// Checks the «Проблема» column of the management sheet (src/domain/report.js, src/app/managers.js, the nightly job lib): open problems one per line in the
// sheet's language, the red row color over the status color, the 7th legend cell, the hash, default profiles, the wrap request and the shared argument.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContext, buildReport, defaultTables, COLUMNS, POINT_TYPES, CATALOG, EXAMPLE_PROBLEMS, PROBLEM_COLOR } from '../src/domain/index.js';
import { sheetRequests, syncTable } from '../src/app/managers.js';
import { updateProjectTables } from '../scripts/server-tables-lib.mjs';

const NOW = new Date('2026-11-18T00:00:00Z');
const PROBLEMS = [...EXAMPLE_PROBLEMS, { id: 'pr_own', name: 'Своя', nameHe: 'משלי', types: [], descs: [] }];
const MARKS = [
  { id: 'm1', pointId: 'a', problemId: 'pr_cable', descId: 'd_damaged', markedAt: 20 }, // newer, listed second
  { id: 'm2', pointId: 'a', problemId: 'pr_magnet', descId: 'd_notdrilled', markedAt: 10 }, // older, listed first
  { id: 'm3', pointId: 'a', problemId: 'pr_lock', descId: 'd_nopower', markedAt: 5, solvedAt: 30 }, // solved: hidden
  { id: 'm4', pointId: 'b', problemId: 'pr_own', text: 'Dvarim ktuvim', markedAt: 1 },
];
const dataOf = (marks = MARKS, extra = {}) => ({
  projects: [{ id: 'p1', name: 'P', nameHe: 'פ' }],
  points: [
    { id: 'a', projectId: 'p1', label: 'A-01', typeId: 'Дверь' },
    { id: 'b', projectId: 'p1', label: 'B-01', typeId: 'Камера' },
    { id: 'c', projectId: 'p1', label: 'C-01', typeId: 'Камера' },
  ],
  types: POINT_TYPES, catalog: CATALOG, cables: [], problemMarks: marks, shared: { problems: PROBLEMS }, ...extra,
});
const build = (table, marks, extra) => {
  const data = dataOf(marks, extra); const ctx = buildContext(data);
  return { ctx, data, project: data.projects[0], rep: buildReport(data.projects[0], ctx, table, { now: NOW }) };
};
const cols = ['label', 'problem'];
const rowOf = (rep, label) => rep.sheets[0].rows.find((r) => r[0] === label);
// the color of the point row of `label` (rowColors goes with the rows after the header)
const colorOf = (sh, label) => { const first = sh.headerRow + 1; return sh.rowColors[sh.rows.findIndex((r, i) => i >= first && r[0] === label) - first]; };

test('problem column: after «Причина задержки», a profile tick', () => {
  const ids = COLUMNS.map((c) => c.id);
  assert.equal(ids[ids.indexOf('delay') + 1], 'problem');
  assert.deepEqual(COLUMNS.find((c) => c.id === 'problem'), { id: 'problem', ru: 'Проблема', he: 'בעיה', w: 260 });
});

test('problem column: open problems one per line, oldest first, solved hidden', () => {
  const { rep } = build({ ...defaultTables()[1], columns: cols, sections: false });
  assert.equal(rowOf(rep, 'A-01')[1], 'Магнит индикация: Не просверлены двери\nКабель: Кабель повреждён');
  assert.equal(rowOf(rep, 'B-01')[1], 'Своя: Dvarim ktuvim'); // own text as written
  assert.equal(rowOf(rep, 'C-01')[1], '');
  assert.ok(!JSON.stringify(rep.sheets[0].rows).includes('Нет питания')); // the solved one
});

test('problem column: the Hebrew sheet has the Hebrew names and descriptions', () => {
  const { rep } = build({ ...defaultTables()[0], columns: cols, sections: false });
  assert.equal(rowOf(rep, 'A-01')[1], 'מגנט חיווי: הדלתות לא קדוחות\nכבל: כבל פגום');
  assert.equal(rep.sheets[0].rows[rep.sheets[0].headerRow][1], 'בעיה');
  assert.ok(!/[Ѐ-ӿ]/.test(rowOf(rep, 'A-01')[1]), 'no Russian in the Hebrew cell');
});

test('row color: an open problem gives #E57373 over any status color; a solved one does not', () => {
  const t = { ...defaultTables()[1], columns: cols, sections: false };
  const sh = build(t).rep.sheets[0];
  assert.equal(PROBLEM_COLOR, '#E57373');
  assert.equal(colorOf(sh, 'A-01'), '#E57373'); assert.equal(colorOf(sh, 'B-01'), '#E57373'); assert.equal(colorOf(sh, 'C-01'), '');
  const solved = build(t, MARKS.map((m) => (m.pointId === 'b' ? { ...m, solvedAt: 99 } : m))).rep.sheets[0];
  assert.equal(colorOf(solved, 'B-01'), '');
  // over a status color: the point C-01 is checked (green) and has a problem
  const extra = { journal: [{ id: 'j1', pointId: 'c', editDate: '2026-10-04', editWorkId: 'CHK_FLUKE' }] };
  const green = build(t, [], extra).rep.sheets[0];
  assert.equal(colorOf(green, 'C-01'), '#C6E5C9');
  const both = build(t, [...MARKS, { id: 'm5', pointId: 'c', problemId: 'pr_cable', markedAt: 2 }], extra).rep.sheets[0];
  assert.equal(colorOf(both, 'C-01'), '#E57373');
});

