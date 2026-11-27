// Tests of the NAS copy's reading (spec 4 § 3.5, § 10 cases 3, 7, 9, 12, 13, 24, 25, § 11; ticket 4.6): the pure rules of src/domain/pbread.js (record → document,
// marks, the delta and page filters, the rollback check, full-read replacement keeping queued documents, the event-apply order, a server version with queued ops on top)
// and the reader of src/app/pb/reader.js over the real local copy (memory only) with a small fake of the SDK client. The real server: tests/pb-read.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordToDoc, projectKeyMap, pbTime, pbMs, newestOf, pageFilter, nextAfter, deltaSince, readMode, rolledBack, shouldApply,
  serverVersion, fullReadRemovals, dropsEveryProject, queuedIds, PAGE_SIZE, PREFIX, recordsPrefix,
} from '../src/domain/pbread.js';
import { DELTA_MARGIN, lastSaturday } from '../src/domain/sync.js';
import { toOps } from '../src/domain/pbwrite.js';

const ls = new Map();
globalThis.window ??= { addEventListener() {} };
globalThis.localStorage ??= { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) };
const { openLocalCopy } = await import('../src/app/pb/localcopy.js');
const { createReader, errorKind } = await import('../src/app/pb/reader.js');
const { createPocketBaseBackend } = await import('../src/app/pb/backend.js');

const T = (s) => `2026-11-27 10:${s}.000Z`;   // server times, minute:second
const proj = (key, id, updated, data = {}) => ({ id, key, updated, data: { id: key, name: key, memberUids: ['u1'], ...data } });
const rec = (project, coll, key, updated, data = {}) => ({ id: `r_${key}`, project, coll, key, updated, data: { id: key, ...data } });

// ---------- record → document ----------

test('record → document: each collection lands at its local id with `_pb`', () => {
  assert.deepEqual(recordToDoc('projects', proj('P1', 'pb1', T('00:01'))), ['p|||P1', { id: 'P1', name: 'P1', memberUids: ['u1'], _pb: { id: 'pb1', updated: T('00:01') } }]);
  const pidOf = (id) => (id === 'pb1' ? 'P1' : '');
  assert.deepEqual(recordToDoc('records', rec('pb1', 'points', 'a/b c', T('00:02'), { label: 'C1' }), pidOf),
    ['r|P1|points|a/b c', { id: 'a/b c', label: 'C1', _pb: { id: 'r_a/b c', updated: T('00:02') } }]);
  assert.equal(recordToDoc('records', rec('pbX', 'points', 'k', T('00:02')), pidOf), null, 'a record of a project the phone does not know');
  assert.deepEqual(recordToDoc('pool', { id: 'x', kind: 'culprits', key: 'Электрик', updated: T('00:03'), data: { name: 'Электрик' } })[0], 'pool||culprits|Электрик');
  assert.deepEqual(recordToDoc('inbox', { id: 'x', key: 'u1_P1', updated: T('00:04'), data: { status: 'new' } }), ['inbox|||u1_P1', { status: 'new', key: 'u1_P1', _pb: { id: 'x', updated: T('00:04') } }]);
  assert.equal(recordToDoc('prefs', { id: 'y', updated: T('00:05'), data: { lang: 'he' } })[0], 'prefs|||main');
  const inv = recordToDoc('invites', { id: 'i1', project: 'pb9', email: 'b@x', updated: T('00:06'), data: { name: 'Объект', from: 'a@x' } });
  assert.deepEqual(inv, ['inv|||i1', { name: 'Объект', from: 'a@x', _pb: { id: 'i1', updated: T('00:06'), project: 'pb9', email: 'b@x' } }]);
  assert.equal(recordToDoc('projects', { id: 'z' }), null, 'a project without its key');
  assert.deepEqual(recordToDoc('records', { ...rec('pb1', 'points', 'k', T('00:02')), data: null }, pidOf)[1], { _pb: { id: 'r_k', updated: T('00:02') } }, 'no data → an empty document');
});

test('record → document: PocketBase project ids map to the app\'s ids from the local project documents', () => {
  const m = projectKeyMap([['p|||P1', { _pb: { id: 'pb1' } }], ['p|||P|2', { _pb: { id: 'pb2' } }], ['p|||P3', { id: 'P3' }]]);
  assert.equal(m.get('pb1'), 'P1');
  assert.equal(m.get('pb2'), 'P|2', 'a key holding «|» stays whole');
  assert.equal(m.size, 2, 'a project not on the server yet has no PocketBase id');
});

