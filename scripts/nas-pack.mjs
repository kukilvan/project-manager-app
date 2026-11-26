// NAS release packer: makes the four files of the GitHub release `nas-build` — nas-site.zip, nas-pb.zip, nas-jobs.zip and the manifest nas-site.json.
// Run by the `nas-build` job of .github/workflows/pages.yml after `npm run build:nas`; zips come from scripts/zip-lib.mjs, so unchanged contents keep their checksum.
// Reads dist-nas/, pb/, scripts/, src/, package.json; installs the jobs' production dependencies with npm into .cache/nas-jobs/ (network) unless --modules names a folder.
// Spec 4 § 4; the NAS side reads the manifest as R-SITE-2 and installs nas-pb.zip as R-PB-8 of docs/nas-requirements.md.
//
// Contents:
// - NAS_FILES, JOB_DEPS — the release's file names and the jobs' dependencies (google-auth-library as server-backup.yml installs it, mupdf from package.json; no firebase-admin)
// - siteFiles(), pbFiles(), jobsFiles() — the entries of each zip
// - makeManifest() — the fields of nas-site.json
// - pack() — writes the four files into a folder and returns the manifest
// - jobDepSpecs(), installJobModules() — the npm install of the jobs' node_modules
// - CLI: node scripts/nas-pack.mjs <out folder> [--dist <folder>] [--modules <node_modules folder>]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { zip, filesOf } from './zip-lib.mjs';
import { PB_SCHEMA } from '../src/domain/pbwrite.js';
import { PB_VERSION } from '../tools/pb-dev.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const NAS_FILES = { site: 'nas-site.zip', pb: 'nas-pb.zip', jobs: 'nas-jobs.zip', manifest: 'nas-site.json' };
// What the job scripts import outside Node: google-auth-library (Drive and Sheets) as server-backup.yml installs it, mupdf (drawing pages) in the version package.json locks.
// Ticket 12 completes the list when the job runner exists.
export const JOB_DEPS = ['google-auth-library', 'mupdf'];
const GOOGLE_AUTH_SPEC = 'google-auth-library@9';
export const MODULES_DIR = '.cache/nas-jobs';

export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// nas-site.zip: the built site at the root of the zip (index.html, sw.js, assets/…)
export function siteFiles(distDir) {
  if (!fs.existsSync(path.join(distDir, 'index.html'))) throw new Error(`nas-pack: ${distDir} has no index.html — run npm run build:nas first`);
  let start = null;
  try { start = JSON.parse(fs.readFileSync(path.join(distDir, 'manifest.webmanifest'), 'utf8')).start_url; } catch { /* checked below */ }
  if (start !== '/') throw new Error(`nas-pack: ${distDir} is not the NAS build (manifest start_url ${JSON.stringify(start)}, expected "/") — run npm run build:nas`);
  return filesOf(distDir);
}

// nas-pb.zip: pb_migrations/… and pb_hooks/…, to replace the whole contents of the NAS's two mounted folders
export function pbFiles(root = ROOT) {
  return { ...filesOf(path.join(root, 'pb', 'pb_migrations'), 'pb_migrations/'), ...filesOf(path.join(root, 'pb', 'pb_hooks'), 'pb_hooks/') };
}

// nas-jobs.zip: scripts/, src/, package.json and node_modules/ (the jobs' production dependencies only), run as node scripts/<job>.mjs
// npm's own bookkeeping (.bin links, .package-lock.json, .cache) is left out: the jobs do not need it and it would change the checksum
export function jobsFiles({ root = ROOT, modulesDir }) {
  if (!modulesDir || !fs.existsSync(modulesDir)) throw new Error(`nas-pack: no node_modules folder for the jobs at ${modulesDir}`);
  for (const dep of JOB_DEPS) if (!fs.existsSync(path.join(modulesDir, dep, 'package.json'))) throw new Error(`nas-pack: ${dep} is missing from ${modulesDir}`);
  const npmOwn = (rel) => rel === '.bin' || rel === '.package-lock.json' || rel === '.cache' || rel.endsWith('/.bin');
  return {
    ...filesOf(path.join(root, 'scripts'), 'scripts/'),
    ...filesOf(path.join(root, 'src'), 'src/'),
    'package.json': fs.readFileSync(path.join(root, 'package.json')),
    ...filesOf(modulesDir, 'node_modules/', npmOwn),
  };
}

