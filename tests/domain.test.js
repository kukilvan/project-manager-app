// Checks the domain (src/domain/index.js): statuses, cables and meters, daily report, journal, labels, doors and devices, manager tables, imports and the server cache.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOG, POINT_TYPES, CABLES, UNITS, CULPRITS, DELAY_REASONS,
  generateLabels, parseSuffixes, buildContext, pointInfo, pointKey, sortNumber, comparePoints, entryLine, itogShtuk, dohHeader, doh,
} from '../src/domain/index.js';

const project = { id: 'P1', name: 'Mega Or', contractor: 'Megason', object: 'Mega Or', helper: 'Марина', helperHe: 'מרינה',
  nameHe: 'מגה אור', objectHe: 'מגה אור', oneOff: false };

function make(extra = {}) {
  return buildContext({
    projects: [project], points: [], days: [], entries: [], journal: [], cabinetSettings: [],
    catalog: CATALOG, types: POINT_TYPES, cables: CABLES, units: UNITS, culprits: CULPRITS, delayReasons: DELAY_REASONS,
    ...extra,
  });
}
// Helper: a day + entries with points → journal rows (as the app does when it saves an entry)
function scenario(pointsIn, daysIn, entriesIn) {
  const journal = [];
  entriesIn.forEach((e) => (e.pointIds || []).forEach((pid) => journal.push({ id: `${e.id}-${pid}`, entryId: e.id, pointId: pid })));
  return make({ points: pointsIn, days: daysIn, entries: entriesIn, journal });
}
const cam = { id: 'c1', projectId: 'P1', label: '1A-01', cabinet: '1A', typeId: 'Камера' };
const door = { id: 'd1', projectId: 'P1', label: '1A-D1', cabinet: '1A', typeId: 'Дверь', length: 20 };
const day = (id, date, extra = {}) => ({ id, projectId: 'P1', date, helper: 'Марина', helperHe: 'מרינה', ...extra });
const entry = (id, dayId, workType, workId, pointIds, extra = {}) => ({ id, dayId, workType, workId, pointIds, result: 'Работает', createdAt: Number(id.slice(1)), ...extra });

test('статус: Новая → Посчитана → Протянута → Захивучена → Установлена → Проверена', () => {
  const steps = [
    [[], 'Новая'],
    [[], 'Посчитана', { length: 10 }],
    [[entry('e1', 'D1', 'Протяжка', 'PR_PTS', ['c1'])], 'Протянута'],
    [[entry('e1', 'D1', 'Протяжка', 'PR_PTS', ['c1']), entry('e2', 'D1', 'Хивут', 'HIV_KEY', ['c1'])], 'Захивучена'],
    [[entry('e1', 'D1', 'Протяжка', 'PR_PTS', ['c1']), entry('e2', 'D1', 'Хивут', 'HIV_KEY', ['c1']), entry('e3', 'D1', 'Установка', 'INS_CAM', ['c1'])], 'Установлена'],
    [[entry('e1', 'D1', 'Протяжка', 'PR_PTS', ['c1']), entry('e3', 'D1', 'Установка', 'INS_CAM', ['c1']), entry('e4', 'D1', 'Проверка', 'CHK_FLUKE', ['c1'])], 'Проверена'],
  ];
  for (const [entries, expected, patch] of steps) {
    const ctx = scenario([{ ...cam, ...(patch || {}) }], [day('D1', '2026-10-05')], entries);
    assert.equal(pointInfo(ctx.points.get('c1'), ctx).status, expected);
  }
});

test('статус: проверка «Не работает» → Неисправна, а новая успешная проверка исправляет', () => {
  const bad = entry('e1', 'D1', 'Проверка', 'CHK_FLUKE', ['c1'], { result: 'Не работает' });
  let ctx = scenario([cam], [day('D1', '2026-10-05')], [bad]);
  assert.equal(pointInfo(ctx.points.get('c1'), ctx).status, 'Неисправна');
  assert.equal(pointInfo(ctx.points.get('c1'), ctx).statusHe, 'תקלה');
  const good = entry('e2', 'D2', 'Проверка', 'CHK_FLUKE', ['c1']);
  ctx = scenario([cam], [day('D1', '2026-10-05'), day('D2', '2026-10-06')], [bad, good]);
  assert.equal(pointInfo(ctx.points.get('c1'), ctx).status, 'Проверена');
});

test('кабели и метраж: значения типа, переопределение по шкафу, метраж = длина × кабелей', () => {
  let ctx = make({ points: [{ ...cam, length: 15 }, door] });
  assert.deepEqual([pointInfo(ctx.points.get('c1'), ctx).cable, pointInfo(ctx.points.get('c1'), ctx).cables, pointInfo(ctx.points.get('c1'), ctx).metrage], ['cat7', 1, 15]);
  assert.deepEqual([pointInfo(ctx.points.get('d1'), ctx).cable, pointInfo(ctx.points.get('d1'), ctx).cables, pointInfo(ctx.points.get('d1'), ctx).metrage], ['6005', 3, 60]);
  const bakar = { id: 'b1', projectId: 'P1', label: '1A-B1', cabinet: '1A', typeId: 'Бакар', length: 10 };
  ctx = make({ points: [bakar, { ...bakar, id: 'b2', cabinet: '1B' }], cabinetSettings: [{ id: 's', projectId: 'P1', cabinet: '1A', typeId: 'Бакар', cables: 4, cable: 'cat7' }] });
  assert.equal(pointInfo(ctx.points.get('b1'), ctx).cables, 4); assert.equal(pointInfo(ctx.points.get('b1'), ctx).metrage, 40);
  assert.equal(pointInfo(ctx.points.get('b2'), ctx).cables, 2); // another cabinet — the type default
});

test('естественная сортировка точек: 2 раньше 10, подномера, шкаф и тип', () => {
  const labels = ['1A-10', '1A-2', '1A-2.5', '1A-1', '1B-1'];
  const sorted = labels.map((label) => ({ label, cabinet: label.slice(0, 2), typeId: 'Камера' })).sort(comparePoints).map((p) => p.label);
  assert.deepEqual(sorted, ['1A-1', '1A-2', '1A-2.5', '1A-10', '1B-1']);
  assert.equal(sortNumber('1A-01-02'), 2); assert.equal(sortNumber('без цифр'), 0);
  assert.equal(pointKey('1A-12'), '1A||00012|000');
});

test('строки записей RU/HE по формулам Приложения А', () => {
  const p1 = { ...cam, id: 'c1', length: 10 }; const p2 = { ...cam, id: 'c2', label: '1A-02', length: 12 };
  const d = day('D1', '2026-10-05');
  const mk = (e) => scenario([p1, p2], [d], [e]);
  let e = entry('e1', 'D1', 'Установка', 'INS_CAM', ['c1', 'c2']);
  assert.equal(entryLine(e, mk(e)), 'Установка камеры 2 шт');
  assert.equal(entryLine(e, mk(e), 'he'), "התקנת מצלמה 2 יח'");
  e = entry('e1', 'D1', 'Проверка', 'CHK_FLUKE', ['c1'], { result: 'Не работает' });
  assert.equal(entryLine(e, mk(e)), 'Проверка кабеля Fluke 1 шт (не работает)');
  assert.equal(entryLine(e, mk(e), 'he'), "בדיקת כבל Fluke 1 יח' (לא תקין)");
  e = entry('e1', 'D1', 'Протяжка', 'PR_PTS', ['c1', 'c2'], { cableId: 'cat7' }); // cat7 — count points
  assert.equal(entryLine(e, mk(e)), 'Протяжка cat7: 2 точек');
  assert.equal(entryLine(e, mk(e), 'he'), 'השחלת כבל CAT7: 2 נקודות');
  e = entry('e1', 'D1', 'Протяжка', 'PR_PTS', ['d1'], { cableId: '6005', minutes: 30, note: 'через потолок' });
  const ctxD = scenario([door], [d], [e]); // 6005 — meters: 3 cables × 20 m = 60 m
  assert.equal(entryLine(e, ctxD), 'Протяжка 6005: 3 каб., 60 м, 30 мин. через потолок');
  assert.equal(entryLine(e, ctxD, 'he'), 'השחלת כבל 6005: 3 כבלים, 60 מטר, 30 דקות. через потолок');
  e = entry('e1', 'D1', 'Протяжка', 'PR_MAN', [], { cableId: '6005', quantity: 4, meters: 80 });
  assert.equal(entryLine(e, mk(e)), 'Протяжка 6005: 4 каб., 80 м');
  e = entry('e1', 'D1', 'Время', 'T_WAIT', [], { minutes: 45, culprit: 'Электрики', note: 'нет доступа' });
  assert.equal(entryLine(e, mk(e)), 'Ожидание 45 мин (Электрики). нет доступа');
  assert.equal(entryLine(e, mk(e), 'he'), 'המתנה 45 דקות (חשמלאים). нет доступа');
  e = entry('e1', 'D1', 'Доп. работа', 'EX_TAALA', [], { quantity: 12.5 });
  assert.equal(entryLine(e, mk(e)), 'Установка таалы 12.5 м');
  assert.equal(itogShtuk(e, mk(e)), 12.5);
  e = entry('e1', 'D1', 'Доп. работа', 'EX_ARON_HIV', [], { quantity: 1, minutes: 90 }); // unit «min» → a time row
  assert.equal(entryLine(e, mk(e)), 'Хивут арона бакары 1 ч 30 мин'); assert.equal(itogShtuk(e, mk(e)), 0);
  e = entry('e1', 'D1', 'Текст', undefined, [], { note: 'Продолжение протяжки оптики' }); // free-text row
  assert.equal(entryLine(e, mk(e)), 'Продолжение протяжки оптики');
});

test('дох дня: шапка (сам / с помощником / разовый) и строки работ', () => {
  const p1 = { ...cam, length: 10 };
  const d = day('D1', '2026-10-05');
  const e1 = entry('e1', 'D1', 'Хивут', 'HIV_KEY', ['c1']); const e2 = entry('e2', 'D1', 'Время', 'T_SIYUR', [], { minutes: 20 });
  const ctx = scenario([p1], [d], [e1, e2]);
  assert.equal(dohHeader(d, ctx), '05.10.2026 Megason Mega Or с Марина');
  assert.equal(dohHeader(d, ctx, 'he'), '05.10.2026 מגה אור מגה אור עם מרינה');
  assert.equal(doh(d, ctx), '05.10.2026\nMegason Mega Or с Марина\n\nХивут кистона 1 шт\n\nСиюр 20 мин');
  const solo = { ...d, helper: 'сам', helperHe: 'сам', comment: 'всё по плану' };
  const ctx2 = scenario([p1], [solo], [e1]);
  assert.equal(doh(solo, ctx2), '05.10.2026\nMegason Mega Or сам\n\nХивут кистона 1 шт\n\nвсё по плану');
  assert.match(doh(solo, ctx2, 'he'), /לבד/);
  const oneOff = { ...d, object: 'Склад Хайфа' };
  const ctx3 = buildContext({ ...{ projects: [{ ...project, oneOff: true }], points: [p1], days: [oneOff], entries: [e1], journal: [], cabinetSettings: [],
    catalog: CATALOG, types: POINT_TYPES, cables: CABLES, units: UNITS, culprits: CULPRITS, delayReasons: DELAY_REASONS } });
  assert.equal(dohHeader(oneOff, ctx3), '05.10.2026 Склад Хайфа с Марина');
});

test('журнал: правки без записи, мягкое удаление записи/точки убирает вклад в статусы', () => {
  const j = [{ id: 'x1', pointId: 'c1', editDate: '2026-10-03', editWorkId: 'HIV_KEY' }];
  let ctx = make({ points: [cam], journal: j });
  assert.equal(pointInfo(ctx.points.get('c1'), ctx).status, 'Захивучена'); assert.equal(pointInfo(ctx.points.get('c1'), ctx).hived, '2026-10-03');
  const e = entry('e1', 'D1', 'Проверка', 'CHK_FLUKE', ['c1']);
  ctx = make({ points: [cam], days: [day('D1', '2026-10-05')], entries: [{ ...e, deleted: true }], journal: [{ id: 'j1', entryId: 'e1', pointId: 'c1' }] });
  assert.equal(pointInfo(ctx.points.get('c1'), ctx).status, 'Новая'); // a deleted entry does not count
  ctx = make({ points: [{ ...cam, deleted: true }], journal: j });
  assert.equal(ctx.points.size, 0);
});

test('даты этапов: берётся максимальная дата, а не порядок ввода', () => {
  const es = [entry('e1', 'D2', 'Хивут', 'HIV_KEY', ['c1']), entry('e2', 'D1', 'Хивут', 'HIV_KEY', ['c1'])];
  const ctx = scenario([cam], [day('D1', '2026-10-01'), day('D2', '2026-10-07')], es);
  assert.equal(pointInfo(ctx.points.get('c1'), ctx).hived, '2026-10-07');
});

test('генератор точек: диапазон, шаг, ведущие нули, пара, суффиксы', () => {
  assert.deepEqual(generateLabels({ prefix: '1A-', from: 1, to: 3 }), ['1A-1', '1A-2', '1A-3']);
  assert.deepEqual(generateLabels({ prefix: '1A-', from: 1, to: 6, step: 2, digits: 2 }), ['1A-01', '1A-03', '1A-05']);
  assert.deepEqual(generateLabels({ prefix: '1A-', from: 1, to: 5, step: 2, digits: 2, pair: true }), ['1A-01-02', '1A-03-04', '1A-05-06']);
  assert.deepEqual(generateLabels({ prefix: 'C', from: 7, to: 8, suffixes: parseSuffixes(' A, B ,, ') }), ['C7A', 'C7B', 'C8A', 'C8B']);
  assert.deepEqual(generateLabels({ from: 5, to: 1 }), []); // «to» is less than «from»
  assert.equal(generateLabels({ from: 1, to: 999999 }).length, 2000); // guard against an accidental million points
});

