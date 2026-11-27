// The PocketBase backend of the repo on the NAS copy: the interface of createFirestoreBackend (src/app/repo.js) over the local copy and the write queue.
// A write: ops from toOps (src/domain/pbwrite.js) applied to the local copy (`_pending: true`), one queue item, a promise that resolves when the item is on the server
// and rejects when it is refused, so `track` and `onReject` of createRepo work unchanged; a refused item with no live promise (queued before a restart) goes to «⚠» here.
// Listeners and one-off reads answer from src/app/pb/localcopy.js only; ticket 06 feeds the copy from the server, ticket 07 completes the rest (spec 4 § 3.3, § 3.4).
import { toOps } from '../../domain/pbwrite.js';
import { queueCount, PROJECTS_SCOPE, recordsScope, poolScope, INBOX_SCOPE, PREFS_SCOPE, INVITES_SCOPE } from '../../domain/pbqueue.js';
import { noteRejected, notifyPending } from '../repo.js';
import { error } from '../../log.js';

// Keys the phone adds to its documents: never sent (a screen may spread a shown document into a write)
const LOCAL_KEYS = ['_pb', '_pending'];
const bare = (d) => { if (!d || typeof d !== 'object') return d; const c = { ...d }; LOCAL_KEYS.forEach((k) => delete c[k]); return c; };
const bareWrites = (writes) => (writes || []).map((w) => (w && w.data ? { ...w, data: bare(w.data) } : w));

// opts: { copy, user, onQueued() — the sender's kick after a write }
export function createPocketBaseBackend({ copy, user, onQueued = () => {} }) {
  const live = new Map();   // seq → { resolve, reject } of the write calls of this run

  // One write call → one queue item; the promise settles when the sender hears from the server
  function enqueue(kind, pid, writes, ops) {
    const seq = copy.accept({ uid: user.uid, kind, pid, writes, ops });
    notifyPending();
    onQueued();
    return new Promise((resolve, reject) => { live.set(seq, { resolve, reject }); });
  }

  const backend = {
    kind: 'pocketbase',
    // ---- writes ----
    commit(pid, writes) { const w = bareWrites(writes); return enqueue('commit', pid, w, toOps('commit', pid, w)); },
    commitPool(writes) { const w = bareWrites(writes); return enqueue('commitPool', null, w, toOps('commitPool', null, w)); },
    setInbox(list) { const w = bareWrites(list); return enqueue('setInbox', null, w, toOps('setInbox', null, w)); },
    allowEmails(list) { return enqueue('allowEmails', null, list, toOps('allowEmails', null, list)); },
    saveUserPrefs(_uid, patch, replace = false) { const w = [{ data: bare(patch), replace }]; return enqueue('saveUserPrefs', null, w, toOps('saveUserPrefs', null, w)); },
    // ---- listeners: the local copy ----
    listenProjects(uid, cb) { return copy.listen(PROJECTS_SCOPE, (docs) => cb(docs.filter((p) => (p.memberUids || []).includes(uid)))); },
    listenColl(pid, name, cb) { return copy.listen(recordsScope(pid, name), cb); },
    listenUserPrefs(_uid, cb) { return copy.listen(PREFS_SCOPE, (docs) => cb(bare(docs[0]) || {})); },
    listenPool(kind, cb, { withDeleted = false } = {}) { return copy.listen(poolScope(kind), (docs) => cb(withDeleted ? docs : docs.filter((x) => !x.deleted))); },
    listenInbox(cb) { return copy.listen(INBOX_SCOPE, cb); },
    listenInvitations(_email, uid, cb) { return copy.listen(INVITES_SCOPE, (docs) => cb(docs.filter((p) => !(p.memberUids || []).includes(uid)))); },
    async loadHistory(pid, since, max) { return copy.history(pid, since, max); },
    async readColl(pid, coll) { return copy.list(recordsScope(pid, coll)); },
    async readPool(kind) { return copy.list(poolScope(kind)); },
    // ---- the queue ----
    // «⬆ N» and the sign-out question: the non-history writes of this user in the queue
    queueCount: () => queueCount(copy.queueItems(), user.uid),
    itemProgress(seq, done) { copy.setProgress(seq, done); notifyPending(); },
    itemDone(seq) {
      copy.finish(seq);
      const p = live.get(seq); live.delete(seq);
      p?.resolve();
      notifyPending();
    },
    itemRejected(seq, code, message) {
      const it = copy.item(seq);
      copy.finish(seq);
      const err = Object.assign(new Error(message || code), { code });
      const p = live.get(seq); live.delete(seq);
      if (p) p.reject(err);
      else if (it && (it.kind === 'commit' || it.kind === 'commitPool')) noteRejected(it.kind === 'commitPool' ? 'pool' : 'project', it.pid, it.writes, err);
      else error('Запись отклонена', `${code} ${message || ''} (${it?.kind || '?'})`);
      notifyPending();
    },
  };
  return backend;
}
