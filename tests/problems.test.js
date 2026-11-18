// Checks problems on points (src/domain/problems.js, ADR 0017): fit by type and group, the marking form's list, mark and solve operations,
// labels in Russian and Hebrew, counts, the context index of marks and the point merge carrying open marks over.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildContext, problemFits, problemsForPoints, markOps, solveOps, openProblemsOf, marksOf, problemLabel, problemCounts, hasCyrillic,
  EXAMPLE_PROBLEMS, findSameGroups, previewMerge, mergeOps,
} from '../src/domain/index.js';

const by = { uid: 'u1', name: 'Иван' };
const PROBLEMS = [
  ...EXAMPLE_PROBLEMS,
  { id: 'pr_cam', name: 'Объектив', nameHe: 'עדשה', types: ['Камера'], descs: [{ id: 'd_dirty', ru: 'Грязный', he: 'מלוכלך' }, { id: 'd_old', ru: 'Старый', he: 'ישן', deleted: true }] },
  { id: 'pr_both', name: 'Высота', nameHe: 'גובה', types: ['Дверь', 'Камера'], descs: [] },
  { id: 'pr_gone', name: 'Удалённая', nameHe: 'נמחקה', types: [], descs: [{ id: 'd_x', ru: 'Текст', he: 'טקסט' }], deleted: true },
];
function data(marks = []) {
  return {
    projects: [{ id: 'P' }],
    types: [{ id: 'Дверь ЭМ', group: 'Дверь' }, { id: 'Дверь МХ', group: 'Дверь' }, { id: 'Камера' }],
    points: [
      { id: 'd1', label: 'D-01', typeId: 'Дверь ЭМ' }, { id: 'd2', label: 'D-02', typeId: 'Дверь МХ' },
      { id: 'c1', label: 'C-01', typeId: 'Камера' }, { id: 'gone', label: 'X', typeId: 'Камера', deleted: true },
    ],
    problemMarks: marks,
    shared: { problems: PROBLEMS },
  };
}
// apply ops like the repo: an op without id becomes a new document
let seq = 0;
const apply = (d, ops) => { ops.forEach((o) => { const i = d.problemMarks.findIndex((m) => m.id === o.id); if (o.id && i >= 0) d.problemMarks[i] = { ...d.problemMarks[i], ...o.data }; else d.problemMarks.push({ id: o.id || `m${++seq}`, ...o.data }); }); return buildContext(d); };

test('problemFits: empty types fit all, a type id, a group name', () => {
  const ctx = buildContext(data());
  const p = (id) => ctx.problems.get(id);
  assert.equal(problemFits(p('pr_cable'), ctx.points.get('c1'), ctx), true);
  assert.equal(problemFits(p('pr_magnet'), ctx.points.get('d1'), ctx), true, '«Дверь» is the group of «Дверь ЭМ»');
  assert.equal(problemFits(p('pr_magnet'), ctx.points.get('c1'), ctx), false);
  assert.equal(problemFits(p('pr_cam'), ctx.points.get('c1'), ctx), true, 'by type id');
});

test('problemsForPoints: a mixed selection gets only what fits every point, with the hint', () => {
  const ctx = buildContext(data());
  const doors = problemsForPoints([ctx.points.get('d1'), ctx.points.get('d2')], ctx);
  assert.deepEqual(doors.list.map((x) => x.id).sort(), ['pr_access', 'pr_both', 'pr_cable', 'pr_lock', 'pr_magnet']);
  assert.equal(doors.partial, true);
  const mixed = problemsForPoints([ctx.points.get('d1'), ctx.points.get('c1')], ctx);
  assert.deepEqual(mixed.list.map((x) => x.name), ['Высота', 'Доступ', 'Кабель'], 'by name; door-only and camera-only left out; deleted never');
  assert.equal(mixed.partial, true);
});