test('legend: the 7th cell «Есть проблема» / «יש בעיה» in #E57373', () => {
  const ru = build({ ...defaultTables()[1], columns: cols, sections: false }).rep.sheets[0];
  const he = build({ ...defaultTables()[0], columns: cols, sections: false }).rep.sheets[0];
  assert.equal(ru.rows[ru.legendRow].length, 7);
  assert.equal(ru.rows[ru.legendRow][6], 'Есть проблема'); assert.equal(he.rows[he.legendRow][6], 'יש בעיה'); // cell G
  assert.equal(ru.legend.length, 7); assert.equal(ru.legend[6].color, '#E57373');
});

test('hash: marks change it, the same data keeps it', () => {
  const t = { ...defaultTables()[1], columns: cols, sections: false };
  const a = build(t).rep.hash;
  assert.notEqual(a, build(t, []).rep.hash);
  assert.equal(a, build(t).rep.hash);
});

test('default profiles: the main one has the column after «checked», the extended one after «delay»', () => {
  const [main, ext] = defaultTables();
  assert.equal(main.columns[main.columns.indexOf('checked') + 1], 'problem');
  assert.equal(ext.columns[ext.columns.indexOf('delay') + 1], 'problem');
});

test('a saved profile without the tick is unchanged', () => {
  const { rep } = build({ ...defaultTables()[0], columns: ['label', 'type'] });
  assert.deepEqual(rep.sheets[0].rows[rep.sheets[0].headerRow], ['נקודה', 'סוג']);
  assert.ok(!JSON.stringify(rep.sheets[0].rows).includes('מגנט'));
});

test('requests: the problem cells wrap, the legend covers A–G, the filter and the row color use every column', () => {
  const { rep } = build({ ...defaultTables()[1], columns: ['label', 'problem', 'note'], sections: false });
  const sh = rep.sheets[0]; const reqs = sheetRequests(7, sh);
  const wrap = reqs.filter((q) => q.repeatCell?.fields === 'userEnteredFormat.wrapStrategy');
  assert.equal(wrap.length, 1); assert.equal(wrap[0].repeatCell.cell.userEnteredFormat.wrapStrategy, 'WRAP');
  assert.deepEqual([wrap[0].repeatCell.range.startColumnIndex, wrap[0].repeatCell.range.endColumnIndex], [1, 2]);
  assert.deepEqual([wrap[0].repeatCell.range.startRowIndex, wrap[0].repeatCell.range.endRowIndex], sh.pointRuns[0]);
  const legend = reqs.filter((q) => q.repeatCell?.range.startRowIndex === sh.legendRow);
  assert.deepEqual(legend.map((q) => q.repeatCell.range.startColumnIndex), [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(reqs.find((q) => q.setBasicFilter).setBasicFilter.filter.range.endColumnIndex, 3);
  const red = JSON.stringify({ red: 0xE5 / 255, green: 0x73 / 255, blue: 0x73 / 255 });
  const reds = reqs.filter((q) => JSON.stringify(q.repeatCell?.cell.userEnteredFormat.backgroundColor) === red && q.repeatCell.range.startRowIndex > sh.headerRow);
  assert.ok(reds.length >= 1); // the row color: the problem column is an information column, so it is inside the colored range
  assert.ok(reds.some((q) => q.repeatCell.range.startColumnIndex <= 1 && q.repeatCell.range.endColumnIndex >= 2));
  // no points → no wrap request
  const none = build({ ...defaultTables()[1], columns: cols, sections: false, statuses: ['Неисправна'] }).rep.sheets[0];
  assert.equal(sheetRequests(7, none).filter((q) => q.repeatCell?.fields === 'userEnteredFormat.wrapStrategy').length, 0);
});

test('sync: a sheet saved with an old hash is rebuilt', async () => {
  const table = { ...defaultTables()[1], columns: cols, fileId: 'F', hash: 'hash-of-style-7' };
  const { ctx, project } = build(table);
  const calls = [];
  const api = { fileInfo: async () => ({ id: 'F', name: 'x' }), rename: async () => {}, sheetsOf: async () => [{ sheetId: 0, title: 'S' }], batch: async (id, r) => calls.push(['batch', r]), write: async () => calls.push(['write']) };
  const r = await syncTable(api, project, ctx, table, { now: NOW });
  assert.equal(r.changed, true); assert.ok(calls.some((c) => c[0] === 'batch'));
});

test('nightly job: problemMarks and the shared problems give the same sheet as the app', async () => {
  const table = { ...defaultTables()[1], columns: cols, sections: false, auto: true, fileId: 'F1' };
  const { data, project, ctx } = build(table);
  const written = [];
  const api = { fileInfo: async (id) => ({ id, name: 'x' }), rename: async () => {}, sheetsOf: async () => [{ sheetId: 0, title: 'S' }], batch: async () => {}, write: async (id, d) => { written.push(JSON.stringify(d)); } };
  const proj = { ...project, tables: [table] };
  const r = await updateProjectTables(api, proj, data, NOW, data.shared);
  assert.equal(r.patches[table.id].serverError, '');
  assert.match(written.join(''), /Магнит индикация: Не просверлены двери\\nКабель: Кабель повреждён/);
  assert.equal(r.patches[table.id].hash, buildReport(project, ctx, table, { now: NOW }).hash); // the app's hash equals the job's
  // without the pool the problem is labelled by its id, the open mark is still there
  written.length = 0;
  const { shared, ...noShared } = data; void shared;
  const r2 = await updateProjectTables(api, proj, noShared, NOW);
  assert.equal(r2.patches[table.id].serverError, '');
  assert.match(written.join(''), /pr_magnet/);
});