test('месячный отчёт: дохи подряд, часы и сводка протяжки', async () => {
  const { buildContext, monthReportRu, monthSummary, monthReportHe, CATALOG, CABLES, CULPRITS, UNITS, POINT_TYPES } = await import('../src/domain/index.js');
  const mk = (a) => a.map((x) => ({ ...x }));
  const data = {
    projects: [{ id: 'p', name: 'P', contractor: 'Мегасон', object: 'Модиин', helper: 'Мариной', nameHe: 'מגה', objectHe: 'מודיעין', helperHe: 'מרינה' }],
    points: [], catalog: mk(CATALOG), cables: mk(CABLES), culprits: mk(CULPRITS), units: mk(UNITS), types: mk(POINT_TYPES), configs: [], delayReasons: [], cabinetSettings: [], journal: [],
    days: [{ id: 'd1', projectId: 'p', date: '2026-09-01' }, { id: 'd2', projectId: 'p', date: '2026-09-02' }, { id: 'd3', projectId: 'p', date: '2026-10-01' }],
    entries: [
      { id: 'e1', dayId: 'd1', workType: 'Протяжка', workId: 'PR_MAN', cableId: '6005', quantity: 5, meters: 60 },
      { id: 'e2', dayId: 'd1', workType: 'Время', workId: 'T_WAIT', minutes: 90 },
      { id: 'e3', dayId: 'd2', workType: 'Протяжка', workId: 'PR_MAN', cableId: '6005', quantity: 2, meters: 120 },
      { id: 'e4', dayId: 'd2', workType: 'Доп. работа', workId: 'EX_MERIRON', quantity: 16 },
      { id: 'e5', dayId: 'd3', workType: 'Время', workId: 'T_WAIT', minutes: 600 },
    ],
  };
  const ctx = buildContext(data);
  const ru = monthReportRu(ctx, '2026-09');
  assert.ok(ru.startsWith('Дохот\n\n\n01.09.2026\nМегасон Модиин с Мариной'));
  assert.ok(!ru.includes('01.10.2026'));
  const s = monthSummary(ctx, '2026-09');
  assert.equal(s.days, 2); assert.equal(s.hours, 1.5);
  assert.deepEqual(s.pulls.map((p) => [p.cableId, p.count, p.meters]), [['6005', 7, 180]]);
  assert.equal(s.works[0].qty, 16);
  assert.ok(monthReportHe(ctx, '2026-09').includes('דוח חודשי – ספטמבר 2026'));
});

test('рабочие дни месяца по всем проектам: только дата и место', async () => {
  const { workdaysReport } = await import('../src/domain/index.js');
  const projects = [
    { id: 'a', name: 'A', contractor: 'Мегасон', object: 'Модиин', helper: 'Мариной' },
    { id: 'b', name: 'B', contractor: 'Электра', object: 'Тель-Авив', helper: 'Лешей и Ильёй' },
  ];
  const days = [
    { id: '3', projectId: 'a', date: '2026-09-23', comment: 'не должен попасть' },
    { id: '1', projectId: 'b', date: '2026-09-22', helper: 'Лешей и Ильёй' },
    { id: '2', projectId: 'a', date: '2026-10-01' },
    { id: '4', projectId: 'a', date: '2026-09-01', deleted: true },
  ];
  const r = workdaysReport(days, projects, '2026-09');
  assert.equal(r.count, 2);
  assert.equal(r.text, 'Рабочие дни за сентябрь 2026\n\n22.09.2026\nЭлектра Тель-Авив с Лешей и Ильёй\n\n23.09.2026\nМегасон Модиин с Мариной');
});

test('старые точки (без состава): установка — любая запись «Установка» в журнале', async () => {
  const { buildContext, pointInfo, POINT_TYPES, CATALOG } = await import('../src/domain/index.js');
  const ctx = buildContext({
    projects: [{ id: 'p' }], types: POINT_TYPES, catalog: CATALOG,
    points: [{ id: 'w', projectId: 'p', label: 'W-1', typeId: 'Вайфай', length: 5 }, { id: 'b', projectId: 'p', label: 'B-1', typeId: 'Бакар', length: 5 }],
    journal: [{ id: 'j1', pointId: 'w', editDate: '2026-10-01', editWorkId: 'INS_AP' }],
  });
  assert.equal(pointInfo(ctx.points.get('w'), ctx).install, 'Установлено');
  assert.equal(pointInfo(ctx.points.get('b'), ctx).install, '');
});

test('тип-дверь определяется по названию «Дверь» или группе «Дверь»', async () => {
  const { usesConfig } = await import('../src/domain/index.js');
  assert.ok(usesConfig({ id: 'Дверь' })); assert.ok(usesConfig({ id: 'Дверь 2', group: 'Дверь' }));
  assert.ok(!usesConfig({ id: 'Камера' })); assert.ok(!usesConfig(undefined));
});

// ---- manager tables (profiles and assembly) ----
const reportData = async () => {
  const { buildContext, POINT_TYPES, CATALOG } = await import('../src/domain/index.js');
  const data = {
    projects: [{ id: 'p1', name: 'Mega Or', contractor: 'Megason', object: 'Mega Or', nameHe: 'מגה אור', objectHe: 'מגה אור' }],
    points: [
      { id: 'a', projectId: 'p1', label: '1A-C01', typeId: 'Камера', cabinet: '1A', length: 70, planName: 'C-71' },
      { id: 'b', projectId: 'p1', label: '1A-D01', typeId: 'Дверь', cabinet: '1A' },
      { id: 'c', projectId: 'p1', label: '2B-C01', typeId: 'Камера', cabinet: '2B' },
      { id: 'd', projectId: 'p1', label: 'G-01', typeId: 'Галай' },
    ],
    types: POINT_TYPES, catalog: CATALOG, cables: [{ id: 'cat7', nameHe: 'כבל CAT7' }],
    journal: [
      { id: 'j1', pointId: 'a', editDate: '2026-10-03', editWorkId: 'PR_PTS', createdBy: 'u1' },
      { id: 'j2', pointId: 'a', editDate: '2026-10-04', editWorkId: 'CHK_FLUKE', createdBy: 'u1' },
      { id: 'j3', pointId: 'b', editDate: '2026-10-05', editWorkId: 'INS_KORE' },
    ],
  };
  return { ctx: buildContext(data), project: data.projects[0], data };
};

test('таблица: профиль выбирает шкафы, типы, столбцы и их порядок', async () => {
  const { buildReport, defaultTables, sheetSerial } = await import('../src/domain/index.js');
  const { ctx, project } = await reportData();
  const ext = { ...defaultTables()[1], columns: ['planName', 'label', 'pulled'], cabinets: ['1A'], types: ['Камера'] };
  const r = buildReport(project, ctx, ext);
  const sh = r.sheets[0];
  assert.equal(r.pointCount, 1);
  assert.deepEqual(sh.rows[sh.headerRow], ['Имя в плане', 'Обозначение', 'Протянуто']);
  assert.deepEqual(sh.rows[sh.headerRow + 1], ['Камера — 1 точка']); // the section row comes first
  assert.deepEqual(sh.rows[sh.headerRow + 2], ['C-71', '1A-C01', sheetSerial('2026-10-03')]);
  // with no cabinet, picked as a separate value
  const none = buildReport(project, ctx, { ...ext, cabinets: ['__none'], types: [] });
  assert.equal(none.pointCount, 1); assert.equal(none.sheets[0].rows[none.sheets[0].headerRow + 2][1], 'G-01');
  assert.throws(() => buildReport(project, ctx, { ...ext, columns: [] }), /ни один столбец/);
});

test('таблица: язык, «—» для этапов, которых у типа нет, частичная установка и итоги', async () => {
  const { buildReport, defaultTables } = await import('../src/domain/index.js');
  const { ctx, project } = await reportData();
  const he = buildReport(project, ctx, { ...defaultTables()[0], columns: ['label', 'type', 'installed', 'checked', 'shilut', 'status'] });
  const sh = he.sheets[0]; const rows = sh.rows.slice(sh.headerRow);
  assert.deepEqual(rows[0], ['נקודה', 'סוג', 'הותקן', 'נבדק', 'שילוט', 'סטטוס']);
  assert.equal(he.sheets[0].rtl, true);
  const byLabel = Object.fromEntries(rows.slice(1).map((r) => [r[0], r]));
  assert.equal(byLabel['G-01'][3], '—'); assert.equal(byLabel['G-01'][4], '—'); // a detector has no check and no shilut
  assert.equal(byLabel['1A-D01'][2], 46300);   // installation date
  assert.equal(byLabel['1A-C01'][5], 'נבדק');
  const ru = buildReport(project, ctx, { ...defaultTables()[1], columns: ['label', 'installed', 'status', 'checkResult'] });
  const rr = Object.fromEntries(ru.sheets[0].rows.slice(ru.sheets[0].headerRow + 1).map((r) => [r[0], r]));
  assert.equal(rr['1A-D01'][2], 'Установлена'); assert.equal(rr['1A-C01'][3], 'Работает');
  // totals on top: 4 in all, 1 pulled, 1 checked
  assert.deepEqual(ru.sheets[0].rows[3].slice(0, 6), [4, 1, 0, 1, 0, 1]);
  assert.ok(!JSON.stringify(ru.sheets[0].rows).includes('=')); // no formulas
});

test('таблица: раскладка «шкаф на листе», названия листов и фильтр по статусу', async () => {
  const { buildReport, defaultTables } = await import('../src/domain/index.js');
  const { ctx, project } = await reportData();
  const t = { ...defaultTables()[1], columns: ['label'], layout: 'perCabinet' };
  const r = buildReport(project, ctx, t);
  assert.deepEqual(r.sheets.map((x) => x.title), ['1A', '2B', 'Без шкафа', 'Итоги по шкафам']); // the rack sheet is last
  assert.equal(r.sheets[0].count, 2);
  const faulty = buildReport(project, ctx, { ...t, layout: 'one', statuses: ['Неисправна'] });
  assert.equal(faulty.pointCount, 0);
  assert.notEqual(r.hash, buildReport(project, ctx, { ...t, layout: 'one' }).hash);
});

test('таблица: основная всегда одна, профили по умолчанию', async () => {
  const { tablesOf, mainTable, withTable } = await import('../src/domain/index.js');
  assert.equal(tablesOf({}).length, 2); assert.equal(mainTable({}).name, 'Для руководства');
  const next = withTable({}, 't_ext', { main: true });
  assert.deepEqual(next.map((t) => t.main), [false, true]);
});

test('таблица: создание файла и пересборка листов через Google API (заглушка)', async () => {
  const { syncTable } = await import('../src/app/managers.js');
  const { defaultTables } = await import('../src/domain/index.js');
  const { ctx, project } = await reportData();
  const calls = []; const files = {};
  const api = {
    fileInfo: async (id) => files[id] || null,
    create: async (title) => { files.F1 = { id: 'F1', name: 'x' }; calls.push(['create', title]); return files.F1; },
    rename: async (id, name) => calls.push(['rename', name]),
    sheetsOf: async () => [{ sheetId: 0, title: 'Sheet1' }],
    batch: async (id, reqs) => calls.push(['batch', reqs]),
    write: async (id, data) => calls.push(['write', data]),
  };
  const table = defaultTables()[0];
  const r1 = await syncTable(api, project, ctx, table, { uid: 'u1' });
  assert.equal(r1.changed, true); assert.equal(r1.patch.fileId, 'F1'); assert.equal(r1.patch.by, 'u1');
  const reqs = calls.find((c) => c[0] === 'batch')[1];
  assert.ok(reqs[0].addSheet && reqs.some((q) => q.deleteSheet) && reqs.some((q) => q.setBasicFilter) && reqs.some((q) => q.addConditionalFormatRule));
  assert.equal(reqs[0].addSheet.properties.rightToLeft, true);
  const wr = calls.find((c) => c[0] === 'write')[1][0];
  assert.equal(wr.range, "'סטטוס'!A1");
  // unchanged data on a repeat run: the file is not touched; a foreign file — a clear error
  const t2 = { ...table, ...r1.patch };
  calls.length = 0;
  const r2 = await syncTable(api, project, ctx, t2, { uid: 'u1' });
  assert.equal(r2.changed, false); assert.ok(!calls.some((c) => c[0] === 'batch'));
  delete files.F1;
  await assert.rejects(() => syncTable(api, project, ctx, { ...t2, by: 'u1' }, { uid: 'u2' }), /другой участник/);
});

test('таблица: время обновления в израильском времени, летом и зимой, на двух языках', async () => {
  const { stampText } = await import('../src/domain/index.js');
  assert.equal(stampText(new Date('2026-11-16T00:00:00Z'), 'he'), 'עודכן: 16/11/2026 02:00');
  assert.equal(stampText(new Date('2026-11-16T00:00:00Z'), 'ru'), 'Обновлено: 16/11/2026 02:00');
  assert.equal(stampText(new Date('2026-07-01T00:00:00Z'), 'he'), 'עודכן: 01/07/2026 03:00');
  assert.equal(stampText(new Date('2026-07-01T00:00:00Z'), 'ru'), 'Обновлено: 01/07/2026 03:00');
  assert.equal(stampText(new Date('2026-12-31T22:30:00Z'), 'ru'), 'Обновлено: 01/01/2027 00:30'); // midnight is 00, not 24
});

test('таблица: строки сверху — итоги, легенда цветов, пустая строка, шапка; время вне строк', async () => {
  const { buildReport, defaultTables } = await import('../src/domain/index.js');
  const { ctx, project } = await reportData();
  const now = new Date('2026-11-16T00:00:00Z');
  const ru = buildReport(project, ctx, { ...defaultTables()[1], columns: ['label', 'status'], sections: false }, { now }).sheets[0];
  assert.equal(ru.headerRow, 6); assert.equal(ru.frozenRows, 7); assert.equal(ru.legendRow, 4);
  assert.deepEqual(ru.rows[4], ['Выполнено', 'В работе', 'Частично', 'Неисправность', '— не относится к типу', 'Пусто — ещё не сделано']);
  assert.deepEqual(ru.rows[5], []);
  assert.deepEqual(ru.rows[6], ['Обозначение', 'Статус']);
  assert.deepEqual(ru.stamp, { row: 1, col: 4, text: 'Обновлено: 16/11/2026 02:00' });
  assert.ok(!JSON.stringify(ru.rows).includes('Обновлено')); // the stamp is not in rows, so not in the hash
  assert.deepEqual(ru.pointRuns, [[7, ru.rows.length]]); assert.deepEqual(ru.sectionRows, []);
  assert.equal(ru.rowColors.length, ru.rows.length - 7);
  // without totals the legend is row 3 (index 2) and the header index 4
  const he = buildReport(project, ctx, { ...defaultTables()[0], summary: false, columns: ['label'] }, { now }).sheets[0];
  assert.equal(he.headerRow, 4); assert.equal(he.frozenRows, 5); assert.equal(he.legendRow, 2);
  assert.deepEqual(he.rows[2], ['בוצע', 'בתהליך', 'בוצע חלקית', 'תקלה', '— לא רלוונטי לסוג', 'ריק — טרם בוצע']);
  assert.deepEqual(he.rows[4], ['נקודה']); assert.equal(he.stamp.text, 'עודכן: 16/11/2026 02:00');
  // no points: the legend and the header stay, no point rows to frame
  const none = buildReport(project, ctx, { ...defaultTables()[1], columns: ['label'], statuses: ['Неисправна'] }, { now }).sheets[0];
  assert.equal(none.rows.length, 7); assert.deepEqual(none.pointRuns, []);
});

