// Project data repository: one interface over a Firestore backend and an in-memory backend, plus the shared layer that stamps author and time, writes history and soft-deletes.
// Two storage implementations with one interface:
//  - Firestore (the live one, with an offline cache and a write queue);
//  - memory (for automatic UI tests, switched on by the address ?mem=1; localdb.js reuses it to keep data on the device).
// The shared logic lives here: who changed what and when, the change history, soft deletion. Every data write of the app goes through `createRepo().save`.
// Talks to Firestore (collections under `projects/<pid>/…`, `pool_*`, `meta/admin`, `allowed`, `users/<uid>/prefs/main`), keeps sync marks and counters in localStorage
// (`pz.sync.*`, `pz.reads`, `pz.writes`, `pz.rejected`, `pz.allowed.<uid>`), and takes sync decisions from src/domain/sync.js.
//
// Contents:
// - COLLECTIONS, docKey, newId — the project subcollections, document-id safety, id generator
// - createMemoryBackend() — the in-memory backend (tests, on-device storage through `persist`)
// - read saving — `deltaListen` (cache + changed documents only), the daily read and write counters
// - rejected writes and read-state tracking — the data behind the «⚠» and «⬇» badges
// - createFirestoreBackend(db, uid) — the Firestore backend
// - createRepo(backend, user) — save with history, soft delete, projects, pool, inbox, members, administrator
import {
  collection, doc, onSnapshot, setDoc, getDoc, query, where, writeBatch, serverTimestamp, arrayUnion, arrayRemove, getDocs, getDocsFromCache, orderBy, limit as fbLimit, Timestamp,
} from 'firebase/firestore';
import { info, error } from '../log.js';
import { isAdminEmail } from '../edition.js';
import { DELTA_MARGIN, decideMode, maxMillis, DAILY_WRITE_LIMIT, writeWarnLevel } from '../domain/sync.js';
import {
  CATALOG, POINT_TYPES, CABLES, UNITS, CULPRITS, DELAY_REASONS, DEVICES, composedTypes, fixLatin, fixCabinet,
} from '../domain/index.js';

// Project subcollections the app reads in full (the change history is read separately)
export const COLLECTIONS = ['points', 'days', 'entries', 'journal', 'catalog', 'types', 'cables', 'devices', 'configs',
  'units', 'culprits', 'delayReasons', 'cabinetSettings', 'todos', 'notes', 'pulls'];

