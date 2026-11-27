// Checks the PocketBase job source (scripts/pb-source.mjs, ticket 4.11, spec 4 § 5.2, § 5.3, § 10 case 22) against a real PocketBase 0.42.3: a synthetic
// database written through the write route is exported, and the export equals the Firestore export of the same data (tests/fake-firestore.js through
// scripts/fs-source.mjs) apart from `source`; `serverBackupAt` lands in the projects; the night sheets' list patches go out as `itemPatches`; the night run
// writes its results; cleanup deletes what the rules say, at most `max` per collection, and DRY_RUN deletes nothing.
// Needs `node tools/pb-dev.mjs fetch`; skipped with a message without the binary, fails then in CI (PB_TESTS_REQUIRED=1), as tests/pb-server.test.js.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { missingBinary, REQUIRED, startServer } from './pb-helper.js';
import { SUPERUSER } from '../tools/pb-dev.mjs';
import { createFakeFirestore, Timestamp } from './fake-firestore.js';
import { createFirestoreSource } from '../scripts/fs-source.mjs';
import { openPocketBase } from '../scripts/pb-source.mjs';
import { runServerBackup, runCleanup, stamp } from '../scripts/server-backup-lib.mjs';
import { runTables, applyPatches } from '../scripts/server-tables-lib.mjs';
import { serverStamp, pbMs } from '../src/domain/pbread.js';

const missing = missingBinary();
if (missing && REQUIRED) test('PocketBase binary is present (PB_TESTS_REQUIRED=1)', () => assert.fail(missing));
if (missing && !REQUIRED) console.log(`# ${missing}`);

