// Checks the day off (src/domain/dayoff.js and its use in doh.js, month.js, export.js): reasons, texts, the clash with other projects, month lines, sums and the Excel row.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_OFF_REASONS, dayOffText, dayOffLine, dayConflict, isDayOff, doh, dohTop, dohHeader, buildContext, workdaysReport, workdaysList,
  monthReportRu, monthReportHe, monthSummary, downtimeByCulprit, exportSheets, setNameTranslator,
  CATALOG, CABLES, UNITS, POINT_TYPES,
} from '../src/domain/index.js';

const projects = [
  { id: 'a', name: 'A', contractor: 'Мегасон', object: 'Модиин', helper: 'Мариной', nameHe: 'מגה', objectHe: 'מודיעין', helperHe: 'מרינה' },
  { id: 'b', name: 'B', contractor: 'Электра', object: 'Тель-Авив', helper: 'сам' },
];
const mk = (days, entries = []) => buildContext({
  projects: [projects[0]], points: [], days, entries, journal: [], cabinetSettings: [], configs: [],
  catalog: CATALOG.map((x) => ({ ...x })), cables: CABLES.map((x) => ({ ...x })), units: UNITS.map((x) => ({ ...x })), types: POINT_TYPES.map((x) => ({ ...x })),
  culprits: [{ id: 'Заказчик', he: 'לקוח' }], delayReasons: [],
});
const off = (id, date, reason, extra = {}) => ({ id, projectId: 'a', date, off: true, offReason: reason, createdAt: Number(id.slice(1)) || 0, ...extra });
const work = (id, date, extra = {}) => ({ id, projectId: 'a', date, helper: 'Мариной', helperHe: 'מרינה', createdAt: Number(id.slice(1)) || 0, ...extra });

test('dayoff: четыре причины в форме, старые читаются, русский и иврит, своя причина как набрана', () => {
  assert.deepEqual(DAY_OFF_REASONS.map((r) => r.id), ['personal', 'holiday', 'sick', 'other']);
  assert.equal(dayOffText({ offReason: 'weather' }, 'ru'), 'Погода');   // retired from the form, saved days still read
  assert.equal(dayOffText({ offReason: 'shabbat' }, 'he'), 'שבת');
  assert.equal(dayOffText({ offReason: 'holiday' }, 'ru'), 'Праздник');
  assert.equal(dayOffText({ offReason: 'holiday' }, 'he'), 'חג');
  assert.equal(dayOffText({ offReason: 'nowork' }, 'ru'), 'Нет работы на объекте');
  assert.equal(dayOffText({ offReason: 'other', offText: 'Свадьба' }, 'ru'), 'Свадьба');
  assert.equal(dayOffText({ offReason: 'other', offText: 'Свадьба' }, 'he'), 'Свадьба');
  assert.equal(dayOffText({ offReason: 'other', offText: 'Свадьба' }, 'en'), 'Свадьба');
  assert.equal(dayOffText({ offReason: 'sick' }, 'en', (s) => `EN:${s}`), 'EN:Болезнь');
  assert.equal(isDayOff({ off: true }), true); assert.equal(isDayOff({ off: false }), false); assert.equal(isDayOff({}), false);
});

test('dayConflict: рабочий день в другом проекте, выходной в другом, тот же проект, удалённые', () => {
  const days = [
    { id: '1', projectId: 'b', date: '2026-11-05' },
    { id: '2', projectId: 'b', date: '2026-11-06', off: true, offReason: 'holiday' },
    { id: '3', projectId: 'b', date: '2026-11-07', deleted: true },
    { id: '4', projectId: 'a', date: '2026-11-08' },
    { id: '5', projectId: 'c', date: '2026-11-09' },
  ];
  const live = [projects[0], projects[1]];
  // we want a day off: a working day of another project blocks it
  assert.equal(dayConflict(days, live, { date: '2026-11-05', projectId: 'a', off: true }).kind, 'work');
  assert.equal(dayConflict(days, live, { date: '2026-11-05', projectId: 'a', off: true }).project.name, 'B');
  // a day off of another project does not block a day off
  assert.equal(dayConflict(days, live, { date: '2026-11-06', projectId: 'a', off: true }), null);
  // we want a working day: a day off of another project blocks it
  assert.equal(dayConflict(days, live, { date: '2026-11-06', projectId: 'a', off: false }).kind, 'off');
  assert.equal(dayConflict(days, live, { date: '2026-11-05', projectId: 'a', off: false }), null);
  // deleted days, the same project and projects that are not live are ignored
  assert.equal(dayConflict(days, live, { date: '2026-11-07', projectId: 'a', off: true }), null);
  assert.equal(dayConflict(days, live, { date: '2026-11-08', projectId: 'b', off: true }).project.name, 'A');
  assert.equal(dayConflict(days, live, { date: '2026-11-08', projectId: 'a', off: true }), null);
  assert.equal(dayConflict(days, live, { date: '2026-11-09', projectId: 'a', off: true }), null);
});