// A Firestore document id cannot contain '/', and in catalogues id = name («Поставка / склад»)
export const docKey = (id) => String(id).replace(/\//g, '_');

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
export function newId(len = 12) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

// Counter of records sent to the database but not yet confirmed by the server (offline they wait for a connection)
let ownPending = 0; const pendingSubs = new Set();
export const ownPendingCount = () => ownPending;
export const onPendingChange = (fn) => { pendingSubs.add(fn); return () => pendingSubs.delete(fn); };
const track = (promise, n) => {
  if (!promise?.then) return promise;
  ownPending += n; pendingSubs.forEach((f) => f());
  const done = () => { ownPending = Math.max(0, ownPending - n); pendingSubs.forEach((f) => f()); };
  promise.then(done, done);
  return promise;
};

let snapFn = null;
export const setSnapProvider = (f) => { snapFn = f; };
const clean = (obj) => JSON.parse(JSON.stringify(obj, (k, v) => (v === undefined ? null : v)));
const strip = (obj) => { const c = clean(obj); delete c._pending; return c; };

// ---------- storage: memory ----------
// persist (optional) — on-device storage (localdb.js): initial — what is already saved, put/putProject/putSettings — writing the changes
export function createMemoryBackend({ initial = null, persist = null, kind = 'memory' } = {}) {
  const projects = new Map(); // pid -> doc
  const colls = new Map();    // `${pid}/${name}` -> Map(key -> doc)
  const listeners = new Set();
  let settings = { ...(initial?.settings || {}) };
  const bucket = (pid, name) => {
    const k = `${pid}/${name}`;
    if (!colls.has(k)) colls.set(k, new Map());
    return colls.get(k);
  };
  (initial?.projects || []).forEach((p) => projects.set(p.id, p));
  (initial?.docs || []).forEach(({ pid, coll, key, doc }) => bucket(pid, coll).set(key, doc));
  const notify = () => listeners.forEach((fn) => fn());
  const saveSettings = () => persist?.putSettings(settings);
  return {
    kind,
    listenProjects(uid, cb) {
      const run = () => cb([...projects.values()].filter((p) => (p.memberUids || []).includes(uid)).map((p) => ({ ...p })));
      listeners.add(run); run(); return () => listeners.delete(run);
    },
    async loadHistory(pid, since, max) {
      return [...bucket(pid, 'history').values()].filter((x) => x.at >= since).sort((a, b) => b.at - a.at).slice(0, max);
    },
    listenInvitations(email, uid, cb) {
      const run = () => cb([...projects.values()].filter((p) => (p.invitedEmails || []).includes(email) && !(p.memberUids || []).includes(uid)).map((p) => ({ ...p })));
      listeners.add(run); run(); return () => listeners.delete(run);
    },
    listenColl(pid, name, cb) {
      const run = () => cb([...bucket(pid, name).values()].map((d) => ({ ...d })));
      listeners.add(run); run(); return () => listeners.delete(run);
    },
    listenUserPrefs(uid, cb) { const run = () => cb({ ...settings }); listeners.add(run); run(); return () => listeners.delete(run); },
    async saveUserPrefs(uid, patch) { settings = { ...settings, ...patch }; saveSettings(); notify(); },
    async commit(pid, writes) {
      for (const w of writes) {
        if (w.coll === 'projects') {
          const cur = { ...(projects.get(w.id) || {}), ...w.data };
          Object.entries(w.arrayOps || {}).forEach(([k, o]) => { const a = cur[k] || []; cur[k] = o.union ? [...new Set([...a, ...o.union])] : a.filter((x) => !o.remove.includes(x)); });
          projects.set(w.id, cur); persist?.putProject(cur); continue;
        }
        const b = bucket(pid, w.coll); const key = docKey(w.id);
        const d = { ...(b.get(key) || {}), ...w.data };
        b.set(key, d); persist?.put(pid, w.coll, key, d);
      }
      notify();
    },
    async loadAdmin() { return settings.__admin || null; },
    async claimAdmin(email) { if (!settings.__admin) { settings.__admin = email; saveSettings(); } return settings.__admin; },
    async loadSettings() { return { ...settings }; },
    async saveSettings(patch) { settings = { ...settings, ...patch }; saveSettings(); },
    // shared pool and inbox (in memory — for tests)
    listenPool(kind, cb) { const run = () => cb([...bucket('_pool', kind).values()].map((d) => ({ ...d }))); listeners.add(run); run(); return () => listeners.delete(run); },
    async commitPool(writes) { writes.forEach((w) => { const b = bucket('_pool', w.coll); const key = docKey(w.id); if (w.remove) { b.delete(key); persist?.del('_pool', w.coll, key); } else { const d = { ...(b.get(key) || {}), ...w.data }; b.set(key, d); persist?.put('_pool', w.coll, key, d); } }); notify(); },
    listenInbox(cb) { const run = () => cb([...bucket('_pool', 'inbox').values()].map((d) => ({ ...d }))); listeners.add(run); run(); return () => listeners.delete(run); },
    async setInbox(list) { if (persist) return; const b = bucket('_pool', 'inbox'); list.forEach((x) => b.set(x.key, { ...(b.get(x.key) || {}), ...x.data })); notify(); },
    dump: () => ({ projects: [...projects.values()], colls: [...colls.entries()].map(([k, v]) => [k, [...v.values()]]) }),
  };
}

// ---------- saving Firestore reads ----------
// Firestore re-reads the WHOLE collection if a listener was disconnected for more than 30 minutes (each such start = thousands of reads).
// So after the first full load we read only what changed: documents whose updatedAtServer is newer than the last mark.
// The rest comes from the phone's cache. Once a week, and when the cache is suspected to be incomplete, we do a full load.
const metaGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const metaSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage not accessible */ } };
const srvMillis = (d) => { const v = d.get('updatedAtServer'); return v && typeof v.toMillis === 'function' ? v.toMillis() : 0; };
let serverReads = 0; // how many documents were read from the server in this run (to check the saving)
export const readsCount = () => serverReads;
// The daily read counter on this device. Firebase's daily limit resets at midnight Pacific time (USA).
export const DAILY_READ_LIMIT = 50000;
const ptNow = () => {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  return Object.fromEntries(f.formatToParts(new Date()).map((x) => [x.type, x.value]));
};
const ptDay = () => { const t = ptNow(); return `${t.year}-${t.month}-${t.day}`; };
export function readsToday() {
  try { const o = JSON.parse(localStorage.getItem('pz.reads') || 'null'); return o && o.day === ptDay() ? o.n : 0; } catch { return 0; }
}
// When the limit resets (local time)
export function readsResetAt() {
  const t = ptNow(); const left = 86400 - (Number(t.hour) * 3600 + Number(t.minute) * 60 + Number(t.second));
  return new Date(Date.now() + left * 1000);
}
// ---------- writes: the daily counter and those not accepted by the server ----------
export { DAILY_WRITE_LIMIT };
export function writesToday() {
  try { const o = JSON.parse(localStorage.getItem('pz.writes') || 'null'); return o && o.day === ptDay() ? o.n : 0; } catch { return 0; }
}
const writeSubs = new Set();
export const onWriteWarn = (fn) => { writeSubs.add(fn); return () => writeSubs.delete(fn); };
const addWrites = (n) => {
  if (!n) return; const before = writesToday(); const after = before + n;
  try { localStorage.setItem('pz.writes', JSON.stringify({ day: ptDay(), n: after })); } catch { /* no storage */ }
  const lvl = writeWarnLevel(before, after); if (lvl) writeSubs.forEach((f) => { try { f(lvl, after); } catch { /* */ } });
};
const REJ_KEY = 'pz.rejected';
let rejected = metaGet(REJ_KEY) || [];
const rejSubs = new Set();
const rejEmit = () => { metaSet(REJ_KEY, rejected); rejSubs.forEach((f) => { try { f(); } catch { /* */ } }); };
export const rejectedList = () => rejected.slice();
export const onRejectedChange = (fn) => { rejSubs.add(fn); return () => rejSubs.delete(fn); };
export const dropRejected = (id) => { rejected = rejected.filter((x) => x.id !== id); rejEmit(); };
const addRejected = (item) => { rejected = [...rejected, item].slice(-50); rejEmit(); };

