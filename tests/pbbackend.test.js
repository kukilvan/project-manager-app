// Tests of the rest of the NAS copy's backend (spec 4 § 3.6, § 3.7, § 3.10, § 10 cases 18, 21; ticket 4.7): src/app/pb/backend.js under createRepo over the local copy
// of src/app/pb/localcopy.js (a small in-memory fake of the IndexedDB calls it makes), without a sender, so every write stays queued. The invitation banner's list,
// accepting and declining while the answer is queued, the administrator-only inbox, the pool listeners' onError, history merged from the server and the phone,
// and «⬆» / store.pendingCount after a restart with pool, inbox and prefs writes in the queue. The real server: tests/pb-backend.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';

const ls = new Map();
globalThis.window ??= { addEventListener() {} };
globalThis.localStorage ??= { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) };
const { openLocalCopy } = await import('../src/app/pb/localcopy.js');
const { createPocketBaseBackend } = await import('../src/app/pb/backend.js');
const { createRepo } = await import('../src/app/repo.js');

// The IndexedDB calls of localcopy.js, kept in memory across opens (a restart opens the same `dbs`)
function memIdb() {
  const dbs = new Map();
  const later = (fn) => { const r = {}; setImmediate(() => { r.result = fn(); r.onsuccess?.(); }); return r; };
  const makeDb = () => {
    const stores = new Map();
    return {
      createObjectStore(n) { stores.set(n, new Map()); },
      transaction() {
        return { objectStore(n) { const m = stores.get(n); return { put(v, k) { m.set(k, structuredClone(v)); }, delete(k) { m.delete(k); }, clear() { m.clear(); }, getAllKeys: () => later(() => [...m.keys()]), getAll: () => later(() => [...m.values()]) }; } };
      },
      close() {},
    };
  };
  return {
    open(name) {
      const r = {};
      setImmediate(() => { let db = dbs.get(name); const fresh = !db; if (fresh) { db = makeDb(); dbs.set(name, db); } r.result = db; if (fresh) r.onupgradeneeded?.(); r.onsuccess?.(); });
      return r;
    },
  };
}

async function phone({ idb = null, uid = 'u1', admin = false, server = null } = {}) {
  const { copy } = await openLocalCopy({ uid, idb, win: null, doc: null });
  const user = { uid, email: `${uid}@pm.test`, displayName: `Имя ${uid}` };
  const backend = createPocketBaseBackend({ copy, user, server, isAdmin: () => admin });
  return { copy, user, backend, repo: createRepo(backend, user) };
}

test('restart: «⬆» and store.pendingCount count queued pool, inbox and prefs writes with no live promise (spec 4 § 3.6)', async () => {
  const idb = memIdb();
  const a = await phone({ idb });
  a.repo.savePool([{ coll: 'delayReasons', id: 'r1', data: { name: 'Дождь' } }]);
  a.repo.setInbox([{ key: 'u1_P1_types_x', data: { status: 'new' } }]);
  a.repo.saveUserPrefs({ bind: 1 });
  assert.equal(a.backend.queueCount(), 3);
  a.copy.flush();
  // the app closes before anything is sent and opens again: no promise of the first run is alive
  const b = await phone({ idb });
  assert.equal(b.backend.queueCount(), 3);
  assert.equal(b.copy.get('pool||delayReasons|r1').name, 'Дождь', 'the queued change is shown');
  const store = await import('../src/app/store.js');
  store.start(b.repo);
  assert.equal(store.pendingCount(), 3, 'the backend count (3) wins over the live writes of this process (1)');
  store.stop();
});

