// Checks the NAS copy's write queue against a real PocketBase 0.42.3 (spec 4 § 3.4, § 10 cases 2, 3, 4, 15; ticket 4.5): the app's own repo, PocketBase backend,
// local copy (over an in-memory IndexedDB fake) and sender, with the real fetch. Saves reach the server; a cut connection and a lost answer are resent harmlessly
// (records and history exactly once); a refused item goes to «⚠» with `forbidden` while the rest is sent; a 400-point save goes in requests of ≤ 300 ops.
// Needs `node tools/pb-dev.mjs fetch`; skipped with a message without the binary, fails then in CI (PB_TESTS_REQUIRED=1), as tests/pb-server.test.js.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { missingBinary, REQUIRED, startServer } from './pb-helper.js';

const ls = new Map();
globalThis.window ??= { addEventListener() {} };
globalThis.localStorage ??= { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) };
const { openLocalCopy } = await import('../src/app/pb/localcopy.js');
const { createSender } = await import('../src/app/pb/sender.js');
const { createPocketBaseBackend } = await import('../src/app/pb/backend.js');
const { createRepo, rejectedList, dropRejected } = await import('../src/app/repo.js');

// A minimal IndexedDB for the local copy (the same calls as the fake of tests/pbqueue.test.js)
function memIdb() {
  const stores = new Map();
  const later = (fn) => { const r = {}; setImmediate(() => { r.result = fn(); r.onsuccess?.(); }); return r; };
  const db = {
    createObjectStore(n) { stores.set(n, new Map()); },
    transaction() {
      return { objectStore(n) { const m = stores.get(n); return { put(v, k) { m.set(k, structuredClone(v)); }, delete(k) { m.delete(k); }, clear() { m.clear(); }, getAllKeys: () => later(() => [...m.keys()]), getAll: () => later(() => [...m.values()]) }; } };
    },
    close() {},
  };
  return { open() { const r = {}; setImmediate(() => { r.result = db; r.onupgradeneeded?.(); r.onsuccess?.(); }); return r; } };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 8000) { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(50); } return false; }

const missing = missingBinary();
if (missing && REQUIRED) test('PocketBase binary is present (PB_TESTS_REQUIRED=1)', () => assert.fail(missing));
if (missing && !REQUIRED) console.log(`# ${missing}`);

