// Одинаковые точки в разном виде: двойная FC/B05-06 и одинарные FC/B05 + FC/B06 — поиск и объединение с переносом работ.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContext, findSameGroups, singlesOf, previewMerge, mergeOps, pullFigures, itogShtuk } from '../src/domain/index.js';

function project() {
  const pts = [
    { id: 'a', label: 'FC/B05', typeId: 'T', cabinet: 'FC', length: 40, cableOverride: [{ cable: 'cat7', count: 1 }], port: 5, panel: 'U15' },
    { id: 'b', label: 'FC/B06', typeId: 'T', cabinet: 'FC', length: 40, cableOverride: [{ cable: 'cat7', count: 1 }], port: 6, panel: 'U15' },
    { id: 'd', label: 'FC/B05-06', typeId: 'T', cabinet: 'FC' },
    { id: 'x', label: 'FC/B07', typeId: 'T', cabinet: 'FC', length: 30, cableOverride: [{ cable: 'cat7', count: 1 }] },
    { id: 'y', label: 'FA/B05', typeId: 'T', cabinet: 'FA' },   // другой шкаф — не пара
  ];
  const data = {
    points: pts, projects: [{ id: 'P' }], days: [{ id: 'D1', date: '2026-11-05' }],
    types: [{ id: 'T', cables: [{ cable: 'cat7', count: 2 }] }], cables: [{ id: 'cat7', accounting: 'Метры' }], devices: [], configs: [], units: [], culprits: [], delayReasons: [],
    catalog: [{ id: 'PR', name: 'Протяжка', workType: 'Протяжка' }, { id: 'HV', name: 'Хивут', workType: 'Хивут', unit: 'шт' }],
    entries: [
      { id: 'e1', dayId: 'D1', workType: 'Протяжка', workId: 'PR', cableId: 'cat7', pointIds: ['a', 'b', 'x'] },
      { id: 'e2', dayId: 'D1', workType: 'Протяжка', workId: 'PR', cableId: 'cat7', pointIds: ['a'] },   // только одна из пары
      { id: 'e3', dayId: 'D1', workType: 'Хивут', workId: 'HV', pointIds: ['a', 'b'] },
    ],
    journal: [{ id: 'e1_a', entryId: 'e1', pointId: 'a' }, { id: 'e1_b', entryId: 'e1', pointId: 'b' }, { id: 'e2_a', entryId: 'e2', pointId: 'a' }, { id: 'edit_b_HV', entryId: null, pointId: 'b', editWorkId: 'HV', editDate: '2026-11-06' }],
    pulls: [{ id: 'pl', pointIds: ['a', 'b', 'x'], meters: [{ id: 'a', v: 40 }, { id: 'b', v: 42 }], fixed: [], kept: [], finished: ['a', 'b'], checked: ['a'] }],
  };
  return data;
}
const apply = (data, { ops, remove }) => {
  for (const op of ops) { const arr = data[op.coll]; const i = arr.findIndex((x) => x.id === op.id); if (i >= 0) arr[i] = { ...arr[i], ...op.data }; else arr.push({ id: op.id, ...op.data }); }
  for (const r of remove) { const arr = data[r.coll]; const i = arr.findIndex((x) => x.id === r.id); if (i >= 0) arr.splice(i, 1); }
};

test('одинаковые точки: поиск двойной и её одинарных в том же шкафу', () => {
  const { points } = project();
  const g = findSameGroups(points);
  assert.equal(g.length, 1); assert.equal(g[0].double.id, 'd'); assert.deepEqual(g[0].singles.map((s) => s.id), ['a', 'b']);
  assert.deepEqual(singlesOf('FC/B05-06', 'FC', points).map((s) => s.id), ['a', 'b']);
  assert.equal(singlesOf('FC/B05-06', 'FA', points), null);
  assert.equal(singlesOf('FC/B07-08', 'FC', points), null);   // FC/B08 нет
});