// The manifest the NAS updater reads every 10 minutes (R-SITE-2); field order as in spec 4 § 4
export function makeManifest({ commit, version, builtAt, site, pb, jobs, schema = PB_SCHEMA, pocketbase = PB_VERSION }) {
  if (!/^[0-9a-f]{40}$/.test(String(commit))) throw new Error(`nas-pack: the commit must be a 40-character sha, got ${JSON.stringify(commit)}`);
  return {
    commit,
    version,
    builtAt,
    sha256: sha256(site),
    schema,
    pocketbase,
    pb: { file: NAS_FILES.pb, sha256: sha256(pb) },
    jobs: { file: NAS_FILES.jobs, sha256: sha256(jobs) },
  };
}

// Writes the three zips and then nas-site.json into outDir; returns the manifest
export function pack({ root = ROOT, outDir, distDir = path.join(root, 'dist-nas'), modulesDir, commit, builtAt = new Date().toISOString() }) {
  const site = zip(siteFiles(distDir));
  const pb = zip(pbFiles(root));
  const jobs = zip(jobsFiles({ root, modulesDir }));
  const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const manifest = makeManifest({ commit, version, builtAt, site, pb, jobs });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, NAS_FILES.site), site);
  fs.writeFileSync(path.join(outDir, NAS_FILES.pb), pb);
  fs.writeFileSync(path.join(outDir, NAS_FILES.jobs), jobs);
  fs.writeFileSync(path.join(outDir, NAS_FILES.manifest), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

// npm specs of the jobs' dependencies: mupdf at the version installed from package-lock.json, so the jobs parse drawings like the app
export function jobDepSpecs(root = ROOT) {
  const mupdf = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', 'mupdf', 'package.json'), 'utf8')).version;
  return [GOOGLE_AUTH_SPEC, `mupdf@${mupdf}`];
}

// A fresh install of the jobs' dependencies into root/.cache/nas-jobs/; returns its node_modules folder
export function installJobModules(root = ROOT, log = console.log) {
  const dir = path.join(root, MODULES_DIR);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), '{ "name": "nas-jobs-modules", "private": true }\n');
  const specs = jobDepSpecs(root);
  log(`Installing the jobs' dependencies: ${specs.join(', ')}`);
  // one command line through the shell (npm is npm.cmd on Windows); the specs are fixed names and a version read from node_modules, nothing from outside
  const r = spawnSync(`npm install --omit=dev --no-save --no-package-lock --no-audit --no-fund --ignore-scripts ${specs.join(' ')}`, { cwd: dir, stdio: 'inherit', shell: true });
  if (r.status !== 0) throw new Error(`nas-pack: npm install of the jobs' dependencies failed (exit ${r.status})`);
  return path.join(dir, 'node_modules');
}

function gitCommit(root) {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('nas-pack: cannot read the commit (git rev-parse HEAD failed)');
  return r.stdout.trim();
}

export function main(argv, root = ROOT) {
  const out = argv[0];
  if (!out || out.startsWith('--')) {
    console.log('Usage: node scripts/nas-pack.mjs <out folder> [--dist <folder>] [--modules <node_modules folder>]');
    return out ? 2 : 0;
  }
  const opt = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);
  const distDir = path.resolve(root, opt('--dist') || 'dist-nas');
  const modulesDir = opt('--modules') ? path.resolve(root, opt('--modules')) : installJobModules(root);
  const outDir = path.resolve(root, out);
  const m = pack({ root, outDir, distDir, modulesDir, commit: gitCommit(root) });
  for (const f of Object.values(NAS_FILES)) console.log(`${f.padEnd(14)} ${String(fs.statSync(path.join(outDir, f)).size).padStart(10)} bytes`);
  console.log(`commit ${m.commit}, version ${m.version}, schema ${m.schema}, site sha256 ${m.sha256}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exitCode = 1; }
}