describe('write queue against PocketBase', { skip: missing ? missing : false }, () => {
  let srv; let A; let B; let app; let net;

  before(async () => {
    srv = await startServer();
    [A, B] = srv.users;
    const adm = await srv.call('/api/pm/admin', { method: 'POST', token: A.token });   // A becomes the administrator, so A may create projects
    assert.equal(adm.status, 200, adm.text);
    // the network between the phone and the server: `down` cuts it, `loseAnswer` lets one request through and loses its answer
    net = { down: false, loseAnswer: 0, bodies: [] };
    const fetchFn = async (url, init) => {
      net.bodies.push(JSON.parse(init.body));
      if (net.down) throw new TypeError('Failed to fetch');
      const r = await fetch(srv.url + url, init);
      if (net.loseAnswer > 0) { net.loseAnswer--; await r.text(); throw new TypeError('network connection was lost'); }
      return r;
    };
    const { copy } = await openLocalCopy({ uid: A.id, idb: memIdb(), win: null, doc: null });
    const user = { uid: A.id, email: A.email, displayName: 'Tester A' };
    let sender = null;
    const backend = createPocketBaseBackend({ copy, user, onQueued: () => sender.kick(50) });
    sender = createSender({ copy, uid: () => A.id, token: () => A.token, fetchFn, onDone: backend.itemDone, onRejected: backend.itemRejected, onProgress: backend.itemProgress });
    app = { copy, backend, sender, repo: createRepo(backend, user) };
  });
  after(async () => { if (srv) await srv.stop(); });

  const records = async (pid, coll) => (await srv.all('records', `project.key = "${pid}" && coll = "${coll}"`));
  const sentAll = () => until(() => app.copy.queueItems().length === 0);
  let pid;

  test('a new project, its points and a day reach the server; «⬆» goes to 0', async () => {
    pid = app.repo.createProject({ name: 'Тест NAS' });
    app.repo.save(pid, [{ coll: 'points', id: 'pt1', data: { label: 'C1', cabinet: 'R1' } }, { coll: 'points', id: 'pt2', data: { label: 'C2', cabinet: 'R1' } }]);
    app.repo.save(pid, [{ coll: 'days', id: '2026-11-27', data: { date: '2026-11-27', note: 'день' } }]);
    assert.ok(app.backend.queueCount() > 0);
    assert.ok(await sentAll(), 'the queue empties');
    assert.equal(app.backend.queueCount(), 0);
    const [proj] = await srv.all('projects', `key = "${pid}"`);
    assert.equal(proj.data.name, 'Тест NAS');
    assert.deepEqual(proj.members, [A.id]);
    assert.deepEqual((await records(pid, 'points')).map((r) => r.data.label).sort(), ['C1', 'C2']);
    assert.equal((await records(pid, 'days'))[0].data.note, 'день');
    assert.ok((await records(pid, 'catalog')).length > 0, 'the seed catalogs too');
    assert.equal((await srv.all('history', `project.key = "${pid}"`)).length, 3, 'one history entry per saved record');
    assert.equal(app.copy.get(`r|${pid}|points|pt1`)._pending, undefined);
  });

  test('a cut connection: three changes wait, then go out by themselves, each exactly once', async () => {
    net.down = true;
    for (const id of ['pt3', 'pt4', 'pt5']) app.repo.save(pid, [{ coll: 'points', id, data: { label: id.toUpperCase() } }]);
    await sleep(300);
    assert.equal(app.backend.queueCount(), 3, '«⬆ 3» stays');
    assert.ok(app.sender.syncState().failures >= 1);
    net.down = false;
    app.sender.kick(0);   // the page's `online` event
    assert.ok(await sentAll());
    const pts = await records(pid, 'points');
    assert.equal(pts.length, 5);
    assert.equal(new Set(pts.map((r) => r.key)).size, 5, 'no doubles');
    assert.equal((await srv.all('history', `project.key = "${pid}"`)).length, 6);
  });

  test('a lost answer: the request is sent again and changes nothing twice', async () => {
    const before = net.bodies.length;
    net.loseAnswer = 1;
    app.repo.save(pid, [{ coll: 'points', id: 'pt1', data: { label: 'C1', cabinet: 'R2' } }]);
    assert.ok(await sentAll());
    const sent = net.bodies.slice(before);
    assert.ok(sent.length >= 2, 'sent twice');
    assert.equal(JSON.stringify(sent[0]), JSON.stringify(sent[1]), 'the same request');
    const pt1 = (await records(pid, 'points')).find((r) => r.key === 'pt1');
    assert.equal(pt1.data.cabinet, 'R2');
    assert.equal((await srv.all('history', `project.key = "${pid}"`)).length, 7, 'the history entry once');
  });

  test('a refused item goes to «⚠» with `forbidden`; the other changes of the queue are sent', async () => {
    for (const x of rejectedList()) dropRejected(x.id);
    const made = await srv.su('/api/pm/save', { method: 'POST', body: { schema: 1, ops: [{ t: 'project', key: 'pb-only', data: { id: 'pb-only', name: 'B', memberUids: [B.id], memberEmails: [B.email] }, mode: 'deep' }] } });
    assert.equal(made.status, 200, made.text);
    net.down = true;
    app.repo.save(pid, [{ coll: 'points', id: 'pt6', data: { label: 'C6' } }]);
    app.repo.save('pb-only', [{ coll: 'points', id: 'x', data: { label: 'X' } }]);
    app.repo.save(pid, [{ coll: 'points', id: 'pt7', data: { label: 'C7' } }]);
    net.down = false;
    app.sender.kick(0);
    assert.ok(await sentAll());
    assert.ok(await until(() => rejectedList().length === 1));
    assert.equal(rejectedList()[0].code, 'forbidden');
    assert.equal(rejectedList()[0].pid, 'pb-only');
    assert.deepEqual((await records(pid, 'points')).map((r) => r.key).filter((k) => k === 'pt6' || k === 'pt7').sort(), ['pt6', 'pt7']);
    assert.equal((await srv.all('records', 'project.key = "pb-only"')).length, 0);
  });

  test('a 400-point save goes in requests of at most 300 ops and lands completely', async () => {
    const before = net.bodies.length;
    const ops = Array.from({ length: 400 }, (_, i) => ({ coll: 'points', id: `imp${i}`, data: { label: `D${i}`, cabinet: 'R9' } }));
    app.repo.save(pid, ops);
    assert.ok(await sentAll(20000));
    const sizes = net.bodies.slice(before).map((b) => b.ops.length);
    assert.deepEqual(sizes, [300, 300, 200]);
    assert.equal((await records(pid, 'points')).filter((r) => r.key.startsWith('imp')).length, 400);
  });
});
