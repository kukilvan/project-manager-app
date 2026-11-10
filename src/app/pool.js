// The shared pool inside the app: listens to the pool (all users) and to the inbox (pool administrator only),
// and sends the administrator what is new or changed in the current project.
// Reads and writes through the repo (`listenPool`, `listenInbox`, `setInbox`); pool logic comes from src/domain; `pz.poolSent` in localStorage remembers what was already sent.
import { state, getRepo, subscribe, currentProject, demo } from './store.js';
import { isAdminEmail } from '../edition.js';
import { POOL_KINDS, poolMaps, inboxCandidates, deepHash, bundleFrom, coveredBy, candidateChanges } from '../domain/index.js';
import { docKey } from './repo.js';

export const pool = Object.fromEntries(POOL_KINDS.map((k) => [k, new Map()]));
const loaded = new Set();
export let inbox = [];
const subs = new Set();
export const onPool = (fn) => { subs.add(fn); return () => subs.delete(fn); };
const emit = () => subs.forEach((f) => { try { f(); } catch { /* ok */ } });
export const isPoolAdmin = () => isAdminEmail(getRepo()?.user?.email);
export const poolReady = () => loaded.size === POOL_KINDS.length;
// The pool was really downloaded to the phone (not empty just because there has been no connection yet)
export const poolHasData = () => POOL_KINDS.some((k) => pool[k].size > 0);

let started = false; let timer = null;
export function startPool() {
  if (started || !getRepo()) return; started = true;
  POOL_KINDS.forEach((k) => getRepo().listenPool(k, (docs) => { pool[k] = new Map(docs.filter((x) => !x.deleted).map((x) => [x.id, x])); loaded.add(k); emit(); schedule(); }));
  if (isPoolAdmin()) getRepo().listenInbox((list) => { inbox = list; emit(); });
  subscribe(() => schedule());
}
function schedule() { clearTimeout(timer); timer = setTimeout(pushCandidates, 4000); }

// new or changed in the current project → the administrator's inbox (once per version; while the pool is empty nothing is sent)
const sentKey = 'pz.poolSent';
function pushCandidates() {
  try {
    const p = currentProject(); const repo = getRepo();
    if (demo.on || !p || !poolReady() || !state.ctx || !['types', 'devices', 'cables', 'catalog'].every((c) => state.loaded?.has?.(c))) return;
    if (POOL_KINDS.every((k) => !pool[k].size)) return;
    let sent = {}; try { sent = JSON.parse(localStorage.getItem(sentKey) || '{}'); } catch { /* ok */ }
    const uid = repo.user.uid; const list = [];
    for (const c of inboxCandidates(state.ctx, poolMaps(pool))) {
      const key = `${uid}_${c.kind}_${docKey(c.id)}`.slice(0, 1400);
      if (sent[key] === c.hash) continue;
      list.push({ key, data: { kind: c.kind, itemId: c.id, item: c.item, deps: c.deps, hash: c.hash, owner: { uid, email: repo.user.email || '', name: repo.by.name }, project: { id: p.id, name: p.name || '' }, at: Date.now() } });
      sent[key] = c.hash;
    }
    if (!list.length) return;
    for (let i = 0; i < list.length; i += 300) repo.setInbox(list.slice(i, i + 300));
    try { localStorage.setItem(sentKey, JSON.stringify(sent)); } catch { /* ok */ }
  } catch (e) { console.warn('pool push', e); }
}

// Inbox by section: new (no decision yet), changed after a decision, rejected
// open: absent from the pool or different (by hash; also by the list of changes, just in case, so old entries without differences do not hang around)
const openItem = (x) => { const m = poolMaps(pool); if (!m[x.kind]?.get(x.itemId)) return true; if (deepHash(m, x.kind, x.itemId) === x.hash) return false; return candidateChanges(x, m).length > 0; };
const decided = (x) => x.status && x.seenHash === x.hash;
export function inboxOf(kind) {
  // a part (work, cable, device) that belongs to an open candidate one level up is accepted together with it — not shown separately
  const open = inbox.filter((x) => openItem(x) && !decided(x));
  const live = inbox.filter((x) => x.kind === kind && openItem(x) && !(!decided(x) && coveredBy(x, open)));
  return {
    fresh: live.filter((x) => !x.status),
    changed: live.filter((x) => x.status && x.seenHash && x.seenHash !== x.hash),
    ignored: live.filter((x) => x.status === 'ignored' && x.seenHash === x.hash),
  };
}
export const inboxCount = (kind) => (isPoolAdmin() ? inboxOf(kind).fresh.length : 0);

// Type bundles from the pool (for importing points from a file: an unknown type can be taken from the pool)
export function poolBundles() {
  const maps = poolMaps(pool); const m = new Map();
  maps.types.forEach((t, id) => { const b = bundleFrom(maps, id); if (b) m.set(id, { ...b, source: 'pool' }); });
  return m;
}
export const poolSentReset = () => { try { localStorage.removeItem(sentKey); } catch { /* ok */ } };
if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('mem')) window.__pzPool = { pool, get inbox() { return inbox; }, poolMaps, deepHash, inboxCandidates, state };