// ---------- the state of reading from the server (the «⬇» badge at the top) ----------
// Each listener waits for the server's first answer; until it gets it, it is «queued for reading». An error (e.g. the limit) is remembered.
const readWait = new Map(); const readFail = new Map(); const readSubs = new Set();
let readSeq = 0;
const readEmit = () => readSubs.forEach((f) => { try { f(); } catch { /* */ } });
export const onReadChange = (fn) => { readSubs.add(fn); return () => readSubs.delete(fn); };
export const readStatus = () => {
  const since = readWait.size ? Math.min(...readWait.values()) : 0;
  return { waiting: readWait.size, since, failed: [...readFail.entries()].map(([label, code]) => ({ label, code })) };
};
// readTrack(label): wait() — waiting for the server; ok() — the server answered; fail(e) — an error; stop() — the listener is removed
function readTrack(label) {
  const id = ++readSeq; const key = `${label}#${id}`;
  const t = {
    wait() { if (!readWait.has(key)) { readWait.set(key, Date.now()); readEmit(); } },
    ok() { const ch = readWait.delete(key) | readFail.delete(label); if (ch) readEmit(); },
    fail(e) { readWait.delete(key); readFail.set(label, e?.code || 'error'); readEmit(); },
    stop() { const ch = readWait.delete(key); if (ch) readEmit(); },
  };
  t.wait(); return t;
}
const addReads = (n) => {
  if (!n) return; serverReads += n;
  try { localStorage.setItem('pz.reads', JSON.stringify({ day: ptDay(), n: readsToday() + n })); } catch { /* no storage */ }
};

