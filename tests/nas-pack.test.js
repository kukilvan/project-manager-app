// Tests of the NAS release: the deterministic zip writer (scripts/zip-lib.mjs), the packer (scripts/nas-pack.mjs), the `nas-build` job and the build flag.
// Offline: the packer runs on a small synthetic tree in a temp folder with a fake node_modules (spec 4 § 11, ticket 4.3).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { zip, unzip, crc32, filesOf } from '../scripts/zip-lib.mjs';
import { pack, makeManifest, siteFiles, jobsFiles, pbFiles, NAS_FILES, JOB_DEPS, sha256 } from '../scripts/nas-pack.mjs';
import { PB_SCHEMA } from '../src/domain/pbwrite.js';
import { PB_VERSION } from '../tools/pb-dev.mjs';
import { isPocketBase } from '../src/edition.js';

// The names of a zip's entries in the order of its central directory
function entryNames(buf) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const names = [];
  let p = buf.readUInt32LE(end + 16);
  for (let n = buf.readUInt16LE(end + 10); n > 0; n--) {
    const len = buf.readUInt16LE(p + 28);
    names.push(buf.toString('utf8', p + 46, p + 46 + len));
    p += 46 + len + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return names;
}

test('crc32: the standard check value', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  assert.equal(crc32(Buffer.alloc(0)), 0);
});

test('zip: the same files in any order give the same bytes; entries sorted, read back with zlib', () => {
  const big = Buffer.from('точка FC/B05-06\n'.repeat(500));
  const a = zip({ 'b/x.txt': 'hello', 'a.json': '{"a":1}', 'b/big.txt': big, 'Ä/ü.bin': Buffer.from([0, 1, 2, 3]) });
  const b = zip({ 'Ä/ü.bin': Buffer.from([0, 1, 2, 3]), 'b/big.txt': big, 'a.json': '{"a":1}', 'b/x.txt': 'hello' });
  assert.deepEqual(a, b);
  assert.equal(sha256(a), sha256(b));
  assert.deepEqual(entryNames(a), ['a.json', 'b/big.txt', 'b/x.txt', 'Ä/ü.bin']);
  const back = unzip(a);
  assert.equal(back['b/x.txt'].toString(), 'hello');
  assert.deepEqual(back['b/big.txt'], big);
  assert.deepEqual(back['Ä/ü.bin'], Buffer.from([0, 1, 2, 3]));
  // the big text is deflated, and plain zlib inflates it from its local entry
  const at = a.indexOf(Buffer.from('b/big.txt'));
  assert.equal(a.readUInt16LE(at - 30 + 8), 8, 'deflate method');
  const size = a.readUInt32LE(at - 30 + 18);
  assert.deepEqual(zlib.inflateRawSync(a.subarray(at + 'b/big.txt'.length, at + 'b/big.txt'.length + size)), big);
  assert.ok(a.length < big.length / 4);
});

test('zip: fixed timestamps, no permission bits, small files stored', () => {
  const buf = zip({ 'x': 'ab' });
  assert.equal(buf.readUInt32LE(0), 0x04034b50);
  assert.equal(buf.readUInt16LE(8), 0, 'stored: deflate would not make 2 bytes smaller');
  assert.equal(buf.readUInt16LE(10), 0, 'time 00:00');
  assert.equal(buf.readUInt16LE(12), 33, 'date 1980-01-01');
  const dir = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  assert.equal(buf.readUInt32LE(dir + 38), 0, 'external attributes');
  assert.deepEqual(zip({}), zip({}));
  assert.deepEqual(unzip(zip({})), {});
});

test('zip: bad names are refused; unzip catches a damaged entry', () => {
  for (const name of ['', '/abs', 'a\\b', '../up', 'a/../../b']) assert.throws(() => zip({ [name]: 'x' }), /bad entry name/, name);
  const buf = zip({ 'a.txt': 'hello world' });
  const at = buf.indexOf(Buffer.from('hello world'));
  buf[at] ^= 1;
  assert.throws(() => unzip(buf), /CRC mismatch/);
  assert.throws(() => unzip(Buffer.from('not a zip at all, no end record here')), /not a zip/);
});

// ---------- the packer on a synthetic tree ----------

function tree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nas-pack-'));
  const put = (rel, text) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
  put('package.json', '{ "name": "project-manager-app", "version": "9.8.7", "type": "module" }\n');
  put('dist-nas/index.html', '<link rel="manifest" href="/manifest.webmanifest">');
  put('dist-nas/manifest.webmanifest', '{"start_url":"/"}');
  put('dist-nas/assets/index-abc.js', 'console.log(1)');
  put('pb/pb_migrations/1764000001_pm_schema_1.js', 'migrate(() => {})');
  put('pb/pb_hooks/pm.pb.js', 'routerAdd()');
  put('pb/pb_hooks/pm/pbwrite.js', 'module.exports = {}');
  put('scripts/server-backup.mjs', '// job');
  put('src/domain/doh.js', '// domain');
  put('mods/google-auth-library/package.json', '{"version":"9.0.0"}');
  put('mods/mupdf/package.json', '{"version":"1.28.1"}');
  put('mods/mupdf/dist/mupdf.js', '// mupdf');
  put('mods/.bin/mupdf', 'link');
  put('mods/.package-lock.json', '{"generated":"now"}');
  put('mods/gaxios/.bin/x', 'link');
  return root;
}

const COMMIT = 'c3b521c1b38f5cfd445a39c9795af657268ea37d';

