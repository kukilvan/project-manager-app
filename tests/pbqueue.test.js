// Tests of the NAS copy's write queue (spec 4 § 3.3, § 3.4, § 11; ticket 4.5): the pure rules of src/domain/pbqueue.js (chunking, answers, back-off, replay, counts),
// the local copy of src/app/pb/localcopy.js over a small in-memory fake of the IndexedDB calls it makes, the sender of src/app/pb/sender.js with a fake fetch,
// and the backend of src/app/pb/backend.js under createRepo (promises, «⚠» for a refused item queued before a restart, the other-account switch).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planRequest, classify, settle, backoffDelay, replayOps, applyOp, queueCount, opTarget, docId, scopeOf, jsonBytes, refusedRepair,
  MAX_REQ_OPS, MAX_REQ_BYTES, BACKOFF_MS, HISTORY_KEEP_MS,
} from '../src/domain/pbqueue.js';
import { toOps, PB_SCHEMA } from '../src/domain/pbwrite.js';
import { otherAccountNotice } from '../src/domain/pbauth.js';

const ls = new Map();
globalThis.window ??= { addEventListener() {} };
globalThis.localStorage ??= { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) };
const { openLocalCopy } = await import('../src/app/pb/localcopy.js');
const { createSender } = await import('../src/app/pb/sender.js');
const { createPocketBaseBackend } = await import('../src/app/pb/backend.js');
const { createRepo, rejectedList, dropRejected } = await import('../src/app/repo.js');

const rec = (i, extra = {}) => ({ t: 'rec', pid: 'p1', coll: 'points', key: `k${i}`, data: { id: `k${i}`, n: i, ...extra }, mode: 'fields' });
const item = (seq, n, from = 0, extra) => ({ seq, ops: Array.from({ length: n }, (_, i) => rec(from + i, extra)) });

// ---------- chunking ----------

test('chunking: items are taken in order while the request stays within 300 ops', () => {
  const p = planRequest([item(1, 100), item(2, 100), item(3, 100), item(4, 100)]);
  assert.equal(p.ops.length, 300);
  assert.deepEqual(p.parts.map((x) => x.seq), [1, 2, 3]);
  assert.ok(p.parts.every((x) => x.last));
  const q = planRequest([item(1, 200), item(2, 200)]);
  assert.deepEqual(q.parts, [{ seq: 1, from: 0, to: 200, last: true }], 'the second item does not fit beside the first: it goes in the next request');
  assert.equal(planRequest([]), null);
  assert.equal(planRequest([{ seq: 1, ops: [] }]), null);
});

test('chunking: an item over 300 ops is sent as consecutive chunks of its own', () => {
  const big = item(7, 700);
  const a = planRequest([big, item(8, 5)]);
  assert.deepEqual(a.parts, [{ seq: 7, from: 0, to: 300, last: false }]);
  const b = planRequest([{ ...big, done: 300 }, item(8, 5)]);
  assert.deepEqual(b.parts, [{ seq: 7, from: 300, to: 600, last: false }]);
  assert.equal(b.ops[0].key, 'k300');
  const c = planRequest([{ ...big, done: 600 }, item(8, 5)]);
  assert.deepEqual(c.parts, [{ seq: 7, from: 600, to: 700, last: true }, { seq: 8, from: 0, to: 5, last: true }], 'the last chunk shares a request with the next item');
});

test('chunking: at most 1.5 MB of JSON per request; one op larger than that still goes alone', () => {
  const blob = 'x'.repeat(600 * 1024);
  const three = item(1, 3, 0, { blob });
  const a = planRequest([three]);
  assert.deepEqual(a.parts, [{ seq: 1, from: 0, to: 2, last: false }]);
  assert.ok(jsonBytes({ schema: 1, ops: a.ops }) <= MAX_REQ_BYTES);
  const each = [item(1, 1, 0, { blob: 'y'.repeat(900 * 1024) }), item(2, 1, 1, { blob: 'y'.repeat(900 * 1024) })];
  assert.deepEqual(planRequest(each).parts.map((x) => x.seq), [1]);
  const huge = item(3, 2, 0, { blob: 'z'.repeat(2 * 1024 * 1024) });
  assert.deepEqual(planRequest([huge]).parts, [{ seq: 3, from: 0, to: 1, last: false }]);
  assert.equal(MAX_REQ_OPS, 300);
});

test('chunking: bytes are counted as UTF-8 (Cyrillic and emoji), and maxItems sends one item per request', () => {
  assert.equal(jsonBytes('щ'), 4);       // two quotes + 2 bytes
  assert.equal(jsonBytes('🔌'), 6);      // two quotes + 4 bytes
  assert.deepEqual(planRequest([item(1, 2), item(2, 2)], { maxItems: 1 }).parts.map((x) => x.seq), [1]);
});

// ---------- answers ----------