// A collection listener that saves reads: after the first full load — the cache + only changed documents.
function deltaListen(col, key, shape, label, cb, retryDenied = false) {
  let unsub = () => {}; let stopped = false; let tries = 0; let timer = null;
  const tr = readTrack(label);
  const onErr = (restart) => (e) => {
    if (stopped) return;
    if (!(retryDenied && e.code === 'permission-denied' && tries < 15)) tr.fail(e);
    if (retryDenied && e.code === 'permission-denied' && tries < 15) { tries++; timer = setTimeout(() => { if (!stopped) restart(); }, 1500); return; }
    error(label, `${e.code || ''} ${e.message || e}`);
  };
  // as before: listen to the whole collection (first start, once a week, when the cache is incomplete)
  const startFull = () => {
    let stamped = false; // the full-load timestamp is set once per run
    unsub = onSnapshot(col, { includeMetadataChanges: true }, (snap) => {
      tries = 0;
      if (!snap.metadata.fromCache) {
        tr.ok();
        addReads(snap.docChanges().length);
        const prev = metaGet(key) || {};
        const last = maxMillis([prev.last, ...snap.docs.map(srvMillis)]);
        if (last > 0 && !snap.metadata.hasPendingWrites) { metaSet(key, { last, full: stamped ? prev.full : Date.now(), n: snap.size }); stamped = true; }
      }
      cb(snap.docs.map(shape));
    }, onErr(startFull));
  };
  // saving mode: from the server — only the changes since the last mark; on screen — the whole collection from the phone's memory.
  // Why: a «changed after» query does not see records that have not reached the server yet (they have no server time),
  // and without a connection a new work/record did not appear in the lists until the phone uploaded it. The phone-memory listener
  // (source: 'cache') sees them at once, and what comes from the server also lands in that memory and is shown by it.
  const startDelta = (meta) => {
    const q = query(col, where('updatedAtServer', '>', Timestamp.fromMillis(meta.last - DELTA_MARGIN)));
    let lastSize = 0;
    const uServer = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
      tries = 0;
      if (!snap.metadata.fromCache) { tr.ok(); addReads(snap.docChanges().length); }
      const prev = metaGet(key) || meta;
      if (!snap.metadata.fromCache && !snap.metadata.hasPendingWrites) {
        metaSet(key, { ...prev, last: maxMillis([prev.last, ...snap.docs.map(srvMillis)]), n: Math.max(prev.n || 0, lastSize) });
      }
    }, onErr(() => { uLocal(); startDelta(meta); }));
    const uLocal = onSnapshot(col, { source: 'cache', includeMetadataChanges: true }, (snap) => {
      lastSize = snap.size;
      cb(snap.docs.map(shape));
    }, (e) => error(label, `память телефона: ${e.code || ''} ${e.message || e}`));
    unsub = () => { uServer(); uLocal(); };
  };
  const start = async () => {
    const meta = metaGet(key);
    if (!meta) { startFull(); return; }
    try {
      const cached = await getDocsFromCache(col);
      if (stopped) return;
      if (decideMode(meta, cached.size) !== 'delta') { startFull(); return; }
      // show everything in the phone's memory at once, then attach the listeners
      cb(cached.docs.map(shape));
      startDelta(meta);
    } catch { if (!stopped) startFull(); }
  };
  start();
  return () => { stopped = true; clearTimeout(timer); tr.stop(); unsub(); };
}