test('markOps: a new mark, a re-mark updates the open one, a solved one marked again is new', () => {
  const d = data(); let ctx = buildContext(d);
  let ops = markOps(['d1', 'd2'], { problemId: 'pr_magnet', descId: 'd_notdrilled' }, by, 1000, ctx);
  assert.equal(ops.length, 2); assert.equal(ops[0].id, undefined);
  assert.deepEqual(ops[0].data, { pointId: 'd1', problemId: 'pr_magnet', descId: 'd_notdrilled', text: null, markedAt: 1000, markedBy: 'u1', markedByName: 'Иван', solvedAt: null, solvedBy: null, solvedByName: null });
  ctx = apply(d, ops);
  ops = markOps(['d1'], { problemId: 'pr_magnet', text: 'דלת 3' }, by, 2000, ctx);
  assert.equal(ops[0].id, marksOf({ id: 'd1' }, ctx)[0].id, 'the same mark is updated');
  ctx = apply(d, ops);
  assert.equal(marksOf({ id: 'd1' }, ctx).length, 1);
  assert.deepEqual([marksOf({ id: 'd1' }, ctx)[0].text, marksOf({ id: 'd1' }, ctx)[0].descId], ['דלת 3', null]);
  ctx = apply(d, solveOps(['d1'], 'pr_magnet', by, 3000, ctx));
  ctx = apply(d, markOps(['d1'], { problemId: 'pr_magnet' }, by, 4000, ctx));
  const list = marksOf({ id: 'd1' }, ctx);
  assert.equal(list.length, 2, 'the old mark stays as history');
  assert.equal(list[0].solvedAt, null); assert.equal(list[1].solvedAt, 3000, 'open first, then solved');
});

test('solveOps: one problem, all problems, duplicates of two members closed', () => {
  const marks = [
    { id: 'a', pointId: 'd1', problemId: 'pr_magnet', markedAt: 10 },
    { id: 'b', pointId: 'd1', problemId: 'pr_magnet', markedAt: 20 },   // the same problem marked offline by a second member
    { id: 'c', pointId: 'd1', problemId: 'pr_cable', markedAt: 30 },
    { id: 'e', pointId: 'd2', problemId: 'pr_cable', markedAt: 5, solvedAt: 6 },
  ];
  const ctx = buildContext(data(marks));
  assert.deepEqual(solveOps(['d1'], 'pr_magnet', by, 99, ctx).map((o) => o.id).sort(), ['a', 'b']);
  assert.deepEqual(solveOps(['d1', 'd2'], null, by, 99, ctx).map((o) => o.id).sort(), ['a', 'b', 'c'], 'a solved mark is not solved again');
  assert.deepEqual(solveOps(['d1'], 'pr_cable', by, 99, ctx)[0].data, { solvedAt: 99, solvedBy: 'u1', solvedByName: 'Иван' });
});

test('openProblemsOf: one per problem, the newest; marks of deleted points are not in the context', () => {
  const marks = [
    { id: 'a', pointId: 'd1', problemId: 'pr_magnet', markedAt: 10, descId: 'd_notdrilled' },
    { id: 'b', pointId: 'd1', problemId: 'pr_magnet', markedAt: 20, text: 'חדש' },
    { id: 'c', pointId: 'd1', problemId: 'pr_cable', markedAt: 15 },
    { id: 'z', pointId: 'd1', problemId: 'pr_lock', markedAt: 50, deleted: true },
    { id: 'g', pointId: 'gone', problemId: 'pr_cable', markedAt: 1 },
  ];
  const ctx = buildContext(data(marks));
  assert.deepEqual(openProblemsOf({ id: 'd1' }, ctx).map((m) => m.id), ['b', 'c']);
  assert.deepEqual(marksOf({ id: 'd1' }, ctx).map((m) => m.id), ['b', 'c', 'a'], 'marksByPoint: open by markedAt desc');
  assert.equal(ctx.marksByPoint.has('gone'), false);
});

test('problemLabel: Russian, Hebrew, own text, no description, deleted problem and description', () => {
  const ctx = buildContext(data());
  assert.equal(problemLabel({ problemId: 'pr_magnet', descId: 'd_notdrilled' }, ctx, 'ru'), 'Магнит индикация: Не просверлены двери');
  assert.equal(problemLabel({ problemId: 'pr_magnet', descId: 'd_notdrilled' }, ctx, 'he'), 'מגנט חיווי: הדלתות לא קדוחות');
  assert.equal(problemLabel({ problemId: 'pr_magnet', text: 'דלת 3' }, ctx, 'ru'), 'Магнит индикация: דלת 3', 'own text as written');
  assert.equal(problemLabel({ problemId: 'pr_lock' }, ctx, 'he'), 'מנעול');
  assert.equal(problemLabel({ problemId: 'pr_cam', descId: 'd_old' }, ctx, 'ru'), 'Объектив: Старый', 'a deleted description still labels its marks');
  assert.equal(problemLabel({ problemId: 'pr_gone', descId: 'd_x' }, ctx, 'he'), 'נמחקה: טקסט', 'a deleted problem still labels its marks');
  assert.equal(problemLabel({ problemId: 'pr_unknown' }, ctx, 'ru'), 'pr_unknown');
});

