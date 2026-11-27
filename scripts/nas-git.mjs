// Git for the NAS job runner: keeps a clone of the private backup repository up to date, commits a new backup folder and pushes it.
// The GitHub token reaches git only through the environment variable PM_GIT_TOKEN and a credential helper that answers for https://github.com alone:
// it is never part of an address, an argument or a file. Runs the `git` program of the machine; used by scripts/nas-jobs.mjs (spec 4 § 5.1),
// checked on a local bare repository by tests/nas-jobs.test.js.
//
// Contents:
// - gitArgs() — the settings given to every git call, the credential helper among them
// - git() — one git call; throws with git's own last error line
// - syncClone() — the clone: made, or cleaned and brought up to date
// - publish() — add, commit, push
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const TOKEN_VARIABLE = 'PM_GIT_TOKEN';
// A shell function git runs when it needs a password; the token's value is read from the environment only inside it
const HELPER = `!f() { if test "$1" = get; then printf 'username=x-access-token\\npassword=%s\\n' "$${TOKEN_VARIABLE}"; fi; }; f`;
const TIMEOUT = 10 * 60e3;

export function gitArgs(dir) {
  return [
    // an empty value first drops every helper of the machine's own settings
    '-c', 'credential.helper=', '-c', `credential.https://github.com.helper=${HELPER}`,
    '-c', 'user.name=backup-bot', '-c', 'user.email=backup-bot@users.noreply.github.com', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false',
    // a mounted state folder may belong to another user of the container
    ...(dir ? ['-c', `safe.directory=${path.resolve(dir).replace(/\\/g, '/')}`] : []),
  ];
}

// One git call in `cwd`. Resolves with stdout; a failure throws `git <command>: <git's error line>`.
// own: the call is about the repository in `cwd` and no other — a broken clone fails instead of git going up to a repository around it.
export function git(args, { cwd, dir = cwd, own = false, token = '' } = {}) {
  const here = own ? [`--git-dir=${path.join(cwd, '.git')}`, `--work-tree=${cwd}`] : [];
  return new Promise((resolve, reject) => {
    const child = spawn('git', [...gitArgs(dir), ...here, ...args], { cwd, timeout: TIMEOUT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, [TOKEN_VARIABLE]: token, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' } });
    let out = ''; let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err = (err + d).slice(-4000); });
    child.on('error', (e) => reject(new Error(e.code === 'ENOENT' ? 'программа git не найдена' : `git ${args[0]}: ${e.message}`)));
    child.on('close', (code, signal) => {
      if (code === 0) { resolve(out); return; }
      const lines = err.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const told = lines.filter((l) => /^(fatal|error|remote):|\[(remote )?rejected\]/.test(l));
      reject(new Error(`git ${args[0]}: ${signal ? `прерван по времени (${signal})` : (told.length ? told : lines).slice(-3).join(' / ') || `код ${code}`}`));
    });
  });
}

const works = async (args, opts) => { try { await git(args, opts); return true; } catch { return false; } };

// The clone of `remote` in `dir`: cloned when missing or broken, else cleaned (what a stopped run left behind goes away) and reset to the remote's state.
// Returns { warning }: why an existing clone could not be brought up to date (GitHub down) — the run goes on with it and the push says the rest.
// A missing clone that cannot be made throws.
export async function syncClone(folder, remote, { token = '', log = () => {} } = {}) {
  const dir = path.resolve(folder);
  const opts = { cwd: dir, own: true, token };
  if (fs.existsSync(path.join(dir, '.git'))) {
    // a stopped run leaves the lock file behind; only one backup runs at a time (the runner's own lock)
    fs.rmSync(path.join(dir, '.git', 'index.lock'), { force: true });
    try {
      if (await works(['rev-parse', '--verify', '-q', 'HEAD'], opts)) await git(['reset', '--hard', '-q'], opts);
      await git(['clean', '-fdq'], opts);
      await git(['remote', 'set-url', 'origin', remote], opts);
    } catch (e) {
      log(`Клон копий повреждён, клонирую заново: ${e.message}`);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } else fs.rmSync(dir, { recursive: true, force: true });
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    try { await git(['clone', '-q', '--depth', '1', remote, dir], { cwd: path.dirname(dir), dir, token }); } catch (e) { fs.rmSync(dir, { recursive: true, force: true }); throw e; }
    return { warning: null };
  }
  try {
    await git(['fetch', '-q', 'origin'], opts);
    // an empty repository has no upstream commit yet
    if (await works(['rev-parse', '--verify', '-q', '@{upstream}'], opts)) await git(['reset', '--hard', '-q', '@{upstream}'], opts);
    return { warning: null };
  } catch (e) { return { warning: e.message }; }
}

// Commits everything in the clone (new and removed folders) and pushes the current branch
export async function publish(folder, message, { token = '' } = {}) {
  const opts = { cwd: path.resolve(folder), own: true, token };
  await git(['add', '-A'], opts);
  if ((await git(['status', '--porcelain'], opts)).trim()) await git(['commit', '-q', '-m', message], opts);
  await git(['push', '-q', 'origin', 'HEAD'], opts);
}
