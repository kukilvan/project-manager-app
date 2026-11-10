#!/usr/bin/env node
// Russian-comment finder: lists every comment with Cyrillic outside «…» in the stage-1 scope (spec 01-code-docs, sections 2 and 6.1).
// Parses JS with acorn and scans CSS, Python, YAML and Firestore rules by hand; tools/code-map.mjs, tools/same-code.mjs
// and tests/code-docs.test.js reuse its comment scanners and PENDING matching.
//
// Contents:
// - commentRanges(), commentsOf() — the comments of one file by its type, with line and character range
// - isRussian() — Cyrillic left after removing «…» spans
// - PENDING, isPending() — paths still waiting for their ticket; a folder entry matches the files directly in it
// - scopeFiles(), scanScope() — every file of the scope and its Russian comments
// - CLI: node tools/ru-comments.mjs [paths…] — prints path:line: comment; exit 1 if one is outside PENDING
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as acorn from 'acorn';

// Paths still waiting for their ticket (spec section 9). Each ticket deletes its own entries; ticket 09 deletes the list.
export const PENDING = [
  // ticket 05
  ...['planmodal', 'tohnitview', 'planversion', 'planpick', 'planlink', 'planview', 'planassign', 'plannumbers', 'pdfpick',
    'import', 'guide'].map((n) => `src/app/views/${n}.js`),
  // ticket 06
  ...['doh', 'settings', 'wizard', 'catalogview', 'project', 'poolview', 'shilutsettings', 'managersfolder', 'tables',
    'todos', 'sheetslist', 'history', 'manualsview', 'members', 'journal', 'projects', 'month', 'log'].map((n) => `src/app/views/${n}.js`),
  // ticket 07
  'src/tohnit/', 'scripts/', 'src/style.css', 'vite.config.js', 'firestore.rules', 'firestore.open.rules', '.github/workflows/',
  // ticket 08
  'tests/', 'tools/tohnit/',
];

// An entry ending in "/" matches the files directly in that folder (not subfolders); any other entry matches one file.
export function isPending(file, list = PENDING) {
  return list.some((e) => (e.endsWith('/') ? file.startsWith(e) && !file.slice(e.length).includes('/') : file === e));
}

const CYRILLIC = /[Ѐ-ӿ]/;

// Removes «…» spans, innermost first, so nested guillemets («Проект «Офис»») go away whole.
export function withoutQuotes(text) {
  let s = String(text);
  for (let prev = null; prev !== s;) { prev = s; s = s.replace(/«[^«»]*»/g, ''); }
  return s;
}

export function isRussian(comment) {
  return CYRILLIC.test(withoutQuotes(typeof comment === 'string' ? comment : comment.text));
}

export function kindOf(file) {
  const base = file.split('/').pop();
  if (base === 'firestore.rules' || base === 'firestore.open.rules') return 'rules';
  if (/\.(m?js)$/.test(base)) return 'js';
  if (base.endsWith('.css')) return 'css';
  if (base.endsWith('.py')) return 'py';
  if (/\.ya?ml$/.test(base)) return 'yml';
  return null;
}

function lineAt(text, pos) {
  let n = 1;
  for (let i = text.indexOf('\n'); i !== -1 && i < pos; i = text.indexOf('\n', i + 1)) n++;
  return n;
}

function jsComments(text) {
  const out = [];
  acorn.parse(text, {
    ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true,
    onComment: (block, body, start, end) => out.push({ start, end, text: body }),
  });
  return out;
}

function cssComments(text) {
  const out = [];
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote || c === '\n') quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2);
      const end = close === -1 ? text.length : close + 2;
      out.push({ start: i, end, text: text.slice(i + 2, close === -1 ? text.length : close) });
      i = end - 1;
    }
  }
  return out;
}

// Python: "#" comments outside strings and docstrings (a triple-quoted string that starts a logical line).
// The first docstring of a file that runs print(__doc__) is its usage help: a string, not a comment.
function pyComments(text) {
  const out = [];
  let docIsHelp = text.includes('print(__doc__)');
  let depth = 0;           // open brackets: inside them no logical line starts
  let lineStart = true;    // nothing but whitespace yet on this logical line
  let continued = false;   // the physical line ended with a backslash
  let i = 0;
  const readString = (q, triple) => {
    // i points at the first quote; returns the index after the closing quote(s)
    let j = i + (triple ? 3 : 1);
    while (j < text.length) {
      const c = text[j];
      if (c === '\\') { j += 2; continue; }
      if (triple) { if (text.startsWith(q.repeat(3), j)) return j + 3; } else if (c === q) return j + 1;
      else if (c === '\n') return j;
      j++;
    }
    return text.length;
  };
  while (i < text.length) {
    const c = text[i];
    if (c === '\n') {
      if (depth === 0 && !continued) lineStart = true;
      continued = false; i++; continue;
    }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f') { i++; continue; }
    if (c === '\\' && (text[i + 1] === '\n' || (text[i + 1] === '\r' && text[i + 2] === '\n'))) { continued = true; i++; continue; }
    if (c === '#') {
      let end = text.indexOf('\n', i);
      if (end === -1) end = text.length;
      out.push({ start: i, end: text[end - 1] === '\r' ? end - 1 : end, text: text.slice(i + 1, end).replace(/\r$/, '') });
      i = end; continue;
    }
    let prefixEnd = i;
    if (/[A-Za-z_]/.test(c)) {
      let j = i; while (j < text.length && /\w/.test(text[j])) j++;
      const word = text.slice(i, j);
      if (!/^(r|u|f|b|br|rb|fr|rf)$/i.test(word) || (text[j] !== '"' && text[j] !== "'")) { i = j; lineStart = false; continue; }
      prefixEnd = j;
    }
    const q = text[prefixEnd];
    if (q === '"' || q === "'") {
      const startsLine = lineStart && depth === 0;
      const start = i;
      i = prefixEnd;
      const triple = text.startsWith(q.repeat(3), i);
      const end = readString(q, triple);
      if (triple && startsLine) {
        if (docIsHelp) docIsHelp = false;
        else out.push({ start, end, text: text.slice(i + 3, Math.max(i + 3, end - 3)) });
      }
      i = end; lineStart = false; continue;
    }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth = Math.max(0, depth - 1);
    else if (c === ';' && depth === 0) { lineStart = true; i++; continue; }
    lineStart = false; i++;
  }
  return out;
}

