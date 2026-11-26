#!/usr/bin/env node
// Local PocketBase runner: fetches PocketBase 0.42.3 with its checksum and starts or stops a local instance with the repo's migrations and hooks.
// For the self-check of NAS tickets and for the server tests (tests/pb-helper.js imports startPocketBase / stopPocketBase).
// Node only, no dependency. Spec 4 § 1 and § 11; ticket 4.2. Everything here is local: bound to 127.0.0.1, data under .cache/.
// The superuser and the test users have fixed passwords written below on purpose: they exist only on this local instance,
// which also switches password sign-in on and the batch API on; the NAS sets its own Settings (docs/nas-requirements.md, "Who sets what").
//
// Contents:
// - constants — PB_VERSION, SHA256 per platform, SUPERUSER, TEST_USERS, TEST_PASSWORD, folders
// - platformKey(), binaryPath() — which build and where it lives
// - fetchPocketBase() — download, SHA-256 check, unzip (scripts/zip-lib.mjs)
// - startPocketBase(), stopPocketBase() — an instance on a port with a data folder; superuser, settings, test users
// - CLI: node tools/pb-dev.mjs fetch | up [--empty] [--port N] [--serve <dir>] | down
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { unzip } from '../scripts/zip-lib.mjs';

export const PB_VERSION = '0.42.3';
// From the release's checksums.txt (spec 4 § 1); a mismatch deletes the download and fails
export const SHA256 = {
  linux_amd64: '89b1ded352404c648dd92c2d884fc8ff7858138697cb1ccb52722ccaa0bbd2a9',
  windows_amd64: 'c783fffb2ae6cf38e11d99eb995ea182c29f0a998f53a0d638111e687553c349',
};
export const DOWNLOAD = (plat) => `https://ganigeorgiev.com/meta/pocketbase/pocketbase/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_${plat}.zip`;

// Local-only accounts (see the header): the dashboard at http://127.0.0.1:<port>/_/ and the app's password form use them
export const SUPERUSER = { email: 'admin@pm.test', password: 'pm-local-superuser' };
export const TEST_PASSWORD = 'pm-local-test';
export const TEST_USERS = [
  { email: 'a@pm.test', name: 'Tester A' },
  { email: 'b@pm.test', name: 'Tester B' },
  { email: 'c@pm.test', name: 'Tester C' },
];

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEV_DIR = '.cache/pb-dev';
export const DEFAULT_PORT = 8090;

// ---------- the binary ----------

// 'linux_amd64' or 'windows_amd64'; anything else throws a clear message
export function platformKey(platform = process.platform, arch = process.arch) {
  const p = platform === 'win32' ? 'windows' : platform === 'linux' ? 'linux' : null;
  if (!p || arch !== 'x64') throw new Error(`pb-dev: PocketBase builds are fetched only for Linux and Windows on x64 (this is ${platform} ${arch})`);
  return `${p}_amd64`;
}

export function binaryPath(root = ROOT, plat = platformKey()) {
  return path.join(root, '.cache', 'pocketbase', PB_VERSION, plat.startsWith('windows') ? 'pocketbase.exe' : 'pocketbase');
}

// unzip() lives in scripts/zip-lib.mjs (shared with the NAS release packer); re-exported for the callers of this module
export { unzip };

export function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

// Downloads and unpacks the binary unless it is there already; returns its path
export async function fetchPocketBase({ root = ROOT, log = console.log } = {}) {
  const plat = platformKey();
  const bin = binaryPath(root, plat);
  if (fs.existsSync(bin)) { log(`PocketBase ${PB_VERSION} is already here: ${path.relative(root, bin)}`); return bin; }
  fs.mkdirSync(path.dirname(bin), { recursive: true });
  const url = DOWNLOAD(plat);
  log(`Downloading PocketBase ${PB_VERSION} (${plat})...`);
  const res = await fetch(url, { headers: { 'User-Agent': 'project-manager-pb-dev' } });
  if (!res.ok) throw new Error(`pb-dev: download failed: HTTP ${res.status} ${url}`);
  const zip = Buffer.from(await res.arrayBuffer());
  const zipPath = `${bin}.zip`;
  fs.writeFileSync(zipPath, zip);
  const got = sha256(zip);
  if (got !== SHA256[plat]) {
    fs.rmSync(zipPath, { force: true });
    throw new Error(`pb-dev: SHA-256 mismatch for ${url}: got ${got}, expected ${SHA256[plat]}; the file was deleted`);
  }
  const files = unzip(zip);
  const exe = files[path.basename(bin)];
  if (!exe) throw new Error(`pb-dev: ${path.basename(bin)} is not in the zip`);
  fs.writeFileSync(bin, exe, { mode: 0o755 });
  fs.rmSync(zipPath, { force: true });
  log(`PocketBase ${PB_VERSION} ready: ${path.relative(root, bin)} (SHA-256 of the zip checked)`);
  return bin;
}

