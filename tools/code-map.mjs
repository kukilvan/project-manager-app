#!/usr/bin/env node
// Code-map builder: writes the module list of docs/code-map.md from the first sentence of each module's header comment (spec 01-code-docs, section 5).
// Reads every *.js and *.mjs under src/ and scripts/; tests/code-docs.test.js calls the same functions,
// and tools/ru-comments.mjs supplies the Cyrillic check and the PENDING matching.
//
// Contents:
// - listModules() — the modules on disk, sorted
// - headerOf(), firstSentence(), entryOf() — header comment → first sentence → one map line
// - buildList(), renderMap(), checkMap() — the list, its place between the markers, staleness and problems
// - PENDING — modules still waiting for their ticket (spec section 9)
// - CLI: node tools/code-map.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isPending, isRussian } from './ru-comments.mjs';

// Modules still waiting for their English header (spec section 9). Each ticket deletes its own entries; ticket 09 deletes the list.
export const PENDING = [
  // ticket 04
  ...['points', 'racks', 'pullview', 'racktable', 'pointmerge', 'pointsfile', 'pointchooser', 'cablespick', 'doorchips',
    'doorcfgview', 'ownworks', 'latinfix'].map((n) => `src/app/views/${n}.js`),
  // ticket 05
  ...['planmodal', 'tohnitview', 'planversion', 'planpick', 'planlink', 'planview', 'planassign', 'plannumbers', 'pdfpick',
    'import', 'guide'].map((n) => `src/app/views/${n}.js`),
  // ticket 06
  ...['doh', 'settings', 'wizard', 'catalogview', 'project', 'poolview', 'shilutsettings', 'managersfolder', 'tables',
    'todos', 'sheetslist', 'history', 'manualsview', 'members', 'journal', 'projects', 'month', 'log'].map((n) => `src/app/views/${n}.js`),
  // ticket 07
  'src/tohnit/', 'scripts/',
];

export const MAP_FILE = 'docs/code-map.md';
export const MAX_SENTENCE = 200;
export const NO_HEADER = '(no English header yet)';

// Every *.js and *.mjs under src/ and scripts/ on disk, paths with "/", plain string order.
export function listModules(root) {
  const out = [];
  const walk = (dir) => {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(rel); }
      else if (/\.m?js$/.test(e.name)) out.push(rel);
    }
  };
  walk('src');
  walk('scripts');
  return out.sort();
}

// The leading comment of a module, its markers stripped, lines joined with "\n" (an empty line between paragraphs);
// null when the module does not start with a comment. Allowed before it: a "#!" line and blank lines.
// A "//" block runs over consecutive "//" lines; a blank line inside it separates paragraphs.
export function headerOf(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  let i = 0;
  if (lines[0]?.startsWith('#!')) i++;
  while (i < lines.length && !lines[i].trim()) i++;
  if (i >= lines.length) return null;
  const first = lines[i].trim();
  const body = [];
  if (first.startsWith('//')) {
    for (; i < lines.length; i++) {
      const t = lines[i].trim();
      if (t.startsWith('//')) body.push(t.replace(/^\/\/ ?/, ''));
      else if (!t) body.push('');
      else break;
    }
  } else if (first.startsWith('/*')) {
    const rest = lines.slice(i).join('\n').trim();
    const close = rest.indexOf('*/');
    if (close === -1) return null;
    const inner = rest.slice(rest.startsWith('/**') ? 3 : 2, close);
    for (const l of inner.split('\n')) body.push((/^\s*\*(?!\/)/.test(l) ? l.replace(/^\s*\* ?/, '') : l.trimStart()).trimEnd());
  } else return null;
  while (body.length && !body[0].trim()) body.shift();
  while (body.length && !body[body.length - 1].trim()) body.pop();
  return body.length ? body.join('\n') : null;
}

export function firstParagraph(header) {
  return header.split(/\n\s*\n/)[0];
}

const NOT_AN_END = /(?:^|[^\p{L}])(?:e\.g|i\.e|vs|cf)\.$/iu;

