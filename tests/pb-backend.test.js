// Checks the rest of the NAS copy's backend against a real PocketBase 0.42.3 (spec 4 § 3.5–3.7, § 10 cases 3, 18, 21, 26; ticket 4.7): two phones, each with the app's
// own repo, PocketBase backend, local copy (memory only), sender (real fetch) and reader (the real SDK over the small EventSource of tests/pb-helper.js).
// The invitation round trip with capital letters, the shared lists and their deletion rights, the administrator's inbox, the history with names and a rollback,
// and a member removed while their change waits: the change is refused with `forbidden` and the project leaves the phone.
// Needs `node tools/pb-dev.mjs fetch`; skipped with a message without the binary, fails then in CI (PB_TESTS_REQUIRED=1), as tests/pb-server.test.js.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { missingBinary, REQUIRED, startServer, TestEventSource } from './pb-helper.js';

const ls = new Map();
globalThis.window ??= { addEventListener() {} };
globalThis.localStorage ??= { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) };
globalThis.EventSource ??= TestEventSource;
const { default: PocketBase } = await import('pocketbase');
const { openLocalCopy } = await import('../src/app/pb/localcopy.js');
const { createReader } = await import('../src/app/pb/reader.js');
const { createSender } = await import('../src/app/pb/sender.js');
const { createPocketBaseBackend } = await import('../src/app/pb/backend.js');
const { createRepo, rejectedList, dropRejected } = await import('../src/app/repo.js');
const { setAdminEmail } = await import('../src/edition.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 10000) { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(25); } return false; }

const missing = missingBinary();
if (missing && REQUIRED) test('PocketBase binary is present (PB_TESTS_REQUIRED=1)', () => assert.fail(missing));
if (missing && !REQUIRED) console.log(`# ${missing}`);

describe('the rest of the backend against PocketBase', { skip: missing ? missing : false }, () => {
  let srv; let A; let B; let a; let b; let pid;
  const phones = [];

  // A phone as src/app/pbstart.js builds it, with listeners kept in `seen`
  async function phone(acc, { admin = false } = {}) {
    const pb = new PocketBase(srv.url);
    pb.autoCancellation(false);
    pb.authStore.save(acc.token, { id: acc.id, email: acc.email, collectionName: 'users' });
    const { copy } = await openLocalCopy({ uid: acc.id, idb: null, win: null, doc: null });
    const user = { uid: acc.id, email: acc.email, displayName: acc.name || acc.email };
    let sender = null; let backend = null;
    const reader = createReader({
      pb, copy, uid: () => acc.id, isAdmin: () => admin, sender: { wake: () => sender?.wake() },
      onRefused: (part, e) => { if (part === 'pool') backend?.poolRefused(e); }, win: null, doc: null,
    });
    backend = createPocketBaseBackend({ copy, user, onQueued: () => sender.kick(20), server: reader, isAdmin: () => admin });
    sender = createSender({
      copy, uid: () => acc.id, token: () => acc.token, fetchFn: (url, init) => fetch(srv.url + url, init), online: () => true,
      onDone: backend.itemDone, onProgress: backend.itemProgress,
      onRejected: (seq, code, message) => { backend.itemRejected(seq, code, message); if (code === 'forbidden') reader.readNow('light'); },
    });
    const repo = createRepo(backend, user);
    const seen = { projects: [], invitations: [], inbox: [] };
    repo.listenProjects((l) => { seen.projects = l; });
    repo.listenInvitations((l) => { seen.invitations = l; });
    repo.listenInbox((l) => { seen.inbox = l; });
    const p = {
      copy, reader, backend, sender, repo, seen,
      sent: () => until(() => backend.queueCount() === 0 && copy.queueItems().every((it) => it.uid !== acc.id)),
      project: () => seen.projects.find((x) => x.id === pid),
      coll: (name) => new Promise((res) => { const off = repo.listenColl(pid, name, (l) => { res(l); setTimeout(() => off(), 0); }); }),
    };
    phones.push(p);
    await reader.start();
    assert.ok(await until(() => reader.readState().realtime === 'connected' && reader.readState().waiting === 0), JSON.stringify(reader.readState()));
    return p;
  }

  before(async () => {
    srv = await startServer();
    [A, B] = srv.users;
    assert.equal((await srv.call('/api/pm/admin', { method: 'POST', token: A.token })).status, 200);   // A is the database administrator
    setAdminEmail(A.email);
    for (const x of rejectedList()) dropRejected(x.id);
    a = await phone(A, { admin: true });
    b = await phone(B);
  });
  after(async () => {
    await Promise.all(phones.map((p) => p.reader.stop()));
    if (srv) await srv.stop();
  });

  test('A creates a project and invites B by an e-mail with capital letters; B sees the banner, accepts and gets the project with its points', async () => {
    pid = a.repo.createProject({ name: 'Школа', object: 'Корпус Б' });
    a.repo.save(pid, [{ coll: 'points', id: 'pt1', data: { label: 'C1' } }, { coll: 'points', id: 'pt2', data: { label: 'C2' } }]);
    assert.ok(await a.sent());
    a.repo.invite(a.project(), B.email.toUpperCase());
    assert.ok(await a.sent());
    assert.deepEqual((await srv.all('allowed')).map((r) => r.email), [B.email], 'the administrator\'s invitation allows B');
    assert.ok(await until(() => b.seen.invitations.length === 1), 'the banner shows on B\'s phone');
    const inv = b.seen.invitations[0];
    assert.deepEqual({ id: inv.id, name: inv.name, object: inv.object, from: inv.memberEmails[0] }, { id: pid, name: 'Школа', object: 'Корпус Б', from: A.email });
    b.repo.acceptInvite(inv);
    assert.equal(b.seen.invitations.length, 0, 'hidden at once');
    assert.ok(await until(() => b.project()?.name === 'Школа'), 'the project with its name');
    assert.ok(await until(async () => (await b.coll('points')).length === 2), 'and its points');
    assert.ok(await b.sent());
    assert.equal((await srv.all('invites')).length, 0, 'the invitation is gone on the server');
    assert.ok(await until(() => (a.project()?.memberUids || []).includes(B.id)), 'A sees B among the members');
  });

  test('shared lists: an item B adds shows on A; only the administrator marks one deleted (edge case 26)', async () => {
    let onA = []; a.repo.listenPool('delayReasons', (l) => { onA = l; });
    b.repo.savePool([{ coll: 'delayReasons', id: 'r1', data: { name: 'Дождь', he: 'גשם' } }]);
    assert.ok(await b.sent());
    assert.ok(await until(() => onA.some((x) => x.id === 'r1' && x.name === 'Дождь')));
    b.repo.savePool([{ coll: 'delayReasons', id: 'r1', remove: true }]);
    assert.ok(await b.sent());
    const rej = rejectedList().find((x) => x.kind === 'pool');
    assert.equal(rej?.code, 'forbidden', '«⚠» on B');
    assert.equal((await srv.all('pool', 'kind = "delayReasons"'))[0].data.deleted, undefined, 'not deleted on the server');
    dropRejected(rej.id);
    a.repo.savePool([{ coll: 'delayReasons', id: 'r1', remove: true }]);
    assert.ok(await a.sent());
    let onB = []; b.repo.listenPool('delayReasons', (l) => { onB = l; }, { withDeleted: true });
    assert.ok(await until(() => onB.some((x) => x.id === 'r1' && x.deleted === true)), 'B sees the deletion');
    assert.deepEqual(await b.repo.readPool('delayReasons').then((l) => l.map((x) => [x.id, x.deleted])), [['r1', true]], 'readPool reads the server');
  });

  test('the inbox: what B\'s project brings reaches the administrator; B gets no inbox events', async () => {
    const key = `${B.id}_${pid}_types_x`;
    b.repo.setInbox([{ key, data: { kind: 'types', status: 'new', from: B.email } }]);
    assert.ok(await b.sent());
    assert.ok(await until(() => a.seen.inbox.some((x) => x.key === key && x.status === 'new')), 'A\'s inbox');
    assert.deepEqual(b.seen.inbox, []);
    assert.equal(b.copy.entries('inbox||').filter(([, d]) => d._pb).length, 0, 'nothing of the inbox came from the server to B');
  });

  test('history: entries with author names; a rollback restores the record and is itself in the history', async () => {
    b.repo.save(pid, [{ coll: 'points', id: 'pt1', data: { label: 'C1-new' } }]);
    assert.ok(await b.sent());
    assert.ok(await until(async () => (await a.coll('points')).find((x) => x.id === 'pt1')?.label === 'C1-new'));
    const h = await a.repo.loadHistory(pid, 0);
    const edit = h.find((e) => e.docId === 'pt1' && e.action === 'update');
    assert.equal(edit.byName, B.name || B.email, 'B\'s name on A\'s phone');
    a.repo.revertTo(pid, 'points', 'pt1', edit.before);
    assert.ok(await a.sent());
    assert.ok(await until(async () => (await b.coll('points')).find((x) => x.id === 'pt1')?.label === 'C1'), 'B sees the rollback');
    const h2 = await b.repo.loadHistory(pid, 0);
    assert.equal(h2[0].action, 'rollback');
    assert.equal(h2[0].byName, A.name || A.email);
    assert.equal(h2.length, h.length + 1);
  });

  test('A removes B; a change B made meanwhile is refused with `forbidden` and the project leaves B\'s phone (edge case 3)', async () => {
    a.repo.removeMember(a.project(), B.email);
    assert.ok(await a.sent());
    b.repo.save(pid, [{ coll: 'points', id: 'pt2', data: { label: 'C2-late' } }]);
    assert.ok(await until(() => rejectedList().some((x) => x.kind === 'project' && x.code === 'forbidden')), '«⚠ forbidden» on B');
    assert.ok(await until(() => !b.project()), 'the project left B\'s list');
    assert.ok(await until(() => b.copy.entries(`r|${pid}|`).length === 0), 'and its records left B\'s copy');
    assert.equal((await srv.all('records', 'key = "pt2"'))[0].data.label, 'C2', 'the late change is not on the server');
  });
});
