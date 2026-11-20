// Checks the pure rules of the several-value point filter in src/domain/filters.js (spec 7 § 1.6, § 10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toggleValue, tickAll, clearAll, isOff, normalize, prune, buttonText, anyOf, groupState,
  rackMatch, typeSetMatch, problemMatch,
} from '../src/domain/filters.js';

const S = (...v) => new Set(v);
const arr = (s) => [...s].sort();

const racks = [
  { value: 'FA', text: 'FA', count: 7 },
  { value: 'FB', text: 'FB', count: 6 },
  { value: 'FC', text: 'FC', count: 2 },
  { value: '__none', text: 'Без шкафа', count: 1 },
];
const types = [
  { value: 'g:door', text: '▸ Все: Дверь (типов: 3)', kind: 'group', members: ['D1', 'D2', 'D3'] },
  { value: 'D1', text: 'D1' }, { value: 'D2', text: 'D2' }, { value: 'D3', text: 'D3' },
  { value: 'C', text: 'C' },
  { value: '__unlinked', text: '❔ Не размеченые (1)', label: '❔ Не размеченые', kind: 'mode' },
  { value: '__hidden', text: '🙈 Скрытые (1)', label: '🙈 Скрытые', kind: 'mode' },
];
const problems = [
  { value: '__any', text: '⚠ С проблемами (3)', label: '⚠ С проблемами', kind: 'any', members: ['p1', 'p2'] },
  { value: 'p1', text: 'Проблема: Замок (2)', label: 'Проблема: Замок' },
  { value: 'p2', text: 'Проблема: Кабель (1)', label: 'Проблема: Кабель' },
];
const opt = (list, v) => list.find((o) => o.value === v);

test('toggleValue: plain value ticks and unticks', () => {
  const a = toggleValue(S(), opt(racks, 'FA'), racks);
  assert.deepEqual(arr(a), ['FA']);
  assert.deepEqual(arr(toggleValue(a, opt(racks, 'FA'), racks)), []);
});

test('toggleValue: group with partial members ticks all, full unticks all', () => {
  const g = opt(types, 'g:door');
  assert.equal(groupState(S('D1'), g, types), false);
  const all = toggleValue(S('D1'), g, types);
  assert.deepEqual(arr(all), ['D1', 'D2', 'D3']);
  assert.equal(groupState(all, g, types), true);
  assert.deepEqual(arr(toggleValue(S('D1', 'D2', 'D3', 'C'), g, types)), ['C']);
});

test('toggleValue: group counts only members present in the list', () => {
  const partial = types.filter((o) => o.value !== 'D3');
  const g = opt(partial, 'g:door');
  assert.deepEqual(arr(toggleValue(S(), g, partial)), ['D1', 'D2']);
  assert.equal(groupState(S('D1', 'D2'), g, partial), true);
});

test('toggleValue: «⚠ С проблемами» against single problems, both ways', () => {
  assert.deepEqual(arr(toggleValue(S('p1', 'p2'), opt(problems, '__any'), problems)), ['__any']);
  assert.deepEqual(arr(toggleValue(S('__any'), opt(problems, 'p1'), problems)), ['p1']);
});

test('toggleValue: modes against types and each other', () => {
  assert.deepEqual(arr(toggleValue(S('C', 'D1'), opt(types, '__unlinked'), types)), ['__unlinked']);
  assert.deepEqual(arr(toggleValue(S('__unlinked'), opt(types, '__hidden'), types)), ['__hidden']);
  assert.deepEqual(arr(toggleValue(S('__hidden'), opt(types, 'C'), types)), ['C']);
  assert.deepEqual(arr(toggleValue(S('__hidden'), opt(types, 'g:door'), types)), ['D1', 'D2', 'D3']);
});