test('одинаковые точки: оставить двойную — работы переходят, количество в отчётах не меняется', () => {
  const data = project(); let ctx = buildContext(data);
  const before = Object.fromEntries(data.entries.map((e) => [e.id, e.workType === 'Протяжка' ? JSON.stringify(pullFigures(e, ctx)) : itogShtuk(e, ctx)]));
  const g = findSameGroups([...ctx.points.values()])[0];
  const pv = previewMerge(g, 'double', data, ctx);
  const e2 = pv.entries.find((x) => x.id === 'e2'); assert.equal(e2.before, 1); assert.equal(e2.after, 2); assert.equal(e2.keepCount, true);
  assert.ok(pv.notes.some((n) => n.includes('разный метраж')));
  assert.ok(pv.notes.some((n) => n.includes('отмечена')));   // checked — только у одной
  apply(data, mergeOps(g, 'double', pv, data, ctx)); ctx = buildContext(data);
  const after = Object.fromEntries(data.entries.map((e) => [e.id, e.workType === 'Протяжка' ? JSON.stringify(pullFigures(e, ctx)) : itogShtuk(e, ctx)]));
  assert.deepEqual(after, before);
  assert.deepEqual(data.entries.find((e) => e.id === 'e1').pointIds, ['d', 'x']);
  assert.deepEqual(data.entries.find((e) => e.id === 'e2').portQty, [{ id: 'd', v: 1 }]);
  assert.ok(!ctx.points.has('a') && !ctx.points.has('b'));
  const d = ctx.points.get('d'); assert.equal(d.length, 40); assert.equal(d.port, 5); assert.equal(d.panel, 'U15');
  assert.deepEqual(data.journal.map((r) => r.id).sort(), ['e1_d', 'e2_d', 'edit_d_HV']);
  const pl = data.pulls[0]; assert.deepEqual(pl.pointIds, ['d', 'x']); assert.deepEqual(pl.meters, [{ id: 'd', v: 42 }]); assert.deepEqual(pl.finished, ['d']); assert.deepEqual(pl.checked, []);
});

test('одинаковые точки: «не сохранять количество» и «не переносить работу»', () => {
  const data = project(); let ctx = buildContext(data);
  const g = findSameGroups([...ctx.points.values()])[0];
  const pv = previewMerge(g, 'double', data, ctx);
  pv.entries.find((x) => x.id === 'e2').keepCount = false;
  pv.entries.find((x) => x.id === 'e3').transfer = false;
  apply(data, mergeOps(g, 'double', pv, data, ctx)); ctx = buildContext(data);
  assert.equal(pullFigures(data.entries.find((e) => e.id === 'e2'), ctx).count, 2);
  assert.deepEqual(data.entries.find((e) => e.id === 'e3').pointIds, []);
});

test('одинаковые точки: оставить одинарные — двойная убирается, её работы переходят на обе одинарные', () => {
  const data = project();
  data.entries.push({ id: 'e4', dayId: 'D1', workType: 'Протяжка', workId: 'PR', cableId: 'cat7', pointIds: ['d'] });
  data.journal.push({ id: 'e4_d', entryId: 'e4', pointId: 'd' });
  let ctx = buildContext(data);
  const g = findSameGroups([...ctx.points.values()])[0];
  const pv = previewMerge(g, 'singles', data, ctx);
  assert.deepEqual(pv.removed, ['d']);
  apply(data, mergeOps(g, 'singles', pv, data, ctx)); ctx = buildContext(data);
  assert.deepEqual(data.entries.find((e) => e.id === 'e4').pointIds, ['a', 'b']);
  assert.equal(pullFigures(data.entries.find((e) => e.id === 'e4'), ctx).count, 2);
  assert.ok(data.journal.some((r) => r.id === 'e4_a') && data.journal.some((r) => r.id === 'e4_b') && !data.journal.some((r) => r.pointId === 'd'));
});