test('таблица: время обновления не входит в хэш, другое содержимое — входит', async () => {
  const { buildReport, defaultTables } = await import('../src/domain/index.js');
  const { ctx, project } = await reportData();
  const t = { ...defaultTables()[0], columns: ['label', 'installed'] };
  const a = buildReport(project, ctx, t, { now: new Date('2026-11-16T00:00:00Z') });
  const b = buildReport(project, ctx, t, { now: new Date('2026-11-17T09:30:00Z') });
  assert.equal(a.hash, b.hash); assert.notEqual(a.sheets[0].stamp.text, b.sheets[0].stamp.text);
  assert.notEqual(a.hash, buildReport(project, ctx, { ...t, lang: 'ru' }).hash);
  assert.ok(buildReport(project, ctx, t).sheets[0].stamp.text.startsWith('עודכן: ')); // `now` defaults to the current time
});

test('таблица: запросы форматирования — легенда, рамки, без розового, закрепление строк', async () => {
  const { buildReport, defaultTables } = await import('../src/domain/index.js');
  const { sheetRequests } = await import('../src/app/managers.js');
  const { ctx, project } = await reportData();
  const sh = buildReport(project, ctx, { ...defaultTables()[1], columns: ['label', 'pulled', 'installed'], sections: false }).sheets[0];
  assert.ok(!sh.rules.some((r) => r.kind === 'blank'));
  assert.ok(sh.rules.some((r) => r.kind === 'number')); assert.ok(sh.rules.some((r) => r.kind === 'eq' && r.text === '—'));
  const reqs = sheetRequests(7, sh);
  const text = JSON.stringify(reqs);
  assert.ok(!text.includes('COUNTA') && !text.includes('0.9882352')); // no «empty cell → pink» rule, no pink anywhere
  const borders = reqs.map((q, i) => ({ b: q.updateBorders, i })).filter((x) => x.b);
  const legend = borders.find((x) => x.b.range.startRowIndex === sh.legendRow);
  assert.equal(legend.b.range.endColumnIndex, 6); assert.equal(legend.b.top.style, 'SOLID');
  const run = borders.find((x) => x.b.range.startRowIndex === 7);
  assert.equal(run.b.range.endRowIndex, sh.rows.length); assert.equal(run.b.top.style, 'SOLID'); assert.equal(run.b.innerHorizontal.style, 'SOLID');
  const head = borders.find((x) => x.b.range.startRowIndex === sh.headerRow);
  assert.equal(head.b.top.style, 'SOLID_THICK'); assert.equal(head.b.innerVertical.style, 'SOLID');
  assert.ok(run.i < head.i); // the header frame is sent after the point-row borders
  assert.equal(reqs.filter((q) => q.repeatCell && q.repeatCell.range.startRowIndex === sh.legendRow).length, 6);
  const wrap = reqs.find((q) => q.repeatCell && q.repeatCell.range.startRowIndex === sh.legendRow);
  assert.equal(wrap.repeatCell.cell.userEnteredFormat.wrapStrategy, 'WRAP');
  assert.ok(reqs.some((q) => q.repeatCell && q.repeatCell.range.startRowIndex === 1 && q.repeatCell.range.startColumnIndex === 4)); // the stamp cell look
  assert.equal(reqs.find((q) => q.setBasicFilter).setBasicFilter.filter.range.startRowIndex, sh.headerRow);
});

test('таблица: пересборка пишет время в E2 вместе со значениями и закрепляет строки до шапки', async () => {
  const { syncTable } = await import('../src/app/managers.js');
  const { defaultTables } = await import('../src/domain/index.js');
  const { ctx, project } = await reportData();
  const calls = [];
  const api = {
    fileInfo: async () => ({ id: 'F1', name: 'x' }), rename: async () => {}, sheetsOf: async () => [{ sheetId: 0, title: 'Sheet1' }],
    batch: async (id, reqs) => calls.push(['batch', reqs]), write: async (id, data) => calls.push(['write', data]),
  };
  const table = { ...defaultTables()[0], fileId: 'F1' };
  await syncTable(api, project, ctx, table, { now: new Date('2026-11-16T00:00:00Z') });
  assert.equal(calls.find((c) => c[0] === 'batch')[1][0].addSheet.properties.gridProperties.frozenRowCount, 7);
  const data = calls.find((c) => c[0] === 'write')[1];
  assert.deepEqual(data.map((d) => d.range), ["'סטטוס'!A1", "'סטטוס'!E2", "'התקדמות לפי ארון'!A1", "'התקדמות לפי ארון'!E2"]);
  assert.deepEqual(data[1].values, [['עודכן: 16/11/2026 02:00']]);
});

test('таблица: данные не менялись — одна запись времени, без пересборки; если запись не прошла — пересборка', async () => {
  const { syncTable } = await import('../src/app/managers.js');
  const { defaultTables } = await import('../src/domain/index.js');
  const { ctx, project } = await reportData();
  const calls = []; let failStamp = false;
  const api = {
    fileInfo: async () => ({ id: 'F1', name: 'x' }), rename: async (id, name) => calls.push(['rename', name]), sheetsOf: async () => [{ sheetId: 0, title: 'Sheet1' }],
    batch: async (id, reqs) => calls.push(['batch', reqs]),
    write: async (id, data) => { if (failStamp && data.length === 2) throw new Error('Unable to parse range'); calls.push(['write', data]); },
  };
  const first = await syncTable(api, project, ctx, { ...defaultTables()[0], fileId: 'F1' }, { now: new Date('2026-11-16T00:00:00Z') });
  const table = { ...defaultTables()[0], fileId: 'F1', hash: first.patch.hash };
  calls.length = 0;
  const same = await syncTable(api, project, ctx, table, { now: new Date('2026-11-17T01:00:00Z') });
  assert.equal(same.changed, false); assert.equal(same.patch.hash, undefined); assert.match(same.message, /данные не менялись/);
  assert.deepEqual(calls.filter((c) => c[0] !== 'rename').map((c) => c[0]), ['write']); // exactly one write, no batch
  assert.deepEqual(calls.find((c) => c[0] === 'write')[1], [{ range: "'סטטוס'!E2", values: [['עודכן: 17/11/2026 03:00']] }, { range: "'התקדמות לפי ארון'!E2", values: [['עודכן: 17/11/2026 03:00']] }]);
  // an editor renamed the tab: the stamp write fails and the file is rebuilt
  failStamp = true; calls.length = 0;
  const rebuilt = await syncTable(api, project, ctx, table, { now: new Date('2026-11-17T01:00:00Z') });
  assert.equal(rebuilt.changed, true); assert.equal(rebuilt.patch.hash, first.patch.hash);
  assert.deepEqual(calls.filter((c) => c[0] !== 'rename').map((c) => c[0]), ['batch', 'write']);
  // the rebuild fails too: the error comes out with the patch, as before
  api.batch = async () => { throw new Error('boom'); };
  await assert.rejects(() => syncTable(api, project, ctx, table, { now: new Date() }), (e) => e.message === 'boom' && !!e.patch);
});

test('сервер: ночное автообновление таблиц', async () => {
  const { updateProjectTables, applyPatches, autoTables } = await import('../scripts/server-tables-lib.mjs');
  const { defaultTables } = await import('../src/domain/index.js');
  const { project, data } = await reportData();
  const [main, ext] = defaultTables();
  const proj = { ...project, tables: [{ ...main, fileId: 'F1', by: 'u1' }, { ...ext, fileId: 'F2' }] };
  assert.deepEqual(autoTables(proj).map((t) => t.id), ['t_main']); // an extended table without the tick is not updated
  const calls = []; const stamps = []; const files = { F1: { id: 'F1', name: 'x' } };
  const api = {
    fileInfo: async (id) => files[id] || null, rename: async () => {}, sheetsOf: async () => [{ sheetId: 0, title: 'S' }],
    batch: async (id, reqs) => calls.push(['batch', id, reqs.length]),
    write: async (id, data) => { calls.push(['write', id]); data.filter((d) => d.range.endsWith('!E2')).forEach((d) => stamps.push(d.values[0][0])); },
  };
  const r = await updateProjectTables(api, proj, data, new Date('2026-10-11T00:00:00Z'));
  assert.equal(r.patches.t_main.serverError, ''); assert.ok(r.patches.t_main.hash); assert.equal(r.patches.t_main.by, undefined);
  assert.ok(calls.some((c) => c[0] === 'write' && c[1] === 'F1'));
  assert.deepEqual(stamps, ['עודכן: 11/10/2026 03:00', 'עודכן: 11/10/2026 03:00']); // the stamp is the job's start time (Israel summer time)
  // the same data the next night: only the stamp is written
  const r1 = await updateProjectTables(api, { ...proj, tables: applyPatches(proj, r.patches) }, data, new Date('2026-10-12T00:00:00Z'));
  assert.equal(r1.report[0], 'Для руководства: без изменений'); assert.equal(stamps.at(-1), 'עודכן: 12/10/2026 03:00');
  // the file is unavailable to the server: no new one is created, the error is written to the profile
  delete files.F1;
  const r2 = await updateProjectTables(api, proj, data, new Date());
  assert.match(r2.patches.t_main.serverError, /не видит файл/);
  assert.equal(applyPatches(proj, r2.patches)[0].fileId, 'F1');
});

test('экономия чтений: когда читать всё, а когда только изменения', async () => {
  const { decideMode, maxMillis, lastSaturday } = await import('../src/domain/sync.js');
  const now = 1_800_000_000_000; const ok = { last: now - 1000, full: now - 1000, n: 100 };
  assert.equal(decideMode(null, 100, now), 'full');                         // first run
  assert.equal(decideMode(ok, 100, now), 'delta');                          // cache is complete
  assert.equal(decideMode(ok, 120, now), 'delta');                          // cache holds more than remembered
  assert.equal(decideMode(ok, 80, now), 'full');                            // cache is incomplete (for example, partly cleared)
  assert.equal(decideMode(ok, 0, now), 'full');                             // cache is empty
  // full reconciliation once a week, on Saturdays: 2026-10-10 Saturday, 2026-10-11 Sunday, 2026-10-16 Friday, 2026-10-17 Saturday
  const at = (s) => new Date(`${s}T12:00:00`).getTime();
  assert.equal(new Date(lastSaturday(at('2026-10-10'))).getDay(), 6); assert.equal(new Date(lastSaturday(at('2026-10-14'))).getDate(), 10);
  assert.equal(decideMode({ ...ok, last: at('2026-10-10'), full: at('2026-10-10') }, 100, at('2026-10-16')), 'delta'); // Friday: still after the Saturday reconciliation
  assert.equal(decideMode({ ...ok, last: at('2026-10-10'), full: at('2026-10-10') }, 100, at('2026-10-17')), 'full');  // next Saturday
  assert.equal(decideMode({ ...ok, last: 0 }, 100, now), 'full');           // no server timestamp
  assert.equal(maxMillis([0, 5, undefined, 9, 3]), 9);
});

test('срок хранения удалённого: год, затем удаление навсегда', async () => {
  const { isExpiredDeleted, purgeDate, historyCutoff, RETENTION_DAYS } = await import('../src/domain/sync.js');
  const DAY = 86400000; const now = Date.UTC(2027, 9, 10);
  assert.equal(RETENTION_DAYS, 365);
  assert.equal(isExpiredDeleted({ deleted: true, deletedAt: now - 364 * DAY }, now), false);   // still kept
  assert.equal(isExpiredDeleted({ deleted: true, deletedAt: now - 366 * DAY }, now), true);    // retention period is over
  assert.equal(isExpiredDeleted({ deleted: false, deletedAt: now - 900 * DAY }, now), false);  // not deleted — leave it
  assert.equal(isExpiredDeleted({ deleted: true }, now), false);                               // no deletion date — leave it
  assert.equal(isExpiredDeleted(null, now), false);
  assert.equal(purgeDate(now), now + 365 * DAY); assert.equal(purgeDate(0), 0);
  assert.equal(historyCutoff(now), now - 365 * DAY);
});

test('серийный номер и MAC: разбор считанного', async () => {
  const d = await import('../src/domain/deviceid.js');
  assert.equal(d.normalizeMac('a4:14:37:0b:12:cd'), 'A4:14:37:0B:12:CD');
  assert.equal(d.normalizeMac('A414370B12CD'), 'A4:14:37:0B:12:CD');
  assert.equal(d.normalizeMac('A4-14-37-0B-12-CD'), 'A4:14:37:0B:12:CD');
  assert.equal(d.normalizeMac('DS-2CD2143G2'), '');
  assert.deepEqual(d.macsIn('SN:XYZ12345 MAC: a4:14:37:0b:12:cd'), ['A4:14:37:0B:12:CD']);
  assert.deepEqual(d.labeledSerials('S/N: DS2CD1234567 MAC 11:22:33:44:55:66'), ['DS2CD1234567']);
  assert.deepEqual(d.labeledSerials('https://x.com/p?sn=ABC123456&a=1'), ['ABC123456']);
  const mac = d.candidatesFor('mac', ['DS-2CD2143G2-I20200101AAWR', 'A414370B12CD']);
  assert.equal(mac[0].value, 'A4:14:37:0B:12:CD'); assert.equal(mac[0].sure, true);
  const sn = d.candidatesFor('serial', ['A414370B12CD', 'DS-2CD2143G2-I20200101AAWR']);
  assert.equal(sn[0].value, 'DS-2CD2143G2-I20200101AAWR');
  assert.equal(d.hasDeviceId({ id: 'Камера' }), true); assert.equal(d.hasDeviceId({ id: 'Дверь' }), false); assert.equal(d.hasDeviceId({ id: 'Дверь', scanId: true }), true);
  const pts = [{ id: 'a', mac: 'A4:14:37:0B:12:CD' }, { id: 'b', serial: 'abc1' }];
  assert.equal(d.findDuplicate(pts, { id: 'c' }, 'mac', 'a414370b12cd').id, 'a');
  assert.equal(d.findDuplicate(pts, { id: 'a' }, 'mac', 'a414370b12cd'), null);
  assert.equal(d.findDuplicate(pts, { id: 'c' }, 'serial', 'ABC1').id, 'b');
});