// ---------- marks and filters ----------

test('marks: server time text, compared as text; the newest `updated` seen', () => {
  assert.equal(pbTime(Date.UTC(2026, 10, 27, 10, 0, 5, 7)), '2026-11-27 10:00:05.007Z');
  assert.equal(pbMs('2026-11-27 10:00:05.007Z'), Date.UTC(2026, 10, 27, 10, 0, 5, 7));
  assert.equal(pbMs(''), 0);
  assert.equal(newestOf('', [{ updated: T('00:02') }, { updated: T('00:09') }, { updated: T('00:05') }]), T('00:09'));
  assert.equal(newestOf(T('00:10'), [{ updated: T('00:02') }]), T('00:10'), 'an older page does not move the mark back');
  assert.equal(newestOf('', []), '');
});

test('delta filter: changes after the mark minus 10 minutes, keyset pages by updated and id', () => {
  const mark = '2026-11-27 10:30:00.000Z';
  assert.equal(deltaSince(mark), '2026-11-27 10:20:00.000Z');
  assert.equal(pbMs(mark) - pbMs(deltaSince(mark)), DELTA_MARGIN);
  assert.equal(deltaSince(''), '');
  assert.equal(pageFilter('project = "pb1"', deltaSince(mark)), '(project = "pb1") && updated > "2026-11-27 10:20:00.000Z"');
  assert.equal(pageFilter('', '', { updated: T('00:01'), id: 'abc' }), `(updated > "${T('00:01')}" || (updated = "${T('00:01')}" && id > "abc"))`);
  assert.equal(pageFilter(), '');
  assert.equal(pageFilter('kind = "a\\"b"'), '(kind = "a\\"b")');
  const full = Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: `i${i}`, updated: T('00:01') }));
  assert.deepEqual(nextAfter(full), { updated: T('00:01'), id: `i${PAGE_SIZE - 1}` });
  assert.equal(nextAfter(full.slice(1)), null, 'a short page is the last');
  assert.equal(PAGE_SIZE, 1000);
});

test('read mode: full without a mark, after the Saturday boundary or with fewer documents than the last full read; else delta', () => {
  const now = Date.UTC(2026, 10, 27, 12);   // a Friday
  const sat = lastSaturday(now);
  assert.equal(readMode({ mark: '', full: { at: now, n: 3 }, cached: 3, now }), 'full');
  assert.equal(readMode({ mark: T('00:01'), full: null, cached: 3, now }), 'full');
  assert.equal(readMode({ mark: T('00:01'), full: { at: sat - 1, n: 3 }, cached: 3, now }), 'full', 'the first start from Saturday 00:00 reads in full');
  assert.equal(readMode({ mark: T('00:01'), full: { at: sat + 1, n: 3 }, cached: 2, now }), 'full', 'the copy lost documents');
  assert.equal(readMode({ mark: T('00:01'), full: { at: sat + 1, n: 3 }, cached: 3, now }), 'delta');
  assert.equal(readMode({ mark: T('00:01'), full: { at: sat + 1, n: 0 }, cached: 0, now }), 'full', 'an empty scope reads in full (cheap)');
});

test('rollback check: the newest server record older than the newest the phone has seen', () => {
  assert.equal(rolledBack(T('00:05'), T('00:09')), true);
  assert.equal(rolledBack('', T('00:09')), true, 'the server shows no record at all');
  assert.equal(rolledBack(T('00:09'), T('00:09')), false);
  assert.equal(rolledBack(T('00:10'), T('00:09')), false);
  assert.equal(rolledBack(T('00:01'), ''), false, 'nothing seen yet');
});

// ---------- applying ----------

test('event-apply order: applied when not older than the local version; a document without `_pb` takes any', () => {
  assert.equal(shouldApply(null, T('00:01')), true);
  assert.equal(shouldApply({ id: 'k', _pending: true }, T('00:01')), true, 'created on the phone, not echoed yet');
  assert.equal(shouldApply({ _pb: { updated: T('00:05') } }, T('00:05')), true, 'the same time: applied');
  assert.equal(shouldApply({ _pb: { updated: T('00:05') } }, T('00:06')), true);
  assert.equal(shouldApply({ _pb: { updated: T('00:05') } }, T('00:04')), false, 'an older event that arrived late');
});

