// Checks the app side of the several-value point filter: shared filters per project, type and door-configuration options and matching, and the coding-standards rule 13 check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prune, normalize } from '../src/domain/filters.js';

// stubs for modules that touch the browser when they load (src/log.js, src/app/pool.js)
globalThis.window ??= { addEventListener() {} };
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.location ??= { search: '' };
const root = fileURLToPath(new URL('..', import.meta.url));
const S = (...v) => new Set(v);
const arr = (s) => [...s].sort();

test('shared filters: a change through set() is seen by a second reader; listeners fire only on a change', async () => {
  const { createSharedFilters } = await import('../src/app/sharedfilters.js');
  const store = createSharedFilters(() => 'p1');
  const calls = [];
  store.onChange((k) => calls.push(k));
  assert.equal(store.set('cab', S('FA', 'FB')), true);
  const reader = createSharedFilters(() => 'p1');   // another store is another app: not shared
  assert.deepEqual(arr(reader.get().cab), []);
  assert.deepEqual(arr(store.get().cab), ['FA', 'FB']);
  assert.equal(store.set('cab', S('FB', 'FA')), false);   // same set: no listener call
  assert.deepEqual(calls, ['cab']);
  assert.equal(store.clear(), true);
  assert.equal(store.clear(), false);
  assert.deepEqual(calls, ['cab', 'all']);
});

test('shared filters: another project clears the sets', async () => {
  const { createSharedFilters } = await import('../src/app/sharedfilters.js');
  let pid = 'p1';
  const store = createSharedFilters(() => pid);
  store.set('type', S('C', 'D1')); store.set('cfg', S('__nolock'));
  assert.deepEqual(arr(store.get().type), ['C', 'D1']);
  pid = 'p2';
  assert.deepEqual([...store.get().type, ...store.get().cab, ...store.get().cfg], []);
  pid = 'p1';
  assert.deepEqual(arr(store.get().type), [], 'coming back does not restore the old sets');
});

test('shared filters: the plan path keeps a value missing on its drawing; «Точки» prunes against the whole project (D2, § 1.5)', async () => {
  const { createSharedFilters } = await import('../src/app/sharedfilters.js');
  const store = createSharedFilters(() => 'p1');
  store.set('cab', S('FA', 'FC'));
  // the plan only reads the set and builds its own options: FC is not on this drawing, the set is untouched
  const drawing = [{ value: 'FA', text: 'Шкаф FA' }, { value: 'FB', text: 'Шкаф FB' }];
  const missing = [...store.get().cab].filter((v) => !drawing.some((o) => o.value === v));
  assert.deepEqual(missing, ['FC']);
  assert.deepEqual(arr(store.get().cab), ['FA', 'FC']);
  // «Точки»: FC emptied in the project → dropped; FA, FB of a project with only FA, FB → covering → off
  const project = [{ value: 'FA', text: 'Шкаф FA' }, { value: 'FB', text: 'Шкаф FB' }];
  store.set('cab', normalize(prune(store.get().cab, project), project, { covering: true }));
  assert.deepEqual(arr(store.get().cab), ['FA']);
  store.set('cab', S('FA', 'FB'));
  store.set('cab', normalize(prune(store.get().cab, project), project, { covering: true }));
  assert.deepEqual(arr(store.get().cab), []);
});

test('typeOptions: group lines with members and summed counts, then each type', async () => {
  const { typeOptions } = await import('../src/app/typegroups.js');
  const ctx = { types: new Map([['D1', { id: 'D1', group: 'Дверь' }], ['D2', { id: 'D2', group: 'Дверь' }], ['C', { id: 'C' }]]) };
  const n = { D1: 3, D2: 2, C: 5 };
  const opts = typeOptions(['D2', 'C', 'D1', 'C'], (t) => n[t], ctx);
  assert.deepEqual(opts.map((o) => o.value), ['grp:Дверь', 'C', 'D1', 'D2']);
  assert.equal(opts[0].kind, 'group');
  assert.deepEqual(opts[0].members, ['D1', 'D2']);
  assert.equal(opts[0].count, 5);
  assert.equal(opts[0].text, '▸ Все: Дверь (типов: 2)');
  assert.equal(opts[1].count, 5);
});