test('answers: every row of spec 4 § 3.4 is classified', () => {
  assert.deepEqual(classify({ status: 200, body: { ok: true, n: 3 } }), { kind: 'ok' });
  assert.deepEqual(classify({ status: 422, body: { code: 'forbidden', index: 4 } }), { kind: 'reject', index: 4, code: 'forbidden' });
  assert.deepEqual(classify({ status: 422, body: { code: 'not-found', index: 0 } }), { kind: 'reject', index: 0, code: 'not-found' });
  assert.deepEqual(classify({ status: 422, body: { code: 'weird', index: 1 } }), { kind: 'reject', index: 1, code: 'invalid' });
  assert.deepEqual(classify({ status: 422, body: { code: 'invalid', index: -1 } }), { kind: 'bad-request' }, 'the request as a whole: an unknown 400');
  assert.deepEqual(classify({ status: 401, body: {} }), { kind: 'expired' });
  assert.deepEqual(classify({ status: 404, body: { message: 'Not found' } }), { kind: 'server-older' });
  assert.deepEqual(classify({ status: 404, body: { code: 'x' } }), { kind: 'bad-request' });
  assert.deepEqual(classify({ status: 409, body: { code: 'schema_old', schema: 1 } }), { kind: 'server-older' });
  assert.deepEqual(classify({ status: 426, body: { code: 'app_old' } }), { kind: 'app-older' });
  assert.deepEqual(classify({ status: 413, body: null }), { kind: 'too-large' });
  for (const s of [429, 500, 502, 503]) assert.deepEqual(classify({ status: s, body: null }), { kind: 'retry' }, String(s));
  assert.deepEqual(classify({ network: true }), { kind: 'retry' });
  assert.deepEqual(classify({ status: 400, body: { message: 'bad' } }), { kind: 'bad-request' });
  assert.deepEqual(classify({ status: 403, body: {} }), { kind: 'bad-request' });
});

test('back-off: 2, 5, 10, 30, 60 s, then stays at 60', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 20].map(backoffDelay), [2000, 5000, 10000, 30000, 60000, 60000, 60000]);
  assert.equal(backoffDelay(0), 0);
  assert.deepEqual(BACKOFF_MS, [2000, 5000, 10000, 30000, 60000]);
});

test('settle: a 200 finishes whole items and records the progress of a chunk', () => {
  const plan = { parts: [{ seq: 7, from: 0, to: 300, last: false }] };
  assert.deepEqual(settle(plan, { kind: 'ok' }).progress, [{ seq: 7, done: 300 }]);
  const r = settle({ parts: [{ seq: 1, from: 0, to: 2, last: true }, { seq: 2, from: 0, to: 3, last: true }] }, { kind: 'ok' }, { badTries: 2 });
  assert.deepEqual(r.done, [1, 2]);
  assert.equal(r.badTries, 0);
});

test('settle: a 422 sends the item holding `index` to «⚠» and the rest again at once; a refused chunk refuses the whole item', () => {
  const plan = { parts: [{ seq: 1, from: 0, to: 2, last: true }, { seq: 2, from: 0, to: 3, last: true }, { seq: 3, from: 0, to: 1, last: true }] };
  const r = settle(plan, { kind: 'reject', index: 3, code: 'forbidden' });
  assert.deepEqual(r.rejected, [{ seq: 2, code: 'forbidden' }]);
  assert.equal(r.now, true);
  assert.deepEqual(r.done, []);
  assert.deepEqual(settle(plan, { kind: 'reject', index: 5, code: 'invalid' }).rejected, [{ seq: 3, code: 'invalid' }]);
  const chunk = { parts: [{ seq: 9, from: 600, to: 900, last: false }] };
  assert.deepEqual(settle(chunk, { kind: 'reject', index: 120, code: 'invalid' }).rejected, [{ seq: 9, code: 'invalid' }]);
});

test('settle: 413, unknown 400 three times, holds and retries', () => {
  const two = { parts: [{ seq: 1, from: 0, to: 2, last: true }, { seq: 2, from: 0, to: 2, last: true }] };
  const one = { parts: [{ seq: 1, from: 0, to: 2, last: true }] };
  assert.deepEqual(settle(two, { kind: 'too-large' }).single, [1, 2]);
  assert.deepEqual(settle(one, { kind: 'too-large' }).rejected, [{ seq: 1, code: 'invalid' }]);
  let s = { badTries: 0 };
  const a = settle(one, { kind: 'bad-request' }, s); assert.equal(a.backoff, true); s = a;
  const b = settle(one, { kind: 'bad-request' }, s); assert.equal(b.backoff, true); s = b;
  const c = settle(one, { kind: 'bad-request' }, s);
  assert.deepEqual(c.rejected, [{ seq: 1, code: 'invalid' }]);
  assert.equal(c.badTries, 0);
  for (const k of ['expired', 'server-older', 'app-older']) assert.equal(settle(one, { kind: k }).hold, k);
  assert.equal(settle(one, { kind: 'retry' }).backoff, true);
});

// ---------- replay and counts ----------