// ---------- an instance ----------

export function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

async function api(url, { method = 'GET', token, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: token } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  return { status: res.status, json, text };
}

async function waitHealthy(url, child, ms = 30000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (child && child.exitCode !== null) throw new Error(`pb-dev: PocketBase exited with code ${child.exitCode}`);
    try { const r = await api(`${url}/api/health`); if (r.status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`pb-dev: PocketBase did not answer ${url}/api/health in ${ms / 1000} s`);
}

// Starts PocketBase and prepares it. Options: dataDir (a new temp folder when omitted), port (a free one when omitted),
// serve (folder served as pb_public), hooks / migrations (false = start without the repo's folder), users (create TEST_USERS),
// detached (keep running after this process exits; output into <dataDir>/../pocketbase.log), root.
// Returns { url, port, dataDir, child, superToken, users: [{id, email, name, token}] } — tokens only when users is on.
export async function startPocketBase(opts = {}) {
  const root = opts.root || ROOT;
  const bin = binaryPath(root);
  if (!fs.existsSync(bin)) throw new Error(`pb-dev: no PocketBase binary; run: node tools/pb-dev.mjs fetch`);
  const dataDir = opts.dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'pm-pb-'));
  const port = opts.port || await freePort();
  const url = `http://127.0.0.1:${port}`;
  const empty = path.join(dataDir, '..', `.pm-empty-${path.basename(dataDir)}`);
  const hooksDir = opts.hooks === false ? empty : path.join(root, 'pb', 'pb_hooks');
  const migrationsDir = opts.migrations === false ? empty : path.join(root, 'pb', 'pb_migrations');
  fs.mkdirSync(dataDir, { recursive: true });
  if (opts.hooks === false || opts.migrations === false) fs.mkdirSync(empty, { recursive: true });

  const up = spawnSync(bin, ['superuser', 'upsert', SUPERUSER.email, SUPERUSER.password, `--dir=${dataDir}`], { encoding: 'utf8' });
  if (up.status !== 0) throw new Error(`pb-dev: superuser upsert failed: ${(up.stderr || up.stdout || '').trim()}`);

  const args = ['serve', `--http=127.0.0.1:${port}`, `--dir=${dataDir}`, `--hooksDir=${hooksDir}`, `--migrationsDir=${migrationsDir}`, '--hooksWatch=false'];
  if (opts.serve) args.push(`--publicDir=${path.resolve(root, opts.serve)}`);
  let child;
  if (opts.detached) {
    const logFd = fs.openSync(path.join(dataDir, '..', 'pocketbase.log'), 'a');
    child = spawn(bin, args, { detached: true, stdio: ['ignore', logFd, logFd], windowsHide: true });
    child.unref();
  } else {
    child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    child.output = '';
    const keep = (d) => { child.output = (child.output + d).slice(-20000); };
    child.stdout.on('data', keep); child.stderr.on('data', keep);
  }
  try {
    await waitHealthy(url, child);
  } catch (e) {
    try { child.kill(); } catch { /* gone */ }
    throw new Error(`${e.message}\n${child.output || ''}`);
  }

  const auth = await api(`${url}/api/collections/_superusers/auth-with-password`, { method: 'POST', body: { identity: SUPERUSER.email, password: SUPERUSER.password } });
  if (auth.status !== 200) throw new Error(`pb-dev: superuser sign-in failed: ${auth.text}`);
  const superToken = auth.json.token;
  // Local instance only: batch on (A4 of tools/nas-check.mjs) and password sign-in for the test users
  const s = await api(`${url}/api/settings`, { method: 'PATCH', token: superToken, body: { batch: { enabled: true, maxRequests: 500, timeout: 10, maxBodySize: 0 } } });
  if (s.status !== 200) throw new Error(`pb-dev: settings failed: ${s.text}`);
  const u = await api(`${url}/api/collections/users`, { method: 'PATCH', token: superToken, body: { passwordAuth: { enabled: true, identityFields: ['email'] } } });
  if (u.status !== 200) throw new Error(`pb-dev: users auth options failed: ${u.text}`);

  const users = [];
  if (opts.users !== false) {
    for (const t of TEST_USERS) users.push(await ensureUser(url, superToken, t));
  }
  return { url, port, dataDir, child, superToken, users };
}

