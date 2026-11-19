// Collects every Russian UI string (strings and `…${x}…` templates in src) for the translation dictionaries and the coverage test.
// Parses the source with acorn; skips texts that go only to the event log or the console. Exports collectStrings(); CLI: node scripts/i18n-extract.mjs [--json out.json]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const CYR = /[А-Яа-яЁё]/;
const LOG_CALLS = new Set(['info', 'warn', 'error']); // src/log.js; the event log is always Russian

/** Source files of `dir` (the same folders the translation covers: not tohnit, data, i18n) */
function sourceFiles(dir) {
  const files = [];
  (function scan(d) {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) { if (!['tohnit', 'data', 'i18n'].includes(f.name)) scan(p); } else if (p.endsWith('.js')) files.push(p);
    }
  })(dir);
  return files;
}

/** Every string literal and template inside an argument of a log call: `'a'`, `'a' + b`, `${x ? 'a' : 'b'}` in a template — all of it lands in the event log */
function textNodes(n, into) {
  walk.full(n, (x) => { if (x.type === 'Literal' || x.type === 'TemplateLiteral') into.add(x); });
}

const isLogCall = (c) => (c.callee.type === 'Identifier' && LOG_CALLS.has(c.callee.name))
  || (c.callee.type === 'MemberExpression' && c.callee.object.type === 'Identifier' && c.callee.object.name === 'console');

/**
 * Every Russian string literal and template (`{}` in place of each `${…}`) under `srcDir`.
 * Returns [{ text, tpl, files }] — files relative to `srcDir`, in the order found.
 */
export function collectStrings(srcDir = 'src') {
  const out = new Map(); // text -> { files:Set, tpl:boolean }
  for (const file of sourceFiles(srcDir)) {
    const src = fs.readFileSync(file, 'utf8');
    let ast; try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' }); } catch (e) { console.error(file, e.message); continue; }
    const skip = new Set();
    walk.full(ast, (n) => { if (n.type === 'CallExpression' && isLogCall(n)) n.arguments.forEach((a) => textNodes(a, skip)); });
    const add = (text, tpl) => {
      if (!CYR.test(text)) return;
      if (!out.has(text)) out.set(text, { files: new Set(), tpl });
      out.get(text).files.add(path.relative(srcDir, file).split(path.sep).join('/'));
    };
    walk.full(ast, (n) => {
      if (skip.has(n)) return;
      if (n.type === 'Literal' && typeof n.value === 'string') add(n.value, false);
      if (n.type === 'TemplateLiteral') add(n.quasis.map((q) => q.value.cooked).join('{}'), n.expressions.length > 0);
    });
  }
  return [...out.entries()].map(([text, v]) => ({ text, tpl: v.tpl, files: [...v.files] }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const list = collectStrings('src');
  const arg = process.argv.indexOf('--json');
  if (arg > 0) fs.writeFileSync(process.argv[arg + 1], JSON.stringify(list, null, 1));
  const byFile = {}; list.forEach((x) => x.files.forEach((f) => { byFile[f] = (byFile[f] || 0) + 1; }));
  console.log(`Строк: ${list.length}, шаблонов: ${list.filter((x) => x.tpl).length}, символов: ${list.reduce((n, x) => n + x.text.length, 0)}`);
  Object.entries(byFile).sort((a, b) => b[1] - a[1]).forEach(([f, n]) => console.log(`${String(n).padStart(5)}  ${f}`));
}