test('replay: queued ops are shown over a server version of the document, in queue order', () => {
  const id = docId('r', 'p1', 'days', 'd1');
  const server = { id: 'd1', a: 1, nested: { x: 1, y: 1 }, _pb: { id: 'pbid', updated: '2026-11-27 10:00:00.000Z' } };
  const items = [
    { ops: toOps('commit', 'p1', [{ coll: 'days', id: 'd1', data: { nested: { y: 2 } } }]) },
    { ops: toOps('commit', 'p1', [{ coll: 'days', id: 'other', data: { z: 1 } }]) },
    { ops: toOps('commit', 'p1', [{ coll: 'days', id: 'd1', data: { b: 3 } }]) },
  ];
  const shown = replayOps(server, items, id);
  assert.deepEqual(shown, { id: 'd1', a: 1, b: 3, nested: { x: 1, y: 2 }, _pb: server._pb, _pending: true });
  assert.deepEqual(replayOps(server, items, docId('r', 'p1', 'days', 'none')), server, 'no queued op: the server version as it is');
  assert.deepEqual(replayOps(shown, items, id), shown, 'replaying ops the document already holds changes nothing');
});

test('replay: the targets of every op kind, the inbox key, history kept apart', () => {
  assert.equal(opTarget({ t: 'project', key: 'p1' }).id, 'p|||p1');
  assert.equal(opTarget(rec(1)).id, 'r|p1|points|k1');
  assert.equal(opTarget({ t: 'pool', kind: 'types', key: 'a/b' }).id, 'pool||types|a/b');
  assert.equal(opTarget({ t: 'prefs', data: {}, mode: 'deep' }).id, 'prefs|||main');
  assert.deepEqual(opTarget({ t: 'history', pid: 'p1', key: 'h1' }), { store: 'history', id: 'p1|h1' });
  assert.equal(opTarget({ t: 'allowed', email: 'a@b.c' }), null);
  assert.equal(scopeOf('r|p1|catalog|Поставка | склад'), 'r|p1|catalog');
  assert.deepEqual(applyOp(null, { t: 'inbox', key: 'p1|x', data: { kind: 'types' } }), { kind: 'types', key: 'p1|x' });
});

test('counts: «⬆» counts the non-history writes of this user only', () => {
  const ops = toOps('commit', 'p1', [{ coll: 'points', id: 'a', data: {} }, { coll: 'history', id: 'h', data: { at: 1 } }]);
  const q = [{ uid: 'u1', ops }, { uid: 'u1', ops: toOps('allowEmails', null, ['x@y.z']) }, { uid: 'u2', ops }];
  assert.equal(queueCount(q, 'u1'), 2);
  assert.equal(queueCount(q, 'u2'), 1);
  const big = { uid: 'u1', ops: toOps('commit', 'p1', Array.from({ length: 10 }, (_, i) => ({ coll: 'points', id: `x${i}`, data: {} }))) };
  assert.equal(queueCount([big], 'u1'), 10);
  assert.equal(queueCount([{ ...big, done: 6 }], 'u1'), 4, 'a chunk on the server counts down «⬆»');
  assert.equal(otherAccountNotice(2), 'Вы вошли другим аккаунтом. Неотправленные записи прошлого аккаунта (2) ждут, пока он снова войдёт на этом телефоне.');
  assert.equal(otherAccountNotice(0), null);
});

// ---------- fakes ----------

// The IndexedDB calls localcopy.js makes: open (with upgrade), transaction, objectStore, put, delete, clear, getAll, getAllKeys, tx.onerror
function fakeIdb() {
  const dbs = new Map();
  const cmp = (a, b) => (typeof a === typeof b ? (a < b ? -1 : a > b ? 1 : 0) : typeof a === 'number' ? -1 : 1);
  const later = (req, fn) => { setImmediate(() => { req.result = fn(); req.onsuccess?.(); }); return req; };
  const makeDb = () => {
    const stores = new Map();
    return {
      stores,
      createObjectStore(n) { stores.set(n, new Map()); },
      transaction() {
        return {
          objectStore(n) {
            const m = stores.get(n);
            return {
              put(v, k) { m.set(k, structuredClone(v)); },
              delete(k) { m.delete(k); },
              clear() { m.clear(); },
              getAllKeys() { return later({}, () => [...m.keys()].sort(cmp)); },
              getAll() { return later({}, () => [...m.keys()].sort(cmp).map((k) => structuredClone(m.get(k)))); },
            };
          },
        };
      },
      close() {},
    };
  };
  return {
    dbs,
    open(name) {
      const req = {};
      setImmediate(() => {
        let db = dbs.get(name); const fresh = !db;
        if (fresh) { db = makeDb(); dbs.set(name, db); }
        req.result = db;
        if (fresh) req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };
}
const store = (idb, s) => idb.dbs.get('pm-pb').stores.get(s);

const tick = () => new Promise((r) => setImmediate(r));
async function settleAll(n = 6) { for (let i = 0; i < n; i++) await tick(); }

function fakeTimers() {
  let id = 0; const list = new Map();
  return {
    list,
    setTimeout(f, ms) { id++; list.set(id, { f, ms }); return id; },
    clearTimeout(t) { list.delete(t); },
    // the delays the sender is waiting on (a request's own timeout is cleared when its answer comes)
    waits() { return [...list.values()].map((x) => x.ms); },
    async run() { const all = [...list.entries()]; all.forEach(([k]) => list.delete(k)); all.forEach(([, x]) => x.f()); await settleAll(); },
  };
}

// A fake fetch: answers from a script (a function of the request body), keeps every body
function fakeFetch(answer) {
  const calls = [];
  const fn = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body, auth: init.headers.Authorization });
    const a = answer(body, calls.length);
    if (a === 'network') throw new TypeError('Failed to fetch');
    return { status: a.status, json: async () => a.body };
  };
  return { fn, calls };
}
const OK = (body) => ({ status: 200, body: { ok: true, n: body.ops.length } });

