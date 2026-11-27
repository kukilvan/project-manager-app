// The sender of the NAS copy's write queue: one request at a time to `POST /api/pm/save`, every answer of spec 4 § 3.4, back-off and the state behind the banners.
// Runs 300 ms after a write, on `online`, when the app becomes visible, after a realtime (re)connect (`wake()`, called by the reader of ticket 06) and on its back-off timer;
// holds while the sign-in is expired, the server or the app is older, or the phone is offline. Chunking and answer rules are pure in src/domain/pbqueue.js.
// Reads the queue of src/app/pb/localcopy.js; tells src/app/pb/backend.js which items are done or refused. Tests give it a fake `fetch`.
import { PB_SCHEMA } from '../../domain/pbwrite.js';
import { planRequest, classify, settle, backoffDelay, queueCount, REQUEST_TIMEOUT_MS, BACKOFF_MS } from '../../domain/pbqueue.js';
import { info, warn } from '../../log.js';

const PROBE_MS = BACKOFF_MS[BACKOFF_MS.length - 1];   // while the server is older, one try a minute (a refused request writes nothing)

// opts: { copy, uid(), token(), fetchFn, url, schema, online(), isExpired(), onExpired(), onDone(seq), onRejected(seq, code, message),
//   onProgress(seq, done) — a chunk of a large item is on the server, now(), timers }
export function createSender(opts) {
  const {
    copy, uid, token = () => '', fetchFn = (...a) => globalThis.fetch(...a), url = '/api/pm/save', schema = PB_SCHEMA,
    online = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
    isExpired = () => false, onExpired = () => {}, onDone = () => {}, onRejected = () => {}, onProgress = () => {},
    now = () => Date.now(), timers = { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (t) => clearTimeout(t) },
  } = opts;

  let busy = false; let again = false; let timer = null; let due = Infinity;
  let failures = 0; let badTries = 0;
  const single = new Set();     // after a 413: these items go one per request
  const st = { serverOlder: false, appOlder: false, lastAnswerAt: 0, failures: 0 };
  const subs = new Set();

  const mine = () => copy.queueItems().filter((it) => it.uid === uid());
  const state = () => ({ signInExpired: !!isExpired(), serverOlder: st.serverOlder, appOlder: st.appOlder, lastAnswerAt: st.lastAnswerAt, queue: queueCount(copy.queueItems(), uid()), busy, failures });
  const emit = () => { const s = state(); subs.forEach((fn) => { try { fn(s); } catch { /* a screen's problem */ } }); };

  function kick(delay = 0, { probe = false } = {}) {
    const at = now() + delay;
    if (timer && at >= due) return;
    if (timer) timers.clearTimeout(timer);
    due = at;
    timer = timers.setTimeout(() => { timer = null; due = Infinity; run({ probe }); }, delay);
  }

  async function post(ops) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = timers.setTimeout(() => ctl?.abort(), REQUEST_TIMEOUT_MS);
    try {
      const r = await fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: token() } : {}) },
        body: JSON.stringify({ schema, ops }),
        signal: ctl?.signal,
      });
      let body = null;
      try { body = await r.json(); } catch { /* not JSON */ }
      return { status: r.status, body };
    } catch { return { network: true }; } finally { timers.clearTimeout(t); }
  }

  async function run({ probe = false } = {}) {
    if (busy) { again = true; return; }
    if (isExpired() || st.appOlder || !online() || (st.serverOlder && !probe)) { emit(); return; }
    const items = mine();
    const plan = planRequest(items, { maxItems: items.length && single.has(items[0].seq) ? 1 : Infinity });
    if (!plan) { emit(); return; }
    busy = true; emit();
    const res = await post(plan.ops);
    busy = false;
    if (res.status) st.lastAnswerAt = now();
    const ans = classify(res);
    const r = settle(plan, ans, { badTries });
    badTries = r.badTries;
    r.progress.forEach((p) => onProgress(p.seq, p.done));
    r.single.forEach((s) => single.add(s));
    const leave = (seq) => { single.delete(seq); };
    r.done.forEach((seq) => { leave(seq); onDone(seq); });
    r.rejected.forEach(({ seq, code }) => { leave(seq); warn(`Очередь записи: сервер отклонил запись (${code})`); onRejected(seq, code, String(res.body?.message || code)); });
    if (ans.kind === 'ok') {
      failures = 0; st.serverOlder = false; st.appOlder = false;
      info(`Очередь записи: отправлено ${plan.ops.length}, осталось ${queueCount(copy.queueItems(), uid())}`);
      if (mine().length) kick(0);
    }
    if (r.hold === 'expired') { warn('Очередь записи: вход истёк (401), отправка ждёт входа'); onExpired(); }
    if (r.hold === 'server-older') { if (!st.serverOlder) warn('Очередь записи: сервер старее приложения, отправка ждёт'); st.serverOlder = true; kick(PROBE_MS, { probe: true }); }
    if (r.hold === 'app-older') { warn('Очередь записи: приложение старее сервера (426)'); st.appOlder = true; }
    if (r.now) kick(0);
    if (r.backoff) { failures++; kick(backoffDelay(failures)); info(`Очередь записи: нет ответа (${res.status || 'сеть'}), повтор через ${backoffDelay(failures) / 1000} с`); }
    st.failures = failures;
    emit();
    if (again) { again = false; kick(0); }
  }

  return {
    kick,
    // after a realtime (re)connect (ticket 06): try at once, also while the server was older
    wake: () => kick(0, { probe: true }),
    syncState: state,
    onSyncState(fn) { subs.add(fn); return () => subs.delete(fn); },
    // the triggers of spec 4 § 3.4 that come from the page
    start(win = globalThis.window, doc = globalThis.document) {
      win?.addEventListener?.('online', () => kick(0));
      doc?.addEventListener?.('visibilitychange', () => { if (doc.visibilityState === 'visible') kick(0); });
      kick(0);
    },
  };
}
