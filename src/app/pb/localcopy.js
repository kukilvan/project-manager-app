// The local copy of the NAS copy: IndexedDB `pm-pb` with the stores docs, queue, meta and history, held in memory with listeners per scope.
// Start: every store read into memory, history over 60 days dropped, another user's documents cleared, every queued item of this user replayed over the documents.
// A queue item is written to IndexedDB in the same call that accepts it; documents, history and meta are batched (150 ms, and at `pagehide` / hidden), as in localdb.js.
// Rules (keys, replay, counts) are pure in src/domain/pbqueue.js; src/app/pb/backend.js and src/app/pb/sender.js use it (spec 4 § 3.3, ADR 0021).
// Without IndexedDB (or when it refuses to open) the copy lives in memory only. Tests give it a small in-memory fake of the IndexedDB calls it makes.
import { applyOp, opTarget, scopeOf, queueCount, HISTORY_KEEP_MS } from '../../domain/pbqueue.js';
import { info, warn, error } from '../../log.js';

export const DB_NAME = 'pm-pb';
const STORES = ['docs', 'queue', 'meta', 'history'];
const FLUSH_MS = 150;
const GROUP_MS = 100;   // server changes are grouped this long before the listeners are called

const json = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

function openDb(idb, name) {
  return new Promise((res, rej) => {
    const r = idb.open(name, 1);
    r.onupgradeneeded = () => { const db = r.result; STORES.forEach((s) => db.createObjectStore(s, s === 'queue' ? { autoIncrement: true } : undefined)); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function readStore(db, store) {
  return new Promise((res, rej) => {
    const st = db.transaction(store, 'readonly').objectStore(store);
    const keys = st.getAllKeys(); const vals = st.getAll();
    vals.onsuccess = () => res((keys.result || []).map((k, i) => [k, vals.result[i]]));
    vals.onerror = () => rej(vals.error);
    keys.onerror = () => rej(keys.error);
  });
}

// opts: { uid, idb, name, now, win, doc }. Returns { copy, switched } — switched: { from, count } when another user's copy was cleared, else null.
export async function openLocalCopy({ uid, idb = globalThis.indexedDB, name = DB_NAME, now = () => Date.now(), win = globalThis.window, doc = globalThis.document } = {}) {
  let db = null;
  if (idb) {
    try { db = await openDb(idb, name); } catch (e) { warn(`Локальная копия: IndexedDB не открылась (${e?.message || e}), данные только в памяти`); }
  }
  const docs = new Map(); const byScope = new Map(); const meta = new Map(); const history = new Map();
  let queue = []; let seqNext = 1;

  // ---------- writing to IndexedDB ----------
  let batch = new Map(); let timer = null;   // `${store}\u0000${key}` → [store, key, value | undefined]
  const flush = () => {
    clearTimeout(timer); timer = null;
    if (!batch.size || !db) { batch = new Map(); return; }
    const rows = [...batch.values()]; batch = new Map();
    try {
      const tx = db.transaction(['docs', 'meta', 'history'], 'readwrite');
      rows.forEach(([s, k, v]) => { const st = tx.objectStore(s); if (v === undefined) st.delete(k); else st.put(v, k); });
      tx.onerror = () => error('Локальная копия: запись', tx.error);
    } catch (e) { error('Локальная копия: запись', e); }
  };
  const later = (store, key, value) => {
    batch.set(`${store}\u0000${key}`, [store, key, json(value)]);
    if (!timer) timer = setTimeout(flush, FLUSH_MS);
  };
  // the queue store is written at once, each change in its own transaction (IndexedDB runs them in order)
  const queueTx = (fn) => {
    if (!db) return;
    try {
      const tx = db.transaction('queue', 'readwrite'); fn(tx.objectStore('queue'));
      tx.onerror = () => error('Локальная копия: очередь', tx.error);
    } catch (e) { error('Локальная копия: очередь', e); }
  };
  win?.addEventListener?.('pagehide', flush);
  doc?.addEventListener?.('visibilitychange', () => { if (doc.visibilityState === 'hidden') flush(); });

  // ---------- memory ----------
  const setDoc = (id, d) => {
    docs.set(id, d);
    const sc = scopeOf(id); if (!byScope.has(sc)) byScope.set(sc, new Map());
    byScope.get(sc).set(id, d);
    later('docs', id, d);
  };
  const delDoc = (id) => {
    if (!docs.has(id)) return;
    docs.delete(id); byScope.get(scopeOf(id))?.delete(id);
    later('docs', id, undefined);
  };
  const setMeta = (k, v) => { meta.set(k, v); later('meta', k, v); };

  // ---------- listeners ----------
  const listeners = new Map();   // scope → Set(fn)
  const list = (scope) => [...(byScope.get(scope)?.values() || [])].map((d) => ({ ...d }));
  const call = (scope) => (listeners.get(scope) || new Set()).forEach((fn) => { try { fn(list(scope)); } catch (e) { error('Локальная копия: подписчик', e); } });
  const notify = (scopes) => new Set(scopes).forEach(call);
  let grouped = new Set(); let groupTimer = null;
  const notifyGrouped = (scopes) => {
    scopes.forEach((s) => grouped.add(s));
    if (!groupTimer) groupTimer = setTimeout(() => { groupTimer = null; const s = grouped; grouped = new Set(); notify(s); }, GROUP_MS);
  };

  // An item's ops over the documents (`_pending: true` on each); history entries kept. Returns the scopes touched.
  const applyItem = (it) => {
    const scopes = [];
    (it.ops || []).forEach((op) => {
      const t = opTarget(op);
      if (!t) return;
      // history: create only; an entry past the 60 days is not kept (a replay at start must not bring it back)
      if (t.store === 'history') { if (!history.has(t.id) && Number(op.data?.at) >= now() - HISTORY_KEEP_MS) { history.set(t.id, json(op.data)); later('history', t.id, op.data); } return; }
      setDoc(t.id, { ...applyOp(docs.get(t.id) || null, op), _pending: true });
      scopes.push(scopeOf(t.id));
    });
    return scopes;
  };
  const touches = (it, id) => (it.ops || []).some((op) => { const t = opTarget(op); return t && t.store === 'docs' && t.id === id; });

  // ---------- start ----------
  if (db) {
    try {
      const [rd, rq, rm, rh] = await Promise.all(STORES.map((s) => readStore(db, s)));
      rd.forEach(([k, v]) => { docs.set(k, v); const sc = scopeOf(k); if (!byScope.has(sc)) byScope.set(sc, new Map()); byScope.get(sc).set(k, v); });
      queue = rq.map(([k, v]) => ({ ...v, seq: k }));
      rm.forEach(([k, v]) => meta.set(k, v));
      const cut = now() - HISTORY_KEEP_MS;
      rh.forEach(([k, v]) => { if (Number(v?.at) >= cut) history.set(k, v); else later('history', k, undefined); });
    } catch (e) { error('Локальная копия: чтение', e); }
  }
  seqNext = queue.reduce((m, it) => Math.max(m, Number(it.seq) || 0), 0) + 1;

  let switched = null;
  const prev = meta.get('uid') || null;
  if (prev && uid && prev !== uid) {
    switched = { from: prev, count: queueCount(queue, prev) };
    docs.clear(); byScope.clear(); meta.clear(); history.clear(); batch = new Map();
    if (db) {
      try { const tx = db.transaction(['docs', 'meta', 'history'], 'readwrite'); ['docs', 'meta', 'history'].forEach((s) => tx.objectStore(s).clear()); } catch (e) { error('Локальная копия: очистка', e); }
    }
    info(`Локальная копия: вошёл другой пользователь, копия очищена; записей прошлого аккаунта в очереди: ${switched.count}`);
  }
  // the copy's user is written at once: the next start must know whose documents these are
  if (uid && prev !== uid) { setMeta('uid', uid); flush(); }
  // a change whose document write was cut off by the app closing is still shown
  queue.filter((it) => it.uid === uid).forEach(applyItem);
  info(`Локальная копия: документов ${docs.size}, в очереди ${queue.length} (своих ${queue.filter((it) => it.uid === uid).length}), истории ${history.size}`);
  try { navigator.storage?.persist?.().catch?.(() => {}); } catch { /* harmless */ }

  const copy = {
    uid: () => meta.get('uid') || uid,
    get: (id) => (docs.has(id) ? { ...docs.get(id) } : null),
    list,
    // listen(scope, cb): cb(list) now and after every change of the scope; returns the unsubscribe function
    listen(scope, cb) {
      if (!listeners.has(scope)) listeners.set(scope, new Set());
      listeners.get(scope).add(cb);
      try { cb(list(scope)); } catch (e) { error('Локальная копия: подписчик', e); }
      return () => listeners.get(scope)?.delete(cb);
    },
    // Accept a write: the item goes to the queue store at once, its ops onto the documents; listeners called once each. Returns the item's seq.
    accept(item) {
      const it = { uid: item.uid, at: item.at || now(), kind: item.kind, pid: item.pid || null, writes: json(item.writes || []), ops: json(item.ops || []) };
      const seq = seqNext++;
      queueTx((st) => st.put(it, seq));
      queue.push({ ...it, seq });
      notify(applyItem(it));
      return seq;
    },
    queueItems: () => queue.slice(),
    // ops of a chunked item the server already holds (memory only: after a restart the item is sent whole again, harmlessly)
    setProgress(seq, done) { const it = queue.find((x) => x.seq === seq); if (it) it.done = done; },
    item: (seq) => queue.find((it) => it.seq === seq) || null,
    // An item left the queue (on the server or refused): `_pending` cleared on its documents no later item touches
    finish(seq) {
      const it = queue.find((x) => x.seq === seq);
      if (!it) return;
      queue = queue.filter((x) => x.seq !== seq);
      queueTx((st) => st.delete(seq));
      const scopes = [];
      (it.ops || []).forEach((op) => {
        const t = opTarget(op);
        if (!t || t.store !== 'docs') return;
        const d = docs.get(t.id);
        if (!d || !d._pending || queue.some((x) => touches(x, t.id))) return;
        const c = { ...d }; delete c._pending; setDoc(t.id, c); scopes.push(scopeOf(t.id));
      });
      notify(scopes);
    },
    // History entries of a project kept on the phone, newest first
    history(pid, since = 0, max = Infinity) {
      const pre = `${pid}|`;
      return [...history.entries()].filter(([k, v]) => k.startsWith(pre) && Number(v?.at) >= since).map(([, v]) => ({ ...v }))
        .sort((a, b) => b.at - a.at).slice(0, max);
    },
    getMeta: (k) => meta.get(k),
    setMeta,
    // For the reader of ticket 06: documents from the server, grouped for 100 ms before the listeners run
    setDocs(rows, { grouped: group = true } = {}) {
      const scopes = [];
      rows.forEach(([id, d]) => { if (d === null) delDoc(id); else setDoc(id, d); scopes.push(scopeOf(id)); });
      if (group) notifyGrouped(scopes); else notify(scopes);
    },
    flush,
    close() { flush(); try { db?.close?.(); } catch { /* ok */ } },
  };
  return { copy, switched };
}
