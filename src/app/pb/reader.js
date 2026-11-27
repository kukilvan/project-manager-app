// The reader of the NAS copy: one realtime connection with the keep-alive, the reads after every (re)connect (full, delta, Saturday, rollback check), new and removed projects, history and one-off reads.
// After every `PB_CONNECT`: GET /api/pm/info (schema, administrator) → rollback check → `projects` in full → `invites`, `prefs` in full → `records` per project, `pool`, `inbox` full or delta;
// subscriptions are made before the reads, events are grouped for 100 ms. Feeds src/app/pb/localcopy.js (setDocs), wakes src/app/pb/sender.js after each connect,
// keeps the state behind «⬇» (readState, onReadState). Rules are pure in src/domain/pbread.js (spec 4 § 3.5, § 3.6). Talks to PocketBase through the SDK client it is given.
import { PB_SCHEMA } from '../../domain/pbwrite.js';
import { backoffDelay } from '../../domain/pbqueue.js';
import {
  PAGE_SIZE, READ_PARTS, PREFIX, recordsPrefix, newestOf, recordToDoc, projectKeyMap, pageFilter, nextAfter, deltaSince,
  readMode, rolledBack, shouldApply, serverVersion, fullReadRemovals, dropsEveryProject, queuedIds,
} from '../../domain/pbread.js';
import { info, warn, error } from '../../log.js';

export const GROUP_MS = 100;                    // realtime events are grouped this long
export const INFO_EVERY_MS = 10 * 60 * 1000;    // /api/pm/info (and the project list) is checked this often while connected
export const HISTORY_WAIT_MS = 6000;            // the history screens wait for the server no longer than this
const STALE_MS = 150 * 1000;                    // no message (the keep-alive comes every minute) for this long → the stream is re-made
const WATCH_MS = 30 * 1000;
const SERVER_ERROR_TRIES = 3;                   // a part shows «ошибка» after this many server errors in a row
const TOPICS = ['projects', 'records', 'pool', 'invites', 'prefs'];   // `inbox` too for the administrator
const FIELDS = {
  projects: 'id,updated,key,data', records: 'id,updated,project,coll,key,data', pool: 'id,updated,kind,key,data',
  inbox: 'id,updated,key,data', prefs: 'id,updated,data', invites: 'id,updated,project,email,data', history: 'id,at,key,data',
};

// network: no answer; expired: 401; missing: 404 (the route or the collection is not on the server yet); server: any other answer
export function errorKind(e) {
  const s = Number(e && e.status) || 0;
  if (!s || (e && e.isAbort)) return 'network';
  if (s === 401) return 'expired';
  if (s === 404) return 'missing';
  return 'server';
}

