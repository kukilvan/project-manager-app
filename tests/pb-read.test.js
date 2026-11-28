// Checks the NAS copy's reader against a real PocketBase 0.42.3 (spec 4 § 3.5, § 10 cases 3, 10, 12, 13; ticket 4.6): the app's own reader and local copy
// (memory only) with the real SDK client over a small EventSource for Node (tests/pb-helper.js). Two phones on one project see each other's changes; a new phone reads
// everything; a phone that was away catches up by a delta from its mark minus 10 minutes; the stream is re-made after the server restarts; a server restored from an
// older copy makes the phone read everything; a removed project leaves, a project shared later is read in full at once; a non-member gets nothing.
// Needs `node tools/pb-dev.mjs fetch`; skipped with a message without the binary, fails then in CI (PB_TESTS_REQUIRED=1), as tests/pb-server.test.js.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { missingBinary, REQUIRED, startServer, TestEventSource } from './pb-helper.js';
import { startPocketBase, stopPocketBase } from '../tools/pb-dev.mjs';

const ls = new Map();
globalThis.window ??= { addEventListener() {} };
globalThis.localStorage ??= { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) };
globalThis.EventSource ??= TestEventSource;
const { default: PocketBase } = await import('pocketbase');
const { openLocalCopy } = await import('../src/app/pb/localcopy.js');
const { createReader } = await import('../src/app/pb/reader.js');
const { deltaSince } = await import('../src/domain/pbread.js');
const { PB_SCHEMA } = await import('../src/domain/pbwrite.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 10000) { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(25); } return false; }

const missing = missingBinary();
if (missing && REQUIRED) test('PocketBase binary is present (PB_TESTS_REQUIRED=1)', () => assert.fail(missing));
if (missing && !REQUIRED) console.log(`# ${missing}`);

describe('reader against PocketBase', { skip: missing ? missing : false }, () => {
  let srv; let A; let B; let C;
  const phones = [];

  // A phone: the SDK client signed in as `user`, its own local copy and reader; `urls` keeps every request the SDK sends
  async function phone(user) {
    const pb = new PocketBase(srv.url);
    pb.autoCancellation(false);
    pb.authStore.save(user.token, { id: user.id, email: user.email, collectionName: 'users' });
    const urls = [];
    pb.beforeSend = (url, options) => { urls.push(`${url} ${options?.query?.filter || ''}`); return { url, options }; };
    const { copy } = await openLocalCopy({ uid: user.id, idb: null, win: null, doc: null });
    const reader = createReader({ pb, copy, uid: () => user.id, win: null, doc: null });
    const p = { pb, copy, reader, urls, ready: () => until(() => reader.readState().realtime === 'connected' && reader.readState().waiting === 0) };
    phones.push(p);
    await reader.start();
    return p;
  }
  const su = (ops) => srv.save(srv.superToken, ops);
  const point = (pid, key, data) => ({ t: 'rec', pid, coll: 'points', key, data: { id: key, ...data }, mode: 'fields' });
  const project = (key, memberUids, extra = {}) => ({ t: 'project', key, data: { id: key, name: key, memberUids, createdBy: A.id, ...extra }, mode: 'fields' });
  // stop and start the same server (same data folder and port); `between` runs while it is down
  async function restart(between) {
    await stopPocketBase(srv);
    if (between) between();
    let pb = null;
    for (let i = 0; i < 20 && !pb; i++) {
      try { pb = await startPocketBase({ dataDir: srv.dataDir, port: srv.port, users: false }); } catch (e) { if (i === 19) throw e; await sleep(250); }
    }
    srv.child = pb.child; srv.superToken = pb.superToken;
  }

  before(async () => {
    srv = await startServer();
    [A, B, C] = srv.users;
    assert.equal((await srv.call('/api/pm/admin', { method: 'POST', token: A.token })).status, 200);
    const r = await srv.save(A.token, [
      project('P1', [A.id, B.id]),
      point('P1', 'pt1', { label: 'C1' }), point('P1', 'pt2', { label: 'C2' }),
      { t: 'rec', pid: 'P1', coll: 'days', key: '2026-11-27', data: { id: '2026-11-27', note: 'день' }, mode: 'deep' },
    ]);
    assert.equal(r.status, 200, r.text);
  });
  after(async () => {
    await Promise.all(phones.map((p) => p.reader.stop()));
    if (srv) await stopPocketBase(srv, { removeData: true });   // srv.child is the restarted one
  });

  let b; let c;
  test('a new phone (empty copy) reads everything: the project list, the points, the days', async () => {
    b = await phone(B);
    assert.ok(await b.ready(), JSON.stringify(b.reader.readState()));
    assert.equal(b.copy.get('p|||P1').name, 'P1');
    assert.equal(b.copy.get('r|P1|points|pt1').label, 'C1');
    assert.equal(b.copy.get('r|P1|points|pt2').label, 'C2');
    assert.equal(b.copy.get('r|P1|days|2026-11-27').note, 'день');
    assert.ok(b.copy.getMeta('mark|r|P1'));
    assert.equal(b.reader.readState().serverSchema, PB_SCHEMA);
    c = await phone(C);
    assert.ok(await c.ready());
    assert.equal(c.copy.entries('p||').length, 0, 'a non-member sees no project');
  });

  test('a change in one phone reaches the other within a second; a soft delete too; a non-member gets nothing', async () => {
    const t0 = Date.now();
    assert.equal((await srv.save(A.token, [point('P1', 'pt1', { label: 'C1-new' })])).status, 200);
    assert.ok(await until(() => b.copy.get('r|P1|points|pt1')?.label === 'C1-new', 3000));
    const ms = Date.now() - t0;
    console.log(`# change arrived after ${ms} ms`);
    assert.ok(ms < 1500, `arrived after ${ms} ms`);
    assert.equal((await srv.save(A.token, [point('P1', 'pt2', { deleted: true })])).status, 200);
    assert.ok(await until(() => b.copy.get('r|P1|points|pt2')?.deleted === true, 3000));
    await sleep(300);
    assert.equal(c.copy.entries('r|').length, 0);
  });

  test('a change the server refuses is undone on the phone: the server version comes back, its history entry goes (review 4, F1)', async () => {
    const { createPocketBaseBackend } = await import('../src/app/pb/backend.js');
    const { createSender } = await import('../src/app/pb/sender.js');
    let sender = null;
    const backend = createPocketBaseBackend({ copy: b.copy, user: { uid: B.id, email: B.email, displayName: 'B' }, onQueued: () => sender.kick(0) });
    sender = createSender({
      copy: b.copy, uid: () => B.id, token: () => B.token, fetchFn: (url, init) => fetch(srv.url + url, init),
      onDone: backend.itemDone, onProgress: backend.itemProgress,
      onRejected: (seq, code, message) => { backend.itemRejected(seq, code, message); b.reader.readNow('full'); },   // as src/app/pbstart.js
    });
    // B is a member, not the creator: archiving the project is refused, and with it the whole item (the point and the history entry too)
    const done = backend.commit('P1', [
      { coll: 'projects', id: 'P1', data: { id: 'P1', archived: true } },
      { coll: 'points', id: 'pt1', data: { id: 'pt1', label: 'refused' } },
      { coll: 'history', id: 'h-refused', data: { id: 'h-refused', at: Date.now(), coll: 'points', docId: 'pt1', by: B.id } },
    ]);
    assert.equal(b.copy.get('r|P1|points|pt1').label, 'refused', 'shown at once, as every write');
    assert.equal(b.copy.history('P1').some((h) => h.id === 'h-refused'), true);
    await assert.rejects(done, (e) => e.code === 'forbidden');
    assert.equal(b.copy.history('P1').some((h) => h.id === 'h-refused'), false, 'the refused history entry is gone');
    const back = await until(async () => { await b.reader.idle(); return b.copy.get('r|P1|points|pt1')?.label === 'C1-new' && b.copy.get('p|||P1')?.archived === undefined; });
    assert.ok(back, JSON.stringify({ pt1: b.copy.get('r|P1|points|pt1'), p: b.copy.get('p|||P1') }));
    assert.equal(b.copy.get('r|P1|points|pt1')._pending, undefined);
  });

  test('a phone that was away catches up by a delta read from its mark minus 10 minutes', async () => {
    const mark = b.copy.getMeta('mark|r|P1');
    await b.reader.stop();
    assert.equal((await su([point('P1', 'pt3', { label: 'C3' })])).status, 200);
    b.urls.length = 0;
    await b.reader.start();
    assert.ok(await until(() => b.copy.get('r|P1|points|pt3')?.label === 'C3'));
    await b.reader.idle();
    const q = b.urls.find((u) => u.includes('/api/collections/records/records') && u.includes('project ='));
    assert.ok(q, b.urls.join('\n'));
    assert.ok(q.includes(`updated > "${deltaSince(mark)}"`), q);
    assert.ok(b.copy.getMeta('mark|r|P1') > mark);
  });

  test('after the server restarts the stream is made again and the reads run', async () => {
    b.urls.length = 0;
    await restart();
    assert.ok(await until(() => b.urls.some((u) => u.includes('/api/pm/info')), 15000), 'reads after the reconnect');
    assert.ok(await until(() => b.reader.readState().realtime === 'connected', 15000));
    assert.equal((await su([point('P1', 'pt4', { label: 'C4' })])).status, 200);
    assert.ok(await until(() => b.copy.get('r|P1|points|pt4')?.label === 'C4', 3000), 'events flow on the new stream');
  });

  test('the server restored from an older copy: the phone reads everything and drops what the server lost', async () => {
    const snap = `${srv.dataDir}-snap`;
    await restart(() => fs.cpSync(srv.dataDir, snap, { recursive: true }));
    assert.ok(await until(() => b.reader.readState().realtime === 'connected', 15000));
    await b.reader.idle();
    assert.equal((await su([point('P1', 'pt5', { label: 'C5' }), point('P1', 'pt1', { label: 'C1-later' })])).status, 200);
    assert.ok(await until(() => b.copy.get('r|P1|points|pt5')));
    b.urls.length = 0;
    await restart(() => { fs.rmSync(srv.dataDir, { recursive: true, force: true }); fs.cpSync(snap, srv.dataDir, { recursive: true }); fs.rmSync(snap, { recursive: true, force: true }); });
    const gone = await until(() => b.copy.get('r|P1|points|pt5') === null, 15000);
    assert.ok(gone, `a record the restored server does not have; seen ${b.copy.getMeta('seen|r')}; ${JSON.stringify(b.reader.readState())} ${b.urls.join(' | ')}`);
    assert.ok(await until(() => b.urls.some((u) => u.includes('/api/collections/records/records') && u.includes('project ='))));
    await b.reader.idle();
    assert.equal(b.copy.get('r|P1|points|pt1').label, 'C1-new', 'the server version wins');
    const q = b.urls.find((u) => u.includes('/api/collections/records/records') && u.includes('project ='));
    assert.ok(q && !q.includes('updated >'), `a full read: ${q}`);
  });

  test('a removed project leaves with its records; a project shared later is read in full at once', async () => {
    assert.equal((await su([project('P1', [A.id])])).status, 200);
    await b.reader.readNow('light');
    assert.equal(b.copy.get('p|||P1'), null);
    assert.equal(b.copy.entries('r|P1|').length, 0);
    // P2 has points from before B was added: a delta from an old mark would miss them
    assert.equal((await su([project('P2', [A.id]), point('P2', 'x1', { label: 'X1' }), point('P2', 'x2', { label: 'X2' })])).status, 200);
    await sleep(200);
    assert.equal((await su([project('P2', [A.id, B.id])])).status, 200);
    assert.ok(await until(() => b.copy.entries('r|P2|').length === 2, 3000), JSON.stringify(b.copy.entries('r|')));
    assert.equal(b.copy.get('r|P2|points|x1').label, 'X1');
    assert.equal(c.copy.entries('p||').length, 0, 'still nothing for the non-member');
  });
});