test('«Что осталось»: чего не хватает точке, с учётом этапов типа и привязки установки', async () => {
  const { remaining, missingStages } = await import('../src/domain/remaining.js');
  const bakar = { id: 'b1', projectId: 'P1', label: '1A-B1', cabinet: '1A', typeId: 'Бакар' };
  const cam2 = { id: 'c2', projectId: 'P1', label: '2B-01', cabinet: '2B', typeId: 'Камера' };
  const ctx = scenario([cam, bakar, cam2], [day('D1', '2026-10-05')], [
    entry('e1', 'D1', 'Хивут', 'HIV_KEY', ['c1']),
    entry('e2', 'D1', 'Хивут', 'HIV_DEV', ['b1']), entry('e3', 'D1', 'Проверка', 'CHK_FLUKE', ['b1']),
  ]);
  assert.deepEqual(missingStages(ctx.points.get('c1'), ctx), ['Установка', 'Проверка']);
  assert.deepEqual(missingStages(ctx.points.get('b1'), ctx), []); // a controller has no installation, everything else is done
  assert.deepEqual(missingStages(ctx.points.get('c2'), ctx), ['Хивут', 'Установка', 'Проверка']);
  const r = remaining(ctx);
  assert.deepEqual(r.map((g) => [g.cabinet, g.items.length]), [['1A', 1], ['2B', 1]]);
});

test('готовность по шкафам: точка завершена, когда сделаны все этапы её типа', async () => {
  const { isFinished, readinessByCabinet } = await import('../src/domain/remaining.js');
  const bakar = { id: 'b1', projectId: 'P1', label: '1A-B1', cabinet: '1A', typeId: 'Бакар' };
  const cam2 = { id: 'c2', projectId: 'P1', label: '2B-01', cabinet: '2B', typeId: 'Камера' };
  const all = (id) => [entry('e1' + id, 'D1', 'Протяжка', 'PR_PTS', [id]), entry('e2' + id, 'D1', 'Хивут', 'HIV_KEY', [id]), entry('e3' + id, 'D1', 'Установка', 'INS_CAM', [id]),
    entry('e4' + id, 'D1', 'Проверка', 'CHK_FLUKE', [id]), entry('e5' + id, 'D1', 'Шилют', 'SHL', [id])];
  const ctx = scenario([cam, bakar, cam2], [day('D1', '2026-10-05')], all('c1'));
  assert.equal(isFinished(ctx.points.get('c1'), ctx), true);
  assert.equal(isFinished(ctx.points.get('c2'), ctx), false);
  assert.deepEqual(readinessByCabinet(ctx).map((r) => [r.cabinet, r.done, r.total]), [['1A', 1, 2], ['2B', 0, 1]]);
});

test('exportSheets: листы выгрузки в Excel', async () => {
  const { exportSheets, buildContext } = await import('../src/domain/index.js');
  const project = { id: 'p', name: 'Мега' };
  const ctx = buildContext({ projects: [project], points: [{ id: 'a', projectId: 'p', label: '1A-01', typeId: 'Камера', cabinet: '1A', serial: 'GE1' }],
    types: [{ id: 'Камера', stages: ['Протяжка', 'Проверка'] }], days: [{ id: 'd', projectId: 'p', date: '2026-10-01', helper: 'сам' }],
    entries: [{ id: 'e', dayId: 'd', workType: 'Время', minutes: 30, note: 'ждали' }], catalog: [], cables: [], configs: [], units: [], culprits: [], delayReasons: [], journal: [] });
  const sh = exportSheets(project, ctx);
  assert.deepEqual(sh.map((x) => x.name), ['Точки', 'История по точкам', 'Дни и работы', 'Справочники']);
  assert.equal(sh[0].rows[0][0], 'Обозначение'); assert.equal(sh[0].rows[1][0], '1A-01'); assert.ok(sh[0].rows[1].includes('GE1'));
  assert.equal(sh[2].rows[1][0], '2026-10-01'); assert.equal(sh[2].rows[1][8], 30);
});

test('downtimeByCulprit: простои по виновникам за месяц', async () => {
  const { downtimeByCulprit, buildContext } = await import('../src/domain/index.js');
  const ctx = buildContext({ projects: [{ id: 'p' }], points: [], types: [], catalog: [], cables: [], configs: [], units: [], delayReasons: [], journal: [],
    culprits: [{ id: 'Заказчик', he: 'לקוח' }],
    days: [{ id: 'd1', projectId: 'p', date: '2026-10-01' }, { id: 'd2', projectId: 'p', date: '2026-09-30' }],
    entries: [{ id: 'a', dayId: 'd1', workType: 'Время', minutes: 90, culprit: 'Заказчик' }, { id: 'b', dayId: 'd1', workType: 'Время', minutes: 30, culprit: 'Электрик' },
      { id: 'c', dayId: 'd1', workType: 'Время', minutes: 40, culprit: 'Заказчик' }, { id: 'd', dayId: 'd2', workType: 'Время', minutes: 99, culprit: 'Заказчик' }, { id: 'e', dayId: 'd1', workType: 'Время', minutes: 5 }] });
  const r = downtimeByCulprit(ctx, '2026-10');
  assert.deepEqual(r.list.map((g) => [g.culprit, g.minutes, g.count]), [['Заказчик', 130, 2], ['Электрик', 30, 1]]);
  assert.equal(r.totalMinutes, 160);
});

test('несколько видов кабеля: протяжка каждого вида отдельно, дох и метраж по видам', async () => {
  const { parseCables, cablesText, pullFigures, missingStages, buildReport, statusKeyOf } = await import('../src/domain/index.js');
  assert.deepEqual(parseCables('cat7×1, 6005 x 2').list, [{ cable: 'cat7', count: 1 }, { cable: '6005', count: 2 }]);
  assert.deepEqual(parseCables('cat7').bad, ['cat7']);
  const types = [...POINT_TYPES, { id: 'Интерком', nameHe: 'אינטרקום', defaultCable: '6005', defaultCables: 1, extraCables: [{ cable: 'cat7', count: 1 }], stages: ['Протяжка', 'Хивут'], installMode: 'none' }];
  const int = { id: 'i1', projectId: 'P1', label: '1A-INT1', cabinet: '1A', typeId: 'Интерком', length: 10 };
  const d = day('D1', '2026-10-05');
  const e1 = entry('E1', 'D1', 'Протяжка', 'PULL', ['i1'], { cableId: '6005' });
  let ctx = make({ types, points: [int], days: [d], entries: [e1], journal: [{ id: 'j1', entryId: 'E1', pointId: 'i1' }] });
  let info = pointInfo(ctx.points.get('i1'), ctx);
  assert.equal(cablesText(info.cableList), '6005×1 + cat7×1');
  assert.equal(info.cables, 2); assert.equal(info.metrage, 20);
  assert.equal(info.pulled, ''); assert.equal(info.status, 'Протянуто 1/2'); assert.equal(statusKeyOf(info), 'Частично протянута');
  assert.deepEqual(missingStages(ctx.points.get('i1'), ctx), ['Дотянуть', 'Хивут']);
  assert.deepEqual(pullFigures(e1, ctx), { count: 1, meters: 10 });
  const e2 = entry('E2', 'D1', 'Протяжка', 'PULL', ['i1'], { cableId: 'cat7' });
  ctx = make({ types, points: [int], days: [d], entries: [e1, e2], journal: [{ id: 'j1', entryId: 'E1', pointId: 'i1' }, { id: 'j2', entryId: 'E2', pointId: 'i1' }] });
  info = pointInfo(ctx.points.get('i1'), ctx);
  assert.equal(info.pulled, '2026-10-05'); assert.equal(info.status, 'Протянута');
  // a pull entry without a cable (old data) counts for all kinds
  const e0 = entry('E3', 'D1', 'Протяжка', 'PULL', ['i1']);
  ctx = make({ types, points: [int], days: [d], entries: [e0], journal: [{ id: 'j3', entryId: 'E3', pointId: 'i1' }] });
  assert.equal(pointInfo(ctx.points.get('i1'), ctx).status, 'Протянута');
  // single-cable point: a pull with a "foreign" cable counts (as before)
  const e4 = entry('E4', 'D1', 'Протяжка', 'PULL', ['c1'], { cableId: '6005' });
  ctx = make({ points: [cam], days: [d], entries: [e4], journal: [{ id: 'j4', entryId: 'E4', pointId: 'c1' }] });
  assert.equal(pointInfo(ctx.points.get('c1'), ctx).status, 'Протянута');
  // manager table: cables as a list, partial pull
  ctx = make({ types, points: [int], days: [d], entries: [e1], journal: [{ id: 'j1', entryId: 'E1', pointId: 'i1' }] });
  const rep = buildReport(project, ctx, { id: 't', lang: 'ru', columns: ['label', 'cable', 'cables', 'pulled', 'status'] });
  const row = rep.sheets[0].rows.at(-1);
  assert.deepEqual(row, ['1A-INT1', '6005×1 + cat7×1', 2, 'частично 1/2', 'Протянуто 1/2']);
  // the cabinet setting can remove the extra cables ([]) or keep the type default (null)
  ctx = make({ types, points: [int], cabinetSettings: [{ id: 's', projectId: 'P1', cabinet: '1A', typeId: 'Интерком', extraCables: [] }] });
  assert.equal(pointInfo(ctx.points.get('i1'), ctx).cables, 1);
});

test('точка из устройств: задачи по устройствам, галочки, протяжка по видам, установка k/n, дох', async () => {
  const { pullFigures, missingStages, isFinished, buildReport, tasksOf, devicesForWork, missingDetails } = await import('../src/domain/index.js');
  const cables = [{ id: 'cat7', nameHe: 'CAT7', accounting: 'Точки', workIds: ['HIV_KEY', 'HIV_DEV', 'CHK_FLUKE', 'SHL'] },
    { id: '6005', nameHe: '6005', accounting: 'Метры', workIds: ['HIV_DEV'] }];
  const devices = [
    { id: 'DV_KORE', name: 'Коре картисим', cables: [{ cable: '6005', count: 1 }], workIds: ['INS_KORE'] },
    { id: 'DV_MAG', name: 'Магнит индикация', cables: [{ cable: '6005', count: 1 }], workIds: ['INS_MAGNIT'] },
    { id: 'DV_MAN', name: 'Мануль хашмали', cables: [{ cable: '6005', count: 1 }], workIds: ['INS_MANUL'] },
    { id: 'DV_NIP', name: 'Лахцан нипуц', cables: [], workIds: ['INS_LNIPUTZ'] },
    { id: 'DV_BIO', name: 'Коре биометри', cables: [{ cable: '6005', count: 1 }, { cable: 'cat7', count: 1 }], workIds: ['INS_BIO'] },
  ];
  const types = POINT_TYPES.map((t) => (t.id === 'Дверь' ? { ...t, devices: [{ deviceId: 'DV_KORE', count: 1 }, { deviceId: 'DV_MAG', count: 1 }, { deviceId: 'DV_MAN', count: 1 }], workIds: ['CHK_DOOR'] } : t));
  types.push({ id: 'Коре биометри', nameHe: 'קורא ביומטרי', devices: [{ deviceId: 'DV_BIO', count: 1 }] });
  const d1 = { id: 'd1', projectId: 'P1', label: '1A-1.1', cabinet: '1A', typeId: 'Дверь', length: 10 };
  const d2 = { ...d1, id: 'd2', label: '1A-1.2', devices: [{ deviceId: 'DV_KORE', count: 2 }, { deviceId: 'DV_MAN', count: 1 }, { deviceId: 'DV_NIP', count: 1 }] };
  const bio = { id: 'b1', projectId: 'P1', label: '1A-BIO1', cabinet: '1A', typeId: 'Коре биометри', length: 5 };
  const D = day('D1', '2026-10-05');
  const mk = (entries) => make({ cables, devices, types, points: [d1, d2, bio], days: [D], entries,
    journal: entries.flatMap((e) => e.pointIds.map((p) => ({ id: `${e.id}-${p}`, entryId: e.id, pointId: p }))) });
  const CAT = { ...Object.fromEntries(CATALOG.map((w) => [w.id, w])) };
  assert.ok(CAT.CHK_DOOR && CAT.INS_BIO);

  let ctx = mk([]);
  // door tasks: 3 pulls, 3 terminations in the rack (per device), 3 installations, door check
  const t1 = tasksOf(ctx.points.get('d1'), ctx);
  assert.equal(t1.filter((t) => t.stage === 'Протяжка').length, 3);
  assert.equal(t1.filter((t) => t.workId === 'HIV_DEV').length, 3);
  assert.equal(pointInfo(ctx.points.get('d1'), ctx).cables, 3);
  assert.equal(pointInfo(ctx.points.get('d2'), ctx).cables, 3); // 2 cores + manual; nipuc has no cable
  assert.equal(pointInfo(ctx.points.get('b1'), ctx).cableList.map((c) => `${c.cable}×${c.count}`).join(','), '6005×1,cat7×1');
  assert.deepEqual(devicesForWork([ctx.points.get('d2')], ctx, 'INS_KORE', 'Установка').map((x) => x.deviceId), ['DV_KORE']);

  // pull of 6005 only for the core and the magnet on d1
  const e1 = entry('E1', 'D1', 'Протяжка', 'PR_PTS', ['d1'], { cableId: '6005', deviceIds: ['DV_KORE', 'DV_MAG'] });
  ctx = mk([e1]);
  let info = pointInfo(ctx.points.get('d1'), ctx);
  assert.equal(info.status, 'Протянуто 2/3');
  assert.deepEqual(pullFigures(e1, ctx), { count: 2, meters: 20 });
  assert.deepEqual(missingStages(ctx.points.get('d1'), ctx), ['Дотянуть', 'Хивут', 'Установка', 'Проверка']);
  assert.deepEqual(missingDetails(info, ctx)[0], { stage: 'Протяжка', items: ['Мануль хашмали (6005)'] });

  // all on d1 without ticks: pull, termination, installations (per door accessory), door check
  const all = ['HIV_DEV', 'INS_KORE', 'INS_MAGNIT', 'INS_MANUL', 'CHK_DOOR'].map((w, i) => entry(`E${i + 3}`, 'D1', CAT[w].workType, w, ['d1']));
  const e2 = entry('E2', 'D1', 'Протяжка', 'PR_PTS', ['d1'], { cableId: '6005' });
  ctx = mk([e1, e2, all[0], all[1], all[2]]);
  info = pointInfo(ctx.points.get('d1'), ctx);
  assert.equal(info.status, 'Установлено 2/3'); assert.equal(info.install, 'Установлено 2/3');
  ctx = mk([e1, e2, ...all]);
  info = pointInfo(ctx.points.get('d1'), ctx);
  assert.equal(info.status, 'Проверена'); assert.ok(isFinished(ctx.points.get('d1'), ctx));

  // doh: installing the core on a door with two cores — 2 pcs; biometric pull by kind
  const e9 = entry('E9', 'D1', 'Установка', 'INS_KORE', ['d2']);
  const e10 = entry('E10', 'D1', 'Протяжка', 'PR_PTS', ['b1'], { cableId: 'cat7' });
  ctx = mk([e9, e10]);
  assert.equal(itogShtuk(e9, ctx), 2);
  assert.deepEqual(pullFigures(e10, ctx), { count: 1, meters: 5 });
  assert.equal(pointInfo(ctx.points.get('b1'), ctx).status, 'Протянуто 1/2');
  assert.equal(pointInfo(ctx.points.get('d2'), ctx).install, 'Установлено 1/3'); // core (×2 in one task), manual, nipuc

  // table: stages of a composite point, «—» for a stage it does not have
  const rep = buildReport(project, ctx, { id: 't', lang: 'ru', columns: ['label', 'cable', 'pulled', 'shilut'] });
  const rowB = rep.sheets[0].rows.find((r) => r[0] === '1A-BIO1');
  assert.deepEqual(rowB, ['1A-BIO1', '6005×1 + cat7×1', 'частично 1/2', '']);
  const rowD = rep.sheets[0].rows.find((r) => r[0] === '1A-1.1');
  assert.equal(rowD[3], '—'); // a door has no shilut
});