// Creates a user with TEST_PASSWORD when missing (superusers pass the users' create rule) and signs them in
export async function ensureUser(url, superToken, { email, name }) {
  const found = await api(`${url}/api/collections/users/records?filter=${encodeURIComponent(`email = "${email}"`)}`, { token: superToken });
  if (!found.json || !found.json.items || !found.json.items.length) {
    const c = await api(`${url}/api/collections/users/records`, { method: 'POST', token: superToken, body: { email, name, password: TEST_PASSWORD, passwordConfirm: TEST_PASSWORD, verified: true, emailVisibility: true } });
    if (c.status !== 200) throw new Error(`pb-dev: creating ${email} failed: ${c.text}`);
  }
  const a = await api(`${url}/api/collections/users/auth-with-password`, { method: 'POST', body: { identity: email, password: TEST_PASSWORD } });
  if (a.status !== 200) throw new Error(`pb-dev: sign-in of ${email} failed: ${a.text}`);
  return { id: a.json.record.id, email, name, token: a.json.token };
}

// Stops an instance started by startPocketBase (its child) and waits for the exit; removeData deletes its data folder
export async function stopPocketBase(pb, { removeData = false } = {}) {
  if (!pb) return;
  const c = pb.child;
  if (c && c.exitCode === null) {
    const gone = new Promise((r) => c.once('exit', r));
    c.kill();
    await Promise.race([gone, new Promise((r) => setTimeout(r, 5000))]);
  }
  if (removeData && pb.dataDir) {
    for (let i = 0; i < 10; i++) {
      try { fs.rmSync(pb.dataDir, { recursive: true, force: true }); break; } catch { await new Promise((r) => setTimeout(r, 200)); }
    }
    fs.rmSync(path.join(pb.dataDir, '..', `.pm-empty-${path.basename(pb.dataDir)}`), { recursive: true, force: true });
  }
}

// ---------- CLI ----------

function statePath(root) { return path.join(root, DEV_DIR, 'state.json'); }
function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }

async function cmdUp(argv, root) {
  const port = argv.includes('--port') ? Number(argv[argv.indexOf('--port') + 1]) : DEFAULT_PORT;
  const serve = argv.includes('--serve') ? argv[argv.indexOf('--serve') + 1] : null;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('pb-dev: --port needs a number 1-65535');
  if (serve && !fs.existsSync(path.resolve(root, serve))) throw new Error(`pb-dev: folder to serve not found: ${serve} (build it first)`);
  const st = statePath(root);
  if (fs.existsSync(st)) {
    const old = JSON.parse(fs.readFileSync(st, 'utf8'));
    if (alive(old.pid)) throw new Error(`pb-dev: already running at ${old.url} (pid ${old.pid}); stop it: node tools/pb-dev.mjs down`);
    fs.rmSync(st, { force: true });
  }
  const dataDir = path.join(root, DEV_DIR, 'data');
  if (argv.includes('--empty')) fs.rmSync(dataDir, { recursive: true, force: true });
  const pb = await startPocketBase({ root, dataDir, port, serve, detached: true });
  fs.writeFileSync(st, JSON.stringify({ pid: pb.child.pid, port, url: pb.url, serve }, null, 2));
  console.log(`PocketBase ${PB_VERSION} is running at ${pb.url} (pid ${pb.child.pid})${serve ? `, serving ${serve}` : ''}`);
  console.log(`Dashboard: ${pb.url}/_/  superuser ${SUPERUSER.email} / ${SUPERUSER.password} (local only)`);
  console.log(`Test users (password ${TEST_PASSWORD}): ${TEST_USERS.map((u) => u.email).join(', ')}`);
  console.log(`Data: ${path.relative(root, dataDir)}; log: ${DEV_DIR}/pocketbase.log; stop: node tools/pb-dev.mjs down`);
}

function cmdDown(root) {
  const st = statePath(root);
  if (!fs.existsSync(st)) { console.log('pb-dev: nothing is running'); return; }
  const { pid, url } = JSON.parse(fs.readFileSync(st, 'utf8'));
  if (alive(pid)) { process.kill(pid); console.log(`PocketBase at ${url} stopped (pid ${pid})`); }
  else console.log('pb-dev: the remembered process had already stopped');
  fs.rmSync(st, { force: true });
}

export async function main(argv, root = ROOT) {
  const cmd = argv[0];
  if (cmd === 'fetch') await fetchPocketBase({ root });
  else if (cmd === 'up') await cmdUp(argv.slice(1), root);
  else if (cmd === 'down') cmdDown(root);
  else {
    console.log('Usage: node tools/pb-dev.mjs fetch | up [--empty] [--port N] [--serve <dir>] | down');
    return cmd === undefined || cmd === '--help' ? 0 : 2;
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => { console.error(e.message); process.exitCode = 1; });
}
