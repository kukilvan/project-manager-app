// Checks the NAS job runner (scripts/nas-jobs.mjs, ticket 4.12, spec 4 § 5.1, § 10 case 32): the arguments and settings, state.json and the `catch-up`
// due rule, the lock, the git credential helper, that no secret reaches the output or state.json, the Drive zip and upload, and that the unpacked
// nas-jobs.zip starts alone. `backup`, `tables` and `catch-up` run on a local bare git repository with the Google calls replaced: offline on a fake source,
// then against a real PocketBase 0.42.3 (skipped without the binary, fails then in CI, as tests/pb-server.test.js). Needs the `git` program.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { main, config, readState, recordState, backupDue, scrubber, withLock, USAGE } from '../scripts/nas-jobs.mjs';
import { gitArgs, TOKEN_VARIABLE } from '../scripts/nas-git.mjs';
import { DRIVE_FILE_NAME, newestBackup, zipBackup, uploadDriveBackup } from '../scripts/drive-backup-lib.mjs';
import { previousBackups } from '../scripts/server-backup-lib.mjs';
import { pack } from '../scripts/nas-pack.mjs';
import { unzip } from '../scripts/zip-lib.mjs';
import { createFakeFirestore, Timestamp } from './fake-firestore.js';
import { createFirestoreSource } from '../scripts/fs-source.mjs';
import { missingBinary, REQUIRED, startServer } from './pb-helper.js';
import { SUPERUSER } from '../tools/pb-dev.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runner = path.join(repo, 'scripts', 'nas-jobs.mjs');
const temp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
const remove = (dir) => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
const DAY = 864e5;

// Made-up secrets: every output and state.json of this file is searched for them
const TOKEN = 'github_pat_TESTTOKEN0123456789';
const KEY_LINE = 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCtestkey';
const ACCOUNT = { client_email: 'sa@test.iam', private_key_id: 'keyid0123456789', private_key: `-----BEGIN PRIVATE KEY-----\n${KEY_LINE}\n-----END PRIVATE KEY-----\n` };
const SECRET_WORDS = (password) => [password, TOKEN, KEY_LINE, ACCOUNT.private_key_id];

const gitRun = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
};

// A NAS in temp folders: secrets, the state folder and a bare repository standing for GitHub
function nas({ password = 'pm-jobs-password-1', secrets = ['pb_jobs_password', 'google_service_account.json', 'github_token'] } = {}) {
  const root = temp('nas');
  const dirs = { root, secrets: path.join(root, 'secrets'), state: path.join(root, 'data'), remote: path.join(root, 'remote.git') };
  fs.mkdirSync(dirs.secrets);
  const values = { pb_jobs_password: password, 'google_service_account.json': JSON.stringify(ACCOUNT), github_token: TOKEN };
  secrets.forEach((n) => fs.writeFileSync(path.join(dirs.secrets, n), `${values[n]}\n`));
  gitRun(root, 'init', '-q', '--bare', dirs.remote);
  const env = { ...process.env, PM_SECRETS: dirs.secrets, PM_STATE: dirs.state, BACKUP_REMOTE: dirs.remote, PB_JOBS_EMAIL: SUPERUSER.email, PB_JOBS_PASSWORD: '', GOOGLE_SERVICE_ACCOUNT: '', DRY_RUN: '', FULL: '' };
  const commits = () => (spawnSync('git', ['rev-parse', '--verify', '-q', 'HEAD'], { cwd: dirs.remote }).status === 0 ? gitRun(dirs.remote, 'log', '--format=%s').trim().split('\n') : []);
  const files = () => gitRun(dirs.remote, '-c', 'core.quotePath=false', 'ls-tree', '-r', '--name-only', 'HEAD').trim().split('\n');
  return { ...dirs, env, commits, files, state_: () => readState(path.join(dirs.state, 'state.json')), done: () => remove(root) };
}

// One run in this process; the Google calls are replaced and remembered
async function run(box, command, { env = {}, deps = {} } = {}) {
  const lines = []; const uploads = [];
  const code = await main([command], {
    env: { ...box.env, ...env },
    log: (l) => lines.push(l),
    deps: { uploadDrive: async (cred, bytes, folder) => { uploads.push({ cred, bytes, folder }); }, serverWaitMs: 0, lock: { pollMs: 20 }, ...deps },
  });
  return { code, lines, text: lines.join('\n'), uploads };
}