test('a server version is shown with the queued ops replayed on top (spec 4 § 10 case 24)', () => {
  const ops = toOps('commit', 'P1', [{ coll: 'points', id: 'k', data: { label: 'C2', note: 'новое' } }]);
  const items = [{ uid: 'u1', ops }];
  const server = { id: 'k', label: 'C1', cabinet: 'R1', _pb: { id: 'r_k', updated: T('00:05') } };
  const shown = serverVersion(server, items, 'r|P1|points|k');
  assert.equal(shown.label, 'C2', 'the queued change stays on screen');
  assert.equal(shown.cabinet, 'R1', 'the server\'s other fields come through');
  assert.equal(shown._pending, true);
  assert.deepEqual(shown._pb, server._pb);
  assert.deepEqual(serverVersion(server, items, 'r|P1|points|other'), server, 'untouched: the server version as is');
  assert.equal(serverVersion(null, [], 'r|P1|points|k'), null, 'removed on the server, nothing queued');
  assert.equal(serverVersion(null, items, 'r|P1|points|k').label, 'C2', 'removed on the server but queued: the queued write brings it back');
  assert.deepEqual([...queuedIds(items)], ['r|P1|points|k']);
});

test('full-read replacement: documents the server did not return are removed, except queued ones and newer events', () => {
  const rows = [
    ['r|P1|points|a', { _pb: { updated: T('00:01') } }],                 // on the server
    ['r|P1|points|b', { _pb: { updated: T('00:02') } }],                 // gone from the server
    ['r|P1|points|c', { _pending: true }],                               // queued, not on the server yet
    ['r|P1|points|d', { _pb: { updated: T('00:09') } }],                 // arrived by an event after the read's newest record
    ['r|P1|points|e', {}],                                               // was sent, the server no longer has it
  ];
  const gone = fullReadRemovals(rows, new Set(['r|P1|points|a']), new Set(['r|P1|points|c']), T('00:05'));
  assert.deepEqual(gone, ['r|P1|points|b', 'r|P1|points|e']);
  assert.deepEqual(fullReadRemovals(rows, new Set(), new Set(), ''), rows.map(([id]) => id), 'an empty answer with no mark replaces everything not queued');
  assert.equal(dropsEveryProject(2, 2), true);
  assert.equal(dropsEveryProject(2, 1), false);
  assert.equal(dropsEveryProject(0, 0), false);
  assert.equal(recordsPrefix('P1'), 'r|P1|');
  assert.equal(PREFIX.projects, 'p||');
});

test('error kinds of the SDK: no answer, 401, 404, the rest', () => {
  assert.equal(errorKind({ status: 0 }), 'network');
  assert.equal(errorKind({ status: 0, isAbort: true }), 'network');
  assert.equal(errorKind({ status: 401 }), 'expired');
  assert.equal(errorKind({ status: 404 }), 'missing');
  assert.equal(errorKind({ status: 500 }), 'server');
  assert.equal(errorKind(new Error('x')), 'network');
});

