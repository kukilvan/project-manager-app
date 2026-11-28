// The PocketBase backend of the repo on the NAS copy: every method of createFirestoreBackend (src/app/repo.js) over the local copy, the write queue and the server.
// A write: ops from toOps (src/domain/pbwrite.js) applied to the local copy (`_pending: true`), one queue item, a promise that resolves when the item is on the server
// and rejects when it is refused, so `track` and `onReject` of createRepo work unchanged; a refused item with no live promise (queued before a restart) goes to «⚠» here.
// Listeners answer from src/app/pb/localcopy.js, which src/app/pb/reader.js feeds from the server; one-off reads and history go to the server through the reader
// (`server`; without it — tests of the queue — the copy answers). Spec 4 § 3.3–3.7, § 3.10.
//
// Method → where it is answered (ticket 4.7):
//  - commit, commitPool, setInbox, allowEmails, saveUserPrefs → the write queue (ops `project`/`rec`/`history`, `pool`, `inbox`, `allowed`, `prefs`)
//  - listenProjects → scope `p||`; listenColl → `r|<pid>|<coll>`; listenPool → `pool||<kind>` (+ onError on a refusal, 403); listenInbox → `inbox||` (administrator only);
//    listenUserPrefs → `prefs||`; listenInvitations → `inv||` filtered against `p||` (invitationsOf of src/domain/pbread.js)
//  - loadHistory → the server's `history` merged with the phone's own entries; readColl, readPool → the server (all pages), reject offline
//  - loadAdmin, claimAdmin → the administrator of `POST /api/pm/admin` (src/app/pb/auth.js resolveAdmin), given as `admin`
//  - loadSettings, saveSettings are left out on purpose: createFirestoreBackend has none and nothing calls them (only the memory backend keeps them)
import { toOps } from '../../domain/pbwrite.js';
import { queueCount, docId, PROJECTS_SCOPE, recordsScope, poolScope, INBOX_SCOPE, PREFS_SCOPE, INVITES_SCOPE } from '../../domain/pbqueue.js';
import { invitationsOf, mergeHistory, withInvitationNames } from '../../domain/pbread.js';
import { noteRejected, notifyPending } from '../repo.js';
import { error } from '../../log.js';

// Keys the phone adds to its documents: never sent (a screen may spread a shown document into a write)
const LOCAL_KEYS = ['_pb', '_pending'];
const bare = (d) => { if (!d || typeof d !== 'object') return d; const c = { ...d }; LOCAL_KEYS.forEach((k) => delete c[k]); return c; };
const bareWrites = (writes) => (writes || []).map((w) => (w && w.data ? { ...w, data: bare(w.data) } : w));
// A document of the copy as the app's listeners show it: without the server version `_pb`, which is the reader's and not data (inside a work or a cable it
// would travel to the pool's inbox and make every project item differ from the pool); `_pending` stays for «⬆»
const shown = (d) => { if (!d || !d._pb) return d; const c = { ...d }; delete c._pb; return c; };

// opts: { copy, user, onQueued() — the sender's kick after a write, server — { readColl, readPool, loadHistory } of src/app/pb/reader.js,
//   isAdmin() — the user is the database administrator, admin — { load() → e-mail or null, claim(email) → e-mail } }
export function createPocketBaseBackend({ copy, user, onQueued = () => {}, server = null, isAdmin = () => false, admin = null }) {
  const live = new Map();       // seq → { resolve, reject } of the write calls of this run
  const poolErrors = new Set(); // onError of the pool listeners: called once each, on a refusal only

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
    // ---- the administrator ----
    async loadAdmin() { return admin ? admin.load() : null; },
    async claimAdmin(email) { return admin ? admin.claim(email) : null; },
    // ---- listeners: the local copy ----
    // any scope of the copy (src/domain/pbqueue.js docId): the generic listener the specific ones below are built on
    listenScope(scope, cb) { return copy.listen(scope, cb); },
    // a project accepted here and not read yet shows its invitation's name (review 4, F3)
    listenProjects(uid, cb) { return copy.listen(PROJECTS_SCOPE, (docs) => cb(withInvitationNames(docs, copy.list(INVITES_SCOPE)).filter((p) => (p.memberUids || []).includes(uid)).map(shown))); },
    listenColl(pid, name, cb) { return copy.listen(recordsScope(pid, name), (docs) => cb(docs.map(shown))); },
    listenUserPrefs(_uid, cb) { return copy.listen(PREFS_SCOPE, (docs) => cb(bare(docs[0]) || {})); },
    // onError(e) only when the server refuses the pool (403, e.code 'permission-denied'); a pool the server does not have yet (404) reads as empty
    listenPool(kind, cb, { withDeleted = false, onError = null } = {}) {
      const off = copy.listen(poolScope(kind), (docs) => cb((withDeleted ? docs : docs.filter((x) => !x.deleted)).map(shown)));
      if (typeof onError === 'function') poolErrors.add(onError);
      return () => { off(); poolErrors.delete(onError); };
    },
    // the reader heard a refusal of the pool read: each pool listener's onError once, as a Firestore listener ends with its error
    poolRefused(e) {
      const err = Object.assign(new Error(String(e?.message || 'refused')), { code: 'permission-denied', status: Number(e?.status) || 403 });
      const fns = [...poolErrors]; poolErrors.clear();
      fns.forEach((fn) => { try { fn(err); } catch (x) { error('Общий пул: обработчик ошибки', x); } });
    },
    // the administrator's inbox: `{...data, key}`; anyone else gets an empty list and no events
    listenInbox(cb) {
      if (!isAdmin()) { cb([]); return () => {}; }
      const cut = INBOX_SCOPE.length + 1;
      return copy.listen(INBOX_SCOPE, () => cb(copy.entries(INBOX_SCOPE).map(([id, d]) => ({ ...shown(d), key: d.key || id.slice(cut) }))));
    },
    // the invitations of `invites`, without those the user has accepted or declined (also while the answer is queued)
    listenInvitations(email, uid, cb) {
      const run = () => cb(invitationsOf(copy.list(INVITES_SCOPE), (key) => copy.get(docId('p', '', '', key)), email, uid));
      const offI = copy.listen(INVITES_SCOPE, run); const offP = copy.listen(PROJECTS_SCOPE, run);
      return () => { offI(); offP(); };
    },
    // ---- the server: history and one-off reads ----
    async loadHistory(pid, since, max) {
      const local = copy.history(pid, since, max);
      return server ? mergeHistory(await server.loadHistory(pid, since, max), local, max) : local;
    },
    async readColl(pid, coll) { return server ? server.readColl(pid, coll) : copy.list(recordsScope(pid, coll)).map(bare); },
    async readPool(kind) { return server ? server.readPool(kind) : copy.list(poolScope(kind)).map(bare); },
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
    // a refused item: the copy undoes what it showed (its documents wait for the server's version, review 4 F1); the reader then reads again (src/app/pbstart.js)
    itemRejected(seq, code, message) {
      const it = copy.refuse(seq);
      const err = Object.assign(new Error(message || code), { code });
      const p = live.get(seq); live.delete(seq);
      if (p) p.reject(err);
      else if (it && (it.kind === 'commit' || it.kind === 'commitPool')) noteRejected(it.kind === 'commitPool' ? 'pool' : 'project', it.pid, it.writes, err, it.uid);
      else error('Запись отклонена', `${code} ${message || ''} (${it?.kind || '?'})`);
      notifyPending();
    },
  };
  return backend;
}