const noSecrets = (text, password) => { for (const s of SECRET_WORDS(password)) assert.ok(!text.includes(s), `a secret is in: ${text}`); };
const stateText = (box) => fs.readFileSync(path.join(box.state, 'state.json'), 'utf8');

// A source for the offline runs: the Firestore source on the fake database (the runner only sees the source interface)
const fakeSource = (extra = {}) => {
  const db = createFakeFirestore({ projects: { p1: { data: { name: 'Alpha' }, subs: { points: { a: { data: { label: '1A-01' } } } } } } });
  return { ...createFirestoreSource({ db, Timestamp }), delta: false, exportMark: { source: 'pocketbase' }, ...extra };
};

test('arguments: --help prints the usage; no command, an unknown one or an extra argument is a failure that touches nothing', async () => {
  const box = nas();
  try {
    for (const argv of [['--help'], ['-h']]) { const lines = []; assert.equal(await main(argv, { env: box.env, log: (l) => lines.push(l) }), 0); assert.deepEqual(lines, [USAGE]); }
    for (const argv of [[], ['restore'], ['backup', 'now'], ['--help', 'x']]) { const lines = []; assert.equal(await main(argv, { env: box.env, log: (l) => lines.push(l) }), 1, argv.join(' ')); assert.ok(lines.includes(USAGE)); }
    assert.equal(fs.existsSync(box.state), false);
  } finally { box.done(); }
});

test('settings: the defaults of the NAS container, and each variable overrides its own', () => {
  const d = config({});
  assert.equal(d.pbUrl, 'http://pocketbase:8090');
  assert.equal(d.secrets, '/run/secrets');
  assert.equal(d.state, '/data');
  assert.equal(d.remote, 'https://github.com/kukilvan/polevoy-backups.git');
  assert.equal(d.needsToken, true);
  assert.equal(d.stateFile, path.join('/data', 'state.json'));
  assert.equal(d.jobEnv.PM_SOURCE, 'pocketbase');
  assert.deepEqual([d.full, d.dry], [false, false]);
  const c = config({ PB_URL: 'http://127.0.0.1:8090', PM_SECRETS: 's', PM_STATE: 't', BACKUP_REPO: 'me/copies', FULL: '1', DRY_RUN: '1', PM_SOURCE: 'firestore' });
  assert.equal(c.remote, 'https://github.com/me/copies.git');
  assert.deepEqual([c.pbUrl, c.secrets, c.state, c.full, c.dry, c.jobEnv.PM_SOURCE], ['http://127.0.0.1:8090', 's', 't', true, true, 'pocketbase']);
  const r = config({ BACKUP_REMOTE: '/tmp/bare.git' });
  assert.deepEqual([r.remote, r.needsToken], ['/tmp/bare.git', false]);
});

test('state.json: a success sets okAt, a failure keeps it, each job has its own record; a missing or broken file is empty', () => {
  const dir = temp('state'); const file = path.join(dir, 'sub', 'state.json');
  try {
    assert.deepEqual(readState(file), {});
    recordState(file, 'backup', { ok: false, at: '2026-11-27T01:30:00.000Z', error: 'нет сети' });
    assert.deepEqual(readState(file), { backup: { ok: false, at: '2026-11-27T01:30:00.000Z', error: 'нет сети', okAt: null } });
    recordState(file, 'backup', { ok: true, at: '2026-11-28T01:30:00.000Z' });
    recordState(file, 'tables', { ok: true, at: '2026-11-28T07:20:00.000Z' });
    recordState(file, 'backup', { ok: false, at: '2026-11-29T01:30:00.000Z', error: 'снова' });
    assert.deepEqual(readState(file), {
      backup: { ok: false, at: '2026-11-29T01:30:00.000Z', error: 'снова', okAt: '2026-11-28T01:30:00.000Z' },
      tables: { ok: true, at: '2026-11-28T07:20:00.000Z', error: '', okAt: '2026-11-28T07:20:00.000Z' },
    });
    assert.deepEqual(fs.readdirSync(path.dirname(file)), ['state.json']);
    fs.writeFileSync(file, '{ broken');
    assert.deepEqual(readState(file), {});
  } finally { remove(dir); }
});