test('pack: two runs give identical zips and checksums; the manifest has every field in order', () => {
  const root = tree();
  try {
    const run = (out) => pack({ root, outDir: path.join(root, out), modulesDir: path.join(root, 'mods'), commit: COMMIT, builtAt: '2026-11-26T10:00:00.000Z' });
    const m1 = run('out1');
    const m2 = run('out2');
    assert.deepEqual(m1, m2);
    for (const f of [NAS_FILES.site, NAS_FILES.pb, NAS_FILES.jobs, NAS_FILES.manifest]) {
      assert.deepEqual(fs.readFileSync(path.join(root, 'out1', f)), fs.readFileSync(path.join(root, 'out2', f)), f);
    }
    const file = (f) => fs.readFileSync(path.join(root, 'out1', f));
    const json = JSON.parse(file(NAS_FILES.manifest));
    assert.deepEqual(Object.keys(json), ['commit', 'version', 'builtAt', 'sha256', 'schema', 'pocketbase', 'pb', 'jobs']);
    assert.equal(json.commit, COMMIT);
    assert.equal(json.version, '9.8.7');
    assert.equal(json.builtAt, '2026-11-26T10:00:00.000Z');
    assert.equal(json.sha256, sha256(file(NAS_FILES.site)));
    assert.equal(json.schema, PB_SCHEMA);
    assert.equal(json.pocketbase, PB_VERSION);
    assert.deepEqual(json.pb, { file: 'nas-pb.zip', sha256: sha256(file(NAS_FILES.pb)) });
    assert.deepEqual(json.jobs, { file: 'nas-jobs.zip', sha256: sha256(file(NAS_FILES.jobs)) });

    assert.deepEqual(entryNames(file(NAS_FILES.site)), ['assets/index-abc.js', 'index.html', 'manifest.webmanifest']);
    assert.deepEqual(entryNames(file(NAS_FILES.pb)), ['pb_hooks/pm.pb.js', 'pb_hooks/pm/pbwrite.js', 'pb_migrations/1764000001_pm_schema_1.js']);
    const jobs = entryNames(file(NAS_FILES.jobs));
    assert.deepEqual(jobs, ['node_modules/google-auth-library/package.json', 'node_modules/mupdf/dist/mupdf.js', 'node_modules/mupdf/package.json', 'package.json', 'scripts/server-backup.mjs', 'src/domain/doh.js']);
    assert.equal(unzip(file(NAS_FILES.jobs))['scripts/server-backup.mjs'].toString(), '// job');
    assert.ok(fs.readFileSync(path.join(root, 'out1', NAS_FILES.manifest), 'utf8').endsWith('}\n'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pack: a changed file changes only its own zip checksum', () => {
  const root = tree();
  try {
    const run = (out) => pack({ root, outDir: path.join(root, out), modulesDir: path.join(root, 'mods'), commit: COMMIT, builtAt: 'x' });
    const before = run('o1');
    fs.writeFileSync(path.join(root, 'dist-nas', 'assets', 'index-abc.js'), 'console.log(2)');
    const after = run('o2');
    assert.notEqual(after.sha256, before.sha256);
    assert.equal(after.pb.sha256, before.pb.sha256);
    assert.equal(after.jobs.sha256, before.jobs.sha256);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pack: refuses the GitHub Pages build, a missing build, missing job modules and a bad commit', () => {
  const root = tree();
  try {
    fs.writeFileSync(path.join(root, 'dist-nas', 'manifest.webmanifest'), '{"start_url":"/project-manager-app/"}');
    assert.throws(() => siteFiles(path.join(root, 'dist-nas')), /not the NAS build/);
    assert.throws(() => siteFiles(path.join(root, 'nothing')), /no index\.html/);
    fs.rmSync(path.join(root, 'mods', 'mupdf'), { recursive: true });
    assert.throws(() => jobsFiles({ root, modulesDir: path.join(root, 'mods') }), /mupdf is missing/);
    assert.throws(() => jobsFiles({ root, modulesDir: path.join(root, 'none') }), /no node_modules/);
    assert.throws(() => makeManifest({ commit: 'c3b521c', version: '1', builtAt: 'x', site: Buffer.from(''), pb: Buffer.from(''), jobs: Buffer.from('') }), /40-character sha/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the repo: nas-pb.zip takes the real migrations and hooks; the jobs need no firebase-admin', () => {
  const names = Object.keys(pbFiles()).sort();
  assert.ok(names.includes('pb_hooks/pm.pb.js'));
  assert.ok(names.includes('pb_hooks/pm/pbwrite.js'));
  assert.ok(names.some((n) => /^pb_migrations\/\d+_pm_schema_\d+\.js$/.test(n)));
  assert.ok(names.every((n) => n.startsWith('pb_hooks/') || n.startsWith('pb_migrations/')));
  assert.deepEqual(JOB_DEPS, ['google-auth-library', 'mupdf']);
  const keys = Object.keys(filesOf(path.join(import.meta.dirname, '..', 'pb')));
  assert.ok(keys.length >= 4);
});

test('pages.yml: the nas-build job runs after the tests, on main only, and uploads nas-site.json last', () => {
  const yml = fs.readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
  const job = yml.slice(yml.indexOf('\n  nas-build:'));
  assert.ok(yml.includes('\n  nas-build:'), 'no nas-build job');
  assert.match(job, /needs: build/);
  assert.match(job, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(job, /contents: write/);
  assert.match(job, /npm run build:nas/);
  assert.match(job, /node scripts\/nas-pack\.mjs out\//);
  assert.match(job, /--prerelease/);
  const zips = job.indexOf('out/nas-jobs.zip');
  const manifest = job.indexOf('out/nas-site.json');
  assert.ok(zips > 0 && manifest > zips, 'nas-site.json must be uploaded after the zips');
});

test('isPocketBase(): false without the build flag (plain Node, the GitHub Pages build)', () => {
  assert.equal(isPocketBase(), false);
});