test('кабели самой точки: дверь 2×6005, авизарим без кабелей; работы кабеля наследуются без дублирования', async () => {
  const { pullFigures, tasksOf, devicesForWork } = await import('../src/domain/index.js');
  const cables = [{ id: '6005', accounting: 'Метры', workIds: ['HIV_DEV'] }, { id: 'cat7', accounting: 'Точки', workIds: ['HIV_KEY', 'HIV_DEV', 'CHK_FLUKE', 'SHL'] }];
  const devices = ['INS_KORE', 'INS_MANUL', 'INS_MAGNIT', 'INS_LPTIHA', 'INS_LNIPUTZ'].map((w) => ({ id: `DV_${w}`, name: w, cables: [], workIds: [w] }));
  devices.push({ id: 'DV_BIO', name: 'Коре биометри', cables: [{ cable: '6005', count: 1 }, { cable: 'cat7', count: 1 }], workIds: ['INS_BIO'] });
  const types = [{ id: 'Дверь5', devices: devices.slice(0, 5).map((d) => ({ deviceId: d.id, count: 1 })), cables: [{ cable: '6005', count: 2 }] },
    { id: 'Только кабели', cables: [{ cable: 'cat7', count: 1 }] }, { id: 'Био', devices: [{ deviceId: 'DV_BIO', count: 1 }] }];
  const p = { id: 'x', projectId: 'P1', label: 'D5', typeId: 'Дверь5', length: 10 };
  const q = { id: 'y', projectId: 'P1', label: 'K1', typeId: 'Только кабели' };
  const bio = { id: 'z', projectId: 'P1', label: 'B1', typeId: 'Био' };
  const e = entry('E1', 'D1', 'Протяжка', 'PR_PTS', ['x'], { cableId: '6005' });
  const ctx = make({ cables, devices, types, points: [p, q, bio], days: [day('D1', '2026-10-05')], entries: [e], journal: [{ id: 'j', entryId: 'E1', pointId: 'x' }] });
  const info = pointInfo(ctx.points.get('x'), ctx);
  assert.equal(info.cables, 2); assert.equal(info.status, 'Протянута'); assert.equal(info.installTotal, 5);
  assert.deepEqual(pullFigures(e, ctx), { count: 2, meters: 20 });
  assert.equal(tasksOf(ctx.points.get('x'), ctx).filter((t) => t.workId === 'HIV_DEV').length, 1); // termination of the point cables
  assert.ok(devicesForWork([ctx.points.get('x')], ctx, null, 'Протяжка').some((d) => d.name === 'Кабели точки'));
  assert.equal(pointInfo(ctx.points.get('y'), ctx).stages.join(','), 'Протяжка,Хивут,Проверка,Шилют');
  // device «Core biometric»: hivuts, check and shilut of its cables come from «Cables», no need to repeat them in the device
  const works = tasksOf(ctx.points.get('z'), ctx).map((t) => t.workId || `pull:${t.cable}`).sort();
  assert.deepEqual(works, ['CHK_FLUKE', 'HIV_DEV', 'HIV_KEY', 'INS_BIO', 'SHL', 'pull:6005', 'pull:cat7']);
  assert.equal(tasksOf(ctx.points.get('z'), ctx).find((t) => t.workId === 'HIV_DEV').qty, 2); // in the cabinet — both cables
});

test('устройство, изменённое у точки: свои кабели и работы вместо заданных в «Устройствах»', async () => {
  const { tasksOf } = await import('../src/domain/index.js');
  const cables = [{ id: '6005', accounting: 'Метры', workIds: ['HIV_DEV'] }, { id: 'cat7', accounting: 'Точки', workIds: ['HIV_KEY', 'HIV_DEV', 'CHK_FLUKE', 'SHL'] }];
  const devices = [{ id: 'DV_INT', name: 'Интерком', cables: [{ cable: '6005', count: 1 }, { cable: 'cat7', count: 1 }], workIds: ['INS_INT'] }];
  const types = [{ id: 'INT', devices: [{ deviceId: 'DV_INT', count: 1 }] }];
  const p = { id: 'a', projectId: 'P1', label: 'I1', typeId: 'INT', devices: [{ deviceId: 'DV_INT', count: 1, cables: [{ cable: 'cat7', count: 1 }], workIds: [] }] };
  const ctx = make({ cables, devices, types, points: [p] });
  const info = pointInfo(ctx.points.get('a'), ctx);
  assert.equal(info.cableList.map((c) => c.cable).join(','), 'cat7');
  assert.equal(info.installTotal, 0);
  assert.ok(!tasksOf(ctx.points.get('a'), ctx).some((t) => t.workId === 'INS_INT'));
});

test('добавление точек из файла: дубли пропускаются, ошибки и подозрительные обозначения, новые типы', async () => {
  const { parsePointsFile, planPointsImport, pointsImportOps } = await import('../src/domain/index.js');
  assert.throws(() => parsePointsFile('{"format":"x"}'));
  const ctx = make({ points: [cam] });
  const data = parsePointsFile(JSON.stringify({ format: 'polevoy-points-1', floor: '1', points: [
    { label: '1A-01', typeId: 'Камера', cabinet: '1A' }, { label: '1A-C2', typeId: 'Камера', cabinet: '1A' }, { label: 'H240', typeId: 'Камера' },
    { label: '1A-INT1', typeId: 'Интерком', cabinet: '1A' }, { label: 'X1', typeId: 'Нет такого' }, { label: '1A-C2', typeId: 'Камера', cabinet: '1A' },
  ], types: [{ id: 'Интерком', nameHe: 'אינטרקום', devices: [] , cables: [{ cable: 'cat7', count: 1 }] }] }));
  const plan = planPointsImport(ctx, data);
  assert.deepEqual(plan.add.map((p) => p.label), ['1A-C2', 'H240', '1A-INT1', 'X1']);
  assert.deepEqual(plan.skipped, ['1A-01']);
  assert.equal(plan.errors.length, 1); // duplicate 1A-C2; an unknown type is no longer an error
  assert.deepEqual(plan.blankTypes, ['Нет такого']);
  assert.ok(plan.warnings.some((w) => w.startsWith('H240')));
  assert.deepEqual(plan.newTypes.map((t) => t.id), ['Интерком']);
  // the same label in another cabinet or with no cabinet is no obstacle; in the same cabinet it is skipped
  const p3 = planPointsImport(ctx, parsePointsFile(JSON.stringify({ format: 'polevoy-points-1', points: [
    { label: '1A-01', typeId: 'Камера', cabinet: '2B' }, { label: '1A-01', typeId: 'Камера' }, { label: '1A-01', typeId: 'Камера', cabinet: '1A' }, { label: '1A-01', typeId: 'Камера', cabinet: '2B' },
  ] })));
  assert.deepEqual(p3.add.map((p) => p.cabinet || ''), ['2B', '']); assert.deepEqual(p3.skipped, ['1A-01']); assert.equal(p3.errors.length, 1);
  assert.equal(p3.alsoIn.get('2B\u00001A-01'), '1A');
  // cabinet required: points without a cabinet are not added, they come back as a list
  const p4 = planPointsImport(ctx, parsePointsFile(JSON.stringify({ format: 'polevoy-points-1', points: [{ label: 'N1', typeId: 'Камера' }, { label: 'N2', typeId: 'Камера', cabinet: '2B' }] })), new Map(), { requireCabinet: true });
  assert.deepEqual(p4.add.map((p) => p.label), ['N2']); assert.deepEqual(p4.noCabinet.map((p) => p.label), ['N1']);
  const p5 = planPointsImport(ctx, parsePointsFile(JSON.stringify({ format: 'polevoy-points-1', cabinet: '1A', points: [{ label: '1A-01', typeId: 'Камера' }, { label: 'N1', typeId: 'Камера' }] })), new Map(), { requireCabinet: true });
  assert.deepEqual([p5.add.map((p) => p.label), p5.skipped, p5.noCabinet.length], [['N1'], ['1A-01'], 0]);   // the cabinet of the file is filled in
  let n = 0; const ops = pointsImportOps(plan, () => `id${n++}`);
  assert.deepEqual(ops.map((o) => o.coll), ['types', 'types', 'points', 'points', 'points', 'points']);
  assert.equal(ops[2].data.floor, '1');
  // the place on the sheet (pos) is kept together with the sheet size and the drawing name
  const d2 = parsePointsFile(JSON.stringify({ format: 'polevoy-points-1', sheet: { pdf: 'plan.pdf', pages: [{ w: 3969, h: 2594 }] },
    points: [{ label: 'C01', typeId: 'Камера', pos: { page: 0, x: 878, y: 2055.7, w: 8, h: 7 } }, { label: 'C02', typeId: 'Камера', pos: { x: 'плохо' } }] }));
  const ops2 = pointsImportOps(planPointsImport(make({}), d2), () => 'x', d2);
  assert.deepEqual(ops2[0].data.pos, { page: 0, x: 878, y: 2055.7, w: 8, h: 7, pw: 3969, ph: 2594, sheet: 'plan.pdf' });
  assert.equal(ops2[1].data.pos, undefined);
});

test('общий пул типов: тип из пула переносится в проект с устройствами, кабелями и работами; мой пул заменяет стандартный', async () => {
  const { typePool, bundleFrom, libWith, addBundleOps, planPointsImport, pointsImportOps, parsePointsFile } = await import('../src/domain/index.js');
  const pool = typePool([]);
  assert.ok(pool.get('Лахцан птиха'), 'стандартный тип в пуле');
  const ctx = make({});
  assert.ok(!ctx.types.has('Лахцан птиха'));
  const ops = addBundleOps(ctx, pool.get('Лахцан птиха'));
  assert.ok(ops.some((o) => o.coll === 'types' && o.id === 'Лахцан птиха'));
  assert.ok(ops.some((o) => o.coll === 'devices' && o.id === 'DV_LPTIHA'));
  // my pool: a type from the project (with its composition) replaces the standard one
  const ctx2 = make({ devices: [{ id: 'DV_X', name: 'Прибор X', cables: [{ cable: 'cat7', count: 2 }], workIds: [] }],
    types: [...POINT_TYPES, { id: 'Камера', nameHe: 'מצלמה', devices: [{ deviceId: 'DV_X', count: 1 }], cables: [], workIds: [] }] });
  const lib = libWith([], [bundleFrom(ctx2, 'Камера')]);
  assert.equal(lib[0].devices[0].id, 'DV_X'); assert.equal(lib[0].cables[0].id, 'cat7');
  assert.equal(typePool(lib).get('Камера').source, 'mine');
  // a points file with a type that is not in the project but is in the pool — the type is added automatically
  const data = parsePointsFile(JSON.stringify({ format: 'polevoy-points-1', points: [{ label: 'APA1', typeId: 'Лахцан птиха' }] }));
  const plan = planPointsImport(ctx, data, pool);
  assert.equal(plan.errors.length, 0); assert.deepEqual(plan.poolTypes.map((b) => b.type.id), ['Лахцан птиха']);
  const o2 = pointsImportOps(plan, () => 'p1', data);
  assert.ok(o2.some((o) => o.coll === 'types' && o.id === 'Лахцан птиха') && o2.some((o) => o.coll === 'devices') && o2.some((o) => o.coll === 'points'));
});

