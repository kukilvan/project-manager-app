// Checks the job sources of ticket 4.11 (spec 4 § 5.2, § 5.3) without a server: the Firestore path of server-backup.mjs, server-cleanup.mjs and
// server-tables.mjs gives the same files, log lines and database as the scripts did before the sources (tests/fixtures/jobs-golden/, recorded from
// commit 307a0f9 with the same harness), the source switch of job-source.mjs and where firebase-admin may be imported.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createFakeFirestore, treeOf } from './fake-firestore.js';
import { openSource, googleCredentials, isPocketBase, SetupError } from '../scripts/job-source.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const golden = path.join(repo, 'tests/fixtures/jobs-golden');
const text = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

// The golden sequence: a full backup, changes, a delta backup two days later, cleanup as a dry run and for real, the night sheets (Google answers 500)
function runSequence(out) {
  const fx = JSON.parse(fs.readFileSync(path.join(repo, 'tests/fixtures/jobs-firestore.json'), 'utf8'));
  const st = (n) => path.join(out, `db-${n}.json`);
  fs.writeFileSync(st(0), JSON.stringify(createFakeFirestore(fx.state).dump()));
  const preload = pathToFileURL(path.join(repo, 'tests/jobs-harness/preload.mjs')).href;
  const run = (name, script, args, now, inN, outN, env = {}) => {
    const r = spawnSync(process.execPath, ['--import', preload, path.join(repo, script), ...args], { cwd: repo, encoding: 'utf8',
      env: { ...process.env, PM_SOURCE: '', FAKE_NOW: now, FAKE_DB_IN: st(inN), FAKE_DB_OUT: st(outN), FIREBASE_SERVICE_ACCOUNT: '{"client_email":"jobs@test.iam"}', ...env } });
    fs.writeFileSync(path.join(out, `log-${name}.txt`), `exit ${r.status}\n${r.stdout}${r.stderr ? `--- stderr\n${r.stderr}` : ''}`);
  };
  const backups = path.join(out, 'backups');
  run('backup-1', 'scripts/server-backup.mjs', [backups], fx.runs[0], 0, 1);
  const db = createFakeFirestore(treeOf(JSON.parse(fs.readFileSync(st(1), 'utf8'))));
  return (async () => {
    for (const c of fx.changes) await db.doc(c.path).set(c.data, { merge: true });
    fs.writeFileSync(st('1b'), JSON.stringify(db.dump()));
    run('backup-2', 'scripts/server-backup.mjs', [backups], fx.runs[1], '1b', 2);
    run('cleanup-dry', 'scripts/server-cleanup.mjs', [], fx.runs[1], 2, '3dry', { DRY_RUN: '1' });
    run('cleanup', 'scripts/server-cleanup.mjs', [], fx.runs[1], 2, 3);
    run('tables', 'scripts/server-tables.mjs', [], fx.runs[1], 3, 4);
  })();
}

const filesUnder = (dir) => fs.readdirSync(dir, { recursive: true }).map(String).filter((f) => fs.statSync(path.join(dir, f)).isFile()).map((f) => f.replace(/\\/g, '/')).sort();

test('Firestore path: the backup, cleanup and sheets scripts give the same files, log lines and database as before the sources', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-'));
  await runSequence(out);
  const want = filesUnder(path.join(golden, 'backups'));
  assert.deepEqual(filesUnder(path.join(out, 'backups')), want);
  for (const f of want) assert.equal(text(path.join(out, 'backups', f)), text(path.join(golden, 'backups', f)), f);
  for (const n of ['backup-1', 'backup-2', 'cleanup-dry', 'cleanup', 'tables']) assert.equal(text(path.join(out, `log-${n}.txt`)), text(path.join(golden, `log-${n}.txt`)), n);
  for (const n of ['2', '3', '3dry', '4']) assert.deepEqual(JSON.parse(text(path.join(out, `db-${n}.json`))), JSON.parse(text(path.join(golden, `db-${n}.json`))), `db-${n}`);
  fs.rmSync(out, { recursive: true, force: true });
});

test('the golden run covers the delta read, a deleted project, the cleanup rules and the sheets patches', () => {
  // guards the fixture itself, so a weaker fixture cannot make the comparison above pass
  assert.match(text(path.join(golden, 'log-backup-2.txt')), /Прочитано документов из базы: 14\./); // delta: fewer reads than the full run (20)
  assert.match(text(path.join(golden, 'log-backup-1.txt')), /Пропущен удалённый проект: Old/);
  assert.match(text(path.join(golden, 'log-cleanup.txt')), /проектов 1, записей 1, записей истории 1\./);
  const db = JSON.parse(text(path.join(golden, 'db-4.json')));
  assert.equal(db['projects/p1'].tables[0].serverError, 'В таблице не выбран ни один столбец');
  assert.equal(db['projects/p1'].serverEmail, 'jobs@test.iam');
  assert.equal(db['projects/p2'], undefined);
  const full = JSON.parse(text(path.join(golden, 'backups/2026-11-20_0830/Alpha _ Тест (полная).json')));
  assert.equal(full.source, undefined); // a Firestore export has no `source`
  assert.equal(full.data.points.find((p) => p.id === 'a').label, '1A-01b');
});

test('job source: PM_SOURCE picks PocketBase, secrets come from the environment or PM_SECRETS files, a missing secret is a setup error', async () => {
  assert.equal(isPocketBase({ PM_SOURCE: 'pocketbase' }), true);
  assert.equal(isPocketBase({}), false);
  await assert.rejects(openSource({}), (e) => e instanceof SetupError && e.message === 'Нет секрета FIREBASE_SERVICE_ACCOUNT');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sec-'));
  await assert.rejects(openSource({ PM_SOURCE: 'pocketbase', PM_SECRETS: dir, PB_JOBS_EMAIL: 'jobs@pm.test' }), (e) => e instanceof SetupError && /pb_jobs_password/.test(e.message));
  fs.writeFileSync(path.join(dir, 'google_service_account.json'), '{"client_email":"sa@test.iam"}\n');
  assert.equal(googleCredentials({ PM_SOURCE: 'pocketbase', PM_SECRETS: dir }).client_email, 'sa@test.iam');
  assert.equal(googleCredentials({ PM_SOURCE: 'pocketbase', PM_SECRETS: dir, GOOGLE_SERVICE_ACCOUNT: '{"client_email":"env@test.iam"}' }).client_email, 'env@test.iam');
  assert.equal(googleCredentials({ FIREBASE_SERVICE_ACCOUNT: '{"client_email":"fb@test.iam"}' }).client_email, 'fb@test.iam');
  assert.throws(() => googleCredentials({ PM_SOURCE: 'pocketbase', PM_SECRETS: path.join(dir, 'none') }), SetupError);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('firebase-admin is imported only by fs-source.mjs (dynamically) and the Firestore-only tools export-pool.mjs and server-restore.mjs, so the NAS jobs need no firebase-admin', () => {
  const dir = path.join(repo, 'scripts');
  const users = fs.readdirSync(dir).filter((f) => f.endsWith('.mjs') && /from 'firebase-admin'|import\('firebase-admin'\)/.test(fs.readFileSync(path.join(dir, f), 'utf8'))).sort();
  assert.deepEqual(users, ['export-pool.mjs', 'fs-source.mjs', 'server-restore.mjs']);
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'fs-source.mjs'), 'utf8'), /^import .*firebase-admin/m);
});