// ---------- storage: Firestore ----------
export function createFirestoreBackend(db, uid) {
  return {
    kind: 'firestore',
    // Open edition: the database administrator is the first to sign in (document meta/admin; the rules allow creating it once)
    async loadAdmin() { const d = await getDoc(doc(db, 'meta', 'admin')); return d.exists() ? d.data().email : null; },
    async claimAdmin(email) {
      const cur = await this.loadAdmin(); if (cur) return cur;
      await setDoc(doc(db, 'meta', 'admin'), { email, at: Date.now() });
      return email;
    },
    listenProjects(_uid, cb) {
      const q = query(collection(db, 'projects'), where('memberUids', 'array-contains', uid)); const tr = readTrack('Список проектов');
      const un = onSnapshot(q, { includeMetadataChanges: true }, (snap) => { if (!snap.metadata.fromCache) tr.ok(); cb(snap.docs.map((d) => ({ ...d.data(), _pending: d.metadata.hasPendingWrites }))); },
        (e) => { tr.fail(e); error('Чтение проектов', `${e.code || ''} ${e.message || e}`); });
      return () => { tr.stop(); un(); };
    },
    async loadHistory(pid, since, max) {
      const q = query(collection(db, 'projects', pid, 'history'), where('at', '>=', since), orderBy('at', 'desc'), fbLimit(max));
      // on a weak connection we do not wait for the server longer than 6 s — we show the history from the phone's memory (it holds everything done here too)
      const srv = getDocs(q).then((s) => { addReads(s.size); return s; });
      const snap = await Promise.race([srv, new Promise((r) => setTimeout(() => r(null), 6000))]).catch(() => null) || await getDocsFromCache(q);
      return snap.docs.map((d) => d.data());
    },
    listenInvitations(email, uid, cb) {
      const q = query(collection(db, 'projects'), where('invitedEmails', 'array-contains', email));
      return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data()).filter((p) => !(p.memberUids || []).includes(uid))),
        (e) => error('Чтение приглашений', `${e.code || ''} ${e.message || e}`));
    },
    listenColl(pid, name, cb) {
      // If the project has not reached the server yet, the read is rejected — retry
      return deltaListen(collection(db, 'projects', pid, name), `pz.sync.${uid}.${pid}.${name}`, (d) => ({ ...d.data(), _pending: d.metadata.hasPendingWrites }), `Чтение ${name}`, cb, true);
    },
    // Writing in batches (up to 500 operations per batch). We do not wait for the server: offline the write stays in the queue.
    commit(pid, writes) {
      addWrites(writes.length);
      const CHUNK = 400;
      const chunks = [];
      for (let i = 0; i < writes.length; i += CHUNK) {
        const batch = writeBatch(db);
        writes.slice(i, i + CHUNK).forEach((w) => {
          const ref = w.coll === 'projects' ? doc(db, 'projects', w.id) : doc(db, 'projects', pid, w.coll, docKey(w.id));
          const data = { ...w.data, updatedAtServer: serverTimestamp() };
          // member lists are changed by «add/remove one element», not by replacing them whole
          Object.entries(w.arrayOps || {}).forEach(([k, o]) => { data[k] = o.union ? arrayUnion(...o.union) : arrayRemove(...o.remove); });
          // replace: dictionaries in the record are replaced whole (otherwise merge keeps deleted keys)
          // points — always whole by fields (the place on the drawing, pos, is not merged with the old one: otherwise the previous icon, text, w, h stay)
          batch.set(ref, data, w.replace || w.coll === 'points' ? { mergeFields: Object.keys(data) } : { merge: true });
        });
        chunks.push(batch);
      }
      return Promise.all(chunks.map((b) => b.commit())); // the order of sending is kept
    },
    // The shared pool: collections pool_types, pool_devices, pool_cables, pool_catalog (everyone reads, only the pool administrator writes)
    listenPool(kind, cb) {
      // a deletion in the pool is marked deleted:true (not erased), so the saving «changes only» read sees it
      return deltaListen(collection(db, `pool_${kind}`), `pz.sync.${uid}.pool.${kind}`, (d) => d.data(), `Чтение общего пула (${kind})`, (list) => cb(list.filter((x) => !x.deleted)));
    },
    commitPool(writes) {
      addWrites(writes.length);
      const batch = writeBatch(db);
      writes.forEach((w) => { const ref = doc(db, `pool_${w.coll}`, docKey(w.id)); if (w.remove) batch.set(ref, { deleted: true, updatedAtServer: serverTimestamp() }, { merge: true }); else batch.set(ref, { ...w.data, updatedAtServer: serverTimestamp() }, { merge: true }); });
      return batch.commit();
    },
    // Allowed emails (written only by the pool administrator): who may create projects and write to the shared collections
    allowEmails(list) {
      const batch = writeBatch(db); addWrites(list.length);
      list.forEach((e) => batch.set(doc(db, 'allowed', e), { email: e, at: Date.now() }, { merge: true }));
      return batch.commit();
    },
    // The pool administrator's inbox: what is new and changed in projects (everyone writes, only the administrator reads)
    listenInbox(cb) {
      return deltaListen(collection(db, 'pool_inbox'), `pz.sync.${uid}.pool.inbox`, (d) => ({ ...d.data(), key: d.id }), 'Чтение входящих пула', cb);
    },
    setInbox(list) {
      const batch = writeBatch(db);
      list.forEach((x) => batch.set(doc(db, 'pool_inbox', x.key), { ...x.data, updatedAtServer: serverTimestamp() }, { merge: true }));
      return batch.commit();
    },
    // The user's personal settings (e.g. default installation bindings for new projects)
    listenUserPrefs(_uid, cb) {
      return onSnapshot(doc(db, 'users', uid, 'prefs', 'main'), (snap) => cb(snap.data() || {}),
        (e) => error('Чтение настроек пользователя', `${e.code || ''} ${e.message || e}`));
    },
    saveUserPrefs(_uid, patch, replace = false) { return setDoc(doc(db, 'users', uid, 'prefs', 'main'), patch, replace ? { mergeFields: Object.keys(patch) } : { merge: true }); },
  };
}

