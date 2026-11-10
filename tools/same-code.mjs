#!/usr/bin/env node
// Same-code check: proves that only comments changed since a base commit and that the built site stays byte-identical (spec 01-code-docs, section 6.2).
// Uses git (diff, show, worktree), acorn token streams, the comment scanners of tools/ru-comments.mjs and the Vite API;
// every ticket of stage 1 runs it in its self-check.
//
// Contents:
// - codeDiff(), sameCode() — one file: JS token streams, other code files as text without comments
// - changedFiles(), checkFiles() — check 1 over every file changed between the base and the working tree
// - checkSite() — check 2: the base tree in a git worktree, both trees built with a fixed build stamp, outputs compared
// - CLI: node tools/same-code.mjs [base] [--no-build] [--expect <path>]…
//
// --expect marks a path (a folder entry matches the files directly in it) whose code change the ticket intends,
// e.g. ticket 01's own tools and test: listed for reading and not counted as a failure. The built site is never excused.
// Exit codes: 0 — same; 1 — code or built site differs; 2 — the tool could not run (git, build error).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import * as acorn from 'acorn';
import { commentRanges, isPending, kindOf } from './ru-comments.mjs';

const lineOf = (text, pos) => text.slice(0, pos).split('\n').length;
const LINE_BREAK = new RegExp('[\n\r\u2028\u2029]');

// Token stream without comments: type, value and whether a line break comes before the token (it matters for
// automatic semicolon insertion, so a block comment that loses its line break is a code change).
function jsTokens(text) {
  const tokens = [];
  acorn.parse(text, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true, onToken: tokens });
  let prevEnd = 0;
  return tokens.map((t) => {
    const v = t.value && typeof t.value === 'object' && 'pattern' in t.value ? `/${t.value.pattern}/${t.value.flags}` : String(t.value);
    const key = `${t.type.label} ${typeof t.value} ${v}${LINE_BREAK.test(text.slice(prevEnd, t.start)) ? ' (line break before)' : ''}`;
    prevEnd = t.end;
    return { key, line: lineOf(text, t.start) };
  });
}

// Text without comments, line endings and trailing whitespace normalised; a line that held only a comment is dropped.
export function withoutComments(file, text) {
  const mark = '\u0000';
  let out = '';
  let pos = 0;
  for (const c of commentRanges(file, text)) { out += text.slice(pos, c.start) + mark; pos = c.end; }
  out += text.slice(pos);
  return out.replace(/\r/g, '').split('\n')
    .filter((l) => !(l.includes(mark) && !l.replaceAll(mark, '').trim()))
    .map((l) => l.replaceAll(mark, '').trimEnd())
    .join('\n').trimEnd();
}

// null when a and b hold the same code; otherwise the first difference in words. Throws when a JS file does not parse.
export function codeDiff(file, a, b) {
  const kind = kindOf(file);
  if (!kind) throw new Error(`not a code file: ${file}`);
  if (kind === 'js') {
    const ta = jsTokens(a);
    const tb = jsTokens(b);
    for (let i = 0; i < Math.max(ta.length, tb.length); i++) {
      if (ta[i]?.key !== tb[i]?.key) return `token ${i + 1} differs (base line ${ta[i]?.line ?? 'end'}: ${ta[i]?.key ?? 'none'}; now line ${tb[i]?.line ?? 'end'}: ${tb[i]?.key ?? 'none'})`;
    }
    return null;
  }
  const la = withoutComments(file, a).split('\n');
  const lb = withoutComments(file, b).split('\n');
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) return `code line ${i + 1} without comments differs: ${JSON.stringify((la[i] ?? '').trim().slice(0, 60))} → ${JSON.stringify((lb[i] ?? '').trim().slice(0, 60))}`;
  }
  return null;
}

export function sameCode(file, a, b) {
  return codeDiff(file, a, b) === null;
}

function git(root, args, opts = {}) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