test('catch-up is due without a successful backup or when the last one is over 24 hours old', () => {
  const now = Date.parse('2026-11-27T12:00:00.000Z');
  const at = (ms) => ({ backup: { ok: true, okAt: new Date(now - ms).toISOString() } });
  assert.equal(backupDue({}, now), true);
  assert.equal(backupDue({ backup: { ok: false, okAt: null } }, now), true);
  assert.equal(backupDue({ tables: { ok: true, okAt: new Date(now).toISOString() } }, now), true);
  assert.equal(backupDue(at(60e3), now), false);
  assert.equal(backupDue(at(DAY), now), false);
  assert.equal(backupDue(at(DAY + 1), now), true);
  // a failed last run does not hide a success of an hour ago
  assert.equal(backupDue({ backup: { ok: false, okAt: new Date(now - 3600e3).toISOString() } }, now), false);
  assert.equal(backupDue(at(-60e3), now), false); // a small clock difference
  assert.equal(backupDue(at(-DAY), now), true); // a time well in the future is not believed
});

test('lock: a second run waits for the first, a lock left by a killed run is taken over, a live one is not', async () => {
  const dir = temp('lock'); const file = path.join(dir, 'backup.lock');
  try {
    const order = [];
    let open;
    const first = withLock(file, () => new Promise((r) => { order.push('first in'); open = r; }), { pollMs: 10 });
    const second = withLock(file, async () => { order.push('second in'); }, { pollMs: 10 });
    await new Promise((r) => setTimeout(r, 60));
    assert.deepEqual(order, ['first in']);
    order.push('first out'); open();
    await Promise.all([first, second]);
    assert.deepEqual(order, ['first in', 'first out', 'second in']);
    assert.equal(fs.existsSync(file), false);
    fs.writeFileSync(file, '1\n');
    await assert.rejects(withLock(file, async () => {}, { waitMs: 50, pollMs: 10 }), /ещё выполняется/);
    const old = new Date(Date.now() - 3600e3); fs.utimesSync(file, old, old);
    assert.equal(await withLock(file, async () => 'ran', { waitMs: 50, pollMs: 10 }), 'ran');
    await assert.rejects(withLock(file, async () => { throw new Error('boom'); }), /boom/);
    assert.equal(fs.existsSync(file), false);
  } finally { remove(dir); }
});

test('git credentials: the token comes from the environment, for github.com only, and is in no argument', () => {
  const args = gitArgs('x');
  assert.ok(!args.join(' ').includes(TOKEN));
  assert.ok(args.join(' ').includes(`$${TOKEN_VARIABLE}`));
  const ask = (host) => spawnSync('git', [...args, '-c', 'core.askPass=', 'credential', 'fill'], { encoding: 'utf8', input: `protocol=https\nhost=${host}\n\n`, env: { ...process.env, [TOKEN_VARIABLE]: TOKEN, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '', SSH_ASKPASS: '' } });
  const github = ask('github.com');
  assert.equal(github.status, 0, github.stderr);
  assert.match(github.stdout, /^username=x-access-token$/m);
  assert.match(github.stdout, new RegExp(`^password=${TOKEN}$`, 'm'));
  const other = ask('example.com');
  assert.ok(!`${other.stdout}${other.stderr}`.includes(TOKEN));
});

test('scrubber: secrets (also inside JSON), passwords in addresses and bearer tokens are hidden', () => {
  const s = scrubber(['hunter2-long', 'a\nmulti', '', null, 'ab']);
  assert.equal(s('x hunter2-long y {"p":"a\\nmulti"}'), 'x *** y {"p":"***"}');
  assert.equal(s('https://user:pw@github.com/x Authorization: Bearer ya29.A0-b_c'), 'https://***@github.com/x Authorization: Bearer ***');
  assert.equal(s('ab stays: too short to hide'), 'ab stays: too short to hide');
});