// YAML (and the shell inside run: | blocks): "#" at the start of a line or after whitespace, outside quotes on that line.
function ymlComments(text) {
  const out = [];
  let pos = 0;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    let quote = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quote) {
        if (quote === '"' && c === '\\') i++;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'") quote = c;
      else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
        out.push({ start: pos + i, end: pos + line.length, text: line.slice(i + 1) });
        break;
      }
    }
    pos += raw.length + 1;
  }
  return out;
}

// Firestore rules: "//" to the end of the line, outside quotes.
function rulesComments(text) {
  const out = [];
  let pos = 0;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    let quote = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === '/' && line[i + 1] === '/') {
        out.push({ start: pos + i, end: pos + line.length, text: line.slice(i + 2) });
        break;
      }
    }
    pos += raw.length + 1;
  }
  return out;
}

const SCANNERS = { js: jsComments, css: cssComments, py: pyComments, yml: ymlComments, rules: rulesComments };

// Comments of one file with their character range: [{ line, text, start, end }]. Throws when a JS file does not parse
// or the file type has no comment rules.
export function commentRanges(file, text) {
  const kind = kindOf(file);
  if (!kind) throw new Error(`no comment rules for ${file}`);
  return SCANNERS[kind](text).map((c) => ({ line: lineAt(text, c.start), ...c }));
}

export function commentsOf(file, text) {
  return commentRanges(file, text).map(({ line, text: t }) => ({ line, text: t }));
}

function walk(root, dir, keep, deep, out) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) { if (deep && e.name !== 'node_modules' && e.name !== '__pycache__') walk(root, rel, keep, deep, out); }
    else if (keep.test(e.name)) out.push(rel);
  }
}

// Every file of the scope (spec 6.1), paths relative to root with "/", sorted.
export function scopeFiles(root) {
  const out = [];
  walk(root, 'src', /\.(js|css)$/, true, out);
  walk(root, 'scripts', /\.mjs$/, false, out);
  walk(root, 'tests', /\.js$/, false, out);
  walk(root, 'tools', /\.(mjs|py)$/, true, out);
  walk(root, '.github/workflows', /\.ya?ml$/, false, out);
  for (const f of ['vite.config.js', 'firestore.rules', 'firestore.open.rules']) if (fs.existsSync(path.join(root, f))) out.push(f);
  return out.sort();
}

// Russian comments of the given files (default: the whole scope). problems: files that could not be read as code.
export function scanScope(root, files = scopeFiles(root)) {
  const hits = [];
  const problems = [];
  for (const file of files) {
    let comments;
    try { comments = commentsOf(file, fs.readFileSync(path.join(root, file), 'utf8')); }
    catch (e) { problems.push({ file, message: e.message }); continue; }
    for (const c of comments) if (isRussian(c)) hits.push({ file, line: c.line, text: c.text });
  }
  return { files, hits, problems };
}

// CLI arguments: a file of the scope, or a folder (its files directly inside, as in PENDING).
function selectFiles(root, args) {
  const all = scopeFiles(root);
  const picked = new Set();
  for (const a of args) {
    const p = a.replace(/\\/g, '/').replace(/^\.\//, '');
    const isDir = p.endsWith('/') || (fs.existsSync(path.join(root, p)) && fs.statSync(path.join(root, p)).isDirectory());
    const found = isDir ? all.filter((f) => isPending(f, [p.endsWith('/') ? p : `${p}/`])) : all.filter((f) => f === p);
    if (!found.length) { console.error(`not in the scope: ${a}`); process.exit(2); }
    found.forEach((f) => picked.add(f));
  }
  return [...picked].sort();
}

function main() {
  const root = process.cwd();
  const args = process.argv.slice(2);
  const { files, hits, problems } = scanScope(root, args.length ? selectFiles(root, args) : undefined);
  for (const h of hits) console.log(`${h.file}:${h.line}: ${h.text.replace(/\s+/g, ' ').trim().slice(0, 100)}`);
  for (const p of problems) console.log(`PROBLEM ${p.file}: ${p.message}`);
  const inFiles = new Set(hits.map((h) => h.file)).size;
  const outside = hits.filter((h) => !isPending(h.file));
  console.log(`${hits.length} Russian comments in ${inFiles} files (${files.length} files scanned)`);
  if (outside.length) console.log(`${outside.length} of them outside PENDING`);
  process.exit(outside.length || problems.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