async function setup({ idb = fakeIdb(), uid = 'u1', answer = OK, online = () => true } = {}) {
  const { copy, switched } = await openLocalCopy({ uid, idb, win: null, doc: null });
  const timers = fakeTimers();
  const f = fakeFetch(answer);
  const user = { uid, email: `${uid}@pm.test`, displayName: uid };
  let sender = null;
  const auth = { expired: false };
  const backend = createPocketBaseBackend({ copy, user, onQueued: () => sender.kick(300) });
  sender = createSender({
    copy, uid: () => uid, token: () => 'tok', fetchFn: f.fn, timers, online,
    isExpired: () => auth.expired, onExpired: () => { auth.expired = true; },
    onDone: backend.itemDone, onRejected: backend.itemRejected, onProgress: backend.itemProgress,
  });
  const repo = createRepo(backend, user);
  return { idb, copy, switched, timers, f, backend, sender, repo, auth, user };
}

// ---------- the local copy ----------

test('local copy: documents are batched, the queue is not; a cut-off document write is replayed from the queue at start', async () => {
  const idb = fakeIdb();
  const s = await setup({ idb });
  s.repo.save('p1', [{ coll: 'points', id: 'a', data: { label: 'C1' } }]);
  assert.equal(store(idb, 'queue').size, 1, 'the queue item is in IndexedDB at once');
  assert.equal(store(idb, 'docs').size, 0, 'documents wait for the 150 ms batch');
  // the app is closed before the batch: a new start shows the change from the queue
  const again = await openLocalCopy({ uid: 'u1', idb, win: null, doc: null });
  const d = again.copy.get('r|p1|points|a');
  assert.equal(d.label, 'C1');
  assert.equal(d._pending, true);
  assert.equal(again.copy.queueItems().length, 1);
  s.copy.flush();
  assert.equal(store(idb, 'docs').size, 1);
});

test('local copy: a scope is listed in document id order, whatever order the documents came in', async () => {
  const { copy } = await openLocalCopy({ uid: 'u1', idb: null, win: null, doc: null });
  copy.setDocs(['c', 'a', 'B', 'b'].map((k) => [`r|p1|points|${k}`, { id: k }]), { grouped: false });
  assert.deepEqual(copy.list('r|p1|points').map((d) => d.id), ['B', 'a', 'b', 'c']);
});

test('local copy: history over 60 days is dropped at start; history of a project is read newest first', async () => {
  const idb = fakeIdb();
  const now = Date.UTC(2026, 10, 27);
  const a = await openLocalCopy({ uid: 'u1', idb, win: null, doc: null, now: () => now });
  const b = createPocketBaseBackend({ copy: a.copy, user: { uid: 'u1' } });
  b.commit('p1', [{ coll: 'history', id: 'old', data: { id: 'old', at: now - HISTORY_KEEP_MS - 1 } }, { coll: 'history', id: 'new', data: { id: 'new', at: now - 1000 } }, { coll: 'history', id: 'mid', data: { id: 'mid', at: now - 5000 } }]);
  a.copy.flush();
  const c = await openLocalCopy({ uid: 'u1', idb, win: null, doc: null, now: () => now });
  assert.deepEqual(c.copy.history('p1').map((x) => x.id), ['new', 'mid']);
  assert.deepEqual(c.copy.history('p1', now - 2000).map((x) => x.id), ['new']);
  assert.deepEqual(c.copy.history('p2'), []);
});

// ---------- the sender ----------