test('Drive copy: the newest folder zipped with its own name, the owner’s file replaced and described; each failure is one reason', async () => {
  const root = temp('drive');
  try {
    for (const d of ['2026-11-01_0830', '2026-11-27_0130', 'other']) fs.mkdirSync(path.join(root, d));
    fs.writeFileSync(path.join(root, '2026-11-27_0130', 'ИТОГ.json'), '{"a":1}');
    assert.equal(newestBackup(root), '2026-11-27_0130');
    const bytes = zipBackup(root, '2026-11-27_0130');
    assert.deepEqual(Object.keys(unzip(bytes)), ['2026-11-27_0130/ИТОГ.json']);
    const calls = [];
    const answer = (files, upload = 200) => async (url, o = {}) => {
      calls.push({ url: String(url), method: o.method || 'GET', body: o.body, auth: o.headers.Authorization });
      if (!o.method) return Response.json({ files });
      return new Response('no', { status: String(url).includes('/upload/') ? upload : 200 });
    };
    await uploadDriveBackup({ token: 't', bytes, folder: '2026-11-27_0130', fetch: answer([{ id: 'F' }]) });
    assert.deepEqual(calls.map((c) => c.method), ['GET', 'PATCH', 'PATCH']);
    assert.ok(calls[0].url.includes(encodeURIComponent(`name = '${DRIVE_FILE_NAME}' and trashed = false`)));
    assert.ok(calls[1].url.startsWith('https://www.googleapis.com/upload/drive/v3/files/F?uploadType=media'));
    assert.equal(calls[1].body, bytes);
    assert.match(JSON.parse(calls[2].body).description, /2026-11-27_0130/);
    assert.ok(calls.every((c) => c.auth === 'Bearer t'));
    await assert.rejects(uploadDriveBackup({ token: 't', bytes, folder: 'f', fetch: answer([]) }), /на Диске нет файла/);
    await assert.rejects(uploadDriveBackup({ token: 't', bytes, folder: 'f', fetch: answer([{ id: 'F' }], 500) }), /загрузка: HTTP 500 no/);
  } finally { remove(root); }
});

test('the Firestore delta backup passes over a NAS (PocketBase) copy in the same repository', () => {
  const root = temp('prev');
  try {
    const put = (dir, id, extra) => { fs.mkdirSync(path.join(root, dir), { recursive: true }); fs.writeFileSync(path.join(root, dir, `${id} (полная).json`), JSON.stringify({ createdAt: dir, project: { id }, data: {}, ...extra })); };
    put('2026-11-25_0830', 'p1', {});
    put('2026-11-26_0130', 'p1', { source: 'pocketbase' });
    put('2026-11-26_0130', 'p2', { source: 'pocketbase' });
    const prev = previousBackups(root);
    assert.deepEqual([...prev.keys()], ['p1']);
    assert.equal(prev.get('p1').createdAt, '2026-11-25_0830');
  } finally { remove(root); }
});

test('a missing secret file: exit 1, a one-line reason, state.json written (the program as the NAS runs it)', () => {
  const box = nas({ secrets: [] });
  try {
    // (`catch-up` records under `backup` too; it first waits for PocketBase, so it is not spawned here)
    for (const command of ['backup', 'tables']) {
      const r = spawnSync(process.execPath, [runner, command], { encoding: 'utf8', env: box.env });
      assert.equal(r.status, 1, r.stdout + r.stderr);
      assert.match(r.stdout.trim().split('\n').at(-1), new RegExp(`^${command}: failed — .*pb_jobs_password`));
      assert.equal(box.state_()[command].ok, false);
      assert.match(box.state_()[command].error, /pb_jobs_password/);
      assert.ok(!box.state_()[command].error.includes('\n'));
    }
  } finally { box.done(); }
});

test('no GitHub token for the real repository: nothing is cloned, the copy goes to Drive alone, the run fails (review 4, F2)', async () => {
  const box = nas({ secrets: ['pb_jobs_password', 'google_service_account.json'] });
  try {
    const r = await run(box, 'backup', { env: { BACKUP_REMOTE: '' }, deps: { now: () => new Date('2026-11-27T01:30:00Z'), openSource: async () => fakeSource() } });
    assert.equal(r.code, 1);
    assert.match(box.state_().backup.error, /github_token/);
    assert.equal(fs.existsSync(path.join(box.state, 'polevoy-backups')), false);
    assert.deepEqual(r.uploads.map((u) => u.folder), ['2026-11-27_0130'], r.text);
    assert.ok(Object.keys(unzip(r.uploads[0].bytes)).some((f) => f.endsWith('(полная).json')));
    assert.match(r.text, /Очистка пропущена/);
  } finally { box.done(); }
});

