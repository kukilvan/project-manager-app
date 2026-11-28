// The job runner of the NAS copy: `backup` (export, git push, cleanup, the zip on the owner's Drive), `tables` (the night sheets) and `catch-up`.
// The NAS project's agent runs it from nas-jobs.zip as `node scripts/nas-jobs.mjs <command>` (spec 4 § 5.1; R-JOB-1, R-JOB-2 of docs/nas-requirements.md):
// Node 22, `git` and the network, no npm install. The work itself is shared with GitHub Actions: job-source.mjs (PocketBase), server-backup-lib.mjs,
// server-tables-lib.mjs, google-api.mjs, drive-backup-lib.mjs; git is nas-git.mjs. Exit code 0 on success, 1 on any failure with a one-line reason.
// state.json keeps {backup, tables}: {ok, at, error, okAt — the last success}, written after every run that did something. No secret is ever logged.
//
// Environment: PB_URL (default http://pocketbase:8090), PB_JOBS_EMAIL; secrets as files in PM_SECRETS (default /run/secrets): pb_jobs_password,
// google_service_account.json, github_token; PM_STATE (default /data) for the clone of the backups, state.json and `backups-local` (the export when there is
// no clone); BACKUP_REPO (default
// kukilvan/polevoy-backups); FULL=1 — tables: every project, changed or not; DRY_RUN=1 — the cleanup only reports; BACKUP_REMOTE — another git
// address instead of GitHub, no token needed (tests).
//
// Contents:
// - COMMANDS, USAGE, config() — the commands and the settings
// - readState(), recordState(), backupDue() — state.json and whether `catch-up` has work
// - scrubber(), secretsOf() — what may never reach a log or state.json
// - withLock() — one backup at a time
// - main() — one command; the Google calls and the source are in DEPS, which tests replace
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSource, googleCredentials, secret } from './job-source.mjs';
import { runServerBackup, runCleanup } from './server-backup-lib.mjs';
import { runTables } from './server-tables-lib.mjs';
import { createTablesApi, TABLES_SCOPES } from './google-api.mjs';
import { zipBackup, uploadDriveBackup, DRIVE_FILE_NAME } from './drive-backup-lib.mjs';
import { syncClone, publish } from './nas-git.mjs';

export const COMMANDS = ['backup', 'tables', 'catch-up'];
export const USAGE = `Usage: node scripts/nas-jobs.mjs <command>
  backup    export into the backup repository, push; clean up; zip the new copy to the owner's Google Drive
  tables    the night management sheets, rack tables and numbered drawings
  catch-up  backup, when the last successful one is over 24 hours old or there is none
Settings: PB_URL, PB_JOBS_EMAIL, PM_SECRETS, PM_STATE, BACKUP_REPO, FULL=1, DRY_RUN=1 (see the header of this file).`;
export const CATCH_UP_AGE = 24 * 3600e3;
const CLOCK_SLACK = 5 * 60e3;
const MAX_PER_COLLECTION = 5000; // the cleanup's limit, as in server-cleanup.mjs

export function config(env = process.env) {
  const pbUrl = env.PB_URL || 'http://pocketbase:8090';
  const secrets = env.PM_SECRETS || '/run/secrets';
  const state = env.PM_STATE || '/data';
  const repo = env.BACKUP_REPO || 'kukilvan/polevoy-backups';
  return {
    pbUrl, secrets, state, repo,
    remote: env.BACKUP_REMOTE || `https://github.com/${repo}.git`,
    needsToken: !env.BACKUP_REMOTE,
    stateFile: path.join(state, 'state.json'),
    clone: path.join(state, 'polevoy-backups'),
    // the export when there is no clone (review 4, F2): the same folder format, kept like the clone's last 15
    local: path.join(state, 'backups-local'),
    lock: path.join(state, 'backup.lock'),
    full: env.FULL === '1',
    dry: env.DRY_RUN === '1',
    // what job-source.mjs reads: this runner is the PocketBase one
    jobEnv: { ...env, PM_SOURCE: 'pocketbase', PM_SECRETS: secrets, PB_URL: pbUrl },
  };
}

// ---------- state.json ----------
export function readState(file) {
  try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); return j && typeof j === 'object' && !Array.isArray(j) ? j : {}; } catch { return {}; }
}