test('toggleValue: heading is not tickable; the same tap twice returns to the start', () => {
  const head = { value: 'h', text: 'Осталось', kind: 'head' };
  assert.deepEqual(arr(toggleValue(S('FA'), head, [head, ...racks])), ['FA']);
  const once = toggleValue(S(), opt(racks, 'FB'), racks);
  assert.deepEqual(arr(toggleValue(once, opt(racks, 'FB'), racks)), []);
});

test('tickAll ticks plain lines only; clearAll empties; twice changes nothing', () => {
  assert.deepEqual(arr(tickAll(types)), ['C', 'D1', 'D2', 'D3']);
  assert.deepEqual(arr(tickAll(problems)), ['p1', 'p2']);
  assert.deepEqual(arr(tickAll(racks)), arr(tickAll(racks)));
  assert.equal(clearAll().size, 0);
});

test('isOff and normalize: covering (racks, types) vs not (D1)', () => {
  const full = tickAll(racks);
  assert.equal(isOff(S(), racks), true);
  assert.equal(isOff(full, racks, { covering: true }), true);
  assert.equal(isOff(full, racks), false);
  assert.equal(normalize(full, racks, { covering: true }).size, 0);
  assert.equal(normalize(full, racks).size, 4);
  assert.equal(isOff(S('FA'), racks, { covering: true }), false);
  // A missing shared value keeps the filter on (D2).
  assert.equal(isOff(S(...full, 'FX'), racks, { covering: true }), false);
});

test('prune drops values no longer among the options', () => {
  assert.deepEqual(arr(prune(S('FA', 'FZ', '__none'), racks)), ['FA', '__none']);
  assert.deepEqual(arr(prune(S('g:door', 'D1'), types)), ['D1']);
});

test('buttonText: none, 1, 2, 3+, covering full, mode, missing last', () => {
  const b = (set, extra = {}) => buttonText({ set, options: racks, allText: 'Все шкафы', prefix: 'Шкафы', ...extra });
  assert.equal(b(S()), 'Все шкафы');
  assert.equal(b(S('FA')), 'Шкафы: FA');
  assert.equal(b(S('FB', 'FA')), 'Шкафы: FA, FB');
  assert.equal(b(S('FA', 'FB', 'FC')), 'Шкафы: 3');
  assert.equal(b(S('__none')), 'Шкафы: Без шкафа');
  assert.equal(b(tickAll(racks), { covering: true }), 'Все шкафы');
  assert.equal(b(tickAll(racks)), 'Шкафы: 4');
  assert.equal(b(S('FA', 'FX'), { missing: ['FX'] }), 'Шкафы: FA, FX');
  assert.equal(b(S('FX'), { missing: ['FX'] }), 'Шкафы: FX');
  assert.equal(buttonText({ set: S('__hidden'), options: types, allText: 'Все типы', prefix: 'Типы' }), '🙈 Скрытые');
  assert.equal(buttonText({ set: S('p1'), options: problems, allText: 'Проблемы: все', prefix: 'Проблемы' }), 'Проблемы: Проблема: Замок');
});

test('anyOf: empty set passes all, else any value', () => {
  assert.equal(anyOf(S(), () => false), true);
  assert.equal(anyOf(S(1, 2), (v) => v === 2), true);
  assert.equal(anyOf(S(1, 2), (v) => v === 3), false);
});

test('matching: racks with __none, types, problems __any and ids', () => {
  assert.equal(rackMatch(S('__none'), { cabinet: '' }), true);
  assert.equal(rackMatch(S('FA', 'FB'), { cabinet: 'FB' }), true);
  assert.equal(rackMatch(S('FA'), { cabinet: 'FB' }), false);
  assert.equal(typeSetMatch(S('C', 'D1'), { typeId: 'D1' }), true);
  assert.equal(typeSetMatch(S('C'), { typeId: 'D1' }), false);
  assert.equal(problemMatch(S('__any'), ['p2']), true);
  assert.equal(problemMatch(S('__any'), []), false);
  assert.equal(problemMatch(S('p1', 'p2'), ['p2']), true);
  assert.equal(problemMatch(S('p1'), ['p2']), false);
});