// Files changed between base and the working tree (committed, staged, unstaged, untracked): [{ status, path, from? }].
export function changedFiles(root, base) {
  const out = [];
  const parts = git(root, ['diff', '--name-status', '-z', '-M', base]).split('\0').filter(Boolean);
  for (let i = 0; i < parts.length;) {
    const status = parts[i++][0];
    if (status === 'R' || status === 'C') { const from = parts[i++]; out.push({ status, from, path: parts[i++] }); }
    else out.push({ status, path: parts[i++] });
  }
  for (const p of git(root, ['ls-files', '-o', '--exclude-standard', '-z']).split('\0').filter(Boolean)) out.push({ status: 'A', path: p });
  return out.sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0));
}

// Check 1. { commentOnly, notCode, expected, changed } — lists of { path, reason? }.
export function checkFiles(root, base, expect = []) {
  const res = { commentOnly: [], notCode: [], expected: [], changed: [] };
  for (const f of changedFiles(root, base)) {
    const code = kindOf(f.path) || (f.from && kindOf(f.from));
    if (!code) { res.notCode.push({ path: f.path }); continue; }
    let reason = null;
    if (f.status === 'A') reason = 'added code file';
    else if (f.status === 'D') reason = 'deleted code file';
    else if (f.status === 'R' || f.status === 'C') reason = `${f.status === 'R' ? 'renamed' : 'copied'} from ${f.from}`;
    else {
      try {
        const before = git(root, ['show', `${base}:${f.path}`]);
        const now = fs.readFileSync(path.join(root, f.path), 'utf8');
        reason = codeDiff(f.path, before, now);
      } catch (e) { reason = `cannot compare: ${e.message.split('\n')[0]}`; }
    }
    if (!reason) res.commentOnly.push({ path: f.path });
    else (isPending(f.path, expect) ? res.expected : res.changed).push({ path: f.path, reason });
  }
  return res;
}

const TMP = path.join(os.tmpdir(), 'pm-same-code');

function removeLink(p) {
  let st;
  try { st = fs.lstatSync(p); } catch { return; }
  if (!st.isSymbolicLink()) return;
  try { fs.unlinkSync(p); } catch { fs.rmdirSync(p); }
  if (fs.existsSync(p)) throw new Error(`could not remove the link ${p}`);
}

// Removes the worktree, its node_modules link and the temp outputs — also those left by a crashed run.
// The link goes first, so nothing ever deletes the project's own node_modules through it.
function cleanUp(root) {
  const base = path.join(TMP, 'base');
  removeLink(path.join(base, 'node_modules'));
  if (fs.existsSync(base)) {
    try { git(root, ['worktree', 'remove', '--force', base]); } catch { /* not registered any more */ }
    fs.rmSync(base, { recursive: true, force: true });
  }
  try { git(root, ['worktree', 'prune']); } catch { /* nothing to prune */ }
  fs.rmSync(TMP, { recursive: true, force: true });
}

function listFiles(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listFiles(dir, p)); else out.push(p);
  }
  return out.sort();
}

async function buildTree(dir, outDir) {
  const { build } = await import('vite');
  await build({
    root: dir,
    configFile: path.join(dir, 'vite.config.js'),
    mode: 'production',
    logLevel: 'error',
    define: { __BUILD__: JSON.stringify('same-code') },
    build: { outDir, emptyOutDir: true },
  });
}