// One job's result; the other job's record and the time of this job's last success stay. Written whole and then renamed, so a reader never sees half a file.
export function recordState(file, job, { ok, at, error = '' }) {
  const state = readState(file);
  state[job] = { ok, at, error: ok ? '' : error, okAt: ok ? at : state[job]?.okAt || null };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.${process.pid}.tmp`, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(`${file}.${process.pid}.tmp`, file);
}

// true: no successful backup, or the last one is over 24 hours old (a time well in the future — a wrong clock — counts as none)
export function backupDue(state, now) {
  const age = now - Date.parse(state?.backup?.okAt);
  return !(age >= -CLOCK_SLACK && age <= CATCH_UP_AGE);
}

// ---------- secrets ----------
// The secret values this run can meet, as far as they can be read
export function secretsOf(cfg) {
  const read = (variable, file) => secret(cfg.jobEnv, variable, file);
  const google = read('GOOGLE_SERVICE_ACCOUNT', 'google_service_account.json');
  let key = {};
  try { key = JSON.parse(google) || {}; } catch { /* not JSON: the whole text is hidden below */ }
  const pem = String(key.private_key || '');
  return [read('PB_JOBS_PASSWORD', 'pb_jobs_password'), read('', 'github_token'), google, pem, ...pem.split('\n').filter((l) => l.length >= 16 && !l.startsWith('-----')), key.private_key_id];
}

// text → the text without those values (also as written inside JSON), passwords in addresses and bearer tokens
export function scrubber(secrets) {
  const hidden = [...new Set(secrets.filter(Boolean).flatMap((s) => [String(s), JSON.stringify(String(s)).slice(1, -1)]))].filter((s) => s.length >= 4).sort((a, b) => b.length - a.length);
  return (text) => hidden.reduce((t, s) => t.split(s).join('***'), String(text))
    .replace(/(:\/\/)[^/\s'"@]+@/g, '$1***@')
    .replace(/Bearer [\w.~+/=-]+/g, 'Bearer ***');
}

// ---------- one backup at a time ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Runs fn holding the lock file. A second run waits. The holder touches the file while it works, so a lock left by a killed process (a container
// restart) turns stale after `staleMs` and is taken over.
export async function withLock(file, fn, { staleMs = 2 * 60e3, waitMs = 30 * 60e3, pollMs = 5000, beatMs = 15e3 } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const until = Date.now() + waitMs;
  for (;;) {
    try { fs.writeFileSync(file, `${process.pid}\n`, { flag: 'wx' }); break; } catch (e) { if (e.code !== 'EEXIST') throw e; }
    let age = 0;
    try { age = Date.now() - fs.statSync(file).mtimeMs; } catch { continue; }
    if (age > staleMs) { fs.rmSync(file, { force: true }); continue; }
    if (Date.now() >= until) throw new Error('другая копия ещё выполняется');
    await sleep(pollMs);
  }
  const beat = setInterval(() => { const t = new Date(); try { fs.utimesSync(file, t, t); } catch { /* gone */ } }, beatMs);
  try { return await fn(); } finally { clearInterval(beat); fs.rmSync(file, { force: true }); }
}

// ---------- the commands ----------
// What reaches outside the NAS, and the clock; tests replace any of them
export const DEPS = {
  now: () => new Date(),
  openSource,
  // the zip of the newest copy into the owner's Drive file
  async uploadDrive(cred, bytes, folder) {
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({ credentials: cred, scopes: ['https://www.googleapis.com/auth/drive'] });
    await uploadDriveBackup({ token: await auth.getAccessToken(), bytes, folder });
  },
  // Drive and Sheets for the night sheets
  async tablesApi(cred) {
    const { GoogleAuth } = await import('google-auth-library');
    return createTablesApi(new GoogleAuth({ credentials: cred, scopes: TABLES_SCOPES }));
  },
  loadMupdf: () => import('mupdf'),
  serverWaitMs: 2 * 60e3, // `catch-up` runs at the container's start, maybe before PocketBase answers
  lock: {},
};

const why = (e) => `${e.message}${e.cause?.code ? ` (${e.cause.code})` : ''}`;
async function step(name, fn) {
  try { return await fn(); } catch (e) { throw new Error(`${name}: ${why(e)}`); }
}

async function waitForServer(url, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { if ((await fetch(`${url.replace(/\/+$/, '')}/api/health`, { signal: AbortSignal.timeout(5000) })).ok) return; } catch { /* not up yet */ }
    await sleep(3000);
  }
}

// Export → push → cleanup → Drive. The cleanup deletes for good, so it runs only after the new copy has left the NAS; the Drive copy is made even
// when GitHub or the cleanup failed (it is the other copy outside the home). Without a clone of the backups (no token, GitHub down on the first run,
// a broken clone that cannot be made again) the export goes into a folder of its own in PM_STATE, so the Drive copy is still made (review 4, F2).
// A failed export stops everything: there is no new copy to send.
async function runBackup({ cfg, deps, log }) {
  const source = await step('вход в PocketBase', () => deps.openSource(cfg.jobEnv));
  const problems = [];
  const attempt = (name, fn) => step(name, fn).then(() => true, (e) => { problems.push(e.message); log(`ERROR: ${e.message}`); return false; });
  const token = secret(cfg.jobEnv, '', 'github_token');
  let root = cfg.clone;
  const cloned = await attempt('копии на GitHub', async () => {
    if (cfg.needsToken && !token) throw new Error('нет токена GitHub (файл github_token)');
    if (cfg.needsToken && !/^[\w.-]+\/[\w.-]+$/.test(cfg.repo)) throw new Error('BACKUP_REPO должен быть вида «владелец/репозиторий»');
    const { warning } = await syncClone(cfg.clone, cfg.remote, { token, log });
    if (warning) log(`Копии на GitHub не обновить: ${warning}`);
  });
  if (!cloned) { root = cfg.local; log(`Копия без GitHub: папка ${root}, только на Google Диск`); }
  const made = await step('копия базы', () => runServerBackup(source, root, { now: deps.now(), full: cfg.full, log }));
  const folder = path.basename(made.dir);
  const pushed = cloned && await attempt('отправка на GitHub', () => publish(cfg.clone, `Копия ${folder} (NAS)`, { token }));
  if (pushed) {
    log(`Копия ${folder} отправлена на GitHub`);
    await attempt('очистка', () => runCleanup(source, { now: deps.now().getTime(), dry: cfg.dry, max: MAX_PER_COLLECTION, log }));
  } else log('Очистка пропущена: копия не отправлена на GitHub');
  await attempt('копия на Google Диск', async () => {
    const cred = googleCredentials(cfg.jobEnv);
    const bytes = zipBackup(root, folder);
    await deps.uploadDrive(cred, bytes, folder);
    log(`Копия ${folder} (${Math.round(bytes.length / 1024)} КБ) сохранена на Google Диск: «${DRIVE_FILE_NAME}»`);
  });
  if (problems.length) throw new Error(problems.join('; '));
}

// The night run of server-tables-lib.mjs. Every error it reports counts as a failure, one table's too (GitHub Actions only warns about those);
// the run still goes through all projects.
async function runNightTables({ cfg, deps, log }) {
  const source = await step('вход в PocketBase', () => deps.openSource(cfg.jobEnv));
  const cred = googleCredentials(cfg.jobEnv);
  const api = await step('вход в Google', () => deps.tablesApi(cred));
  const errors = [];
  await runTables(source, api, {
    now: deps.now(), full: cfg.full, serverEmail: cred.client_email, loadMupdf: deps.loadMupdf,
    log: (l) => { if (/^::(warning|error)::/.test(l)) errors.push(l.replace(/^::\w+::/, '')); log(l); },
  });
  if (errors.length) throw new Error(`ошибок: ${errors.length}, первая — ${errors[0]}`);
}

const oneLine = (text) => String(text).replace(/\s*[\r\n]+\s*/g, ' ').slice(0, 500);

// One command → the exit code. `catch-up` records its backup under `backup` and writes nothing when there is nothing to do.
export async function main(argv, { env = process.env, deps: replaced = {}, log: out = console.log } = {}) {
  const [command, ...rest] = argv;
  if ((command === '--help' || command === '-h') && !rest.length) { out(USAGE); return 0; }
  if (!COMMANDS.includes(command) || rest.length) {
    out(command === undefined ? 'No command given.' : `Unknown command or extra arguments: ${argv.join(' ')}`);
    out(USAGE);
    return 1;
  }
  const deps = { ...DEPS, ...replaced };
  const cfg = config(env);
  const scrub = scrubber(secretsOf(cfg));
  // the libraries print GitHub's annotation marks; here they are plain words
  const log = (line) => out(scrub(line).replace(/^::(notice|warning|error)::/, (_, kind) => (kind === 'notice' ? '' : `${kind.toUpperCase()}: `)));
  const ctx = { cfg, deps, log };
  const job = command === 'tables' ? 'tables' : 'backup';
  const due = () => backupDue(readState(cfg.stateFile), deps.now().getTime());
  const idle = () => { log(`catch-up: последняя удачная копия ${readState(cfg.stateFile).backup.okAt}, моложе суток — делать нечего`); return 0; };
  const record = (result) => recordState(cfg.stateFile, job, { at: deps.now().toISOString(), ...result });
  try {
    if (command === 'tables') await runNightTables(ctx);
    else {
      if (command === 'catch-up' && !due()) return idle();
      const ran = await withLock(cfg.lock, async () => {
        // another run may have made the copy while this one waited
        if (command === 'catch-up') {
          if (!due()) return false;
          await waitForServer(cfg.pbUrl, deps.serverWaitMs);
        }
        await runBackup(ctx);
        return true;
      }, deps.lock);
      if (!ran) return idle();
    }
    record({ ok: true });
  } catch (e) {
    const reason = oneLine(scrub(why(e)));
    try { record({ ok: false, error: reason }); } catch (w) { log(`state.json не записать: ${w.message}`); }
    log(`${command}: failed — ${reason}`);
    return 1;
  }
  log(`${command}: ok`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // an error nothing awaited: the same one line and state.json
  const stray = (e) => {
    const argv = process.argv.slice(2);
    const cfg = config();
    const reason = oneLine(scrubber(secretsOf(cfg))(String(e?.message || e)));
    try { if (COMMANDS.includes(argv[0])) recordState(cfg.stateFile, argv[0] === 'tables' ? 'tables' : 'backup', { ok: false, at: new Date().toISOString(), error: reason }); } catch { /* the line below still says why */ }
    console.log(`${argv[0]}: failed — ${reason}`);
    process.exit(1);
  };
  process.on('uncaughtException', stray);
  process.on('unhandledRejection', stray);
  const code = await main(process.argv.slice(2));
  process.exitCode = code;
  // a library's open connection must not keep the job running
  setTimeout(() => process.exit(code), 10e3).unref();
}
