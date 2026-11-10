// On-device storage for the «на этом телефоне» mode: every document lives in IndexedDB (`pm-local`), a working copy in memory.
// To repo.js it looks like an ordinary backend (`createMemoryBackend` that also writes to the device); migrate.js reads it back.
import { createMemoryBackend } from './repo.js';
import { info, error } from '../log.js';

const DB = 'pm-local'; const STORE = 'docs';
function openDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
const all = (db) => new Promise((res, rej) => {
  const out = []; const tx = db.transaction(STORE, 'readonly'); const cur = tx.objectStore(STORE).openCursor();
  cur.onsuccess = () => { const c = cur.result; if (!c) { res(out); return; } out.push([c.key, c.value]); c.continue(); };
  cur.onerror = () => rej(cur.error);
});

// Keys: P|<pid> — project, D|<pid>|<coll>|<key> — document, S — personal settings
export async function createLocalBackend() {
  const db = await openDb();
  const rows = await all(db);
  const initial = { projects: [], docs: [], settings: {} };
  for (const [k, v] of rows) {
    if (k === 'S') initial.settings = v;
    else if (k.startsWith('P|')) initial.projects.push(v);
    else if (k.startsWith('D|')) { const [, pid, coll, ...rest] = k.split('|'); initial.docs.push({ pid, coll, key: rest.join('|'), doc: v }); }
  }
  info(`Данные на устройстве: проектов ${initial.projects.length}, записей ${initial.docs.length}`);
  // writes pile up and go in one transaction (many changes at once — one write to disk)
  let queue = new Map(); let timer = null;
  const flush = () => {
    timer = null; if (!queue.size) return;
    const batch = queue; queue = new Map();
    const tx = db.transaction(STORE, 'readwrite'); const st = tx.objectStore(STORE);
    batch.forEach((v, k) => (v === undefined ? st.delete(k) : st.put(v, k)));
    tx.onerror = () => error('Запись на устройство', tx.error);
  };
  const q = (k, v) => { queue.set(k, v); if (!timer) timer = setTimeout(flush, 150); };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  const persist = {
    put: (pid, coll, key, doc) => q(`D|${pid}|${coll}|${key}`, JSON.parse(JSON.stringify(doc))),
    del: (pid, coll, key) => q(`D|${pid}|${coll}|${key}`, undefined),
    putProject: (p) => q(`P|${p.id}`, JSON.parse(JSON.stringify(p))),
    putSettings: (s) => q('S', JSON.parse(JSON.stringify(s))),
  };
  try { await navigator.storage?.persist?.(); } catch { /* harmless */ }
  return createMemoryBackend({ initial, persist, kind: 'local' });
}

/** Everything stored on the device (for moving it to the Firebase database) */
export async function localSnapshot() {
  const db = await openDb(); return all(db);
}
