// Свой набор работ точки: добавить, убрать, изменить количество (на точку или на каждый кабель) — поверх типа, устройств и кабелей.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContext, tasksOf, taskQty, pointInfo, workApplicable, workFits, worksSummary, ownWorksPatch, pullFigures } from '../src/domain/index.js';

function project(extra = []) {
  return buildContext({
    projects: [{ id: 'P' }], days: [{ id: 'D1', date: '2026-11-09' }],
    types: [{ id: 'Бакар', devices: [{ deviceId: 'DV_BAKAR', count: 1 }], cables: [] }, { id: 'Камера', devices: [{ deviceId: 'DV_CAM', count: 1 }], cables: [] },
      { id: 'Старый', defaultCable: 'cat7', defaultCables: 1 }],
    devices: [{ id: 'DV_BAKAR', name: 'Бакар', cables: [{ cable: 'cat7', count: 2 }], workIds: ['MET'] }, { id: 'DV_CAM', name: 'Камера', cables: [{ cable: 'cat7', count: 1 }], workIds: ['INS_CAM'] }],
    cables: [{ id: 'cat7', workIds: ['HIV_KEY', 'HIV_CAB'] }],
    catalog: [
      { id: 'MET', name: 'Установка метаэма пас-дин', workType: 'Установка', forTypes: ['Бакар'] },
      { id: 'INS_CAM', name: 'Установка камеры', workType: 'Установка', forTypes: ['Камера'] },
      { id: 'HIV_KEY', name: 'Хивут кистона на шетахе', workType: 'Хивут', forTypes: ['Бакар', 'Камера'] },
      { id: 'HIV_CAB', name: 'Хивут кистона в шкафу', workType: 'Хивут', forTypes: ['Бакар', 'Камера'] },
      { id: 'LBL', name: 'Наклейка', workType: 'Шилют' },
    ],
    points: [
      { id: 'd', label: 'FC/B05-06', typeId: 'Бакар', cabinet: 'FC' },
      { id: 's', label: 'FC/B07', typeId: 'Бакар', cabinet: 'FC', cableOverride: [{ cable: 'cat7', count: 1 }] },
      { id: 'c', label: 'FC/C01', typeId: 'Камера', cabinet: 'FC' },
      { id: 'o', label: 'FC/X01', typeId: 'Старый', cabinet: 'FC' },
      ...extra,
    ],
    entries: [], journal: [], pulls: [], configs: [], units: [], culprits: [], delayReasons: [], cabinetSettings: [],
  });
}
const qty = (p, ctx, workId) => tasksOf(p, ctx).filter((t) => t.workId === workId).reduce((n, t) => n + t.qty, 0);

test('по составу: метаэм — 1 на бакар (работа устройства), хивут кистона — на каждый кабель', () => {
  const ctx = project();
  assert.equal(qty(ctx.points.get('d'), ctx, 'MET'), 1);
  assert.equal(qty(ctx.points.get('d'), ctx, 'HIV_KEY'), 2);
  assert.equal(qty(ctx.points.get('s'), ctx, 'HIV_KEY'), 1);
});

test('метаэм на каждый кабель: двойному бакару 2, одинарному 1; в отчёте столько же; устройство за работой сохраняется', () => {
  const ctx0 = project();
  const ch = new Map([['MET', { op: 'set', qty: 1, per: 'cable' }]]);
  const d = { ...ctx0.points.get('d'), ownWorks: ownWorksPatch(ctx0.points.get('d'), ctx0, ch) };
  const s = { ...ctx0.points.get('s'), ownWorks: ownWorksPatch(ctx0.points.get('s'), ctx0, ch) };
  assert.deepEqual(d.ownWorks, [{ workId: 'MET', qty: 1, per: 'cable' }]);
  const ctx = project([]); ctx.points.set('d', d); ctx.points.set('s', s);
  assert.equal(qty(d, ctx, 'MET'), 2); assert.equal(qty(s, ctx, 'MET'), 1);
  assert.equal(tasksOf(d, ctx).find((t) => t.workId === 'MET').deviceId, 'DV_BAKAR');
  assert.equal(taskQty(d, ctx, { workType: 'Установка', workId: 'MET' }), 2);
  assert.equal(taskQty(s, ctx, { workType: 'Установка', workId: 'MET' }), 1);
});

