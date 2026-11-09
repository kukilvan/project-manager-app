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

test('одинаковые точки: одинарные на одной отметке подряд, двойной нет — первая становится двойной', () => {
  const data = project();
  // убрать двойную: остались FC/B05 + FC/B06 на одной отметке
  data.points = data.points.filter((p) => p.id !== 'd');
  const pos = { sheet: 'n.pdf', page: 0, x: 100, y: 50, w: 30, h: 6 };
  data.points.find((p) => p.id === 'a').pos = pos; data.points.find((p) => p.id === 'b').pos = { ...pos };
  data.points.find((p) => p.id === 'x').pos = { ...pos, y: 80 };   // FC/B07 — на другой отметке, не в группе
  let ctx = buildContext(data);
  const before = Object.fromEntries(data.entries.map((e) => [e.id, e.workType === 'Протяжка' ? JSON.stringify(pullFigures(e, ctx)) : itogShtuk(e, ctx)]));
  const gs = findSameGroups([...ctx.points.values()]);
  assert.equal(gs.length, 1); assert.equal(gs[0].double, null); assert.equal(gs[0].newLabel, 'FC/B05-06');
  const pv = previewMerge(gs[0], 'double', data, ctx);
  assert.deepEqual(pv.kept, ['a']); assert.deepEqual(pv.removed, ['b']);
  apply(data, mergeOps(gs[0], 'double', pv, data, ctx)); ctx = buildContext(data);
  const a = ctx.points.get('a'); assert.equal(a.label, 'FC/B05-06'); assert.deepEqual(a.cableOverride, [{ cable: 'cat7', count: 2 }]);
  assert.ok(!ctx.points.has('b'));
  const after = Object.fromEntries(data.entries.map((e) => [e.id, e.workType === 'Протяжка' ? JSON.stringify(pullFigures(e, ctx)) : itogShtuk(e, ctx)]));
  assert.deepEqual(after, before);   // в т. ч. запись e2, где была только FC/B05 (1 кабель)
});

test('кабели по номеру: одинарная точка сети — 1, двойная — 2, тройная — 3; свои значения и не сеть — не трогаются', async () => {
  const { cablesByLabel, cablesMismatch, planPointsImport, pointsImportOps } = await import('../src/domain/index.js');
  const data = project();
  data.types = [{ id: 'T', defaultCable: 'cat7', defaultCables: 2 }, { id: 'DOOR', defaultCable: '6005', defaultCables: 3 }];
  data.points.push({ id: 's', label: 'FC/B29', typeId: 'T', cabinet: 'FC' }, { id: 't', label: 'FC/B40-42', typeId: 'T', cabinet: 'FC' }, { id: 'dr', label: 'FC/D-01.1', typeId: 'DOOR', cabinet: 'FC' });
  const ctx = buildContext(data);
  assert.deepEqual(cablesByLabel(ctx.points.get('s'), ctx), [{ cable: 'cat7', count: 1 }]);
  assert.deepEqual(cablesByLabel(ctx.points.get('t'), ctx), [{ cable: 'cat7', count: 3 }]);
  assert.equal(cablesByLabel(ctx.points.get('d'), ctx), null);   // FC/B05-06 — 2, как у типа
  assert.equal(cablesByLabel(ctx.points.get('a'), ctx), null);   // своё cat7×1
  assert.equal(cablesByLabel(ctx.points.get('dr'), ctx), null);  // дверь: 6005×3 — не по номеру
  assert.deepEqual(cablesMismatch([...ctx.points.values()], ctx).map((x) => x.p.id).sort(), ['s', 't', 'y']);
  // разбор/импорт: новым одинарным сразу 1 кабель
  const plan = planPointsImport(ctx, { points: [{ label: 'FC/B60', typeId: 'T', cabinet: 'FC' }, { label: 'FC/B61-62', typeId: 'T', cabinet: 'FC' }] });
  const ops = pointsImportOps(plan, (() => { let i = 0; return () => `n${i++}`; })(), {});
  assert.deepEqual(ops.map((o) => o.data.cableOverride ?? null), [[{ cable: 'cat7', count: 1 }], null]);
});

test('кабели по номеру: тип бакара приходит из общего пула (новый проект) — одинарной всё равно 1 кабель', async () => {
  const { planPointsImport, pointsImportOps } = await import('../src/domain/index.js');
  const data = project(); data.types = [];
  const ctx = buildContext(data);
  const pool = new Map([['Бакар', { type: { id: 'Бакар', defaultCable: 'cat7', defaultCables: 2 }, devices: [], cables: [], works: [] }]]);
  const plan = planPointsImport(ctx, { points: [{ label: 'FC/B70', typeId: 'Бакар', cabinet: 'FC' }, { label: 'FC/B71-72', typeId: 'Бакар', cabinet: 'FC' }] }, pool);
  const ops = pointsImportOps(plan, (() => { let i = 0; return () => `n${i++}`; })(), {}).filter((o) => o.coll === 'points');
  assert.deepEqual(ops.map((o) => o.data.cableOverride ?? null), [[{ cable: 'cat7', count: 1 }], null]);
});