test('sender: a write goes out 300 ms later with PB_SCHEMA and the token; the promise resolves, `_pending` clears, «⬆» goes to 0', async () => {
  const s = await setup();
  const ids = s.repo.save('p1', [{ coll: 'points', id: 'a', data: { label: 'C1' } }]);
  assert.deepEqual(ids, ['a']);
  assert.deepEqual(s.timers.waits(), [300]);
  await s.timers.run();
  assert.equal(s.f.calls.length, 1);
  const { body, auth, url } = s.f.calls[0];
  assert.equal(url, '/api/pm/save');
  assert.equal(auth, 'tok');
  assert.equal(body.schema, PB_SCHEMA);
  assert.deepEqual(body.ops.map((o) => o.t), ['rec', 'history']);
  assert.equal(s.copy.queueItems().length, 0);
  assert.equal(s.copy.get('r|p1|points|a')._pending, undefined);
  assert.equal(s.backend.queueCount(), 0);
  assert.ok(s.sender.syncState().lastAnswerAt > 0);
});

test('sender: `_pending` stays on a document a later queued item still touches', async () => {
  let n = 0;
  const s = await setup({ answer: (b) => (++n === 1 ? OK(b) : { status: 503, body: null }) });
  s.backend.commit('p1', [{ coll: 'days', id: 'd', data: { a: 1 } }]);
  await s.timers.run();   // the first request: only the first item (sent before the second exists)
  assert.equal(s.copy.get('r|p1|days|d')._pending, undefined);
  s.backend.commit('p1', [{ coll: 'days', id: 'd', data: { b: 1 } }]);
  s.backend.commit('p1', [{ coll: 'days', id: 'd', data: { c: 1 } }]);
  assert.equal(s.copy.get('r|p1|days|d')._pending, true);
  assert.deepEqual(s.copy.get('r|p1|days|d'), { a: 1, b: 1, c: 1, _pending: true });
});

test('sender: no answer → back-off 2, 5, 10, 30, 60, 60 s; reset after a success; the resend carries the same ops (idempotent)', async () => {
  let fail = 6;
  const s = await setup({ answer: (b) => (fail-- > 0 ? 'network' : OK(b)) });
  s.backend.commit('p1', [{ coll: 'days', id: 'd', data: { a: 1 } }]);
  const waits = [];
  for (let i = 0; i < 6; i++) { await s.timers.run(); waits.push(...s.timers.waits()); }
  assert.deepEqual(waits, [2000, 5000, 10000, 30000, 60000, 60000]);
  await s.timers.run();
  assert.equal(s.copy.queueItems().length, 0);
  assert.equal(s.f.calls.length, 7);
  assert.ok(s.f.calls.every((c) => JSON.stringify(c.body) === JSON.stringify(s.f.calls[0].body)), 'every try sends the same request');
  // after the success the back-off starts from 2 s again
  fail = 1;
  s.backend.commit('p1', [{ coll: 'days', id: 'e', data: { a: 1 } }]);
  await s.timers.run();
  assert.deepEqual(s.timers.waits(), [2000]);
  assert.equal(s.sender.syncState().failures, 1);
});

test('sender: 429 and 5xx back off like a network error', async () => {
  let n = 0;
  const s = await setup({ answer: (b) => (++n === 1 ? { status: 429, body: null } : n === 2 ? { status: 500, body: { code: 'server' } } : OK(b)) });
  s.backend.commit('p1', [{ coll: 'days', id: 'd', data: { a: 1 } }]);
  await s.timers.run(); assert.deepEqual(s.timers.waits(), [2000]);
  await s.timers.run(); assert.deepEqual(s.timers.waits(), [5000]);
  await s.timers.run(); assert.equal(s.copy.queueItems().length, 0);
});

test('sender: a 422 sends the refused item to «⚠» with its code; the other items are sent again at once', async () => {
  for (const x of rejectedList()) dropRejected(x.id);
  const s = await setup({ answer: (b) => (b.ops.some((o) => o.pid === 'bad') ? { status: 422, body: { code: 'forbidden', index: b.ops.findIndex((o) => o.pid === 'bad'), message: 'not a member of the project' } } : OK(b)) });
  s.repo.save('p1', [{ coll: 'points', id: 'a', data: { label: 'A' } }]);
  s.repo.save('bad', [{ coll: 'points', id: 'b', data: { label: 'B' } }]);
  s.repo.save('p1', [{ coll: 'points', id: 'c', data: { label: 'C' } }]);
  await s.timers.run();
  await s.timers.run();
  assert.equal(s.f.calls.length, 2);
  assert.equal(s.f.calls[0].body.ops.length, 6, 'the three items went in one request');
  assert.deepEqual(s.f.calls[1].body.ops.filter((o) => o.t === 'rec').map((o) => o.key), ['a', 'c'], 'the rest goes again at once');
  assert.equal(s.copy.queueItems().length, 0);
  const rej = rejectedList();
  assert.equal(rej.length, 1);
  assert.equal(rej[0].code, 'forbidden');
  assert.equal(rej[0].pid, 'bad');
  assert.equal(rej[0].msg, 'not a member of the project');
  // «🔁 Повторить» resends the whole item through the queue
  s.repo.retryRejected();
  assert.equal(s.copy.queueItems().length, 1);
  assert.equal(rejectedList().length, 0);
});