// opts: { pb — the signed-in SDK client, copy, uid(), isAdmin(), auth: { isExpired(), isRefreshed(), refresh() → 'ok'|…, markExpired(), onChange(fn) },
//   sender: { wake() }, onAdmin(email), online(), now(), timers: { setTimeout, clearTimeout, setInterval, clearInterval }, win, doc }
export function createReader(opts) {
  const {
    pb, copy, uid, isAdmin = () => false, sender = { wake() {} }, onAdmin = () => {},
    online = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
    now = () => Date.now(), win = globalThis.window, doc = globalThis.document,
  } = opts;
  const auth = { isExpired: () => false, isRefreshed: () => true, refresh: async () => 'ok', markExpired() {}, onChange: () => () => {}, ...(opts.auth || {}) };
  const timers = { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (t) => clearTimeout(t), setInterval: (f, ms) => { const t = setInterval(f, ms); t?.unref?.(); return t; }, clearInterval: (t) => clearInterval(t), ...(opts.timers || {}) };

  // ---------- state for the screens (ticket 08) ----------
  const parts = {}; READ_PARTS.forEach((p) => { parts[p] = { state: 'waiting', code: '', fails: 0 }; });
  const st = { realtime: 'not', lastServerAt: Number(copy.getMeta('server|at')) || 0, serverSchema: copy.getMeta('server|schema') ?? null, serverOlder: false };
  const subs = new Set();
  const readState = () => {
    const list = READ_PARTS.filter((p) => p !== 'inbox' || isAdmin()).map((p) => ({ part: p, state: parts[p].state, code: parts[p].code }));
    return { realtime: st.realtime, lastServerAt: st.lastServerAt, serverSchema: st.serverSchema, serverOlder: st.serverOlder, parts: list, waiting: list.filter((p) => p.state !== 'done').length };
  };
  const emit = () => { const s = readState(); subs.forEach((fn) => { try { fn(s); } catch (e) { error('Чтение (PocketBase): подписчик', e); } }); };
  const heard = () => { st.lastServerAt = now(); };
  const partDone = (p) => { const x = parts[p]; if (x.state !== 'done' || x.fails) { x.state = 'done'; x.code = ''; x.fails = 0; emit(); } };
  const partFailed = (p, e) => {
    const x = parts[p]; x.fails++;
    if (x.fails >= SERVER_ERROR_TRIES && x.state !== 'done') { x.state = 'error'; x.code = String(e?.status || 'error'); emit(); }
  };

  // ---------- the local copy ----------
  const mine = () => copy.queueItems().filter((it) => it.uid === uid());
  const pidMap = () => projectKeyMap(copy.entries(PREFIX.projects));
  const bumpSeen = (recs) => { const s = copy.getMeta('seen|r') || ''; const n = newestOf(s, recs); if (n !== s) copy.setMeta('seen|r', n); };

  // Server records → the local copy by the event-apply rule (force: the server was rolled back, its version wins). Returns the local ids of the records.
  function applyServer(coll, recs, { force = false, pidOf = null } = {}) {
    const items = mine(); const map = pidOf || pidMap(); const of = (id) => map.get(id) || '';
    const rows = []; const ids = [];
    (recs || []).forEach((r) => {
      const m = recordToDoc(coll, r, of);
      if (!m) return;
      const [id, d] = m; ids.push(id);
      const local = copy.get(id);
      if (local && local._pb && local._pb.updated === d._pb.updated && !local._pending) return;   // the same version
      if (!force && !shouldApply(local, r.updated)) return;
      rows.push([id, serverVersion(d, items, id)]);
    });
    if (rows.length) copy.setDocs(rows, { grouped: false });
    return ids;
  }
  // A project the user no longer sees: the project and its records leave the copy (documents a queued item touches stay until it is answered)
  function dropProjects(keys) {
    const queued = queuedIds(mine());
    const rows = [];
    keys.forEach((key) => {
      const pid = key.slice(PREFIX.projects.length + 1);
      if (!queued.has(key)) rows.push([key, null]);
      copy.entries(recordsPrefix(pid)).forEach(([id]) => { if (!queued.has(id)) rows.push([id, null]); });
      copy.setMeta(`mark|r|${pid}`, undefined); copy.setMeta(`full|r|${pid}`, undefined);
    });
    if (rows.length) copy.setDocs(rows, { grouped: false });
    if (keys.length) info(`Чтение (PocketBase): проектов больше нет на сервере для этого пользователя: ${keys.length}`);
  }

  // ---------- reads ----------
  // Every page of a collection (keyset by `updated,id`, pages of 1,000); onPage(items) per page. { missing: true } when the server has no such collection yet (reads as empty).
  async function listAll(coll, { base = '', since = '', onPage }) {
    let after = null;
    for (;;) {
      let res;
      try {
        res = await pb.collection(coll).getList(1, PAGE_SIZE, { filter: pageFilter(base, since, after), sort: 'updated,id', skipTotal: true, fields: FIELDS[coll], requestKey: null });
      } catch (e) { if (errorKind(e) === 'missing') return { missing: true }; throw e; }
      heard();
      const items = res.items || [];
      onPage(items);
      after = nextAfter(items);
      if (!after) return { missing: false };
    }
  }

  // One scope, full or delta (spec 4 § 3.5 steps 5–6). A full read replaces the scope and stamps `full|…`; the mark = the newest `updated` read (server time).
  async function readScope({ coll, base = '', prefix, markKey, fullKey, full, force = false, pidOf = null }) {
    const prev = copy.getMeta(markKey) || '';
    const since = full ? '' : deltaSince(prev);
    const serverIds = new Set(); let mark = full ? '' : prev; let n = 0;
    const r = await listAll(coll, {
      base, since,
      onPage: (items) => {
        applyServer(coll, items, { force, pidOf }).forEach((id) => serverIds.add(id));
        mark = newestOf(mark, items); n += items.length;
        if (coll === 'records') bumpSeen(items);
      },
    });
    if (r.missing) return { n: 0, missing: true };
    if (full) {
      // after a rollback the server is the truth: newer documents the phone got by events are not kept either
      const gone = fullReadRemovals(copy.entries(prefix), serverIds, queuedIds(mine()), force ? '' : mark);
      if (gone.length) copy.setDocs(gone.map((id) => [id, null]), { grouped: false });
      if (fullKey) copy.setMeta(fullKey, { at: now(), n: copy.entries(prefix).length });
    }
    if (markKey) copy.setMeta(markKey, mark);
    return { n, missing: false };
  }

  async function readInfo() {
    let schema = 0; let admin = null;
    try {
      const r = await pb.send('/api/pm/info', { method: 'GET', requestKey: null });
      schema = Number(r?.schema) || 0; admin = typeof r?.admin === 'string' ? r.admin : null;
    } catch (e) {
      if (errorKind(e) !== 'missing') throw e;   // 404: the hooks are missing → schema 0 (spec 4 § 10 case 9)
    }
    heard();
    const older = schema < PB_SCHEMA;
    if (older && !st.serverOlder) warn(`Чтение (PocketBase): сервер старее приложения (схема ${schema} < ${PB_SCHEMA}); отправка ждёт, чтение идёт`);
    st.serverSchema = schema; st.serverOlder = older; copy.setMeta('server|schema', schema);
    if (admin) { onAdmin(admin); subscribeInbox(); }
    emit();
  }

  // The rollback check (spec 4 § 3.5 step 2)
  async function readRollback() {
    const r = await pb.collection('records').getList(1, 1, { sort: '-updated', fields: 'updated', skipTotal: true, requestKey: null });
    heard();
    const newest = r.items?.[0]?.updated || '';
    const seen = copy.getMeta('seen|r') || '';
    const rolled = rolledBack(newest, seen);
    if (rolled) { warn(`Чтение (PocketBase): на сервере данные старее, чем видел телефон (${newest || 'пусто'} < ${seen}) — читаю всё заново`); copy.setMeta('seen|r', newest); }
    return rolled;
  }

  // `projects` in full (spec 4 § 3.5 step 3): missing ones leave with their records (guarded, § 3.2); returns the keys of projects read before (with a mark) and new ones
  async function readProjects(force) {
    const serverIds = new Set(); let mark = '';
    await listAll('projects', { onPage: (items) => { applyServer('projects', items, { force }).forEach((id) => serverIds.add(id)); mark = newestOf(mark, items); } });
    const local = copy.entries(PREFIX.projects);
    let gone = fullReadRemovals(local, serverIds, queuedIds(mine()), mark);
    if (gone.length && dropsEveryProject(local.length, gone.length) && !auth.isRefreshed()) {
      // a token the server treats as a guest's would show no project at all: drop them only after a refresh has succeeded in this run
      const o = await auth.refresh();
      if (o !== 'ok') { warn(`Чтение (PocketBase): сервер не показал ни одного проекта, а токен не обновлён (${o}) — проекты на телефоне оставлены`); gone = []; }
    }
    dropProjects(gone);
  }

  // Records of one project, full or delta (a project never read before: full)
  async function readProjectRecords(key, { force = false } = {}) {
    const d = copy.get(key);
    if (!d || !d._pb || !d._pb.id) return;   // not on the server yet (its creation is queued)
    const pid = key.slice(PREFIX.projects.length + 1);
    const prefix = recordsPrefix(pid);
    const markKey = `mark|r|${pid}`; const fullKey = `full|r|${pid}`;
    const full = force || readMode({ mark: copy.getMeta(markKey), full: copy.getMeta(fullKey), cached: copy.entries(prefix).length, now: now() }) === 'full';
    const pidOf = new Map([[d._pb.id, pid]]);
    await readScope({ coll: 'records', base: pb.filter('project = {:p}', { p: d._pb.id }), prefix, markKey, fullKey, full, force, pidOf });
  }
  async function readCommon(coll, { force = false } = {}) {
    const prefix = PREFIX[coll]; const markKey = `mark|${coll}`; const fullKey = `full|${coll}`;
    const full = force || readMode({ mark: copy.getMeta(markKey), full: copy.getMeta(fullKey), cached: copy.entries(prefix).length, now: now() }) === 'full';
    await readScope({ coll, prefix, markKey, fullKey, full, force });
  }

  // ---------- the read runs: one at a time ----------
  let running = false; let want = null; let retryTimer = null; let readFails = 0; let stopped = false;
  const fresh = new Set();   // projects that appeared through realtime: their records are read in full at once (spec 4 § 10 case 12)
  function request(kind) { if (kind === 'full' || !want) want = kind; pump(); }
  async function pump() {
    if (running) return;
    running = true;
    try {
      while (!stopped && (want || fresh.size)) {
        const kind = want; want = null;
        if (kind) await readAll(kind === 'light');
        else await readFresh();
      }
    } finally { running = false; }
  }
  function retryLater() {
    readFails++;
    const ms = backoffDelay(readFails);
    timers.clearTimeout(retryTimer);
    retryTimer = timers.setTimeout(() => { retryTimer = null; if (st.realtime === 'connected') request('full'); }, ms);
    info(`Чтение (PocketBase): повтор через ${ms / 1000} с`);
  }
  // A part's step: a server error is counted and the run goes on; no answer or 401 ends the run
  async function step(part, fn) {
    try { await fn(); if (part) partDone(part); return true; } catch (e) {
      const k = errorKind(e);
      if (k === 'network') throw e;
      if (k === 'expired') { auth.markExpired(); throw e; }
      error(`Чтение (PocketBase): ${part || 'сервер'}`, `${e?.status || ''} ${e?.message || e}`);
      if (part) partFailed(part, e);
      return false;
    }
  }
  async function readAll(light) {
    let ok = true;
    try {
      ok = (await step(null, readInfo)) && ok;
      let force = false;
      if (!light) await step(null, async () => { force = await readRollback(); });
      ok = (await step('projects', () => readProjects(force))) && ok;
      const keys = copy.entries(PREFIX.projects).map(([id]) => id);
      if (light) {
        // the 10-minute check: projects that appeared are read in full; the rest waits for realtime and the next connect
        keys.forEach((k) => { if (!copy.getMeta(`mark|r|${k.slice(PREFIX.projects.length + 1)}`)) fresh.add(k); });
      } else {
        ok = (await step('invites', () => readCommon('invites', { force: true }))) && ok;
        ok = (await step('prefs', () => readCommon('prefs', { force: true }))) && ok;
        keys.forEach((k) => fresh.delete(k));
        ok = (await step('records', async () => { for (const k of keys) await readProjectRecords(k, { force }); })) && ok;
        ok = (await step('pool', () => readCommon('pool', { force }))) && ok;
        if (isAdmin()) ok = (await step('inbox', () => readCommon('inbox', { force }))) && ok;
      }
      copy.setMeta('server|at', st.lastServerAt);
    } catch (e) {
      ok = false;
      if (errorKind(e) === 'network') info(`Чтение (PocketBase): нет связи с сервером (${e?.message || e})`);
    }
    if (ok) { readFails = 0; if (!light) info('Чтение (PocketBase): данные с сервера прочитаны'); } else if (!auth.isExpired()) retryLater();
    emit();
  }
  async function readFresh() {
    const keys = [...fresh]; fresh.clear();
    for (const k of keys) {
      try { await readProjectRecords(k, { force: true }); info('Чтение (PocketBase): новый проект прочитан целиком'); } catch (e) {
        if (errorKind(e) === 'expired') auth.markExpired();
        else { fresh.add(k); retryLater(); return; }
      }
    }
  }

  // ---------- realtime events ----------
  let pending = []; let groupTimer = null; let lastMsgAt = 0;
  function onEvent(coll, e) {
    if (!e || !e.record) return;
    pending.push([coll, e]); lastMsgAt = now(); heard();
    if (!groupTimer) groupTimer = timers.setTimeout(flushEvents, GROUP_MS);
  }
  function flushEvents() {
    groupTimer = null;
    const evs = pending; pending = [];
    // projects first, so a record of a project that appeared in the same group finds its key
    const order = evs.filter(([c]) => c === 'projects').concat(evs.filter(([c]) => c !== 'projects'));
    const items = mine(); const queued = queuedIds(items);
    const map = pidMap(); const batch = new Map(); const rows = [];
    const dropped = []; let unknown = false;
    order.forEach(([coll, e]) => {
      const rec = e.record;
      if (coll === 'projects') {
        const key = `${PREFIX.projects}|${rec.key}`;
        if (e.action === 'delete') { dropped.push(key); map.delete(rec.id); return; }
        map.set(rec.id, rec.key);
        if (!copy.get(key) && !batch.has(key)) fresh.add(key);
      }
      const m = recordToDoc(coll, rec, (id) => map.get(id) || '');
      if (!m) { if (coll === 'records') unknown = true; return; }
      const [id, d] = m;
      const local = batch.has(id) ? batch.get(id) : copy.get(id);
      if (!shouldApply(local, rec.updated)) return;
      const shown = e.action === 'delete' ? (queued.has(id) ? serverVersion(null, items, id) : null) : serverVersion(d, items, id);
      batch.set(id, shown); rows.push([id, shown]);
      if (coll === 'records') bumpSeen([rec]);
    });
    if (rows.length) copy.setDocs(rows, { grouped: false });
    if (dropped.length) dropProjects(dropped);
    emit();
    if (unknown) request('light');   // a record of a project the phone does not know: the project list first
    else if (fresh.size) pump();
  }
  function onPing() { lastMsgAt = now(); heard(); emit(); }
  function onConnect() {
    st.realtime = 'connected'; lastMsgAt = now(); heard();
    readFails = 0; timers.clearTimeout(retryTimer); retryTimer = null;
    info('Чтение (PocketBase): realtime подключён');
    emit();
    sender.wake();
    request('full');
  }

  // ---------- the connection ----------
  let connecting = false; let connTimer = null; let connFails = 0; let inboxOn = false;
  function subscribeInbox() {
    if (inboxOn || !isAdmin() || st.realtime !== 'connected') return;
    inboxOn = true;
    pb.collection('inbox').subscribe('*', (e) => onEvent('inbox', e)).catch((e) => { inboxOn = false; warn(`Чтение (PocketBase): подписка на входящие пула (${e?.status || 'нет связи'})`); });
  }
  async function connect() {
    if (stopped || connecting || auth.isExpired()) return;
    connecting = true; timers.clearTimeout(connTimer); connTimer = null;
    try {
      await pb.realtime.unsubscribe().catch(() => {});
      inboxOn = isAdmin();
      const all = [pb.realtime.subscribe('PB_CONNECT', onConnect)];
      TOPICS.forEach((c) => all.push(pb.collection(c).subscribe('*', (e) => onEvent(c, e))));
      all.push(pb.realtime.subscribe('pm_ping', onPing));
      if (inboxOn) all.push(pb.collection('inbox').subscribe('*', (e) => onEvent('inbox', e)));
      await Promise.all(all);
      connFails = 0;
    } catch (e) {
      st.realtime = 'not'; emit();
      if (errorKind(e) === 'expired') auth.markExpired();
      else if (!stopped) {
        connFails++;
        const ms = backoffDelay(connFails);
        connTimer = timers.setTimeout(() => { connTimer = null; connect(); }, ms);
        info(`Чтение (PocketBase): realtime не подключился (${e?.status || 'нет связи'}), повтор через ${ms / 1000} с`);
      }
    } finally { connecting = false; }
  }
  function disconnect() {
    timers.clearTimeout(connTimer); connTimer = null;
    if (st.realtime !== 'not') { st.realtime = 'not'; emit(); }
    return pb.realtime.unsubscribe().catch(() => {});
  }
  const visible = () => !doc || doc.visibilityState !== 'hidden';

  let watch = null; let infoTimer = null; let offAuth = null;
  return {
    start() {
      stopped = false;
      pb.realtime.onDisconnect = (active) => {
        if (st.realtime !== 'not') { st.realtime = 'not'; emit(); }
        if (active && active.length) info('Чтение (PocketBase): realtime отключился, SDK переподключается');
      };
      let wasExpired = auth.isExpired();
      offAuth = auth.onChange(() => {
        const ex = auth.isExpired();
        if (ex && !wasExpired) disconnect();
        if (!ex && wasExpired) connect();
        wasExpired = ex;
      });
      win?.addEventListener?.('online', () => { if (st.realtime !== 'connected') connect(); });
      doc?.addEventListener?.('visibilitychange', () => { if (visible() && st.realtime !== 'connected' && !pb.realtime.isConnected) connect(); });
      // a stream that died without an error (a phone back from the background): no keep-alive for 150 s → made anew
      watch = timers.setInterval(() => { if (st.realtime === 'connected' && visible() && now() - lastMsgAt > STALE_MS) { warn('Чтение (PocketBase): нет сообщений от сервера 150 с — переподключаюсь'); connect(); } }, WATCH_MS);
      infoTimer = timers.setInterval(() => { if (st.realtime === 'connected') request('light'); }, INFO_EVERY_MS);
      emit();
      return connect();
    },
    stop() {
      stopped = true;
      timers.clearInterval(watch); timers.clearInterval(infoTimer); timers.clearTimeout(retryTimer); timers.clearTimeout(groupTimer);
      offAuth?.();
      return disconnect();
    },
    readState,
    onReadState(fn) { subs.add(fn); return () => subs.delete(fn); },
    // tests and browser checks: idle() resolves when no read run is going or wanted; readNow(kind) asks for a run first
    async idle() { await new Promise((r) => setTimeout(r, 0)); while (running || want || groupTimer) await new Promise((r) => setTimeout(r, 20)); },
    async readNow(kind = 'full') { request(kind); return this.idle(); },

    // ---------- one-off reads (spec 4 § 3.5) ----------
    // A project collection straight from the server, all pages; rejects offline, as Firestore's getDocsFromServer
    async readColl(pid, coll) {
      if (!online()) throw Object.assign(new Error('offline'), { code: 'unavailable' });
      const p = copy.get(`${PREFIX.projects}|${pid}`);
      const base = p?._pb?.id ? pb.filter('project = {:p} && coll = {:c}', { p: p._pb.id, c: coll }) : pb.filter('project.key = {:k} && coll = {:c}', { k: pid, c: coll });
      const out = [];
      await listAll('records', { base, onPage: (items) => items.forEach((r) => out.push({ ...(r.data || {}) })) });
      return out;
    },
    async readPool(kind) {
      if (!online()) throw Object.assign(new Error('offline'), { code: 'unavailable' });
      const out = [];
      await listAll('pool', { base: pb.filter('kind = {:k}', { k: kind }), onPage: (items) => items.forEach((r) => out.push({ ...(r.data || {}) })) });
      return out;
    },
    // History of a project from `at >= since`, newest first, up to `max` (pages of 1,000); waits at most 6 s, else (or offline) the phone's history store
    async loadHistory(pid, since = 0, max = 2000) {
      const local = () => copy.history(pid, since, max);
      if (!online()) return local();
      const work = (async () => {
        const p = copy.get(`${PREFIX.projects}|${pid}`);
        const base = p?._pb?.id ? pb.filter('project = {:p} && at >= {:s}', { p: p._pb.id, s: Number(since) || 0 }) : pb.filter('project.key = {:k} && at >= {:s}', { k: pid, s: Number(since) || 0 });
        const out = []; let after = null;
        while (out.length < max) {
          const filter = after ? `(${base}) && (at < ${after.at} || (at = ${after.at} && id < ${JSON.stringify(after.id)}))` : base;
          const size = Math.min(PAGE_SIZE, max - out.length);
          const res = await pb.collection('history').getList(1, size, { filter, sort: '-at,-id', skipTotal: true, fields: FIELDS.history, requestKey: null });
          const items = res.items || [];
          items.forEach((r) => out.push({ ...(r.data || {}) }));
          if (items.length < size) break;
          const last = items[items.length - 1]; after = { at: Number(last.at) || 0, id: last.id };
        }
        heard();
        return out;
      })();
      let timer = null;
      const late = new Promise((r) => { timer = timers.setTimeout(() => r(null), HISTORY_WAIT_MS); });
      try {
        const got = await Promise.race([work, late]);
        if (!got) { info('История (PocketBase): сервер не ответил за 6 с — показана история с телефона'); return local(); }
        copy.putHistory(pid, got);
        return got;
      } catch (e) {
        if (errorKind(e) === 'expired') auth.markExpired();
        info(`История (PocketBase): ${e?.status || 'нет связи'} — показана история с телефона`);
        return local();
      } finally { timers.clearTimeout(timer); work.catch(() => {}); }
    },
  };
}
