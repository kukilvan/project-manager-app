// Checks the pure rules of the plan's filters: rack options with «Без шкафа», covering against one drawing, missing shared values,
// several-value stage matching, the stage window and the focus-point rule (spec 7 § 2.3, src/domain/planfilters.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rackOptions, missingValues, isOff, normalize, buttonText, rackMatch } from '../src/domain/filters.js';
import { stageOptions, stageMatch, shownPoints, noneUnderFilters } from '../src/domain/planfilters.js';
import { LEFT_FILTERS } from '../src/domain/plan.js';

const S = (...v) => new Set(v);
const pt = (id, cabinet, extra = {}) => ({ id, label: id, typeId: 'C', cabinet, ...extra });

test('rack options of a drawing: names sorted with numbers, «Без шкафа» last, counts of this list', () => {
  const opts = rackOptions([pt('1', 'FB'), pt('2', 'FA'), pt('3', ''), pt('4', 'FA'), pt('5', 'F10'), pt('6', 'F9')]);
  assert.deepEqual(opts.map((o) => [o.value, o.text, o.count]),
    [['F9', 'Шкаф F9', 1], ['F10', 'Шкаф F10', 1], ['FA', 'Шкаф FA', 2], ['FB', 'Шкаф FB', 1], ['__none', 'Без шкафа', 1]]);
  assert.equal(opts[0].label, 'F9');
  assert.ok(rackMatch(S('__none'), pt('x', '')) && !rackMatch(S('__none'), pt('y', 'FA')));
});

test('covering against the drawing: all its racks ticked is off; a rack of another drawing is not part of it', () => {
  const drawing = rackOptions([pt('1', 'FA'), pt('2', 'FB')]);
  assert.equal(isOff(S('FA', 'FB'), drawing, { covering: true }), true);
  assert.equal(buttonText({ set: S('FA', 'FB'), options: drawing, allText: 'Все шкафы', prefix: 'Шкафы', covering: true }), 'Все шкафы');
  // FC ticked in «Точки», not on this drawing: the filter is on, FC is missing and named last
  const set = S('FC', 'FA');
  assert.equal(isOff(set, drawing, { covering: true }), false);
  assert.deepEqual(missingValues(set, drawing), ['FC']);
  assert.equal(buttonText({ set, options: drawing.map((o) => ({ ...o })), allText: 'Все шкафы', prefix: 'Шкафы', missing: ['FC'], covering: true }), 'Шкафы: FA, FC');
  assert.equal(buttonText({ set: S('FC'), options: drawing, allText: 'Все шкафы', prefix: 'Шкафы', missing: ['FC'], covering: true }), 'Шкафы: FC');
  // the plan path never prunes: normalize keeps the missing value
  assert.deepEqual([...normalize(S('FA', 'FB', 'FC'), drawing, { covering: true })].sort(), ['FA', 'FB', 'FC']);
});

test('missing values skip group lines and keep the set order', () => {
  const opts = [{ value: 'grp:Дверь', kind: 'group', members: ['D1'] }, { value: 'D1' }, { value: '__unlinked', kind: 'mode' }];
  assert.deepEqual(missingValues(S('X', 'D1', 'grp:Дверь', 'Y'), opts), ['X', 'grp:Дверь', 'Y']);
  assert.deepEqual(missingValues(S('__unlinked'), opts), []);
  assert.deepEqual(missingValues(undefined, opts), []);
});

test('stage window: «Осталось» without counts, «Работа» with counts, «Проблемы» only with open problems', () => {
  const none = stageOptions({ works: [], problems: { n: 0, list: [] } });
  assert.deepEqual(none.map((o) => o.kind || 'plain'), ['head', ...LEFT_FILTERS.map(() => 'plain')]);
  assert.ok(none.slice(1).every((o) => o.count === undefined));
  const full = stageOptions({ works: [{ key: 'p:cat7', label: 'Протяжка cat7', n: 3 }, { key: 'w:inst', label: 'Установка камеры', n: 2 }],
    problems: { n: 2, list: [{ problemId: 'lock', n: 2 }, { problemId: 'pow', n: 1 }] } }, (id) => ({ lock: 'Замок' })[id]);
  const work = full.find((o) => o.value === 'w|p:cat7');
  assert.deepEqual([work.text, work.count], ['Протяжка cat7', 3]);
  const any = full.find((o) => o.value === 'pr|*');
  assert.deepEqual([any.kind, any.text, any.count, any.members], ['any', '⚠ С проблемами', 2, ['pr|lock', 'pr|pow']]);
  assert.deepEqual(full.filter((o) => o.value.startsWith('pr|') && o.value !== 'pr|*').map((o) => o.text), ['Проблема: Замок', 'Проблема: pow']);
  assert.deepEqual(full.filter((o) => o.kind === 'head').map((o) => o.text), ['Осталось', 'Работа', 'Проблемы']);
});

test('stage matching: empty set — all bright; several values — any of them', () => {
  const ctx = {};
  const a = pt('a', 'FA', { length: '' }); const b = pt('b', 'FA', { length: 12 });
  assert.equal(stageMatch(S(), a, ctx), true);
  // «Осталось: длина» only by the length; a stub info function keeps the other values out of the status code
  const info = () => ({ pulled: false, pullDone: false });
  assert.equal(stageMatch(S('Длина'), a, ctx, info), true);
  assert.equal(stageMatch(S('Длина'), b, ctx, info), false);
  assert.equal(stageMatch(S('Длина', 'Протяжка'), b, ctx, info), true);   // b is not pulled: the second value matches
  assert.equal(stageMatch(S('Длина', 'Протяжка'), b, ctx, () => ({ pulled: true })), false);
});

test('focus point: drawn even when the filters hide it, gone without the focus', () => {
  const list = [pt('a', 'FA'), pt('b', 'FB'), pt('c', 'FC')];
  const pass = (p) => p.cabinet === 'FA';
  assert.deepEqual(shownPoints(list, pass, null).map((p) => p.id), ['a']);
  assert.deepEqual(shownPoints(list, pass, 'c').map((p) => p.id), ['a', 'c']);
  assert.deepEqual(shownPoints(list, pass, 'a').map((p) => p.id), ['a']);
  assert.deepEqual(shownPoints(list, pass, 'zz').map((p) => p.id), ['a']);
});

test('«Под фильтры на этом чертеже точек нет»: only with active filters, no mode, and nothing passing', () => {
  const list = [pt('a', 'FA')];
  assert.equal(noneUnderFilters(list, () => false, { active: true }), true);
  assert.equal(noneUnderFilters(list, () => true, { active: true }), false);
  assert.equal(noneUnderFilters(list, () => false, { active: true, mode: true }), false);
  assert.equal(noneUnderFilters([], () => false, { active: false }), false);
});