test('backup with no clone and GitHub down (the first run): the Drive copy is still made from a folder of its own (review 4, F2)', async () => {
  const box = nas();
  try {
    fs.renameSync(box.remote, `${box.remote}.away`);
    const r = await run(box, 'backup', { deps: { now: () => new Date('2026-11-28T01:30:00Z'), openSource: async () => fakeSource() } });
    assert.equal(r.code, 1, r.text);
    assert.match(box.state_().backup.error, /^копии на GitHub: git clone: /);
    assert.deepEqual(r.uploads.map((u) => u.folder), ['2026-11-28_0130']);
    assert.ok(fs.existsSync(path.join(box.state, 'backups-local', '2026-11-28_0130')));
    noSecrets(r.text + stateText(box), 'pm-jobs-password-1');
    // GitHub back: the clone is made and the copy pushed
    fs.renameSync(`${box.remote}.away`, box.remote);
    assert.equal((await run(box, 'backup', { deps: { now: () => new Date('2026-11-29T01:30:00Z'), openSource: async () => fakeSource() } })).code, 0);
    assert.ok(box.files().some((f) => f.startsWith('2026-11-29_0130/')));
  } finally { box.done(); }
});

test('backup: one folder committed and pushed, then the cleanup, then the Drive zip; the next run uses the same clone and drops what a stopped run left', async () => {
  const box = nas();
  try {
    const events = [];
    const source = () => fakeSource({ cleanupCandidates: async () => { events.push(`cleanup after ${box.commits().length} commit(s)`); return []; } });
    const first = await run(box, 'backup', { deps: { now: () => new Date('2026-11-27T01:30:00Z'), openSource: async () => source(), uploadDrive: async (cred, bytes, folder) => { events.push(`drive ${folder} ${cred.client_email} ${Object.keys(unzip(bytes)).length}`); } } });
    assert.equal(first.code, 0, first.text);
    assert.deepEqual(box.commits(), ['Копия 2026-11-27_0130 (NAS)']);
    assert.deepEqual(events, ['cleanup after 1 commit(s)', 'drive 2026-11-27_0130 sa@test.iam 4']);
    assert.equal(first.lines.at(-1), 'backup: ok');
    assert.ok(!first.text.includes('::'), first.text);
    assert.deepEqual(box.state_().backup, { ok: true, at: '2026-11-27T01:30:00.000Z', error: '', okAt: '2026-11-27T01:30:00.000Z' });
    // leftovers of a run that was killed: a half-written folder and git's own lock
    const clone = path.join(box.state, 'polevoy-backups');
    fs.mkdirSync(path.join(clone, '2026-11-27_2359'));
    fs.writeFileSync(path.join(clone, '2026-11-27_2359', 'half.json'), '{');
    fs.writeFileSync(path.join(clone, '.git', 'index.lock'), '');
    const second = await run(box, 'backup', { deps: { now: () => new Date('2026-11-28T01:30:00Z'), openSource: async () => source() } });
    assert.equal(second.code, 0, second.text);
    assert.equal(box.commits().length, 2);
    assert.deepEqual([...new Set(box.files().map((f) => f.split('/')[0]))], ['2026-11-27_0130', '2026-11-28_0130']);
    assert.deepEqual(second.uploads.map((u) => u.folder), ['2026-11-28_0130']);
    noSecrets(first.text + second.text + stateText(box), 'pm-jobs-password-1');
    // a broken clone is made again, and git never reaches a repository around the state folder
    gitRun(box.root, 'init', '-q');
    fs.writeFileSync(path.join(box.root, 'outside.txt'), 'stays');
    fs.rmSync(path.join(clone, '.git', 'HEAD'));
    const third = await run(box, 'backup', { deps: { now: () => new Date('2026-11-29T01:30:00Z'), openSource: async () => source() } });
    assert.equal(third.code, 0, third.text);
    assert.match(third.text, /клонирую заново/);
    assert.equal(box.commits().length, 3);
    assert.equal(fs.readFileSync(path.join(box.root, 'outside.txt'), 'utf8'), 'stays');
  } finally { box.done(); }
});