test('doh выходного: строка на русском, иврите, английском и комментарий; нет пустого отчёта', () => {
  const ctx = mk([]);
  const d = off('1', '2026-11-05', 'holiday', { comment: 'Йом-кипур' });
  assert.equal(doh(d, ctx, 'ru'), '05.11.2026 — выходной — Праздник\nЙом-кипур');
  assert.equal(doh(d, ctx, 'he'), '05.11.2026 — יום חופש — חג\nЙом-кипур');
  setNameTranslator((s) => ({ Праздник: 'Holiday' }[s] ?? s));
  try { assert.equal(doh(d, ctx, 'en'), '05.11.2026 — day off — Holiday\nЙом-кипур'); } finally { setNameTranslator(null); }
  assert.equal(doh(off('2', '2026-11-06', 'sick'), ctx, 'ru'), '06.11.2026 — выходной — Болезнь');
  assert.equal(dohTop(d, ctx, 'ru'), '05.11.2026 — выходной — Праздник');
  assert.equal(dohHeader(d, ctx, 'he'), '05.11.2026 — יום חופש — חג');
  assert.equal(dayOffLine({ offReason: 'weather' }, 'ru', '01.01.2026'), '01.01.2026 — выходной — Погода');
});

test('workdaysReport: блок выходного по порядку дат, count и offCount, одна дата двух проектов один раз', () => {
  const days = [
    work('1', '2026-11-03'),
    off('2', '2026-11-04', 'holiday', { comment: 'не должен попасть' }),
    { ...off('3', '2026-11-04', 'personal'), projectId: 'b' },     // the same date, another project: shown once (the earliest created)
    { ...work('4', '2026-11-05'), projectId: 'b', helper: 'сам' },
    off('5', '2026-10-31', 'sick'),                                  // another month
    { ...off('6', '2026-11-06', 'sick'), deleted: true },
    { ...off('7', '2026-11-07', 'sick'), projectId: 'zzz' },         // a project that is not live
  ];
  const r = workdaysReport(days, projects, '2026-11');
  assert.equal(r.count, 2); assert.equal(r.offCount, 1);
  assert.equal(r.text, 'Рабочие дни за ноябрь 2026\n\n03.11.2026\nМегасон Модиин с Мариной\n\n04.11.2026 — выходной — Праздник\n\n05.11.2026\nЭлектра Тель-Авив сам');
  assert.equal(workdaysList(days, projects, '2026-11').length, 3);
  // a month with only a day off
  const only = workdaysReport([off('1', '2026-12-24', 'weather')], projects, '2026-12');
  assert.equal(only.count, 0); assert.equal(only.offCount, 1);
  // a working day and a day off on one date (after an offline race) both show
  const both = workdaysReport([work('1', '2026-11-03'), { ...off('2', '2026-11-03', 'sick'), projectId: 'b' }], projects, '2026-11');
  assert.equal(both.count, 1); assert.equal(both.offCount, 1);
});

test('месяц: суммы и простои пропускают выходные, тексты месяца с их строкой', () => {
  const days = [work('1', '2026-11-03'), off('2', '2026-11-04', 'holiday', { comment: 'Йом-кипур' }), off('3', '2026-11-05', 'other', { offText: 'Свадьба' })];
  const entries = [
    { id: 'e1', dayId: 'd-none', workType: 'Время', workId: 'T_WAIT', minutes: 60 },     // an entry of a day that does not exist: not counted
    { id: 'e2', dayId: '1', workType: 'Время', workId: 'T_WAIT', minutes: 90, delayCulprit: 'Заказчик', delayMinutes: 30 },
    { id: 'e3', dayId: '2', workType: 'Время', workId: 'T_WAIT', minutes: 600, delayCulprit: 'Заказчик', delayMinutes: 500 },   // a stray entry on a day off: skipped
  ];
  const ctx = mk(days, entries);
  const s = monthSummary(ctx, '2026-11');
  assert.equal(s.days, 1); assert.equal(s.hours, 1.5);
  const dt = downtimeByCulprit(ctx, '2026-11');
  assert.equal(dt.totalMinutes, 30);
  const ru = monthReportRu(ctx, '2026-11');
  assert.ok(ru.includes('04.11.2026 — выходной — Праздник\nЙом-кипур'));
  assert.ok(ru.includes('05.11.2026 — выходной — Свадьба'));
  const he = monthReportHe(ctx, '2026-11');
  assert.ok(he.includes('04.11.2026 — יום חופש — חג\nЙом-кипур'));
  assert.ok(he.includes('סה"כ שעות: 1.5'));
});

test('Excel: выходной — одна строка «Выходной», причина в колонке работы, комментарий в конце', () => {
  const ctx = mk([work('1', '2026-11-03'), off('2', '2026-11-04', 'holiday', { comment: 'Йом-кипур' })]);
  const rows = exportSheets(projects[0], ctx).find((x) => x.name === 'Дни и работы').rows;
  assert.equal(rows.length, 3);   // the header, a working day without entries, a day off
  const r = rows[2];
  assert.deepEqual([r[0], r[3], r[4], r[13]], ['2026-11-04', 'Выходной', 'Праздник', 'Йом-кипур']);
});