test('door configurations: several values match by cfgMatch (no locking, no configuration, ids)', async () => {
  const { state } = await import('../src/app/store.js');
  const { cfgSetMatch, cfgOptions } = await import('../src/app/cfgfilter.js');
  const saved = state.ctx;
  state.ctx = {
    types: new Map([['Дверь', { id: 'Дверь' }], ['C', { id: 'C' }]]),
    devices: new Map([['em', { id: 'em', doorPart: 'lock' }], ['rd', { id: 'rd', doorPart: 'reader' }]]),
    configs: new Map([['c1', { id: 'c1', name: 'ЭМ', devices: [{ deviceId: 'em' }] }], ['c2', { id: 'c2', name: 'Считыватель', devices: [{ deviceId: 'rd' }] }]]),
  };
  try {
    const locked = { typeId: 'Дверь', configId: 'c1' }; const open = { typeId: 'Дверь', configId: 'c2' };
    const bare = { typeId: 'Дверь' }; const cam = { typeId: 'C' };
    assert.equal(cfgSetMatch(S(), cam), true);
    assert.equal(cfgSetMatch(S('__nolock'), open), true);
    assert.equal(cfgSetMatch(S('__nolock'), locked), false);
    assert.equal(cfgSetMatch(S('__none'), bare), true);
    assert.equal(cfgSetMatch(S('__none'), cam), false);
    assert.equal(cfgSetMatch(S('c1', '__none'), locked), true);
    assert.equal(cfgSetMatch(S('c1', '__none'), bare), true);
    assert.equal(cfgSetMatch(S('c1', '__none'), open), false);
    const opts = cfgOptions([locked, open, bare, cam]);
    assert.deepEqual(opts.map((o) => [o.value, o.count]), [['__nolock', 1], ['__none', 1], ['c1', 1], ['c2', 1]]);
  } finally { state.ctx = saved; }
});

// Rule 13 (docs/coding-standards.md): point filters use multiFilter; no new single-value drop-down with an «all» text.
// The allow-list holds the files tickets 03–05 still convert; each removes its file, ticket 05 leaves it empty.
// wizard.js stays outside the rule: its «Все типы» filters catalog types in the setup wizard, not points.
const STILL_TO_CONVERT = ['points.js', 'pullview.js', 'doh.js', 'pointchooser.js', 'racks.js'];
const NOT_POINT_FILTERS = ['wizard.js'];
const ALL_TEXTS = ['Все шкафы', 'Все типы', 'Все конфигурации дверей', 'Все работы', 'Все этапы', 'Проблемы: все'];
const dropDownRe = new RegExp(`(?:h\\('option', \\{ value: '' \\}, |opt\\('', |sel\\()'(?:${ALL_TEXTS.join('|')})'`);

test('rule 13: single-value «all» drop-downs only in files still to convert', () => {
  const dir = path.join(root, 'src/app/views');
  const found = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'multifilter.js')
    .filter((f) => dropDownRe.test(fs.readFileSync(path.join(dir, f), 'utf8')));
  const bad = found.filter((f) => !STILL_TO_CONVERT.includes(f) && !NOT_POINT_FILTERS.includes(f));
  assert.deepEqual(bad, [], `point filters must use multiFilter (src/app/views/multifilter.js): ${bad.join(', ')}`);
  const done = STILL_TO_CONVERT.filter((f) => !found.includes(f));
  assert.deepEqual(done, [], `converted — remove from the allow-list in tests/filter-control.test.js: ${done.join(', ')}`);
  assert.ok(dropDownRe.test("sel('Все типы', opts)") && !dropDownRe.test("allText: 'Все типы'"));
});