// ---------- the reader over a fake SDK client ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// A small fake of the SDK client: lists from `db` (filters `project = "…"`, `kind = "…"` and `updated > "…"` are honored; enough for pages under 1,000),
// subscriptions kept in `handlers`, PB_CONNECT fired by `connect()`.
function fakePb(db) {
  const calls = []; const handlers = {};
  const pick = (re, f) => { const m = re.exec(f || ''); return m ? m[1] : null; };
  const pb = {
    calls, handlers, db,
    filter: (raw, params) => raw.replace(/\{:(\w+)\}/g, (_, k) => (typeof params[k] === 'string' ? JSON.stringify(params[k]) : String(params[k]))),
    send: async (path) => { calls.push([path]); if (db.info instanceof Error || db.info?.status) throw db.info; return db.info || { app: 'pm', schema: 1, admin: '' }; },
    collection: (name) => ({
      getList: async (_page, per, o = {}) => {
        calls.push([name, o.filter || '', o.sort]);
        if (db.fail?.[name]) throw db.fail[name];
        let items = (db[name] || []).slice();
        const p = pick(/project = "([^"]+)"/, o.filter); if (p) items = items.filter((r) => r.project === p);
        const k = pick(/kind = "([^"]+)"/, o.filter); if (k) items = items.filter((r) => r.kind === k);
        const u = pick(/updated > "([^"]+)"/, o.filter); if (u) items = items.filter((r) => r.updated > u);
        items.sort((a, b) => (o.sort === '-updated' ? (a.updated < b.updated ? 1 : -1) : (a.updated > b.updated ? 1 : -1)));
        return { items: items.slice(0, per) };
      },
      subscribe: async (_topic, cb) => { handlers[name] = cb; return async () => {}; },
    }),
    realtime: {
      isConnected: false,
      subscribe: async (topic, cb) => { handlers[topic] = cb; return async () => {}; },
      unsubscribe: async () => {},
    },
    connect() { pb.realtime.isConnected = true; handlers.PB_CONNECT?.({}); },
  };
  return pb;
}
async function setup(db, { uid = 'u1', auth = {}, admin = false } = {}) {
  const { copy } = await openLocalCopy({ uid, idb: null, win: null, doc: null });
  const pb = fakePb(db);
  let woke = 0;
  const reader = createReader({ pb, copy, uid: () => uid, isAdmin: () => admin, auth, sender: { wake: () => { woke++; } }, win: null, doc: null });
  await reader.start();
  return { copy, pb, reader, woke: () => woke };
}
const ids = (copy, prefix) => copy.entries(prefix).map(([id]) => id).sort();

test('reader: after PB_CONNECT the six steps read everything into an empty copy; the sender is woken; «⬇» parts done', async () => {
  const db = {
    projects: [proj('P1', 'pb1', T('00:01')), proj('P2', 'pb2', T('00:02'))],
    records: [rec('pb1', 'points', 'a', T('00:03'), { label: 'C1' }), rec('pb1', 'days', '2026-11-27', T('00:04')), rec('pb2', 'points', 'b', T('00:05'))],
    pool: [{ id: 'q1', kind: 'culprits', key: 'Электрик', updated: T('00:06'), data: { name: 'Электрик' } }],
    invites: [], prefs: [{ id: 'pr', updated: T('00:07'), data: { lang: 'ru' } }],
  };
  const { copy, pb, reader, woke } = await setup(db);
  assert.equal(reader.readState().realtime, 'not');
  assert.deepEqual(reader.readState().parts.map((p) => p.part), ['projects', 'records', 'pool', 'invites', 'prefs'], 'no inbox for a non-administrator');
  pb.connect();
  await reader.readNow('full');
  assert.equal(woke(), 1);
  const s = reader.readState();
  assert.equal(s.realtime, 'connected');
  assert.equal(s.waiting, 0, JSON.stringify(s.parts));
  assert.ok(s.lastServerAt > 0);
  assert.deepEqual(ids(copy, 'p||'), ['p|||P1', 'p|||P2']);
  assert.deepEqual(ids(copy, 'r|P1|'), ['r|P1|days|2026-11-27', 'r|P1|points|a']);
  assert.equal(copy.get('r|P1|points|a').label, 'C1');
  assert.deepEqual(ids(copy, 'pool||'), ['pool||culprits|Электрик']);
  assert.equal(copy.get('prefs|||main').lang, 'ru');
  assert.equal(copy.getMeta('mark|r|P1'), T('00:04'));
  assert.equal(copy.getMeta('mark|r|P2'), T('00:05'));
  assert.equal(copy.getMeta('seen|r'), T('00:05'));
  // the order of § 3.5: info → rollback check → projects → invites, prefs → records → pool
  const order = pb.calls.map((c) => c[0]);
  assert.deepEqual(order.slice(0, 5), ['/api/pm/info', 'records', 'projects', 'invites', 'prefs']);
  assert.equal(pb.calls[1][2], '-updated', 'the rollback check asks for the newest record only');
  reader.stop();
});

test('reader: the next connect reads only changes since the mark minus 10 minutes', async () => {
  const db = { projects: [proj('P1', 'pb1', T('00:01'))], records: [rec('pb1', 'points', 'a', T('30:00'))], pool: [], invites: [], prefs: [] };
  const { copy, pb, reader } = await setup(db);
  pb.connect(); await reader.idle();
  db.records.push(rec('pb1', 'points', 'b', T('35:00')));
  pb.calls.length = 0;
  pb.connect(); await reader.idle();
  const q = pb.calls.find((c) => c[0] === 'records' && c[1].includes('project'));
  assert.match(q[1], /updated > "2026-11-27 10:20:00.000Z"/, 'delta from the mark minus 10 min');
  assert.deepEqual(ids(copy, 'r|P1|'), ['r|P1|points|a', 'r|P1|points|b']);
  assert.equal(copy.getMeta('mark|r|P1'), T('35:00'));
  reader.stop();
});