// Check 2. { files, missing, extra, different } — missing: in the base build only; extra: in the new build only.
export async function checkSite(root, base, { copyOpenRules = false } = {}) {
  cleanUp(root);
  const baseDir = path.join(TMP, 'base');
  try {
    fs.mkdirSync(TMP, { recursive: true });
    // Both trees must be checked out the same way: the base gets the working tree's .gitattributes before its files
    // are written (git falls back to the worktree file when the base index has none), so line endings match (KI-2).
    git(root, ['worktree', 'add', '--detach', '--no-checkout', baseDir, base]);
    if (fs.existsSync(path.join(root, '.gitattributes'))) fs.copyFileSync(path.join(root, '.gitattributes'), path.join(baseDir, '.gitattributes'));
    git(baseDir, ['reset', '--hard', '-q', base]);
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(baseDir, 'node_modules'), 'junction');
    if (copyOpenRules) fs.copyFileSync(path.join(root, 'firestore.open.rules'), path.join(baseDir, 'firestore.open.rules'));
    const outBase = path.join(TMP, 'out-base');
    const outNow = path.join(TMP, 'out-now');
    await buildTree(baseDir, outBase);
    await buildTree(root, outNow);
    const a = listFiles(outBase);
    const b = listFiles(outNow);
    const inB = new Set(b);
    const inA = new Set(a);
    return {
      files: b.length,
      missing: a.filter((f) => !inB.has(f)),
      extra: b.filter((f) => !inA.has(f)),
      different: a.filter((f) => inB.has(f) && !fs.readFileSync(path.join(outBase, f)).equals(fs.readFileSync(path.join(outNow, f)))),
    };
  } finally {
    cleanUp(root);
  }
}

function parseArgs(argv) {
  const opts = { base: null, build: true, expect: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-build') opts.build = false;
    else if (a === '--expect') opts.expect.push(String(argv[++i] ?? '').replace(/\\/g, '/').replace(/^\.\//, ''));
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else opts.base = a;
  }
  return opts;
}

async function main() {
  const root = process.cwd();
  let opts;
  let base;
  try {
    opts = parseArgs(process.argv.slice(2));
    base = git(root, ['rev-parse', '--verify', `${opts.base || git(root, ['merge-base', 'HEAD', 'origin/main']).trim()}^{commit}`]).trim();
  } catch (e) { console.error(`same-code: ${e.message.split('\n')[0]}`); process.exit(2); }
  console.log(`same-code: base ${base.slice(0, 7)}${opts.base ? '' : ' (merge base of HEAD and origin/main)'}`);

  let files;
  try { files = checkFiles(root, base, opts.expect); } catch (e) { console.error(`same-code: git failed: ${e.message.split('\n')[0]}`); process.exit(2); }
  const show = (title, list) => { if (list.length) { console.log(`  ${title}:`); for (const f of list) console.log(`    ${f.path}${f.reason ? ` — ${f.reason}` : ''}`); } };
  console.log('Check 1 — per-file code');
  show('comment-only', files.commentOnly);
  show('not code, not compared', files.notCode);
  show('expected code changes (--expect; read them)', files.expected);
  show('CODE CHANGED', files.changed);
  const ok1 = files.changed.length === 0;
  console.log(ok1 ? 'Check 1: passed' : `Check 1: FAILED — code changed in ${files.changed.length} file(s); if a change is intended by the ticket, rerun with --expect <path>`);

  let ok2 = true;
  if (!opts.build) console.log('Check 2 — built site: skipped (--no-build)');
  else {
    console.log('Check 2 — built site (two builds, about a minute)');
    let site;
    const copyOpenRules = files.commentOnly.some((f) => f.path === 'firestore.open.rules');
    try { site = await checkSite(root, base, { copyOpenRules }); } catch (e) { console.error(`same-code: build failed: ${e.message.split('\n')[0]}`); process.exit(2); }
    show('missing in the new build', site.missing.map((p) => ({ path: p })));
    show('extra in the new build', site.extra.map((p) => ({ path: p })));
    show('different', site.different.map((p) => ({ path: p })));
    ok2 = !site.missing.length && !site.extra.length && !site.different.length;
    console.log(ok2 ? `Check 2: passed — ${site.files} files byte-identical${copyOpenRules ? ' (new firestore.open.rules in both)' : ''}` : 'Check 2: FAILED — the built site differs');
  }
  process.exit(ok1 && ok2 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