// First sentence of a paragraph joined into one line. A ".", "!" or "?" ends it when the paragraph ends there, or when
// whitespace follows and then a character that is not a lowercase letter or digit; "e.g.", "i.e.", "vs." and "cf." never do.
export function firstSentence(paragraph) {
  const s = String(paragraph).replace(/\s+/g, ' ').trim();
  for (let i = 0; i < s.length; i++) {
    if (!'.!?'.includes(s[i])) continue;
    if (i === s.length - 1) return s;
    if (s[i + 1] !== ' ') continue;
    const next = s[i + 2];
    if (/[\p{Ll}\p{Nd}]/u.test(next)) continue;
    if (s[i] === '.' && NOT_AN_END.test(s.slice(0, i + 1))) continue;
    return s.slice(0, i + 1);
  }
  return s;
}

// One module's map entry: { path, sentence, english, tooLong, line }.
export function entryOf(file, text) {
  const header = headerOf(text);
  const sentence = header ? firstSentence(firstParagraph(header)) : '';
  const english = Boolean(sentence) && !isRussian(sentence);
  const tooLong = english && sentence.length > MAX_SENTENCE;
  return { path: file, sentence, english, tooLong, line: `- \`${file}\` — ${english ? sentence : NO_HEADER}` };
}

// The map list and its problems: a module without an English header that is not pending; a sentence over 200 characters.
export function buildList(root, pending = PENDING) {
  const entries = listModules(root).map((f) => entryOf(f, fs.readFileSync(path.join(root, f), 'utf8')));
  const problems = [];
  for (const e of entries) {
    if (!e.english && !isPending(e.path, pending)) problems.push(`${e.path}: no English header comment`);
    if (e.tooLong) problems.push(`${e.path}: first sentence is ${e.sentence.length} characters (limit ${MAX_SENTENCE})`);
  }
  return { entries, lines: entries.map((e) => e.line), problems, pending: entries.filter((e) => isPending(e.path, pending)).length };
}

// Puts the list between the line starting "<!-- code-map:start" and the line "<!-- code-map:end -->".
// Keeps the line ending the file already uses; throws when a marker is missing.
export function renderMap(mapText, list) {
  const crlf = mapText.includes('\r\n');
  const lines = mapText.replace(/\r/g, '').split('\n');
  const start = lines.findIndex((l) => l.startsWith('<!-- code-map:start'));
  const end = lines.findIndex((l, i) => i > start && l.trim() === '<!-- code-map:end -->');
  if (start === -1 || end === -1) throw new Error(`${MAP_FILE}: markers <!-- code-map:start … --> and <!-- code-map:end --> not found`);
  const out = [...lines.slice(0, start + 1), ...list, ...lines.slice(end)].join('\n');
  return crlf ? out.replace(/\n/g, '\r\n') : out;
}

// { stale, problems, text, current }: stale when the file differs from the rendered map (carriage returns ignored).
export function checkMap(root, pending = PENDING) {
  const current = fs.readFileSync(path.join(root, MAP_FILE), 'utf8');
  const built = buildList(root, pending);
  const text = renderMap(current, built.lines);
  return { stale: text.replace(/\r/g, '') !== current.replace(/\r/g, ''), problems: built.problems, text, current, built };
}

function main() {
  const root = process.cwd();
  const check = process.argv.includes('--check');
  let res;
  try { res = checkMap(root); } catch (e) { console.error(e.message); process.exit(2); }
  if (!check && res.stale) fs.writeFileSync(path.join(root, MAP_FILE), res.text);
  console.log(`code map: ${res.built.entries.length} modules, ${res.built.pending} pending`);
  for (const p of res.problems) console.log(`PROBLEM ${p}`);
  if (check && res.stale) console.log(`${MAP_FILE} is stale: run node tools/code-map.mjs`);
  else if (!check && res.stale) console.log(`${MAP_FILE} written`);
  process.exit(res.problems.length || (check && res.stale) ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