const emailOf = (u) => String(u.email || '').toLowerCase();

// ---------- the shared layer: author/time, history, soft deletion ----------
export function createRepo(backend, user) {
  const by = { uid: user.uid, name: user.displayName || user.email || '' };
  const cache = new Map(); // `${pid}/${coll}/${key}` -> the last known version (for «before»)
  const keyOf = (pid, coll, id) => `${pid}/${coll}/${docKey(id)}`;

  function audit(pid, coll, id, data, existing, action) {
    const now = Date.now();
    const stamped = { ...data, id, updatedBy: by.uid, updatedByName: by.name, updatedAt: now };
    if (!existing) Object.assign(stamped, { createdBy: by.uid, createdByName: by.name, createdAt: now });
    const history = {
      id: newId(), coll, docId: id, action, at: now, by: by.uid, byName: by.name,
      before: existing ? strip(existing) : null, after: strip({ ...existing, ...stamped }),
    };
    return [{ coll, id, data: clean(stamped) }, { coll: 'history', id: history.id, data: history }];
  }

  // the server did not accept the write: keep it on the phone (with the error code) so it can be retried once the cause is removed
  const onReject = (kind, pid, writes) => (e) => {
    error('Запись отклонена', `${e.code || ''} ${e.message || e}`);
    addRejected({ id: newId(), kind, pid, writes, code: e?.code || '', msg: String(e?.message || e), at: Date.now() });
  };
  const send = (item) => (item.kind === 'pool' ? backend.commitPool(item.writes) : backend.commit(item.pid, item.writes));

  const api = {
    backend, user, by,
    /** Retry the writes that were not accepted (after the cause is removed); those sent successfully leave the list */
    retryRejected(ids = null) {
      const list = rejected.filter((x) => !ids || ids.includes(x.id));
      list.forEach((it) => { dropRejected(it.id); track(send(it), it.writes.length)?.catch?.(onReject(it.kind, it.pid, it.writes)); });
      return list.length;
    },
    isCreator: (project) => !project?.createdBy || project.createdBy === user.uid,
    listenProjects: (cb) => backend.listenProjects(user.uid, cb),
    listenUserPrefs: (cb) => backend.listenUserPrefs(user.uid, (p) => { api.prefs = p || {}; cb(api.prefs); }),
    saveUserPrefs: (patch, replace = false) => backend.saveUserPrefs(user.uid, patch, replace),
    prefs: {},
    listenColl(pid, name, cb) {
      return backend.listenColl(pid, name, (docs) => {
        docs.forEach((d) => cache.set(keyOf(pid, name, d.id), d));
        cb(docs);
      });
    },
    // One or several writes at a time (ops: [{coll, id?, data, action?}]); returns the ids of the created/changed ones
    save(pid, ops) {
      const writes = []; const ids = [];
      // names of points and racks are in Latin letters wherever they come from (typed by hand, a file, a drawing, an import): «С108» in Cyrillic → «C108» in Latin
      let cabs = null;
      ops = ops.map((op) => {
        // a daily report entry: remember the row's text at the moment of saving — later it shows whether the data changed (length, number of cables, points…)
        if (op.coll === 'entries' && op.data && snapFn && op.action !== 'rollback' && !op.data.deleted) { try { return { ...op, data: { ...op.data, snap: snapFn(op.id, op.data) } }; } catch { return op; } }
        if (op.coll !== 'points' || !op.data) return op;
        const d = { ...op.data };
        if (typeof d.label === 'string') d.label = fixLatin(d.label);
        if (typeof d.planName === 'string') d.planName = fixLatin(d.planName);
        if (typeof d.cabinet === 'string' && d.cabinet) {
          if (!cabs) { cabs = new Set(); for (const [k, v] of cache) if (k.startsWith(`${pid}/points/`) && v?.cabinet && !v.deleted) cabs.add(v.cabinet); }
          d.cabinet = fixCabinet(d.cabinet, cabs); cabs.add(d.cabinet);
        }
        return { ...op, data: d };
      });
      ops.forEach((op) => {
        const id = op.id || newId();
        const existing = cache.get(keyOf(pid, op.coll, id));
        const action = op.action || (existing ? 'update' : 'create');
        writes.push(...audit(pid, op.coll, id, { ...op.data, projectId: pid }, existing, action));
        cache.set(keyOf(pid, op.coll, id), { ...existing, ...op.data, id });
        ids.push(id);
      });
      info(`Запись в базу: ${ops.map((o) => `${o.coll}${o.data?.deleted ? '(удал.)' : ''}`).join(', ')}`);
      track(backend.commit(pid, writes), ops.length)?.catch?.(onReject('project', pid, writes));
      return ids;
    },
    // Soft deletion: the record stays and is marked deleted (rollback — restore)
    remove(pid, coll, id) {
      const now = Date.now();
      return api.save(pid, [{ coll, id, action: 'delete', data: { deleted: true, deletedAt: now, deletedBy: by.uid, deletedByName: by.name } }]);
    },
    restore(pid, coll, id) {
      return api.save(pid, [{ coll, id, action: 'restore', data: { deleted: false, deletedAt: null, deletedBy: null, deletedByName: null } }]);
    },
    // A new project: the project document + the initial catalogues inside it (all members see the same thing)
    // refs: { types, devices, cables, catalog } — what was chosen in the wizard from the shared pool (without the old standard set)
    createProject(data, refs = null) {
      const pid = newId();
      const now = Date.now();
      const project = clean({
        ...data, id: pid, active: true, memberUids: [user.uid], memberEmails: [user.email || ''],
        createdBy: by.uid, createdByName: by.name, createdAt: now, updatedBy: by.uid, updatedByName: by.name, updatedAt: now,
      });
      const seed = [];
      const add = (coll, items, idOf = (x) => x.id) => items.forEach((x) => seed.push({ coll, id: idOf(x), data: { ...x, projectId: pid, id: idOf(x), createdBy: by.uid, createdAt: now, updatedBy: by.uid, updatedAt: now } }));
      const types = composedTypes(POINT_TYPES);
      const merged = refs ? { catalog: refs.catalog || [], types: refs.types || [], cables: refs.cables || [], devices: refs.devices || [] }
        : { catalog: [...CATALOG], types: [...types], cables: [...CABLES], devices: [...DEVICES] };
      add('catalog', merged.catalog); add('types', merged.types); add('cables', merged.cables); add('devices', merged.devices);
      add('units', UNITS); add('culprits', CULPRITS); add('delayReasons', DELAY_REASONS);
      info(`Создаю проект «${data.name}», справочников: ${seed.length}`);
      backend.commit(pid, [{ coll: 'projects', id: pid, data: project }, ...seed.map((w) => ({ ...w, data: clean(w.data) }))])
        ?.catch?.((e) => error('Создание проекта отклонено', `${e.code || ''} ${e.message || e}`));
      return pid;
    },
    // replace: true — dictionaries in the patch are replaced whole (so a key can be removed)
    saveProject(pid, patch, { replace = false, arrayOps = null } = {}) {
      const now = Date.now();
      const data = clean({ ...patch, id: pid, updatedBy: by.uid, updatedByName: by.name, updatedAt: now });
      const writes = [{ coll: 'projects', id: pid, data, replace, ...(arrayOps ? { arrayOps } : {}) }];
      track(backend.commit(pid, writes), 1)?.catch?.(onReject('project', pid, writes));
    },
    // The change history and rollback. A rollback is itself written to the history, so it can be undone too.
    loadHistory: (pid, since, max = 2000) => backend.loadHistory(pid, since, max),
    // Return a record to its state «before» the given event (before === null → the record was created by this event → remove it)
    revertTo(pid, coll, docId, before) {
      if (!before) { api.remove(pid, coll, docId); return; }
      const now = api.cacheGet(pid, coll, docId) || {};
      const data = { ...before };
      Object.keys(now).forEach((k) => { if (!(k in before) && !['id', 'projectId', 'updatedAt', 'updatedBy', 'updatedByName'].includes(k)) data[k] = null; });
      delete data._pending;
      api.save(pid, [{ coll, id: docId, action: 'rollback', data }]);
    },
    cacheGet: (pid, coll, id) => cache.get(keyOf(pid, coll, id)),
    // shared pool
    listenPool: (kind, cb) => backend.listenPool?.(kind, cb) || (() => {}),
    savePool(ops) {
      const now = Date.now();
      const writes = ops.map((o) => (o.remove ? { coll: o.coll, id: o.id, remove: true } : { coll: o.coll, id: o.id, data: clean({ ...o.data, id: o.id, updatedBy: by.uid, updatedByName: by.name, updatedAt: now }) }));
      info(`Общий пул: ${ops.map((o) => `${o.coll}${o.remove ? '(удал.)' : ''}`).join(', ')}`);
      return track(backend.commitPool(writes), ops.length)?.catch?.(onReject('pool', null, writes));
    },
    listenInbox: (cb) => backend.listenInbox?.(cb) || (() => {}),
    setInbox: (list) => backend.setInbox(list.map((x) => ({ key: x.key, data: clean(x.data) })))?.catch?.((e) => error('Входящие пула', `${e.code || ''} ${e.message || e}`)),
    // Invitations by Google email: the invited person sees the project and joins by themself (the database rules check it)
    listenInvitations: (cb) => backend.listenInvitations(emailOf(user), user.uid, cb),
    invite(project, email) {
      if (!api.isCreator(project)) throw new Error('Приглашать может только создатель проекта');
      const e = String(email).trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(e)) throw new Error('Некорректная почта');
      api.saveProject(project.id, {}, { arrayOps: { invitedEmails: { union: [e] } } });
      api.allowEmails([e]);
    },
    // A member's display name (visible to everyone in the project). The key is the email with dots replaced, since a dot in a Firestore key is awkward
    renameMember(project, email, name) {
      api.saveProject(project.id, { memberNames: { [String(email).toLowerCase().replace(/\./g, '_')]: String(name || '').trim() } });
    },
    // Remove a member (creator only): they lose access; their earlier edits stay, and the uid is remembered for rollback in «История»
    removeMember(project, email) {
      if (!api.isCreator(project)) throw new Error('Убирать участников может только создатель проекта');
      const e = String(email).toLowerCase();
      const emails = project.memberEmails || []; const uids = project.memberUids || [];
      const i = emails.findIndex((x) => String(x).toLowerCase() === e);
      if (i < 0 || emails.length !== uids.length) throw new Error('Не удалось определить участника');
      if (uids[i] === user.uid) throw new Error('Себя убрать нельзя');
      const uid = uids[i];
      api.saveProject(project.id, { removedMembers: { ...(project.removedMembers || {}), [uid]: e } },
        { arrayOps: { memberUids: { remove: [uid] }, memberEmails: { remove: [emails[i]] } } });
      return uid;
    },
    cancelInvite(project, email) {
      if (!api.isCreator(project)) throw new Error('Отзывать приглашения может только создатель проекта');
      api.saveProject(project.id, {}, { arrayOps: { invitedEmails: { remove: [email] } } });
    },
    acceptInvite(project) {
      const me = emailOf(user);
      api.saveProject(project.id, {}, { arrayOps: { memberUids: { union: [user.uid] }, memberEmails: { union: [me] }, invitedEmails: { remove: [me] } } });
    },
    declineInvite(project) {
      api.saveProject(project.id, {}, { arrayOps: { invitedEmails: { remove: [emailOf(user)] } } });
    },
    // The pool administrator adds the emails of all members and invitees of their projects to the allowed list (once per email)
    allowEmails(list) {
      if (!isAdminEmail(emailOf(user)) || !backend.allowEmails) return;
      const key = `pz.allowed.${user.uid}`; let done = []; try { done = JSON.parse(localStorage.getItem(key) || '[]'); } catch { /* empty */ }
      const fresh = [...new Set(list.map((e) => String(e || '').trim().toLowerCase()).filter((e) => /^\S+@\S+\.\S+$/.test(e) && !done.includes(e)))];
      if (!fresh.length) return;
      Promise.resolve(backend.allowEmails(fresh)).then(() => { try { localStorage.setItem(key, JSON.stringify([...done, ...fresh])); } catch { /* no access */ } }).catch((e) => error('Список разрешённых почт', `${e.code || ''} ${e.message || e}`));
    },
    loadAdmin: () => backend.loadAdmin?.(),
    claimAdmin: (email) => backend.claimAdmin?.(email),
    loadSettings: () => backend.loadSettings(),
    saveSettings: (p) => backend.saveSettings(p),
  };
  return api;
}