test('backup with GitHub down: no cleanup, the Drive copy is still made, the failure and the last success are kept', async () => {
  const box = nas();
  try {
    const cleaned = [];
    const source = () => fakeSource({ cleanupCandidates: async () => { cleaned.push(1); return []; } });
    assert.equal((await run(box, 'backup', { deps: { now: () => new Date('2026-11-27T01:30:00Z'), openSource: async () => source() } })).code, 0);
    fs.renameSync(box.remote, `${box.remote}.away`);
    const r = await run(box, 'backup', { deps: { now: () => new Date('2026-11-28T01:30:00Z'), openSource: async () => source() } });
    assert.equal(r.code, 1, r.text);
    assert.deepEqual(r.uploads.map((u) => u.folder), ['2026-11-28_0130']);
    assert.equal(cleaned.length, 1, 'only the first run cleaned');
    assert.match(box.state_().backup.error, /^отправка на GitHub: git push: /);
    assert.equal(box.state_().backup.okAt, '2026-11-27T01:30:00.000Z');
    assert.match(r.lines.at(-1), /^backup: failed — /);
    // GitHub back: the run goes through again
    fs.renameSync(`${box.remote}.away`, box.remote);
    assert.equal((await run(box, 'backup', { deps: { now: () => new Date('2026-11-29T01:30:00Z'), openSource: async () => source() } })).code, 0);
    assert.ok(box.files().some((f) => f.startsWith('2026-11-29_0130/')));
  } finally { box.done(); }
});

test('backup failures: a failed export sends nothing; a failed Drive upload or a missing Google account fails the run after the push; nothing secret is shown', async () => {
  const box = nas();
  try {
    const broken = await run(box, 'backup', { deps: { openSource: async () => fakeSource({ readProject: async () => { throw new Error(`HTTP 500 for ${TOKEN}`); } }) } });
    assert.equal(broken.code, 1);
    assert.deepEqual([box.commits(), broken.uploads], [[], []]);
    assert.match(box.state_().backup.error, /копия базы: HTTP 500 for \*\*\*/);
    const drive = await run(box, 'backup', { deps: { openSource: async () => fakeSource(), uploadDrive: async () => { throw new Error(`загрузка: HTTP 403 Bearer abc.def ${ACCOUNT.private_key}\nsecond line`); } } });
    assert.equal(drive.code, 1);
    assert.equal(box.commits().length, 1);
    assert.match(box.state_().backup.error, /^копия на Google Диск: загрузка: HTTP 403/);
    assert.ok(!box.state_().backup.error.includes('\n'));
    fs.rmSync(path.join(box.secrets, 'google_service_account.json'));
    const noAccount = await run(box, 'backup', { deps: { openSource: async () => fakeSource() } });
    assert.match(box.state_().backup.error, /google_service_account\.json/);
    fs.writeFileSync(path.join(box.secrets, 'google_service_account.json'), `{"private_key": "${KEY_LINE}`);
    const badAccount = await run(box, 'backup', { deps: { openSource: async () => fakeSource() } });
    assert.match(box.state_().backup.error, /это не JSON/);
    noSecrets([broken, drive, noAccount, badAccount].map((r) => r.text).join('\n') + stateText(box), 'pm-jobs-password-1');
  } finally { box.done(); }
});

test('tables: runs on the source with the Google calls replaced; one table that fails makes the run fail', async () => {
  const box = nas();
  try {
    const db = (tables) => createFakeFirestore({ projects: { p1: { data: { name: 'Alpha', tables }, subs: {} } } });
    const asked = [];
    const api = { fileInfo: async () => { asked.push('fileInfo'); throw Object.assign(new Error(`stub ${TOKEN}`), { status: 500 }); } };
    const ok = db([]);
    const r1 = await run(box, 'tables', { deps: { openSource: async () => createFirestoreSource({ db: ok, Timestamp }), tablesApi: async (cred) => { asked.push(cred.client_email); return api; } } });
    assert.equal(r1.code, 0, r1.text);
    assert.deepEqual(asked, ['sa@test.iam']);
    assert.equal(ok.dump()['projects/p1'].serverEmail, 'sa@test.iam');
    assert.equal(box.state_().tables.ok, true);
    const bad = db([{ id: 't1', name: 'Main', main: true, fileId: 'F1', auto: true, columns: ['label'] }]);
    const r2 = await run(box, 'tables', { deps: { openSource: async () => createFirestoreSource({ db: bad, Timestamp }), tablesApi: async () => api } });
    assert.equal(r2.code, 1, r2.text);
    assert.match(box.state_().tables.error, /^ошибок: 1, первая — Alpha: Main: ОШИБКА/);
    assert.match(r2.text, /^WARNING: Alpha: Main: ОШИБКА/m);
    assert.equal(box.state_().backup, undefined);
    noSecrets(r1.text + r2.text + stateText(box), 'pm-jobs-password-1');
  } finally { box.done(); }
});