test('invitations: `invites` shaped as the banner reads a project; accepting or declining hides one at once, while the answer is queued (edge case 18)', async () => {
  const s = await phone({ uid: 'u2' });
  let inv = null; let projects = null;
  s.backend.listenInvitations('u2@pm.test', 'u2', (l) => { inv = l; });
  s.backend.listenProjects('u2', (l) => { projects = l; });
  const invite = (rid, key) => [`inv|||${rid}`, { key, name: `Проект ${key}`, object: 'Б', from: 'a@pm.test', _pb: { id: rid, updated: '2026-11-27 10:00:00.000Z', project: `pb_${key}`, email: 'u2@pm.test' } }];
  s.copy.setDocs([invite('i1', 'P1'), invite('i2', 'P2'), ['inv|||i3', { name: 'без ключа', _pb: { id: 'i3' } }]], { grouped: false });
  assert.deepEqual(inv.map((p) => [p.id, p.name, p.object, p.memberEmails[0]]), [['P1', 'Проект P1', 'Б', 'a@pm.test'], ['P2', 'Проект P2', 'Б', 'a@pm.test']],
    'an invitation without a key (older server) is left out');
  s.repo.acceptInvite(inv[0]);
  assert.deepEqual(inv.map((p) => p.id), ['P2'], 'accepted: hidden at once');
  assert.deepEqual(projects.map((p) => p.id), ['P1'], 'the accepted project is listed (its name comes with the server version)');
  s.repo.declineInvite(inv[0]);
  assert.deepEqual(inv, [], 'declined: hidden at once');
  assert.deepEqual(projects.map((p) => p.id), ['P1'], 'a declined project is never listed');
  const ops = s.copy.queueItems().map((it) => it.ops.find((o) => o.t === 'project'));
  assert.deepEqual(ops.map((o) => [o.key, o.arrayOps]), [
    ['P1', { memberUids: { union: ['u2'] }, memberEmails: { union: ['u2@pm.test'] }, invitedEmails: { remove: ['u2@pm.test'] } }],
    ['P2', { invitedEmails: { remove: ['u2@pm.test'] } }],
  ]);
});

test('inbox: the administrator gets `{...data, key}` (a queued entry too); anyone else an empty list', async () => {
  const s = await phone();
  const admin = createPocketBaseBackend({ copy: s.copy, user: s.user, isAdmin: () => true });
  let a = null; let b = null;
  admin.listenInbox((l) => { a = l; });
  s.backend.listenInbox((l) => { b = l; });
  s.repo.setInbox([{ key: 'u1_P1_types_x', data: { status: 'new', kind: 'types' } }]);
  assert.deepEqual(a.map((x) => [x.key, x.status, x.kind]), [['u1_P1_types_x', 'new', 'types']]);
  assert.deepEqual(b, []);
});

test('pool: onError of each listener once, only when the reader hears a refusal; the error looks like Firestore\'s permission-denied (spec 4 § 3.10)', async () => {
  const s = await phone();
  const errs = [];
  const off1 = s.backend.listenPool('delayReasons', () => {}, { withDeleted: true, onError: (e) => errs.push(['r', e.code, e.status]) });
  const off2 = s.backend.listenPool('culprits', () => {}, { onError: (e) => errs.push(['c', e.code]) });
  s.backend.listenPool('problems', () => {});   // no onError: nothing to call
  off2();
  s.backend.poolRefused({ status: 403, message: 'Forbidden' });
  s.backend.poolRefused({ status: 403 });
  assert.deepEqual(errs, [['r', 'permission-denied', 403]]);
  off1();
});

test('history: the server\'s entries merged with the phone\'s own (queued, not on the server yet), newest first; authors keep their stored names (edge case 21)', async () => {
  const server = { loadHistory: async () => [{ id: 'old', at: 1000, by: 'gone-uid', byName: 'Бывший участник', coll: 'points', docId: 'a' }] };
  const s = await phone({ server });
  s.repo.save('P1', [{ coll: 'points', id: 'a', data: { label: 'C1' } }]);
  const h = await s.repo.loadHistory('P1', 0);
  assert.deepEqual(h.map((e) => [e.byName, e.docId]), [['Имя u1', 'a'], ['Бывший участник', 'a']]);
  const one = await s.repo.loadHistory('P1', 0, 1);
  assert.equal(one.length, 1);
  // a rollback is itself a history entry, so it shows too
  s.repo.revertTo('P1', 'points', 'a', null);
  const after = await s.repo.loadHistory('P1', 0);
  assert.equal(after[0].action, 'delete');
  assert.equal(after.length, 3);
});

test('administrator: loadAdmin and claimAdmin answer from the administrator the app resolved (POST /api/pm/admin)', async () => {
  const { copy } = await openLocalCopy({ uid: 'u1', idb: null, win: null, doc: null });
  let who = '';
  const b = createPocketBaseBackend({ copy, user: { uid: 'u1', email: 'u1@pm.test' }, admin: { load: () => who || null, claim: async (e) => { who ||= e; return who; } } });
  assert.equal(await b.loadAdmin(), null);
  assert.equal(await b.claimAdmin('u1@pm.test'), 'u1@pm.test');
  assert.equal(await b.claimAdmin('u2@pm.test'), 'u1@pm.test', 'the first stays');
  assert.equal(await createPocketBaseBackend({ copy, user: { uid: 'u1' } }).loadAdmin(), null);
});