test('свои кабели точки (RJ45 X2 = 2 кабеля): и у типа из устройств, и у старого типа; по умолчанию — как у типа', async () => {
  const { tasksOf, typeCablesOf, cableOverrideFor, effectiveCablesOf } = await import('../src/domain/index.js');
  const cables = [{ id: 'cat7', accounting: 'Точки', workIds: ['HIV_KEY'] }];
  const devices = [{ id: 'DV_AP', name: 'Точка', cables: [{ cable: 'cat7', count: 1 }], workIds: [] }];
  const types = [...POINT_TYPES, { id: 'Точка', devices: [{ deviceId: 'DV_AP', count: 1 }] }];
  const p = { id: 'a', projectId: 'P1', label: 'RJ45 X2', typeId: 'Точка', cableOverride: [{ cable: 'cat7', count: 2 }] };
  const ctx = make({ cables: [...CABLES.filter((c) => c.id !== 'cat7'), ...cables], devices, types, points: [p, { ...cam, cableOverride: [{ cable: 'cat7', count: 3 }] }] });
  assert.deepEqual(effectiveCablesOf(ctx.points.get('a'), ctx), [{ cable: 'cat7', count: 2 }]);
  assert.equal(tasksOf(ctx.points.get('a'), ctx).find((t) => t.workId === 'HIV_KEY').qty, 2);
  assert.equal(pointInfo(ctx.points.get('c1'), ctx).cables, 3);
  assert.deepEqual(typeCablesOf(ctx, 'Точка'), [{ cable: 'cat7', count: 1 }]);
  assert.equal(cableOverrideFor([{ cable: 'cat7', count: 1 }], ctx, 'Точка'), null);
  assert.deepEqual(cableOverrideFor([{ cable: 'cat7', count: 2 }], ctx, 'Точка'), [{ cable: 'cat7', count: 2 }]);
});

test('сортировка точек: числа в любом месте обозначения — как числа', () => {
  const pts = ['D2/10', 'D2/2', 'D2/1', 'D2/24', 'D2/3'].map((label) => ({ label, typeId: 'Дверь', cabinet: '' }));
  assert.deepEqual(pts.sort(comparePoints).map((p) => p.label), ['D2/1', 'D2/2', 'D2/3', 'D2/10', 'D2/24']);
});

test('название следующей точки: тот же формат, пары, ведущие нули', async () => {
  const { nextLabel } = await import('../src/domain/index.js');
  const P = (label, typeId = 'Камера', cabinet = 'GA1') => ({ label, typeId, cabinet });
  assert.equal(nextLabel([P('GA1/C-82'), P('GA1/C-83'), P('GA1/C-9')], 'Камера', 'GA1'), 'GA1/C-84');
  assert.equal(nextLabel([P('1A-17-18', 'Бакар', '1A'), P('1A-19-20', 'Бакар', '1A')], 'Бакар', '1A'), '1A-21-22');
  assert.equal(nextLabel([P('C-083', 'Камера', '')], 'Камера', ''), 'C-084');
  assert.equal(nextLabel([P('GA1/C-1')], 'Вайфай', 'GA1'), '');
  assert.equal(nextLabel([P('GA1/AP-01', 'Вайфай'), P('GA1/AP-02', 'X')], 'Вайфай', 'GA1'), 'GA1/AP-03');
});

test('подпись нескольких точек на одной отметке', async () => {
  const { combineLabels } = await import('../src/domain/points.js');
  assert.deepEqual(combineLabels(['TV14', 'TV13']), ['TV13-14']);
  assert.deepEqual(combineLabels(['TV19', 'TV20', 'TV21', 'TV22', 'TV23', 'TV24', 'TV25', 'TV26']), ['TV19-26']);
  assert.deepEqual(combineLabels(['TV21', 'TV13', 'TV16']), ['TV13', 'TV16', 'TV21']);
  assert.deepEqual(combineLabels(['A-09', 'A-10']), ['A-09-10']);
  assert.deepEqual(combineLabels(['X1']), ['X1']);
});

test('групповое переименование точек', async () => {
  const { renameLabel } = await import('../src/domain/points.js');
  assert.equal(renameLabel('CCTV1-TV01', { find: 'CCTV1-', where: 'start' }), 'TV01');
  assert.equal(renameLabel('W01', { find: 'W', replace: 'WL', where: 'start' }), 'WL01');
  assert.equal(renameLabel('TV09', { shift: 2 }), 'TV11');
  assert.equal(renameLabel('1A-17-18', { shift: 2 }), '1A-19-20');
  assert.equal(renameLabel('C-05', { prefix: '2B/', suffix: '.1' }), '2B/C-05.1');
  assert.equal(renameLabel('A1-B1', { find: '1', replace: '' }), 'A-B');
  assert.equal(renameLabel('X-01', { shift: -1 }), 'X-00');
});

test('повторы работ: нижний уровень главнее, в задачах точки работа один раз', async () => {
  const { buildContext, tasksOf, inheritedOfType } = await import('../src/domain/index.js');
  const ctx = buildContext({
    catalog: [{ id: 'W_INST', name: 'Установка интеркома', workType: 'Установка' }, { id: 'W_HK', name: 'Хивут кистона', workType: 'Хивут' }, { id: 'W_CHK', name: 'Проверка', workType: 'Проверка' }],
    cables: [{ id: 'cat7', workIds: ['W_HK'] }],
    devices: [{ id: 'DV_INT', name: 'Интерком', cables: [{ cable: 'cat7', count: 1 }], workIds: ['W_INST', 'W_HK'] }],
    types: [{ id: 'Интерком', devices: [{ deviceId: 'DV_INT', count: 1 }], cables: [], workIds: ['W_INST', 'W_CHK'] }],
    points: [{ id: 'p1', label: 'INT-1', typeId: 'Интерком' }],
  });
  const tasks = tasksOf(ctx.points.get('p1'), ctx);
  assert.equal(tasks.filter((t) => t.workId === 'W_INST').length, 1);
  assert.equal(tasks.find((t) => t.workId === 'W_HK').qty, 1);  // cable + device — not 2
  assert.equal(tasks.filter((t) => t.workId === 'W_CHK').length, 1);
  assert.deepEqual([...inheritedOfType(ctx, [{ deviceId: 'DV_INT', count: 1 }]).keys()].sort(), ['W_HK', 'W_INST']);
});

test('повторы работ не трогают количества: 2 магнита, несколько кабелей', async () => {
  const { buildContext, tasksOf } = await import('../src/domain/index.js');
  const ctx = buildContext({
    catalog: [{ id: 'W_MAG', name: 'Установка магнита', workType: 'Установка' }, { id: 'W_HS', name: 'Хивут в шкафу', workType: 'Хивут' }, { id: 'W_HK', name: 'Хивут кистона', workType: 'Хивут' }, { id: 'W_CHK', name: 'Проверка двери', workType: 'Проверка' }],
    cables: [{ id: '6005', workIds: ['W_HS'] }, { id: 'cat7', workIds: ['W_HK', 'W_HS'] }],
    devices: [{ id: 'DV_MAG', name: 'Магнит индикация', cables: [{ cable: '6005', count: 1 }], workIds: ['W_MAG'] }, { id: 'DV_CR', name: 'Коре', cables: [{ cable: 'cat7', count: 2 }], workIds: ['W_HK'] }],
    types: [{ id: 'Дверь', devices: [{ deviceId: 'DV_MAG', count: 2 }, { deviceId: 'DV_CR', count: 1 }], cables: [{ cable: '6005', count: 3 }], workIds: ['W_CHK'] }],
    points: [{ id: 'p1', label: 'D-1', typeId: 'Дверь' }],
  });
  const t = tasksOf(ctx.points.get('p1'), ctx);
  const q = (dev, w) => t.find((x) => x.deviceId === dev && x.workId === w)?.qty;
  const pull = (dev, c) => t.find((x) => x.deviceId === dev && x.stage === 'Протяжка' && x.cable === c)?.qty;
  assert.equal(pull('DV_MAG', '6005'), 2); assert.equal(q('DV_MAG', 'W_MAG'), 2); assert.equal(q('DV_MAG', 'W_HS'), 2);   // 2 magnets
  assert.equal(pull('DV_CR', 'cat7'), 2); assert.equal(q('DV_CR', 'W_HK'), 2); assert.equal(q('DV_CR', 'W_HS'), 2);        // 2 cat7 cables: keystone — 2, not 2+1
  assert.equal(t.filter((x) => x.stage === 'Протяжка' && x.cable === '6005').reduce((n, x) => n + x.qty, 0), 5);         // 2 from the magnets + 3 cables of the point
  assert.equal(t.filter((x) => x.workId === 'W_CHK').length, 1);
});

test('общий пул: кандидаты во входящие и «взять в проект» без перезаписи', async () => {
  const { buildContext, inboxCandidates, takeFromPoolOps, poolMaps, poolHash } = await import('../src/domain/index.js');
  const pool = poolMaps({ types: [{ id: 'Камера', nameHe: 'מצלמה', devices: [{ deviceId: 'DV_C', count: 1 }] }], devices: [{ id: 'DV_C', name: 'Камера', cables: [{ cable: 'cat7', count: 1 }], workIds: ['W_I'] }], cables: [{ id: 'cat7', workIds: [] }], catalog: [{ id: 'W_I', name: 'Установка камеры', workType: 'Установка' }] });
  const ctx = buildContext({ types: [{ id: 'Камера', nameHe: 'מצלמה', devices: [{ deviceId: 'DV_C', count: 2 }], updatedAt: 5 }, { id: 'Новый', devices: [] }], devices: [{ id: 'DV_C', name: 'Камера', cables: [{ cable: 'cat7', count: 1 }], workIds: ['W_I'], updatedAt: 9 }], cables: [{ id: 'cat7', workIds: [] }], catalog: [{ id: 'W_I', name: 'Установка камеры', workType: 'Установка' }] });
  const c = inboxCandidates(ctx, pool);
  assert.deepEqual(c.map((x) => `${x.kind}:${x.id}`).sort(), ['types:Камера', 'types:Новый']);  // service fields do not count as a difference
  assert.equal(poolHash({ a: 1, updatedAt: 1 }), poolHash({ a: 1, updatedAt: 2 }));
  const empty = buildContext({ types: [], devices: [], cables: [], catalog: [] });
  assert.deepEqual(takeFromPoolOps(empty, pool, 'types', 'Камера').map((o) => `${o.coll}:${o.id}`), ['catalog:W_I', 'cables:cat7', 'devices:DV_C', 'types:Камера']);
  assert.deepEqual(takeFromPoolOps(ctx, pool, 'types', 'Камера'), []);  // already in the project — leave it
});

test('общий пул: изменения части видны и принимаются на уровне типа', async () => {
  const { buildContext, inboxCandidates, poolMaps, candidateChanges, coveredBy, changedParts } = await import('../src/domain/index.js');
  const pool = poolMaps({ types: [{ id: 'Телефон', devices: [], cables: [{ cable: 'Телефон', count: 1 }], workIds: ['W_A'] }], devices: [], cables: [{ id: 'Телефон', workIds: [] }],
    catalog: [{ id: 'W_A', name: 'Хивут метаэма', workType: 'Хивут', unit: 'шт' }, { id: 'W_S', name: 'Хивут в шкафу', workType: 'Хивут', unit: 'шт' }] });
  const ctx = buildContext({ types: [{ id: 'Телефон', devices: [], cables: [{ cable: 'Телефон', count: 1 }], workIds: ['W_A', 'W_B'] }], devices: [], cables: [{ id: 'Телефон', workIds: ['W_S'] }],
    catalog: [{ id: 'W_A', name: 'Хивут метаэма', workType: 'Хивут', unit: 'шт' }, { id: 'W_B', name: 'Хивут кроны', workType: 'Хивут', unit: 'шт' }, { id: 'W_S', name: 'Хивут в шкафу', workType: 'Хивут', unit: 'мин' }] });
  const own = { uid: 'u1' };
  const c = inboxCandidates(ctx, pool).map((x) => ({ ...x, itemId: x.id, owner: own }));
  const type = c.find((x) => x.kind === 'types'); const work = c.find((x) => x.kind === 'catalog' && x.id === 'W_B');
  assert.ok(type && work); assert.ok(coveredBy(work, c));                 // a new work is accepted together with its type
  const ch = candidateChanges(type, pool);
  assert.ok(ch.includes('Работы на точку: + Хивут кроны'), ch.join(' | '));
  assert.ok(ch.some((s) => s.startsWith('Новая работа «Хивут кроны»')));
  assert.ok(ch.includes('Кабель «Телефон» — Работы кабеля: + Хивут в шкафу'));
  assert.ok(ch.includes('Работа «Хивут в шкафу» — Единица: шт → мин'));
  assert.deepEqual(changedParts(type, pool).map((p) => p.item.id).sort(), ['W_B', 'W_S', 'Телефон']);
});

test('workApplicable: точке предлагаются только подходящие и ещё не сделанные работы', async () => {
  const { buildContext, workApplicable } = await import('../src/domain/index.js');
  const W = (id, workType, forTypes) => ({ id, name: id, workType, forTypes, active: true });
  const data = {
    catalog: [W('PULL', 'Протяжка', ['Камера', 'Дверь']), W('HIV', 'Хивут', ['Камера']), W('INS_CAM', 'Установка', ['Камера']), W('INS_DOOR', 'Установка', ['Дверь']), W('CHK', 'Проверка', ['Камера']), W('RE', 'Перетяжка', ['Камера']), W('EXTRA', 'Доп. работа', ['Камера'])],
    cables: [{ id: 'cat6', workIds: ['PULL'] }],
    devices: [{ id: 'DV', name: 'Камера', cables: [{ cable: 'cat6', count: 1 }], workIds: ['HIV', 'INS_CAM', 'CHK'] }],
    types: [{ id: 'Камера', devices: [{ deviceId: 'DV', count: 1 }], cables: [], workIds: [] }],
    points: [{ id: 'p', label: 'P1', typeId: 'Камера' }], days: [{ id: 'd', date: '2026-10-20' }],
    entries: [{ id: 'e1', dayId: 'd', workType: 'Протяжка', workId: 'PULL', pointIds: ['p'] }, { id: 'e2', dayId: 'd', workType: 'Проверка', workId: 'CHK', pointIds: ['p'], result: 'Не работает' }],
    journal: [{ id: 'j1', entryId: 'e1', pointId: 'p' }, { id: 'j2', entryId: 'e2', pointId: 'p' }],
  };
  const ctx = buildContext(data); const p = ctx.points.get('p'); const ok = (id) => workApplicable(p, ctx, ctx.catalog.get(id));
  assert.equal(ok('PULL'), false, 'протянутая — протяжка не нужна');
  assert.equal(ok('HIV'), true); assert.equal(ok('INS_CAM'), true);
  assert.equal(ok('INS_DOOR'), false, 'работа другого типа точек');
  assert.equal(ok('CHK'), true, 'неработающую точку можно проверить повторно');
  assert.equal(ok('RE'), true, 'перетяжка — всегда'); assert.equal(ok('EXTRA'), true, 'свободная работа без задач');
  data.entries[1].result = 'Работает'; const ctx2 = buildContext(data);
  assert.equal(workApplicable(ctx2.points.get('p'), ctx2, ctx2.catalog.get('CHK')), false, 'проверена — снова не нужна');
});