test('добавить работу, которой нет в составе; убрать работу; вернуть как по составу', () => {
  const ctx = project();
  const c = ctx.points.get('c');
  // добавить «Наклейка» ×3 на камеру
  const add = ownWorksPatch(c, ctx, new Map([['LBL', { op: 'set', qty: 3, per: 'point' }]]));
  assert.deepEqual(add, [{ workId: 'LBL', qty: 3 }]);
  const c2 = { ...c, ownWorks: add }; ctx.points.set('c', c2);
  assert.equal(qty(c2, ctx, 'LBL'), 3);
  assert.equal(workFits(c2, ctx, ctx.catalog.get('LBL')), true);
  assert.equal(workApplicable(c2, ctx, ctx.catalog.get('LBL')), true);
  // убрать установку камеры — не требуется, не подходит, хотя отмечена для типа
  const rm = ownWorksPatch(c2, ctx, new Map([['INS_CAM', { op: 'remove' }]]));
  assert.deepEqual(rm, [{ workId: 'LBL', qty: 3 }, { workId: 'INS_CAM', qty: 0 }]);
  const c3 = { ...c2, ownWorks: rm }; ctx.points.set('c', c3);
  assert.equal(qty(c3, ctx, 'INS_CAM'), 0);
  assert.equal(workFits(c3, ctx, ctx.catalog.get('INS_CAM')), false);
  assert.equal(pointInfo(c3, ctx).stageStats['Установка'].total, 0);
  // как по составу — свои значения стираются
  assert.equal(ownWorksPatch(c3, ctx, new Map([['INS_CAM', { op: 'reset' }], ['LBL', { op: 'reset' }]])), null);
  // количество как по составу «на точку» — своё не записывается
  assert.equal(ownWorksPatch(c, ctx, new Map([['INS_CAM', { op: 'set', qty: 1, per: 'point' }]])), null);
  // убрать работу, которой нет в составе — нечего записывать
  assert.equal(ownWorksPatch(c, ctx, new Map([['LBL', { op: 'remove' }]])), null);
});

test('сводка по выбранным точкам: у скольких есть, разное количество, старая схема — отдельно', () => {
  const ctx = project();
  const { rows, skipped } = worksSummary([...ctx.points.values()], ctx);
  assert.deepEqual(skipped.map((p) => p.id), ['o']);
  const hk = rows.find((r) => r.workId === 'HIV_KEY');
  assert.deepEqual([hk.have, hk.min, hk.max], [3, 1, 2]);
  const met = rows.find((r) => r.workId === 'MET');
  assert.deepEqual([met.have, met.min, met.max], [2, 1, 1]);
  assert.ok(!rows.some((r) => r.workType === 'Протяжка'));
});

test('работа сделана: одна запись закрывает задачу целиком, в отчёте — количество по своему набору', () => {
  const base = project();
  const d = { ...base.points.get('d'), ownWorks: [{ workId: 'MET', qty: 1, per: 'cable' }] };
  const data = {
    projects: [{ id: 'P' }], days: [{ id: 'D1', date: '2026-11-09' }],
    types: [...base.types.values()], devices: [...base.devices.values()], cables: [...base.cables.values()], catalog: [...base.catalog.values()],
    points: [d], entries: [{ id: 'e1', dayId: 'D1', workType: 'Установка', workId: 'MET', pointIds: ['d'] }], journal: [{ id: 'e1_d', entryId: 'e1', pointId: 'd' }],
    pulls: [], configs: [], units: [], culprits: [], delayReasons: [], cabinetSettings: [],
  };
  const ctx = buildContext(data);
  const t = pointInfo(ctx.points.get('d'), ctx).tasks.find((x) => x.workId === 'MET');
  assert.equal(t.done, true); assert.equal(t.qty, 2);
  assert.equal(workApplicable(ctx.points.get('d'), ctx, ctx.catalog.get('MET')), false);
});

test('отчёт: «итог шт» по своему набору — метаэм на каждый кабель у двух двойных и одного одинарного бакара = 5', async () => {
  const { itogShtuk } = await import('../src/domain/index.js');
  const base = project();
  const own = [{ workId: 'MET', qty: 1, per: 'cable' }];
  const ctx = buildContext({
    projects: [{ id: 'P' }], days: [{ id: 'D1', date: '2026-11-09' }],
    types: [...base.types.values()], devices: [...base.devices.values()], cables: [...base.cables.values()], catalog: [...base.catalog.values()],
    points: [{ ...base.points.get('d'), ownWorks: own }, { ...base.points.get('d'), id: 'd2', label: 'FC/B01-02', ownWorks: own }, { ...base.points.get('s'), ownWorks: own }],
    entries: [], journal: [], pulls: [], configs: [], units: [], culprits: [], delayReasons: [], cabinetSettings: [],
  });
  assert.equal(itogShtuk({ workType: 'Установка', workId: 'MET', pointIds: ['d', 'd2', 's'] }, ctx), 5);
});