test('refusedRepair: the documents a refused item touched (not those a later item touches), their full-read stamps and its history entries (review 4, F1)', () => {
  const it = { seq: 1, ops: [
    { t: 'project', key: 'p1', data: { archived: true }, mode: 'deep' }, rec(1), rec(2),
    { t: 'history', pid: 'p1', key: 'h1', data: { id: 'h1', at: 1 } },
    { t: 'pool', kind: 'doorcfg', key: 'd1', data: { deleted: true } }, { t: 'inbox', key: 'u_x', data: { a: 1 } }, { t: 'prefs', data: { a: 1 }, mode: 'deep' },
    { t: 'allowed', email: 'x@y.z' },
  ] };
  const later = [{ seq: 2, ops: [rec(2)] }];
  assert.deepEqual(refusedRepair(it, later), {
    docs: ['p|||p1', 'r|p1|points|k1', 'pool||doorcfg|d1', 'inbox|||u_x', 'prefs|||main'],
    history: ['p1|h1'],
    full: ['full|r|p1', 'full|pool', 'full|inbox'],
  });
  assert.deepEqual(refusedRepair(null), { docs: [], history: [], full: [] });
});

test('local copy: a refused item is undone — its documents lose the server version mark and `_pending`, its history goes, the full read is due', async () => {
  for (const x of rejectedList()) dropRejected(x.id);
  const s = await setup({ answer: (b) => ({ status: 422, body: { code: 'forbidden', index: 0, message: 'no' } }) });
  s.copy.setDocs([['r|p1|points|a', { id: 'a', label: 'server', _pb: { id: 'r1', updated: '2026-11-28 10:00:00.000Z' } }]], { grouped: false });
  s.copy.setMeta('full|r|p1', { at: 1, n: 1 });
  s.repo.save('p1', [{ coll: 'points', id: 'a', data: { label: 'mine' } }]);
  s.repo.save('p1', [{ coll: 'points', id: 'b', data: { label: 'B' } }]);
  assert.equal(s.copy.get('r|p1|points|a').label, 'mine');
  assert.equal(s.copy.history('p1').length, 2);
  await s.timers.run();
  // the first item is refused; the second is refused too (the fake refuses everything) — both undone
  await s.timers.run();
  const a = s.copy.get('r|p1|points|a');
  assert.equal(a._pb.updated, '', 'the next read takes the server version');
  assert.equal(a._pb.id, 'r1');
  assert.equal(a._pending, undefined);
  assert.equal(s.copy.getMeta('full|r|p1'), undefined, 'the project\'s records are read in full next time');
  assert.equal(s.copy.history('p1').length, 0, 'the refused history entries are gone');
  assert.equal(s.copy.queueItems().length, 0);
  assert.equal(rejectedList().length, 2);
});

test('sender: a large item rejected in its third chunk goes to «⚠» whole; «Повторить» sends it all again', async () => {
  for (const x of rejectedList()) dropRejected(x.id);
  const s = await setup({ answer: (b, n) => (n === 3 ? { status: 422, body: { code: 'invalid', index: 10 } } : OK(b)) });
  const ops = Array.from({ length: 400 }, (_, i) => ({ coll: 'points', id: `p${i}`, data: { label: `C${i}` } }));
  s.repo.save('p1', ops);   // 800 ops with history: chunks of 300, 300, 200
  for (let i = 0; i < 4; i++) await s.timers.run();
  assert.deepEqual(s.f.calls.map((c) => c.body.ops.length), [300, 300, 200]);
  assert.equal(s.copy.queueItems().length, 0);
  assert.equal(rejectedList().length, 1);
  assert.equal(rejectedList()[0].writes.length, 800);
});

test('sender: 401 holds the queue and marks the sign-in expired; it goes out after the sign-in', async () => {
  let expired = true;
  const s = await setup({ answer: (b) => (expired ? { status: 401, body: { message: 'expired' } } : OK(b)) });
  s.backend.commit('p1', [{ coll: 'days', id: 'd', data: { a: 1 } }]);
  await s.timers.run();
  assert.equal(s.auth.expired, true);
  assert.equal(s.sender.syncState().signInExpired, true);
  assert.deepEqual(s.timers.waits(), [], 'nothing is retried while the sign-in is expired');
  s.backend.commit('p1', [{ coll: 'days', id: 'e', data: { a: 1 } }]);
  await s.timers.run();
  assert.equal(s.f.calls.length, 1, 'no request while expired');
  expired = false; s.auth.expired = false;
  s.sender.kick(0); await s.timers.run();
  assert.equal(s.copy.queueItems().length, 0);
});