test('problemCounts: points, open problems (duplicates once), by problem', () => {
  const marks = [
    { id: 'a', pointId: 'd1', problemId: 'pr_magnet', markedAt: 10 }, { id: 'b', pointId: 'd1', problemId: 'pr_magnet', markedAt: 20 },
    { id: 'c', pointId: 'd1', problemId: 'pr_cable', markedAt: 15 }, { id: 'd', pointId: 'c1', problemId: 'pr_cable', markedAt: 15 },
    { id: 'e', pointId: 'd2', problemId: 'pr_cable', markedAt: 5, solvedAt: 6 },
  ];
  const ctx = buildContext(data(marks));
  const c = problemCounts([...ctx.points.values()], ctx);
  assert.equal(c.points, 2); assert.equal(c.marks, 3);
  assert.deepEqual([...c.byProblem.entries()].sort(), [['pr_cable', 2], ['pr_magnet', 1]]);
});

test('own text: Cyrillic is refused, Latin and digits are allowed', () => {
  assert.equal(hasCyrillic('דלת 3 מצלמה'), false);
  assert.equal(hasCyrillic('דלת AXIS P3245'), false);
  assert.equal(hasCyrillic('דלת ж'), true);
});

test('example problems: four, with fixed ids and both languages', () => {
  assert.deepEqual(EXAMPLE_PROBLEMS.map((p) => p.id), ['pr_magnet', 'pr_lock', 'pr_cable', 'pr_access']);
  EXAMPLE_PROBLEMS.forEach((p) => { assert.ok(p.name && p.nameHe); p.descs.forEach((d) => assert.ok(d.id && d.ru && d.he)); });
});

test('merge: open marks move to the kept point, a problem it already has open is solved', () => {
  const d = {
    projects: [{ id: 'P' }], types: [{ id: 'T' }], days: [], entries: [], journal: [], pulls: [], catalog: [], cables: [], devices: [], configs: [], units: [],
    points: [{ id: 'a', label: 'FC/B05', typeId: 'T', cabinet: 'FC' }, { id: 'b', label: 'FC/B06', typeId: 'T', cabinet: 'FC' }, { id: 'dd', label: 'FC/B05-06', typeId: 'T', cabinet: 'FC' }],
    problemMarks: [
      { id: 'm1', pointId: 'a', problemId: 'pr_cable', markedAt: 10 },
      { id: 'm2', pointId: 'b', problemId: 'pr_access', markedAt: 20 },
      { id: 'm3', pointId: 'dd', problemId: 'pr_access', markedAt: 5 },
      { id: 'm4', pointId: 'a', problemId: 'pr_lock', markedAt: 1, solvedAt: 2 },   // solved: stays with the removed point
    ],
    shared: { problems: PROBLEMS },
  };
  const ctx = buildContext(d);
  const g = findSameGroups([...ctx.points.values()])[0];
  const pv = previewMerge(g, 'double', d, ctx);
  const { ops } = mergeOps(g, 'double', pv, d, ctx, { by, now: 777 });
  const mk = ops.filter((o) => o.coll === 'problemMarks');
  assert.deepEqual(mk.find((o) => o.id === 'm1').data, { pointId: 'dd' });
  assert.deepEqual(mk.find((o) => o.id === 'm2').data, { solvedAt: 777, solvedBy: 'u1', solvedByName: 'Иван' }, 'the kept point already has «Доступ» open');
  assert.equal(mk.some((o) => o.id === 'm3' || o.id === 'm4'), false);
  // keeping the singles: the double's open mark goes to the first single, a copy to the second
  const pv2 = previewMerge(g, 'singles', d, ctx);
  const mk2 = mergeOps(g, 'singles', pv2, d, ctx, { by, now: 777 }).ops.filter((o) => o.coll === 'problemMarks');
  assert.deepEqual(mk2.find((o) => o.id === 'm3').data, { pointId: 'a' }, 'the first single takes it; the second already has «Доступ» open');
  assert.equal(mk2.length, 1);
  d.problemMarks.push({ id: 'm5', pointId: 'dd', problemId: 'pr_lock', markedAt: 30, descId: 'd_nopower', markedByName: 'Пётр' });
  const ctx3 = buildContext(d);
  const mk3 = mergeOps(g, 'singles', previewMerge(g, 'singles', d, ctx3), d, ctx3, { by, now: 777 }).ops.filter((o) => o.coll === 'problemMarks');
  assert.deepEqual(mk3.find((o) => o.id === 'm5').data, { pointId: 'a' });
  const copy = mk3.find((o) => o.id === 'm5_b');
  assert.equal(copy.data.pointId, 'b'); assert.equal(copy.data.descId, 'd_nopower'); assert.equal(copy.data.markedByName, 'Пётр'); assert.equal(copy.data.solvedAt, null);
});