test('reader: realtime events are grouped, applied by `updated`, a delete removes, a queued change stays on top', async () => {
  const db = { projects: [proj('P1', 'pb1', T('00:01'))], records: [rec('pb1', 'points', 'a', T('00:05'), { label: 'C1' })], pool: [], invites: [], prefs: [] };
  const { copy, pb, reader } = await setup(db);
  pb.connect(); await reader.idle();
  const seen = [];
  copy.listen('r|P1|points', (list) => seen.push(list.length));
  seen.length = 0;
  pb.handlers.records({ action: 'create', record: rec('pb1', 'points', 'b', T('00:06'), { label: 'C2' }) });
  pb.handlers.records({ action: 'update', record: rec('pb1', 'points', 'a', T('00:07'), { label: 'C1x' }) });
  pb.handlers.records({ action: 'update', record: rec('pb1', 'points', 'a', T('00:04'), { label: 'old' }) });   // late and older: ignored
  await sleep(150);
  assert.deepEqual(seen, [2], 'one listener call for the group');
  assert.equal(copy.get('r|P1|points|a').label, 'C1x');
  assert.equal(copy.get('r|P1|points|b').label, 'C2');
  pb.handlers.records({ action: 'delete', record: rec('pb1', 'points', 'b', T('00:08')) });
  await sleep(150);
  assert.equal(copy.get('r|P1|points|b'), null);
  // a change queued on the phone, then the server's echo of an older change: the screen keeps the queued value
  copy.accept({ uid: 'u1', kind: 'commit', pid: 'P1', writes: [], ops: toOps('commit', 'P1', [{ coll: 'points', id: 'a', data: { label: 'mine' } }]) });
  pb.handlers.records({ action: 'update', record: rec('pb1', 'points', 'a', T('00:09'), { label: 'theirs', cabinet: 'R2' }) });
  await sleep(150);
  const a = copy.get('r|P1|points|a');
  assert.equal(a.label, 'mine');
  assert.equal(a.cabinet, 'R2');
  assert.equal(a._pending, true);
  assert.equal(copy.getMeta('seen|r'), T('00:09'), 'events count for the rollback check');
  reader.stop();
});

test('reader: a project that appears by realtime is read in full at once; a removed one leaves with its records at the next read', async () => {
  const db = { projects: [proj('P1', 'pb1', T('00:01'))], records: [rec('pb1', 'points', 'a', T('00:02'))], pool: [], invites: [], prefs: [] };
  const { copy, pb, reader } = await setup(db);
  pb.connect(); await reader.idle();
  // P2 shared with this user: its records exist from before (a delta from an old mark would miss them)
  db.projects.push(proj('P2', 'pb2', T('00:20')));
  db.records.push(rec('pb2', 'points', 'x', T('00:03')), rec('pb2', 'points', 'y', T('00:04')));
  pb.handlers.projects({ action: 'update', record: db.projects[1] });
  await reader.idle();
  assert.deepEqual(ids(copy, 'r|P2|'), ['r|P2|points|x', 'r|P2|points|y']);
  assert.ok(copy.getMeta('full|r|P2'));
  // the user is removed from P1 (no event reaches a non-member): the next read drops it and its records
  db.projects.shift(); db.records = db.records.filter((r) => r.project !== 'pb1');
  pb.connect(); await reader.idle();
  assert.deepEqual(ids(copy, 'p||'), ['p|||P2']);
  assert.deepEqual(ids(copy, 'r|P1|'), []);
  assert.equal(copy.getMeta('mark|r|P1'), undefined);
  reader.stop();
});

test('reader: a records event of an unknown project reads the project list first', async () => {
  const db = { projects: [], records: [], pool: [], invites: [], prefs: [] };
  const { copy, pb, reader } = await setup(db);
  pb.connect(); await reader.idle();
  db.projects.push(proj('P3', 'pb3', T('00:30')));
  db.records.push(rec('pb3', 'points', 'z', T('00:31')));
  pb.handlers.records({ action: 'create', record: db.records[0] });
  await reader.idle();
  assert.deepEqual(ids(copy, 'r|P3|'), ['r|P3|points|z']);
  reader.stop();
});