test('sender: server older (404 without code, 409 schema_old) holds with a probe a minute; 426 holds; offline holds', async () => {
  let ans = { status: 404, body: { message: 'The requested resource wasn\'t found.' } };
  const s = await setup({ answer: (b) => (ans === 'ok' ? OK(b) : ans) });
  s.backend.commit('p1', [{ coll: 'days', id: 'd', data: { a: 1 } }]);
  await s.timers.run();
  assert.equal(s.sender.syncState().serverOlder, true);
  assert.deepEqual(s.timers.waits(), [60000], 'one probe a minute');
  s.sender.kick(0); await s.timers.run();
  assert.equal(s.f.calls.length, 1, 'an ordinary kick does not send while the server is older');
  ans = { status: 409, body: { code: 'schema_old', schema: 1 } };
  s.sender.wake(); await s.timers.run();
  assert.equal(s.f.calls.length, 2);
  assert.equal(s.sender.syncState().serverOlder, true);
  ans = 'ok';
  s.sender.wake(); await s.timers.run();
  assert.equal(s.sender.syncState().serverOlder, false);
  assert.equal(s.copy.queueItems().length, 0);

  const t = await setup({ answer: () => ({ status: 426, body: { code: 'app_old' } }) });
  t.backend.commit('p1', [{ coll: 'days', id: 'd', data: { a: 1 } }]);
  await t.timers.run();
  assert.equal(t.sender.syncState().appOlder, true);
  t.sender.kick(0); await t.timers.run();
  assert.equal(t.f.calls.length, 1);

  let on = false;
  const u = await setup({ online: () => on });
  u.backend.commit('p1', [{ coll: 'days', id: 'd', data: { a: 1 } }]);
  await u.timers.run();
  assert.equal(u.f.calls.length, 0, 'offline: nothing is sent');
  assert.equal(u.backend.queueCount(), 1);
  on = true; u.sender.kick(0); await u.timers.run();
  assert.equal(u.copy.queueItems().length, 0);
});

test('sender: a probe of an updated server answered with a refusal ends «server older», and the rest of the queue goes', async () => {
  for (const x of rejectedList()) dropRejected(x.id);
  let older = true;
  const s = await setup({ answer: (b) => (older ? { status: 409, body: { code: 'schema_old', schema: 1 } } : b.ops.some((o) => o.key === 'no') ? { status: 422, body: { code: 'forbidden', index: 0 } } : OK(b)) });
  s.backend.commit('p1', [{ coll: 'days', id: 'no', data: { a: 1 } }]).catch(() => {});
  s.backend.commit('p1', [{ coll: 'days', id: 'yes', data: { a: 1 } }]);
  await s.timers.run();
  assert.equal(s.sender.syncState().serverOlder, true);
  older = false;
  s.sender.wake();
  for (let i = 0; i < 2; i++) await s.timers.run();
  assert.equal(s.sender.syncState().serverOlder, false);
  assert.equal(s.copy.queueItems().length, 0, 'the item after the refused one went out');
  for (const x of rejectedList()) dropRejected(x.id);
});

test('sender: a 5xx (the tunnel while the server is down) is not «Последнее обновление»', async () => {
  const s = await setup({ answer: () => ({ status: 502, body: null }) });
  s.backend.commit('p1', [{ coll: 'days', id: 'd', data: { a: 1 } }]);
  await s.timers.run();
  assert.equal(s.sender.syncState().lastAnswerAt, 0);
});

test('«⚠» per account (KI-9): another account neither sees nor retries a refused write; its owner does', async () => {
  for (const x of rejectedList()) dropRejected(x.id);
  const idb = fakeIdb();
  const refuse = () => ({ status: 422, body: { code: 'forbidden', index: 0 } });
  const a = await setup({ idb, uid: 'u1', answer: refuse });
  a.repo.save('p1', [{ coll: 'points', id: 'a', data: { label: 'A' } }]);
  await a.timers.run();
  await new Promise((r) => setImmediate(r));   // the refusal reaches createRepo's handler
  assert.equal(rejectedList()[0].uid, 'u1');
  const b = await setup({ idb, uid: 'u2' });
  assert.equal(b.repo.retryRejected(), 0);
  assert.equal(b.copy.queueItems().length, 0);
  assert.equal(rejectedList().length, 1, 'it waits for its owner');
  // a refused write queued before a restart keeps its owner too
  const c = await setup({ idb, uid: 'u1', answer: () => 'network' });
  assert.equal(c.repo.retryRejected(), 1);
  c.copy.flush();
  const d = await setup({ idb, uid: 'u1', answer: refuse });
  d.sender.start(null, null); await d.timers.run();
  assert.deepEqual(rejectedList().map((x) => x.uid), ['u1']);
  for (const x of rejectedList()) dropRejected(x.id);
});

test('sender: 413 of several items sends one item per request; 413 of a single item → «⚠» invalid', async () => {
  for (const x of rejectedList()) dropRejected(x.id);
  const s = await setup({ answer: (b) => (b.ops.length > 2 ? { status: 413, body: null } : b.ops.some((o) => o.key === 'big') ? { status: 413, body: null } : OK(b)) });
  s.repo.save('p1', [{ coll: 'points', id: 'a', data: {} }]);
  s.repo.save('p1', [{ coll: 'points', id: 'big', data: {} }]);
  s.repo.save('p1', [{ coll: 'points', id: 'c', data: {} }]);
  for (let i = 0; i < 5; i++) await s.timers.run();
  assert.deepEqual(s.f.calls.map((c) => c.body.ops.length), [6, 2, 2, 2]);
  assert.equal(s.copy.queueItems().length, 0);
  assert.deepEqual(rejectedList().map((x) => x.code), ['invalid']);
});