test('catch-up: runs the backup when due, otherwise does and writes nothing', async () => {
  const box = nas();
  try {
    let opened = 0;
    const deps = (iso) => ({ now: () => new Date(iso), openSource: async () => { opened += 1; return fakeSource(); } });
    const first = await run(box, 'catch-up', { env: { PB_URL: 'http://127.0.0.1:9' }, deps: deps('2026-11-27T10:00:00Z') });
    assert.equal(first.code, 0, first.text);
    assert.equal(first.lines.at(-1), 'catch-up: ok');
    assert.equal(box.state_().backup.okAt, '2026-11-27T10:00:00.000Z');
    const before_ = stateText(box);
    const soon = await run(box, 'catch-up', { deps: deps('2026-11-28T09:00:00Z') });
    assert.equal(soon.code, 0);
    assert.match(soon.text, /делать нечего/);
    assert.deepEqual([opened, stateText(box), box.commits().length], [1, before_, 1]);
    const late = await run(box, 'catch-up', { env: { PB_URL: 'http://127.0.0.1:9' }, deps: deps('2026-11-28T10:00:01Z') });
    assert.equal(late.code, 0, late.text);
    assert.deepEqual([opened, box.commits().length], [2, 2]);
  } finally { box.done(); }
});

test('the unpacked nas-jobs.zip starts alone: --help, and a job up to PocketBase', () => {
  const root = temp('zip');
  try {
    // the repo's own scripts/ and src/; stand-ins for the two packages, which the runner loads only when a job reaches Google or a drawing
    const mods = path.join(root, 'mods');
    for (const dep of ['google-auth-library', 'mupdf']) { fs.mkdirSync(path.join(mods, dep), { recursive: true }); fs.writeFileSync(path.join(mods, dep, 'package.json'), '{"version":"0.0.0"}'); }
    fs.mkdirSync(path.join(root, 'dist'));
    fs.writeFileSync(path.join(root, 'dist', 'index.html'), '');
    fs.writeFileSync(path.join(root, 'dist', 'manifest.webmanifest'), '{"start_url":"/"}');
    pack({ root: repo, outDir: path.join(root, 'out'), distDir: path.join(root, 'dist'), modulesDir: mods, commit: 'a'.repeat(40) });
    const unpacked = path.join(root, 'jobs');
    for (const [name, data] of Object.entries(unzip(fs.readFileSync(path.join(root, 'out', 'nas-jobs.zip'))))) {
      fs.mkdirSync(path.dirname(path.join(unpacked, name)), { recursive: true });
      fs.writeFileSync(path.join(unpacked, name), data);
    }
    const start = (args, env = {}) => spawnSync(process.execPath, ['scripts/nas-jobs.mjs', ...args], { cwd: unpacked, encoding: 'utf8', env: { ...process.env, NODE_PATH: '', ...env } });
    const help = start(['--help']);
    assert.equal(help.status, 0, help.stderr);
    assert.equal(help.stdout.trim(), USAGE);
    // loads the PocketBase source and its modules, then finds nothing at the address
    const tables = start(['tables'], { PM_STATE: path.join(root, 'state'), PM_SECRETS: root, PB_URL: 'http://127.0.0.1:9', PB_JOBS_EMAIL: 'jobs@pm.test', PB_JOBS_PASSWORD: 'pm-jobs-password-1' });
    assert.equal(tables.status, 1, tables.stdout + tables.stderr);
    assert.match(tables.stdout, /^tables: failed — вход в PocketBase: /m);
    assert.equal(tables.stderr, '');
  } finally { remove(root); }
});

// ---------- against a real PocketBase ----------
const missing = missingBinary();
if (missing && REQUIRED) test('PocketBase binary is present (PB_TESTS_REQUIRED=1)', () => assert.fail(missing));