test('reader: a full read that would drop every project waits for a successful token refresh (spec 4 § 3.2)', async () => {
  const db = { projects: [proj('P1', 'pb1', T('00:01'))], records: [], pool: [], invites: [], prefs: [] };
  let refreshed = false; let refreshAnswer = 'unchanged'; let asked = 0;
  const auth = { isRefreshed: () => refreshed, refresh: async () => { asked++; if (refreshAnswer === 'ok') refreshed = true; return refreshAnswer; } };
  const { copy, pb, reader } = await setup(db, { auth });
  pb.connect(); await reader.idle();
  db.projects = [];
  pb.connect(); await reader.idle();
  assert.equal(asked, 1);
  assert.deepEqual(ids(copy, 'p||'), ['p|||P1'], 'kept: the refresh did not succeed');
  refreshAnswer = 'ok';
  pb.connect(); await reader.idle();
  assert.deepEqual(ids(copy, 'p||'), [], 'dropped after a successful refresh');
  reader.stop();
});

test('reader: the server restored from an older copy → every scope read in full, the server version wins (spec 4 § 10 case 13)', async () => {
  const db = { projects: [proj('P1', 'pb1', T('00:01'))], records: [rec('pb1', 'points', 'a', T('00:02'), { v: 1 })], pool: [], invites: [], prefs: [] };
  const { copy, pb, reader } = await setup(db);
  pb.connect(); await reader.idle();
  pb.handlers.records({ action: 'update', record: rec('pb1', 'points', 'a', T('00:09'), { v: 2 }) });
  pb.handlers.records({ action: 'create', record: rec('pb1', 'points', 'b', T('00:08')) });
  await sleep(150);
  assert.equal(copy.get('r|P1|points|a').v, 2);
  // the server comes back with the state of 00:02
  pb.calls.length = 0;
  pb.connect(); await reader.idle();
  const q = pb.calls.find((c) => c[0] === 'records' && c[1].includes('project'));
  assert.doesNotMatch(q[1], /updated >/, 'a full read, not a delta');
  assert.equal(copy.get('r|P1|points|a').v, 1, 'the server version wins');
  assert.equal(copy.get('r|P1|points|b'), null, 'a record the restored server does not have is removed');
  assert.equal(copy.getMeta('seen|r'), T('00:02'));
  pb.calls.length = 0;
  pb.connect(); await reader.idle();
  assert.match(pb.calls.find((c) => c[0] === 'records' && c[1].includes('project'))[1], /updated >/, 'and the next connect is a delta again');
  reader.stop();
});

test('reader: an older server (or no hooks: 404) is noted, reading goes on; a missing collection reads as empty', async () => {
  const db = { info: Object.assign(new Error('nf'), { status: 404 }), projects: [proj('P1', 'pb1', T('00:01'))], records: [], invites: [], prefs: [], fail: { pool: { status: 404 } } };
  const { copy, pb, reader } = await setup(db);
  pb.connect(); await reader.idle();
  const s = reader.readState();
  assert.equal(s.serverSchema, 0);
  assert.equal(s.serverOlder, true);
  assert.deepEqual(ids(copy, 'p||'), ['p|||P1']);
  assert.equal(s.parts.find((p) => p.part === 'pool').state, 'done', 'a collection the server does not have yet reads as empty');
  reader.stop();
});