test('sender: an unknown 400 is backed off three times, then the first item goes to «⚠» invalid', async () => {
  for (const x of rejectedList()) dropRejected(x.id);
  const s = await setup({ answer: (b) => (b.ops.some((o) => o.key === 'x') ? { status: 400, body: { message: 'Something went wrong' } } : OK(b)) });
  s.repo.save('p1', [{ coll: 'points', id: 'x', data: {} }]);
  await s.timers.run(); assert.deepEqual(s.timers.waits(), [2000]);
  await s.timers.run(); assert.deepEqual(s.timers.waits(), [5000]);
  await s.timers.run();
  assert.deepEqual(rejectedList().map((x) => x.code), ['invalid']);
  assert.equal(s.copy.queueItems().length, 0);
});

// ---------- restart and identity ----------

test('restart: «⬆» counts the queue with no live promise; a refused item queued before the restart goes to «⚠»', async () => {
  for (const x of rejectedList()) dropRejected(x.id);
  const idb = fakeIdb();
  const a = await setup({ idb, answer: () => 'network' });
  a.repo.save('p1', [{ coll: 'points', id: 'a', data: { label: 'A' } }]);
  a.repo.saveProject('p1', { name: 'X' });
  // the app closes before anything is sent; it opens again
  const b = await setup({ idb, answer: (body) => ({ status: 422, body: { code: 'forbidden', index: body.ops.findIndex((o) => o.t === 'project') } }) });
  assert.equal(b.backend.queueCount(), 2);
  b.sender.start(null, null);
  await b.timers.run();
  await b.timers.run();
  assert.equal(rejectedList().length, 1);
  assert.equal(rejectedList()[0].kind, 'project');
  assert.equal(rejectedList()[0].code, 'forbidden');
});

test('another user signs in: the copy is cleared, the previous user\'s items stay unsent and go out after that user signs in again', async () => {
  const idb = fakeIdb();
  const a = await setup({ idb, uid: 'u1', answer: () => 'network' });
  a.repo.save('p1', [{ coll: 'points', id: 'a', data: { label: 'A' } }]);
  a.copy.flush();
  const b = await setup({ idb, uid: 'u2' });
  assert.deepEqual(b.switched, { from: 'u1', count: 1 });
  assert.equal(b.copy.get('r|p1|points|a'), null, 'the documents of the other user are gone');
  assert.equal(b.backend.queueCount(), 0);
  assert.equal(b.copy.queueItems().length, 1, 'the other user\'s item is kept');
  b.sender.start(null, null); await b.timers.run();
  assert.equal(b.f.calls.length, 0, 'and not sent');
  const again = await setup({ idb, uid: 'u2' });
  assert.equal(again.switched, null, 'the notice shows once');
  const c = await setup({ idb, uid: 'u1' });
  assert.deepEqual(c.switched, { from: 'u2', count: 0 });
  assert.equal(c.copy.get('r|p1|points|a').label, 'A', 'the queued change is shown again for its user');
  c.sender.start(null, null); await c.timers.run();
  assert.equal(c.f.calls.length, 1);
  assert.equal(c.copy.queueItems().length, 0);
});

test('backend: listeners answer from the copy; prefs, pool and the project list as the app reads them', async () => {
  const s = await setup();
  let projects = null; let prefs = null; let pool = null; let poolAll = null;
  s.backend.listenProjects('u1', (l) => { projects = l; });
  s.backend.listenUserPrefs('u1', (p) => { prefs = p; });
  s.backend.listenPool('delayReasons', (l) => { pool = l; });
  s.backend.listenPool('delayReasons', (l) => { poolAll = l; }, { withDeleted: true });
  const pid = s.repo.createProject({ name: 'Тест NAS' });
  s.repo.saveUserPrefs({ bind: 1 });
  s.repo.savePool([{ coll: 'delayReasons', id: 'r1', data: { name: 'Дождь' } }, { coll: 'delayReasons', id: 'r2', remove: true }]);
  assert.deepEqual(projects.map((p) => p.id), [pid]);
  assert.deepEqual(prefs, { bind: 1 });
  assert.deepEqual(pool.map((x) => x.id), ['r1']);
  assert.equal(poolAll.length, 2);
  assert.ok((await s.backend.readColl(pid, 'catalog')).length > 0, 'the seed catalogs of the new project');
  // a shown document spread into a write never sends the phone's own keys
  s.backend.commit(pid, [{ coll: 'points', id: 'z', data: { label: 'Z', _pending: true, _pb: { id: 'x' } } }]);
  const last = s.copy.queueItems().at(-1);
  assert.deepEqual(last.ops[0].data, { label: 'Z' });
});