test('правила открытой версии: без вшитой почты, администратор из meta/admin', async () => {
  const fs = await import('node:fs');
  const { openRules } = await import('../src/domain/openrules.js');
  const r = openRules(fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'));
  assert.ok(!/erudit/.test(r));
  assert.match(r, /match \/meta\/admin/);
  assert.match(r, /function poolAdmin\(\) \{ return signedIn\(\) && exists/);
  assert.equal(fs.readFileSync(new URL('../firestore.open.rules', import.meta.url), 'utf8'), r, 'firestore.open.rules устарел: пересоздайте из firestore.rules (openRules)');
});

test('мастер своей базы: проверки по ответам Google', async () => {
  const m = await import('../src/domain/fbcheck.js');
  const cfg = { apiKey: 'k', projectId: 'p' };
  const resp = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  assert.equal((await m.checkConfig(cfg, resp(400, { error: { message: 'CONFIGURATION_NOT_FOUND' } }))).ok, true);
  assert.equal((await m.checkConfig(cfg, resp(400, { error: { message: 'API key not valid. Please pass a valid API key.' } }))).ok, false);
  assert.equal((await m.checkGoogle(cfg, 'https://x/', resp(200, { authUri: 'https://accounts.google.com/...' }))).ok, true);
  assert.match((await m.checkGoogle(cfg, 'https://x/', resp(400, { error: { message: 'OPERATION_NOT_ALLOWED' } }))).msg, /не включён/);
  assert.equal((await m.checkDomain(cfg, 'kukilvan.github.io', resp(200, { authorizedDomains: ['localhost', 'kukilvan.github.io'] }))).ok, true);
  assert.equal((await m.checkDomain(cfg, 'kukilvan.github.io', resp(200, { authorizedDomains: ['localhost'] }))).ok, false);
  let f = await m.checkFirestore(cfg, resp(404, { error: { message: 'The database (default) does not exist for project p', status: 'NOT_FOUND' } }));
  assert.equal(f.db.ok, false);
  f = await m.checkFirestore(cfg, resp(403, { error: { message: 'Missing or insufficient permissions.', status: 'PERMISSION_DENIED' } }));
  assert.equal(f.db.ok, true); assert.equal(f.rules.ok, false);
  f = await m.checkFirestore(cfg, resp(404, { error: { message: 'Document "projects/p/databases/(default)/documents/meta/probe" not found.', status: 'NOT_FOUND' } }));
  assert.equal(f.rules.ok, true);
  f = await m.checkFirestore(cfg, async () => { throw new Error('offline'); });
  assert.equal(f.db.ok, false);
});

test('словари переводов: шаблоны {} совпадают по числу подстановок', async () => {
  const fs = await import('node:fs');
  for (const f of fs.readdirSync(new URL('../src/i18n/src/', import.meta.url))) {
    const j = JSON.parse(fs.readFileSync(new URL(`../src/i18n/src/${f}`, import.meta.url), 'utf8'));
    for (const [ru, [en, he]] of Object.entries(j)) {
      const n = (ru.match(/\{\}/g) || []).length;
      for (const x of [en, he]) if (x) assert.equal((x.match(/\{\d*\}/g) || []).length, n, `${f}: «${ru}» → «${x}»`);
    }
  }
});

test('дох дня: одинаковые работы суммируются в одну строку', () => {
  const c2 = { ...cam, id: 'c2', label: '1A-02' }; const c3 = { ...cam, id: 'c3', label: '1A-03' };
  const d = day('D1', '2026-10-05');
  // keystone termination: 1 + 1 + 1 = 3; «Сиюр» (site walk): 20 + 15 = 35 min; an entry with a different note — separate; with a delay — separate
  const es = [
    entry('e1', 'D1', 'Хивут', 'HIV_KEY', ['c1']), entry('e2', 'D1', 'Время', 'T_SIYUR', [], { minutes: 20 }),
    entry('e3', 'D1', 'Хивут', 'HIV_KEY', ['c2']), entry('e4', 'D1', 'Время', 'T_SIYUR', [], { minutes: 15 }),
    entry('e5', 'D1', 'Хивут', 'HIV_KEY', ['c3'], { note: 'в подвале' }),
    entry('e6', 'D1', 'Хивут', 'HIV_KEY', ['c1'], { delayReason: 'нет доступа' }),
  ];
  const ctx = scenario([{ ...cam, length: 10 }, c2, c3], [d], es);
  assert.equal(doh(d, ctx), '05.10.2026\nMegason Mega Or с Марина\n\nХивут кистона 2 шт\n\nСиюр 35 мин\n\nХивут кистона 1 шт. в подвале\n\nХивут кистона 1 шт\nЗадержка: нет доступа');
});

test('дох дня: протяжка одного кабеля, записанная несколько раз, суммируется', () => {
  const c2 = { ...cam, id: 'c2', label: '1A-02' }; const c3 = { ...cam, id: 'c3', label: '1A-03' };
  const d = day('D1', '2026-10-05');
  const es = [entry('e1', 'D1', 'Протяжка', 'PR_PTS', ['c1'], { cableId: 'cat7' }), entry('e2', 'D1', 'Протяжка', 'PR_PTS', ['c2', 'c3'], { cableId: 'cat7' })];
  const ctx = scenario([{ ...cam, length: 10 }, c2, c3], [d], es);
  assert.equal(doh(d, ctx), '05.10.2026\nMegason Mega Or с Марина\n\nПротяжка cat7: 3 точек');
});

test('дох: минуты складываются в часы и остаток', async () => {
  const { dur } = await import('../src/domain/doh.js');
  assert.equal(dur(35), '35 мин'); assert.equal(dur(60), '1 ч'); assert.equal(dur(95), '1 ч 35 мин'); assert.equal(dur(150), '2 ч 30 мин');
  assert.equal(dur(95, 'he'), 'שעה ו-35 דקות'); assert.equal(dur(120, 'he'), 'שעתיים'); assert.equal(dur(200, 'he'), '3 שעות ו-20 דקות'); assert.equal(dur(40, 'he'), '40 דקות');
  assert.equal(dur(95, 'en'), '1 h 35 min');
  // sum of identical timed works for a day: 50 + 45 = 95 → «1 h 35 min»
  const d = day('D1', '2026-10-05');
  const es = [entry('e1', 'D1', 'Время', 'T_SIYUR', [], { minutes: 50 }), entry('e2', 'D1', 'Время', 'T_SIYUR', [], { minutes: 45 })];
  assert.equal(doh(d, scenario([{ ...cam, length: 10 }], [d], es)), '05.10.2026\nMegason Mega Or с Марина\n\nСиюр 1 ч 35 мин');
});

// ---- sections by point type ----
const sectionData = async (extra = []) => {
  const { buildContext, POINT_TYPES, CATALOG } = await import('../src/domain/index.js');
  const mk = (id, label, typeId, cabinet = '1A') => ({ id, projectId: 'p1', label, typeId, cabinet });
  const data = {
    projects: [{ id: 'p1', name: 'Mega Or', nameHe: 'מגה אור' }],
    points: [mk('a', 'C-01', 'Камера'), mk('b', 'D-01', 'Дверь'), mk('c', 'C-02', 'Камера'), mk('d', 'G-01', 'Галай'), mk('e', 'X-01', undefined), mk('f', 'X-02', 'Призрак'), ...extra],
    types: POINT_TYPES, catalog: CATALOG, cables: [{ id: 'cat7', nameHe: 'כבל CAT7' }], journal: [],
  };
  return { ctx: buildContext(data), project: data.projects[0] };
};
const sectionTexts = (sh) => sh.sectionRows.map((r) => sh.rows[r][0]);

test('разделы: порядок по typeOrder, остальные типы по имени, «Без типа» последним', async () => {
  const { buildReport, defaultTables } = await import('../src/domain/index.js');
  const { ctx, project } = await sectionData();
  const base = { ...defaultTables()[1], columns: ['label', 'type'], summary: false };
  // no typeOrder: by name («Галай», «Дверь», «Камера»), then «Без типа» (no type and a deleted type)
  assert.deepEqual(sectionTexts(buildReport(project, ctx, base).sheets[0]), ['Галай — 1 точка', 'Дверь — 1 точка', 'Камера — 2 точки', 'Без типа — 2 точки']);
  const ordered = buildReport(project, ctx, { ...base, typeOrder: ['Камера', 'Призрак', 'Дверь'] }).sheets[0];
  assert.deepEqual(sectionTexts(ordered), ['Камера — 2 точки', 'Дверь — 1 точка', 'Галай — 1 точка', 'Без типа — 2 точки']);
  // the points of «Без типа» are in the last section, in the usual order
  const last = ordered.rows.slice(ordered.sectionRows[3] + 1).map((r) => r[0]);
  assert.deepEqual(last, ['X-01', 'X-02']);
  // Hebrew: nameHe of the type, «ללא סוג», «נקודה אחת» / «N נקודות»
  const he = buildReport(project, ctx, { ...base, lang: 'he', typeOrder: ['Камера'] }).sheets[0];
  assert.deepEqual(sectionTexts(he), ['מצלמה — 2 נקודות', 'גלאי — נקודה אחת', 'דלת — נקודה אחת', 'ללא סוג — 2 נקודות']);
});

test('разделы: формы числа точек по-русски и по-еврейски', async () => {
  const { pointsCountText } = await import('../src/domain/index.js');
  assert.deepEqual([1, 2, 5, 21, 12, 11, 22, 25, 14, 101].map((n) => pointsCountText(n, 'ru')),
    ['1 точка', '2 точки', '5 точек', '21 точка', '12 точек', '11 точек', '22 точки', '25 точек', '14 точек', '101 точка']);
  assert.equal(pointsCountText(1, 'he'), 'נקודה אחת'); assert.equal(pointsCountText(2, 'he'), '2 נקודות'); assert.equal(pointsCountText(12, 'he'), '12 נקודות');
});

test('разделы: две пустые строки между группами, ни одной в начале и в конце; цвета строк', async () => {
  const { buildReport, defaultTables } = await import('../src/domain/index.js');
  const { ctx, project } = await sectionData();
  const sh = buildReport(project, ctx, { ...defaultTables()[1], columns: ['label', 'status'], summary: false }).sheets[0];
  const first = sh.headerRow + 1;
  assert.equal(sh.sectionRows[0], first);                                   // right under the header
  sh.sectionRows.slice(1).forEach((r) => { assert.deepEqual(sh.rows[r - 1], []); assert.deepEqual(sh.rows[r - 2], []); assert.notDeepEqual(sh.rows[r - 3], []); });
  assert.notDeepEqual(sh.rows[sh.rows.length - 1], []);                      // nothing after the last group
  assert.equal(sh.pointRuns.length, 4);
  sh.pointRuns.forEach(([r0, r1], i) => { assert.equal(r0, sh.sectionRows[i] + 1); assert.ok(r1 > r0); });
  assert.equal(sh.rowColors.length, sh.rows.length - first);
  sh.sectionRows.forEach((r) => assert.equal(sh.rowColors[r - first], ''));
  for (let r = first; r < sh.rows.length; r += 1) if (!sh.rows[r].length) assert.equal(sh.rowColors[r - first], '');
  // a profile with one type has one section, and a type ticked in `types` without points has none
  const one = buildReport(project, ctx, { ...defaultTables()[1], columns: ['label'], types: ['Камера'] }).sheets[0];
  assert.deepEqual(sectionTexts(one), ['Камера — 2 точки']);
  const none = buildReport(project, ctx, { ...defaultTables()[1], columns: ['label'], types: ['Бакар'] }).sheets[0];
  assert.deepEqual(none.sectionRows, []); assert.deepEqual(none.pointRuns, []);
});

test('разделы: галочка выключена — прежний порядок, без строк разделов и пустых строк', async () => {
  const { buildReport, defaultTables } = await import('../src/domain/index.js');
  const { ctx, project } = await sectionData();
  const t = { ...defaultTables()[1], columns: ['label'], summary: false };
  const off = buildReport(project, ctx, { ...t, sections: false }).sheets[0];
  // today's order, as comparePoints sorts them
  assert.deepEqual(off.rows.slice(off.headerRow + 1).map((r) => r[0]), ['X-01', 'G-01', 'D-01', 'C-01', 'C-02', 'X-02']);
  assert.deepEqual(off.sectionRows, []); assert.deepEqual(off.pointRuns, [[off.headerRow + 1, off.rows.length]]);
  const on = buildReport(project, ctx, t);
  assert.notEqual(on.hash, buildReport(project, ctx, { ...t, sections: false }).hash);
  assert.equal(on.pointCount, 6);
});

test('разделы: «шкаф на листе» — разделы и числа на каждом листе свои', async () => {
  const { buildReport, defaultTables } = await import('../src/domain/index.js');
  const { ctx, project } = await sectionData([{ id: 'g', projectId: 'p1', label: 'C-09', typeId: 'Камера', cabinet: '2B' }]);
  const r = buildReport(project, ctx, { ...defaultTables()[1], columns: ['label'], summary: false, layout: 'perCabinet' });
  assert.deepEqual(r.sheets.map((x) => x.title), ['1A', '2B', 'Итоги по шкафам']);
  assert.deepEqual(sectionTexts(r.sheets[0]), ['Галай — 1 точка', 'Дверь — 1 точка', 'Камера — 2 точки', 'Без типа — 2 точки']);
  assert.deepEqual(sectionTexts(r.sheets[1]), ['Камера — 1 точка']);
});

test('разделы: typeOrderOf при отсутствующем, неполном и устаревшем typeOrder; defaultTables с галочками', async () => {
  const { typeOrderOf, defaultTables } = await import('../src/domain/index.js');
  const { ctx } = await sectionData();
  const all = [...ctx.types.keys()].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
  assert.deepEqual(typeOrderOf({}, ctx), all);
  assert.deepEqual(typeOrderOf({ typeOrder: ['Дверь', 'Камера'] }, ctx), ['Дверь', 'Камера', ...all.filter((x) => x !== 'Дверь' && x !== 'Камера')]);
  // a deleted id is skipped and a repeat counts once
  assert.deepEqual(typeOrderOf({ typeOrder: ['Удалён', 'Камера', 'Камера'] }, ctx), ['Камера', ...all.filter((x) => x !== 'Камера')]);
  defaultTables().forEach((t) => { assert.equal(t.sections, true); assert.equal(t.rackSheet, true); });
});

test('разделы: запросы форматирования — строка раздела, высота, рамка толстая, порядок рамок', async () => {
  const { buildReport, defaultTables } = await import('../src/domain/index.js');
  const { sheetRequests } = await import('../src/app/managers.js');
  const { ctx, project } = await sectionData();
  const sh = buildReport(project, ctx, { ...defaultTables()[1], columns: ['label', 'pulled', 'installed'], summary: false }).sheets[0];
  const reqs = sheetRequests(7, sh);
  const idx = (f) => reqs.map((q, i) => (f(q) ? i : -1)).filter((i) => i >= 0);
  sh.sectionRows.forEach((r) => {
    const look = reqs.find((q) => q.repeatCell && q.repeatCell.range.startRowIndex === r && q.repeatCell.range.endColumnIndex === 3 && q.repeatCell.cell.userEnteredFormat.textFormat);
    assert.equal(look.repeatCell.cell.userEnteredFormat.textFormat.bold, true); assert.equal(look.repeatCell.cell.userEnteredFormat.textFormat.fontSize, 12);
    assert.equal(look.repeatCell.cell.userEnteredFormat.horizontalAlignment, undefined);
    assert.match(look.repeatCell.fields, /horizontalAlignment/); // cleared, not set
    const h = reqs.find((q) => q.updateDimensionProperties && q.updateDimensionProperties.range.dimension === 'ROWS' && q.updateDimensionProperties.range.startIndex === r);
    assert.equal(h.updateDimensionProperties.properties.pixelSize, 28);
    const fr = reqs.find((q) => q.updateBorders && q.updateBorders.range.startRowIndex === r);
    assert.equal(fr.updateBorders.top.style, 'SOLID_THICK'); assert.equal(fr.updateBorders.left.style, 'SOLID_THICK'); assert.equal(fr.updateBorders.innerVertical.style, 'NONE');
    assert.equal(fr.updateBorders.range.endColumnIndex, 3); assert.equal(fr.updateBorders.range.endRowIndex, r + 1);
  });
  // order: point-row borders, then section frames, then the header frame
  const runs = idx((q) => q.updateBorders && sh.pointRuns.some(([a, b]) => q.updateBorders.range.startRowIndex === a && q.updateBorders.range.endRowIndex === b));
  const frames = idx((q) => q.updateBorders && sh.sectionRows.includes(q.updateBorders.range.startRowIndex));
  const head = idx((q) => q.updateBorders && q.updateBorders.range.startRowIndex === sh.headerRow);
  assert.equal(runs.length, 4); assert.equal(frames.length, 4);
  assert.ok(Math.max(...runs) < Math.min(...frames)); assert.ok(Math.max(...frames) < head[0]);
  // the section row is formatted after the column formats (they would center its cells)
  const colFormat = idx((q) => q.repeatCell && q.repeatCell.range.startRowIndex === sh.headerRow + 1 && q.repeatCell.range.startColumnIndex === 1);
  assert.ok(Math.max(...colFormat) < idx((q) => q.repeatCell && q.repeatCell.range.startRowIndex === sh.sectionRows[0] && q.repeatCell.range.endColumnIndex === 3 && q.repeatCell.cell.userEnteredFormat.textFormat)[0]);
  assert.equal(reqs.find((q) => q.setBasicFilter).setBasicFilter.filter.range.endRowIndex, sh.rows.length);
});

test('разделы: выгрузка в Excel без строк разделов', async () => {
  const { exportSheets } = await import('../src/domain/index.js');
  const { ctx, project } = await sectionData();
  const pts = exportSheets(project, ctx)[0];
  assert.equal(pts.name, 'Точки');
  assert.equal(pts.rows.length, 1 + 6);                                      // the header and the points only
  assert.ok(pts.rows.slice(1).every((r) => r[0] && !String(r[0]).includes(' — ')));
});

// ---- rack sheet «Итоги по шкафам» ----
const rackData = async (points, journal = []) => {
  const { buildContext, POINT_TYPES, CATALOG } = await import('../src/domain/index.js');
  const data = { projects: [{ id: 'p1', name: 'Mega Or', nameHe: 'מגה אור' }], points: points.map((p) => ({ projectId: 'p1', ...p })), types: POINT_TYPES, catalog: CATALOG, cables: [], journal };
  return { ctx: buildContext(data), project: data.projects[0] };
};
const rackOf = async (project, ctx, table, opts) => {
  const { buildReport, defaultTables } = await import('../src/domain/index.js');
  return buildReport(project, ctx, { ...defaultTables()[1], columns: ['label'], ...table }, opts);
};

test('лист шкафов: числа, проценты вниз, «—» для этапа без точек, «Без шкафа» в конце, итоговая строка', async () => {
  const { ctx, project } = await reportData();
  const r = await rackOf(project, ctx, {});
  const sh = r.sheets.at(-1);
  assert.equal(sh.title, 'Итоги по шкафам'); assert.equal(sh.kind, 'racks'); assert.equal(r.sheets.length, 2);
  assert.deepEqual(sh.rows.slice(0, 5), [['Итоги по шкафам'], ['Mega Or – Megason'], [],
    ['Шкаф', 'Всего точек', 'Протянуто', '', 'Захивучено', '', 'Установлено', '', 'Проверено', '', 'Установлено частично', 'Неисправно'],
    ['', '', 'Кол-во', '%', 'Кол-во', '%', 'Кол-во', '%', 'Кол-во', '%', '', '']]);
  assert.deepEqual(sh.rows.slice(5), [
    ['1A', 2, 1, 0.5, 0, 0, 1, 0.5, 1, 0.5, 0, 0],
    ['2B', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ['Без шкафа', 1, 0, 0, 0, 0, 0, 0, '—', '—', 0, 0],  // a detector has no check stage
    ['Итого', 4, 1, 0.25, 0, 0, 1, 0.25, 1, 0.33, 0, 0]]); // checked: 1 of 3 points whose type has the stage → 33%, rounded down
  assert.deepEqual(sh.greens, []);
  assert.equal(sh.stamp.row, 1); assert.equal(sh.stamp.col, 4); assert.equal(sh.frozenRows, 5); assert.equal(sh.frozenCols, 1);
  // Hebrew: texts of the spec
  const he = (await rackOf(project, ctx, { lang: 'he' })).sheets.at(-1);
  assert.equal(he.title, 'התקדמות לפי ארון'); assert.equal(he.rtl, true);
  assert.deepEqual(he.rows[3], ['ארון', 'סה״כ נקודות', 'הושחל', '', 'חווט', '', 'הותקן', '', 'נבדק', '', 'הותקן חלקית', 'תקלות']);
  assert.deepEqual(he.rows[4].slice(0, 4), ['', '', 'כמות', '%']); assert.equal(he.rows.at(-1)[0], 'סה״כ'); assert.equal(he.rows[7][0], 'ללא ארון');
});

test('лист шкафов: 199 из 200 — 99%, не зелёный; 100% — зелёный; естественный порядок шкафов; чужая запись вне базы не считается', async () => {
  const pts = []; const journal = [];
  for (let i = 0; i < 200; i += 1) { pts.push({ id: `p${i}`, label: `R-${i}`, typeId: 'Камера', cabinet: '9' }); if (i) journal.push({ id: `j${i}`, pointId: `p${i}`, editDate: '2026-10-03', editWorkId: 'PR_PTS' }); }
  pts.push({ id: 'x1', label: 'X-1', typeId: 'Камера', cabinet: '10' }, { id: 'x2', label: 'X-2', typeId: 'Камера', cabinet: '2' },
    { id: 'g1', label: 'G-1', typeId: 'Галай', cabinet: '2' });
  journal.push({ id: 'jx', pointId: 'x1', editDate: '2026-10-03', editWorkId: 'PR_PTS' }, { id: 'jg', pointId: 'g1', editDate: '2026-10-04', editWorkId: 'CHK_FLUKE' });
  const { ctx, project } = await rackData(pts, journal);
  const sh = (await rackOf(project, ctx, {})).sheets.at(-1);
  assert.deepEqual(sh.rows.slice(5).map((r) => r[0]), ['2', '9', '10', 'Итого']);                       // natural order, not 10 before 2
  assert.deepEqual(sh.rows[6].slice(0, 4), ['9', 200, 199, 0.99]);                                        // 199 of 200 → 99%
  assert.ok(!sh.greens.some(([r, c]) => r === 6 && c === 2));
  assert.deepEqual(sh.rows[7].slice(0, 4), ['10', 1, 1, 1]);                                              // 100%: the number 1 shown with the «0%» format
  assert.ok(sh.greens.some(([r, c]) => r === 7 && c === 2));
  // rack «2» has a detector with a stray check row: the detector has no check stage, so it is not counted (the base is the camera only)
  assert.deepEqual(sh.rows[5].slice(0, 4), ['2', 2, 0, 0]); assert.deepEqual(sh.rows[5].slice(8, 10), [0, 0]);
  const total = sh.rows.at(-1); assert.equal(total[1], 203); assert.deepEqual(total.slice(2, 4), [200, 0.98]);  // (199 + 1) of 203 points → 98%
  assert.deepEqual(total.slice(8, 10), [0, 0]);
});

test('лист шкафов: фильтры профиля, пустой набор, галочка rackSheet, имя листа «шкаф на листе», хеш', async () => {
  const { ctx, project } = await reportData();
  const only = (await rackOf(project, ctx, { cabinets: ['1A'], types: ['Камера'] })).sheets.at(-1);
  assert.deepEqual(only.rows.slice(5).map((r) => r.slice(0, 2)), [['1A', 1], ['Итого', 1]]);
  const none = (await rackOf(project, ctx, { statuses: ['Неисправна'] })).sheets.at(-1);
  assert.deepEqual(none.rows.slice(5), [['Итого', 0, '—', '—', '—', '—', '—', '—', '—', '—', 0, 0]]); assert.deepEqual(none.greens, []);
  const off = await rackOf(project, ctx, { rackSheet: false });
  assert.deepEqual(off.sheets.map((x) => x.title), ['Статус']);
  const on = await rackOf(project, ctx, {});
  assert.notEqual(on.hash, off.hash);
  // a rack named like the rack sheet: its sheet becomes «… (2)», the rack sheet keeps the name
  const clash = await rackData([{ id: 'a', label: 'A-1', typeId: 'Камера', cabinet: 'Итоги по шкафам' }, { id: 'b', label: 'B-1', typeId: 'Камера', cabinet: '1A' }]);
  const r = await rackOf(clash.project, clash.ctx, { layout: 'perCabinet' });
  assert.deepEqual(r.sheets.map((x) => x.title), ['1A', 'Итоги по шкафам (2)', 'Итоги по шкафам']);
  assert.equal(r.sheets.at(-1).kind, 'racks');
});

test('лист шкафов: запросы — слияния, формат процентов, зелёное только у полных этапов, закреплённый столбец', async () => {
  const { sheetRequests, rebuildSheets } = await import('../src/app/managers.js');
  const pts = [{ id: 'a', label: 'C-1', typeId: 'Камера', cabinet: '1A' }, { id: 'b', label: 'C-2', typeId: 'Камера', cabinet: '2B' }];
  const journal = [{ id: 'j1', pointId: 'a', editDate: '2026-10-03', editWorkId: 'PR_PTS' }, { id: 'j2', pointId: 'b', editDate: '2026-10-03', editWorkId: 'PR_PTS' }, { id: 'j3', pointId: 'a', editDate: '2026-10-04', editWorkId: 'CHK_FLUKE' }];
  const { ctx, project } = await rackData(pts, journal);
  const sh = (await rackOf(project, ctx, {})).sheets.at(-1);
  const reqs = sheetRequests(9, sh);
  const merges = reqs.filter((q) => q.mergeCells).map((q) => { const g = q.mergeCells.range; return [g.startRowIndex, g.endRowIndex, g.startColumnIndex, g.endColumnIndex]; });
  assert.deepEqual(merges, [[3, 5, 0, 1], [3, 5, 1, 2], [3, 5, 10, 11], [3, 5, 11, 12], [3, 4, 2, 4], [3, 4, 4, 6], [3, 4, 6, 8], [3, 4, 8, 10]]);
  const pct = reqs.filter((q) => q.repeatCell && q.repeatCell.cell.userEnteredFormat.numberFormat);
  assert.deepEqual(pct.map((q) => q.repeatCell.range.startColumnIndex), [3, 5, 7, 9]);
  pct.forEach((q) => assert.deepEqual(q.repeatCell.cell.userEnteredFormat.numberFormat, { type: 'PERCENT', pattern: '0%' }));
  // pulled is 100% in 1A, 2B and the total; checked only in 1A (1 of 1; the total is 1 of 2)
  const isGreen = (q) => q.repeatCell && JSON.stringify(q.repeatCell.cell.userEnteredFormat.backgroundColor) === JSON.stringify({ red: 0xC6 / 255, green: 0xE5 / 255, blue: 0xC9 / 255 });
  const greens = reqs.filter(isGreen).map((q) => [q.repeatCell.range.startRowIndex, q.repeatCell.range.startColumnIndex, q.repeatCell.range.endColumnIndex]);
  assert.deepEqual(greens.sort((x, y) => x[0] - y[0] || x[1] - y[1]), [[5, 2, 4], [5, 8, 10], [6, 2, 4], [7, 2, 4]]);
  assert.ok(reqs.some((q) => q.updateBorders && q.updateBorders.range.startRowIndex === sh.totalRow && q.updateBorders.top.style === 'SOLID_THICK'));
  assert.ok(!reqs.some((q) => q.setBasicFilter || q.addConditionalFormatRule));                         // no filter and no highlight rules
  assert.deepEqual(reqs.filter((q) => q.updateDimensionProperties).map((q) => q.updateDimensionProperties.properties.pixelSize), [110, 95, 70, 60, 70, 60, 70, 60, 70, 60, 110, 85]);
  // rebuild: the rack sheet is added with one frozen column and five frozen rows
  const calls = [];
  await rebuildSheets({ sheetsOf: async () => [], batch: async (id, q) => calls.push(q), write: async () => {} }, 'F', [sh]);
  const grid = calls[0][0].addSheet.properties.gridProperties;
  assert.equal(grid.frozenColumnCount, 1); assert.equal(grid.frozenRowCount, 5);
});