describe('job runner against PocketBase', { skip: missing ? missing : false }, () => {
  let srv; let A; let box;
  const NOW = Date.now();
  const ok = async (ops) => { const r = await srv.save(srv.superToken, ops, 2); assert.equal(r.status, 200, r.text); };

  before(async () => {
    srv = await startServer();
    [A] = srv.users;
    box = nas({ password: SUPERUSER.password });
    box.env.PB_URL = srv.url;
    await ok([{ t: 'project', key: 'p1', mode: 'deep', data: { id: 'p1', name: 'Synthetic', memberUids: [A.id], memberEmails: [A.email], createdBy: A.id, updatedAt: NOW,
      tables: [{ id: 't1', name: 'Main', main: true, fileId: 'F1', auto: true, columns: [] }] } }]);
    await ok([
      { t: 'rec', pid: 'p1', coll: 'points', key: 'a', mode: 'deep', data: { id: 'a', label: '1A-01' } },
      { t: 'rec', pid: 'p1', coll: 'points', key: 'old', mode: 'deep', data: { id: 'old', label: '1A-02', deleted: true, deletedAt: NOW - 400 * DAY } },
    ]);
  });
  after(async () => { await srv?.stop(); box?.done(); });

  const keys = async () => (await srv.all('records')).map((r) => r.key).sort();

  test('backup: DRY_RUN keeps what the cleanup would delete; one folder pushed, marked as PocketBase; the Drive zip holds it', async () => {
    const r = await run(box, 'backup', { env: { DRY_RUN: '1' } });
    assert.equal(r.code, 0, r.text);
    assert.match(r.text, /\[проба\] Очистка .*записей 1/);
    assert.deepEqual(await keys(), ['a', 'old']);
    assert.equal(box.commits().length, 1);
    const [upload] = r.uploads;
    const zipped = unzip(upload.bytes);
    const full = JSON.parse(zipped[`${upload.folder}/Synthetic (полная).json`].toString());
    assert.equal(full.source, 'pocketbase');
    assert.deepEqual(full.data.points.map((p) => p.id), ['a', 'old']);
    assert.deepEqual(Object.keys(zipped).sort(), box.files().sort());
    assert.ok((await srv.all('projects'))[0].data.serverBackupAt);
    noSecrets(r.text + stateText(box), SUPERUSER.password);
  });

  test('backup without DRY_RUN deletes the expired record after the push; catch-up then has nothing to do (the program itself)', async () => {
    // a minute on, so the second folder has its own name
    const r = await run(box, 'backup', { deps: { now: () => new Date(Date.now() + 60e3) } });
    assert.equal(r.code, 0, r.text);
    assert.deepEqual(await keys(), ['a']);
    assert.equal(box.commits().length, 2);
    const again = spawnSync(process.execPath, [runner, 'catch-up'], { encoding: 'utf8', env: box.env });
    assert.equal(again.status, 0, again.stdout + again.stderr);
    assert.match(again.stdout, /делать нечего/);
    assert.equal(box.commits().length, 2);
  });

  test('tables: the night run on PocketBase with the Google calls replaced writes its results; the failure is in state.json', async () => {
    const api = { fileInfo: async () => null, rename: async () => {}, sheetsOf: async () => [], batch: async () => {}, write: async () => {} };
    const r = await run(box, 'tables', { deps: { tablesApi: async () => api } });
    assert.equal(r.code, 1, r.text);
    const p = (await srv.all('projects'))[0].data;
    assert.equal(p.serverEmail, 'sa@test.iam');
    assert.ok(p.serverTablesAt && p.tables[0].serverError);
    assert.match(box.state_().tables.error, /Synthetic: Main: ОШИБКА/);
    await ok([{ t: 'project', key: 'p1', mode: 'deep', data: { tables: [] } }]);
    const fine = await run(box, 'tables', { deps: { tablesApi: async () => api } });
    assert.equal(fine.code, 0, fine.text);
    assert.deepEqual([box.state_().tables.ok, box.state_().backup.ok], [true, true]);
    noSecrets(r.text + fine.text + stateText(box), SUPERUSER.password);
  });

  test('a wrong jobs password is a one-line failure that does not show it', async () => {
    const wrong = nas({ password: 'wrong-password-xyz' });
    try {
      const r = await run(wrong, 'tables', { env: { PB_URL: srv.url } });
      assert.equal(r.code, 1);
      assert.match(wrong.state_().tables.error, /HTTP 400/);
      noSecrets(r.text + stateText(wrong), 'wrong-password-xyz');
    } finally { wrong.done(); }
  });
});
