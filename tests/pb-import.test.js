// Guard of the GitHub Pages build: the PocketBase SDK and the NAS-only modules (src/app/pb/, src/app/pbstart.js) are not reachable from src/main.js
// except through the one dynamic import inside the `isPocketBase()` branch, which Vite drops from that build (spec 4 § 3.1, ticket 4.4).
// A static walk of the import graph (static and literal dynamic imports) with acorn; the self-check also greps dist/ for `PB_CONNECT`.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const NAS_ONLY = (f) => rel(f).startsWith('src/app/pb/') || rel(f) === 'src/app/pbstart.js';

// The imports of one module: { spec, dynamic, nasBranch } — nasBranch: a dynamic import inside an `if` whose test calls isPocketBase()
function importsOf(file) {
  const ast = acorn.parse(fs.readFileSync(file, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' });
  const out = [];
  const lit = (n) => (n && n.type === 'Literal' && typeof n.value === 'string' ? n.value : null);
  walk.ancestor(ast, {
    ImportDeclaration(n) { out.push({ spec: n.source.value, dynamic: false }); },
    ExportNamedDeclaration(n) { if (n.source) out.push({ spec: n.source.value, dynamic: false }); },
    ExportAllDeclaration(n) { out.push({ spec: n.source.value, dynamic: false }); },
    ImportExpression(n, _st, anc) {
      const spec = lit(n.source); if (!spec) return;
      const nasBranch = anc.some((a) => a.type === 'IfStatement' && callsIsPocketBase(a.test) && within(a.consequent, n));
      out.push({ spec, dynamic: true, nasBranch });
    },
  });
  return out;
}
function callsIsPocketBase(node) {
  let found = false;
  walk.simple(node, { CallExpression(c) { if (c.callee.type === 'Identifier' && c.callee.name === 'isPocketBase') found = true; } });
  return found;
}
const within = (outer, inner) => inner.start >= outer.start && inner.end <= outer.end;

function resolve(from, spec) {
  if (!spec.startsWith('.')) return null;
  const clean = spec.replace(/\?.*$/, '');
  const f = path.resolve(path.dirname(from), clean);
  return /\.(js|mjs)$/.test(f) && fs.existsSync(f) ? f : null;
}

function listSrc(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listSrc(p, acc); else if (/\.(js|mjs)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

test('the Pages build graph from src/main.js reaches no PocketBase code', () => {
  const main = path.join(ROOT, 'src/main.js');
  const seen = new Set(); const queue = [main]; const bare = new Set(); const nasEdges = [];
  while (queue.length) {
    const f = queue.shift(); if (seen.has(f)) continue; seen.add(f);
    for (const imp of importsOf(f)) {
      if (imp.nasBranch) { nasEdges.push(`${rel(f)} → ${imp.spec}`); continue; }
      const r = resolve(f, imp.spec);
      if (r) queue.push(r); else if (!imp.spec.startsWith('.')) bare.add(imp.spec.split('/')[0]);
    }
  }
  assert.ok(seen.size > 50, `the walk found too few modules (${seen.size})`);
  assert.ok(!bare.has('pocketbase'), 'the SDK is imported outside the NAS branch');
  assert.deepEqual([...seen].filter(NAS_ONLY).map(rel), [], 'NAS-only modules are reachable in the Pages build');
  assert.deepEqual(nasEdges, ['src/main.js → ./app/pbstart.js'], 'the NAS start is entered only through the isPocketBase() branch of main.js');
});

test('only NAS-only modules import the PocketBase SDK', () => {
  const users = listSrc(path.join(ROOT, 'src')).filter((f) => importsOf(f).some((i) => i.spec === 'pocketbase' || i.spec.startsWith('pocketbase/')));
  assert.ok(users.length >= 1, 'nothing imports the SDK');
  assert.deepEqual(users.filter((f) => !NAS_ONLY(f)).map(rel), []);
});