const DAY = 864e5;
const NOW = Date.now();
const docKey = (id) => String(id).replace(/\//g, '_');

describe('job source against PocketBase', { skip: missing ? missing : false }, () => {
  let srv; let A; let B; let src;
  const ok = async (token, ops) => { const r = await srv.save(token, ops, 2); assert.equal(r.status, 200, r.text); };
  const project = async (key) => (await srv.all('projects', `key = "${key}"`))[0];

  // The synthetic database, as the app writes it
  const seed = () => ({
    projects: {
      p1: { id: 'p1', name: 'Alpha / Тест', object: 'Mega Or', memberUids: [A.id, B.id], memberEmails: [A.email, B.email], createdBy: A.id, updatedAt: NOW - 2 * DAY,
        tables: [{ id: 't1', name: 'Main', main: true, fileId: 'F1', auto: true, columns: [] }, { id: 't2', name: 'Second', fileId: '' }],
        drawings: [{ id: 'd1', name: 'A.pdf' }, { id: 'd2', name: 'B.pdf' }], managers: { drawings: { d1: { on: false, name: 'keep' } } } },
      p2: { id: 'p2', name: 'Old', memberUids: [A.id], memberEmails: [A.email], createdBy: A.id, deleted: true, deletedAt: NOW - 400 * DAY },
      p3: { id: 'p3', name: 'Beta', memberUids: [A.id], memberEmails: [A.email], createdBy: A.id, archived: true, updatedAt: NOW - 20 * DAY },
      p4: { id: 'p4', name: 'Gamma', memberUids: [A.id], memberEmails: [A.email], createdBy: A.id, updatedAt: NOW - 20 * DAY },
    },
    records: [
      ['p1', 'points', 'a', { id: 'a', label: '1A-01', type: 'Камера' }],
      ['p1', 'points', 'b', { id: 'b', label: '1A-02', deleted: true, deletedAt: NOW - 400 * DAY }],
      ['p1', 'points', 'c', { id: 'c', label: '1A-03', deleted: true, deletedAt: NOW - 10 * DAY }],
      ['p1', 'catalog', 'К/2', { id: 'К/2', name: 'Кабель 2' }],
      ['p1', 'catalog', 'PR_PTS', { id: 'PR_PTS', name: 'Протяжка' }],
      ['p1', 'days', '2026-11-16', { id: '2026-11-16', note: 'ok' }],
      ['p2', 'points', 'x', { id: 'x', label: 'X-1' }],
      ['p3', 'points', 'y', { id: 'y', label: 'Y-1', deleted: true, deletedAt: NOW - 380 * DAY }],
      ['p4', 'points', 'z', { id: 'z', label: 'Z-1' }],
    ],
    history: [
      ['p1', 'h0', { id: 'h0', at: NOW - 500 * DAY, action: 'edit', by: A.id }],
      ['p1', 'h1', { id: 'h1', at: NOW - 2 * DAY, action: 'edit', by: A.id }],
    ],
    pool: [
      ['types', 'Камера', { id: 'Камера', nameHe: 'מצלמה' }],
      ['catalog', 'К/1', { id: 'К/1', name: 'Кабель' }],
      ['delayReasons', 'r1', { id: 'r1', name: 'Дождь', nameHe: 'גשם' }],
      ['problems', 'q1', { id: 'q1', name: 'Нет доступа' }],
    ],
    inbox: [['types|Камера', { status: 'new', kind: 'types' }]],
    allowed: [B.email],
    prefs: { dictWords: ['кабель'] },
  });

  before(async () => {
    srv = await startServer();
    [A, B] = srv.users;
    const s = seed();
    assert.equal((await srv.call('/api/pm/admin', { method: 'POST', token: A.token })).status, 200);
    await ok(srv.superToken, Object.entries(s.projects).map(([key, data]) => ({ t: 'project', key, data, mode: 'deep' })));
    await ok(srv.superToken, s.records.map(([pid, coll, key, data]) => ({ t: 'rec', pid, coll, key, data, mode: 'deep' })));
    await ok(srv.superToken, s.history.map(([pid, key, data]) => ({ t: 'history', pid, key, data })));
    await ok(srv.superToken, s.pool.map(([kind, key, data]) => ({ t: 'pool', kind, key, data })));
    await ok(srv.superToken, s.inbox.map(([key, data]) => ({ t: 'inbox', key, data })));
    await ok(srv.superToken, s.allowed.map((email) => ({ t: 'allowed', email })));
    await ok(A.token, [{ t: 'prefs', data: s.prefs, mode: 'deep' }]);
    src = await openPocketBase({ url: srv.url, email: SUPERUSER.email, password: SUPERUSER.password });
  });
  after(async () => { await srv?.stop(); });

  test('the jobs sign in as a superuser only: a wrong password is refused', async () => {
    await assert.rejects(openPocketBase({ url: srv.url, email: SUPERUSER.email, password: 'wrong' }), /HTTP 400/);
    await assert.rejects(openPocketBase({ url: srv.url, email: SUPERUSER.email, password: '' }), /pb_jobs_password/);
  });

  test('the export equals the Firestore export of the same data (apart from `source`), and serverBackupAt is written', async () => {
    // the same data in a fake Firestore, each document stamped with the `updated` the server gave it
    const s = seed(); const tree = { projects: {} };
    const put = (coll, id, data) => { (tree[coll] ??= {})[id] = { data }; };
    const by = async (coll) => new Map((await srv.all(coll)).map((r) => [coll === 'records' ? `${r.coll}|${r.key}` : coll === 'pool' ? `${r.kind}|${r.key}` : (r.key || r.email), r]));
    const [P, R, H, PO, I, AL] = await Promise.all(['projects', 'records', 'history', 'pool', 'inbox', 'allowed'].map(by));
    const adm = (await srv.all('admin'))[0];
    const ts = (rec) => serverStamp(rec.updated);
    for (const [key, data] of Object.entries(s.projects)) tree.projects[key] = { data: { ...data, updatedAtServer: ts(P.get(key)) }, subs: {} };
    for (const [pid, coll, key, data] of s.records) ((tree.projects[pid].subs[coll] ??= {}))[docKey(key)] = { data: { ...data, updatedAtServer: ts(R.get(`${coll}|${key}`)) } };
    for (const [pid, key, data] of s.history) ((tree.projects[pid].subs.history ??= {}))[key] = { data: { ...data, updatedAtServer: ts(H.get(key)) } };
    for (const [kind, key, data] of s.pool) put(`pool_${kind}`, docKey(key), { ...data, updatedAtServer: ts(PO.get(`${kind}|${key}`)) });
    for (const [key, data] of s.inbox) put('pool_inbox', key, { ...data, updatedAtServer: ts(I.get(key)) });
    for (const email of s.allowed) put('allowed', email, { email, at: pbMs(AL.get(email).created) });
    put('meta', 'admin', { email: adm.email, at: pbMs(adm.created) });
    tree.users = { [A.id]: { subs: { prefs: { main: { data: s.prefs } } } } };
    const fake = createFakeFirestore(tree);

    const now = new Date(NOW);
    const roots = { fs: fs.mkdtempSync(path.join(os.tmpdir(), 'exp-fs-')), pb: fs.mkdtempSync(path.join(os.tmpdir(), 'exp-pb-')) };
    const logs = { fs: [], pb: [] };
    await runServerBackup(createFirestoreSource({ db: fake, Timestamp }), roots.fs, { now, log: (l) => logs.fs.push(l) });
    await runServerBackup(src, roots.pb, { now, log: (l) => logs.pb.push(l) });
    const dir = (k) => path.join(roots[k], stamp(now));
    const files = fs.readdirSync(dir('fs')).sort();
    assert.deepEqual(fs.readdirSync(dir('pb')).sort(), files);
    assert.ok(files.includes('Alpha _ Тест (полная).json') && !files.some((f) => f.startsWith('Old')));
    for (const f of files) {
      const a = JSON.parse(fs.readFileSync(path.join(dir('fs'), f), 'utf8'));
      const b = JSON.parse(fs.readFileSync(path.join(dir('pb'), f), 'utf8'));
      if (f.endsWith('(полная).json')) { assert.equal(a.source, undefined); assert.equal(b.source, 'pocketbase', f); delete b.source; }
      assert.deepEqual(b, a, f);
    }
    // the shapes the restore tool and the starter-pool job read
    const full = JSON.parse(fs.readFileSync(path.join(dir('pb'), 'Alpha _ Тест (полная).json'), 'utf8'));
    assert.deepEqual(full.data.catalog.map((d) => d.id), ['PR_PTS', 'К/2']);
    assert.deepEqual(Object.keys(full.data.points[0].updatedAtServer), ['_seconds', '_nanoseconds']);
    assert.deepEqual(full.data.history.map((h) => h.id), ['h0', 'h1']);
    const common = JSON.parse(fs.readFileSync(path.join(dir('pb'), 'ОБЩЕЕ (пул, разрешённые почты, настройки).json'), 'utf8'));
    assert.deepEqual(common.prefs, [{ uid: A.id, id: 'main', data: { dictWords: ['кабель'] } }]);
    assert.deepEqual(common.collections.meta, [{ id: 'admin', email: A.email, at: pbMs(adm.created) }]);
    // logs: the same lines, apart from the read counter (Firestore counts its own reads)
    const noReads = (l) => l.replace(/Прочитано документов из базы: \d+/, '');
    assert.deepEqual(logs.pb.map(noReads), logs.fs.map(noReads));
    for (const key of ['p1', 'p3', 'p4']) assert.equal((await project(key)).data.serverBackupAt, now.toISOString(), key);
    assert.equal((await project('p2')).data.serverBackupAt, undefined);
    Object.values(roots).forEach((r) => fs.rmSync(r, { recursive: true, force: true }));
  });

  test('list patches go out as itemPatches: only the named items change; a project without a tables list gets the whole list', async () => {
    await src.patchProject('p1', { drawings: { d1: { numberedHash: 'h1', numberedError: '' }, nope: { x: 1 } }, managers: { d1: { hash: 'm1', error: '' } } });
    await src.patchProject('p1', { rackTable: { serverAt: 'T', serverError: '' } });
    await src.patchProject('p1', { tables: { t1: { serverAt: 'T', serverError: '' } } });
    const d = (await project('p1')).data;
    assert.deepEqual(d.drawings, [{ id: 'd1', name: 'A.pdf', numberedHash: 'h1', numberedError: '' }, { id: 'd2', name: 'B.pdf' }]);
    assert.deepEqual(d.managers, { drawings: { d1: { on: false, name: 'keep', hash: 'm1', error: '' } } });
    assert.deepEqual(d.rackTable, { serverAt: 'T', serverError: '' });
    assert.deepEqual(d.tables, [{ id: 't1', name: 'Main', main: true, fileId: 'F1', auto: true, columns: [], serverAt: 'T', serverError: '' }, { id: 't2', name: 'Second', fileId: '' }]);
    assert.equal(await src.patchProject('p1', { drawings: {}, managers: {} }), null); // nothing to write → no request
    await src.patchProject('p4', { tables: {} });
    assert.deepEqual((await project('p4')).data.tables, applyPatches({}, {}));
  });

  test('changedSince sees records of the named collections and pool items of the named kinds after the time', async () => {
    assert.equal(await src.changedSince('p4', ['points'], [], NOW - 3600e3), true);
    assert.equal(await src.changedSince('p4', ['days'], [], NOW - 3600e3), false);
    assert.equal(await src.changedSince('p4', ['points'], ['delayReasons'], NOW + 3600e3), false);
    assert.equal(await src.changedSince('p4', [], ['delayReasons'], NOW - 3600e3), true);
    assert.equal(await src.changedSince('p4', [], ['manuals'], NOW - 3600e3), false);
  });

  test('the night run writes serverEmail, its results and serverTablesAt; archived and deleted projects are left alone', async () => {
    const fail = async () => { throw Object.assign(new Error('stub'), { status: 500 }); };
    const api = { fileInfo: fail, rename: fail, sheetsOf: fail, batch: fail, write: fail, download: fail, upload: fail };
    const lines = [];
    // two hours ahead, so the second run's «changed after the mark minus 30 minutes» is later than every record written by this test
    const at = new Date(NOW + 2 * 3600e3);
    const failed = await runTables(src, api, { now: at, serverEmail: 'sa@test.iam', loadMupdf: async () => { throw new Error('no drawing should need MuPDF'); }, log: (l) => lines.push(l) });
    assert.equal(failed, 0, lines.join('\n'));
    const p1 = (await project('p1')).data;
    assert.equal(p1.serverEmail, 'sa@test.iam');
    assert.equal(p1.serverTablesAt, at.toISOString());
    assert.equal(p1.tables[0].serverAt, at.toISOString());
    assert.ok(p1.tables[0].serverError, 'the stubbed Sheets error is kept on the table');
    assert.equal((await project('p4')).data.serverTablesAt, at.toISOString());
    assert.equal((await project('p3')).data.serverTablesAt, undefined);
    assert.equal((await project('p2')).data.serverTablesAt, undefined);
    assert.ok(lines.some((l) => /Gamma: нет таблиц для автообновления/.test(l)), lines.join('\n'));
    // a second run soon after: Gamma changed nothing since (its records are older than the mark minus 30 minutes) and is skipped
    const again = [];
    await runTables(src, api, { now: new Date(NOW + 3 * 3600e3), serverEmail: 'sa@test.iam', loadMupdf: async () => null, log: (l) => again.push(l) });
    assert.ok(again.includes('  - Gamma: без изменений с прошлого раза — пропущен'), again.join('\n'));
  });

  test('cleanup: DRY_RUN deletes nothing; the run deletes expired projects (cascade), expired records and old history, at most max per collection', async () => {
    const count = async () => ({ projects: (await srv.all('projects')).length, records: (await srv.all('records')).length, history: (await srv.all('history')).length });
    const before = await count();
    const dry = [];
    const t0 = await runCleanup(src, { now: NOW, dry: true, log: (l) => dry.push(l) });
    assert.deepEqual(t0, { projects: 1, records: 2, history: 1 });
    assert.deepEqual(await count(), before);
    assert.ok(dry.every((l) => l.startsWith('[проба] ')), dry.join('\n'));
    // max 1: one expired record of the two goes (the budget is per collection for the whole run)
    const t1 = await runCleanup(src, { now: NOW, max: 1, log: () => {} });
    assert.deepEqual(t1, { projects: 1, records: 1, history: 1 });
    const t2 = await runCleanup(src, { now: NOW, log: () => {} });
    assert.deepEqual(t2, { projects: 0, records: 1, history: 0 });
    const keys = (await srv.all('records')).map((r) => r.key).sort();
    assert.deepEqual(keys, ['2026-11-16', 'PR_PTS', 'a', 'c', 'z', 'К/2']); // b and y gone; c (deleted 10 days ago) kept; x went with its project
    assert.deepEqual((await srv.all('history')).map((h) => h.key), ['h1']);
    assert.equal(await project('p2'), undefined);
    assert.deepEqual((await count()), { projects: before.projects - 1, records: before.records - 3, history: before.history - 1 });
  });
});