test('reader: a server error keeps the part waiting, then shows «ошибка» with its code after three tries; no answer keeps it waiting', async () => {
  const db = { projects: [], records: [], invites: [], prefs: [], pool: [], fail: { pool: { status: 500 } } };
  const later = [];   // the retry timers, run by hand
  const timers = { setTimeout: (f, ms) => (ms >= 1000 ? (later.push(f), later.length) : setTimeout(f, ms)), clearTimeout: (t) => { if (typeof t !== 'number') clearTimeout(t); }, setInterval: () => 0, clearInterval: () => {} };
  const { copy } = await openLocalCopy({ uid: 'u1', idb: null, win: null, doc: null });
  const pb = fakePb(db);
  const reader = createReader({ pb, copy, uid: () => 'u1', timers, win: null, doc: null });
  await reader.start();
  const pool = () => reader.readState().parts.find((p) => p.part === 'pool');
  pb.connect(); await reader.idle();
  assert.equal(pool().state, 'waiting');
  assert.equal(later.length, 1, 'a retry is planned');
  later.shift()(); await reader.idle();
  assert.equal(pool().state, 'waiting');
  later.shift()(); await reader.idle();
  assert.equal(pool().state, 'error');
  assert.equal(pool().code, '500');
  assert.equal(reader.readState().parts.find((p) => p.part === 'projects').state, 'done', 'the other parts are read');
  delete db.fail.pool;
  later.shift()(); await reader.idle();
  assert.equal(pool().state, 'done', 'a later success clears the error');
  reader.stop();

  const net = { projects: [], fail: { projects: { status: 0 } } };
  const r2 = await setup(net);
  r2.pb.connect(); await r2.reader.idle();
  assert.equal(r2.reader.readState().parts.find((p) => p.part === 'projects').state, 'waiting');
  r2.reader.stop();
});

test('reader: 401 marks the sign-in expired and closes the stream until the next sign-in', async () => {
  const db = { projects: [], fail: { projects: { status: 401 } } };
  let expired = false; const subs = new Set();
  const auth = { isExpired: () => expired, markExpired: () => { expired = true; subs.forEach((f) => f()); }, onChange: (f) => { subs.add(f); return () => subs.delete(f); } };
  const { pb, reader } = await setup(db, { auth });
  let unsub = 0; pb.realtime.unsubscribe = async () => { unsub++; };
  pb.connect(); await reader.idle();
  assert.equal(expired, true);
  assert.ok(unsub >= 1);
  assert.equal(reader.readState().realtime, 'not');
  reader.stop();
});

test('reader: inbox read and subscribed for the administrator only', async () => {
  const db = { projects: [], records: [], pool: [], invites: [], prefs: [], inbox: [{ id: 'n1', key: 'u2_P9', updated: T('00:01'), data: { status: 'new' } }] };
  const a = await setup(db, { admin: true });
  a.pb.connect(); await a.reader.idle();
  assert.ok(a.pb.handlers.inbox, 'subscribed');
  assert.deepEqual(a.copy.get('inbox|||u2_P9'), { status: 'new', key: 'u2_P9', _pb: { id: 'n1', updated: T('00:01') } });
  assert.ok(a.reader.readState().parts.some((p) => p.part === 'inbox'));
  a.reader.stop();
  const b = await setup({ ...db }, { admin: false });
  b.pb.connect(); await b.reader.idle();
  assert.equal(b.pb.handlers.inbox, undefined);
  assert.equal(b.copy.get('inbox|||u2_P9'), null);
  b.reader.stop();
});

test('reader: history and one-off reads go to the server; history falls back to the phone offline or on an error', async () => {
  const db = {
    projects: [proj('P1', 'pb1', T('00:01'))], records: [rec('pb1', 'points', 'a', T('00:02'), { label: 'C1' }), rec('pb1', 'days', 'd', T('00:03'))],
    pool: [{ id: 'q', kind: 'culprits', key: 'x', updated: T('00:04'), data: { name: 'x' } }], invites: [], prefs: [],
    history: [{ id: 'h1', project: 'pb1', at: Date.now() - 1000, key: 'e1', data: { id: 'e1', at: Date.now() - 1000, coll: 'points' } }],
  };
  const { copy, pb, reader } = await setup(db);
  pb.connect(); await reader.idle();
  const backend = createPocketBaseBackend({ copy, user: { uid: 'u1' }, server: reader });
  const pts = await backend.readColl('P1', 'points');
  assert.equal(pts.length, 2, 'the fake ignores `coll`; the filter asks for it');
  assert.match(pb.calls.filter((c) => c[0] === 'records').pop()[1], /project = "pb1" && coll = "points"/);
  assert.deepEqual(await backend.readPool('culprits'), [{ name: 'x' }]);
  const h = await backend.loadHistory('P1', 0, 100);
  assert.deepEqual(h.map((e) => e.id), ['e1']);
  assert.deepEqual(copy.history('P1').map((e) => e.id), ['e1'], 'kept in the phone\'s history store');
  db.fail = { history: { status: 0 } };
  assert.deepEqual((await backend.loadHistory('P1', 0, 100)).map((e) => e.id), ['e1'], 'no answer: the phone\'s history');
  reader.stop();
});
