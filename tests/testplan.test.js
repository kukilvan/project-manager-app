// Checks the test drawing (src/domain/testplan.js, spec 7 § 6): the generated PDF is well formed, every caption lies inside the page, labels are unique,
// and the points show every plan look of § 6.3 through planColor / markColor.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOG, POINT_TYPES, CABLES, DEVICES, UNITS, EXAMPLE_PROBLEMS, composedTypes,
  buildContext, planColor, markColor, PLAN_PALETTE, gradientColor, pointInfo, doorCfgOf, comparePoints,
} from '../src/domain/index.js';
import { testPlanPdf, testPlanData, captionWidth, TEST_PAGE, TEST_SHEET, TEST_SHEET_2 } from '../src/domain/testplan.js';

const text = Buffer.from(testPlanPdf()).toString('latin1');
const data = testPlanData();
const ctx = buildContext({
  projects: [{ id: 'P' }], points: data.points.map((p) => ({ projectId: 'P', ...p })), journal: data.journal, problemMarks: data.marks, configs: data.configs,
  catalog: CATALOG, types: composedTypes(POINT_TYPES), cables: CABLES, devices: DEVICES, units: UNITS, cabinetSettings: [], shared: { problems: EXAMPLE_PROBLEMS },
});
const point = (label) => ctx.points.get(data.points.find((p) => p.label === label).id);
const look = (label) => planColor(point(label), ctx);

test('test plan PDF: header, trailer and a page of the right size', () => {
  assert.ok(text.startsWith('%PDF-'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  assert.match(text, /\/MediaBox \[0 0 600 400\]/);
  assert.match(text, /\/BaseFont \/Helvetica/);
  assert.equal((text.match(/BT \/F1 9 Tf/g) || []).length, 16, 'one caption per label, 9 pt');
});

test('test plan PDF: every xref offset points at «N 0 obj», startxref at the table', () => {
  const x = text.indexOf('\nxref\n') + 1;
  assert.equal(Number(/startxref\n(\d+)\n/.exec(text)[1]), x);
  const [, count] = /xref\n0 (\d+)\n/.exec(text);
  const rows = text.slice(x).split('\n').slice(2, 2 + Number(count));
  assert.equal(rows.length, 6);
  rows.slice(1).forEach((r, i) => {
    assert.equal(r.length, 19, 'entry «offset gen n »');
    assert.equal(r.slice(11), '00000 n ');
    assert.ok(text.startsWith(`${i + 1} 0 obj`, Number(r.slice(0, 10))), `object ${i + 1}`);
  });
});

test('test plan PDF: /Length is the length of the content stream', () => {
  const m = /<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/.exec(text);
  assert.equal(Number(m[1]), m[2].length);
});

test('test plan data: the drawing entry, unique labels and ids, every position inside the page and 20 pt from the edges', () => {
  assert.equal(data.drawing.name, TEST_SHEET);
  assert.deepEqual(data.drawing.pages, [{ w: 600, h: 400 }]);
  const labels = data.points.map((p) => p.label);
  assert.equal(new Set(labels).size, labels.length);
  assert.equal(new Set(data.points.map((p) => p.id)).size, data.points.length);
  const all = [...data.points.filter((p) => p.pos).map((p) => p.pos), ...data.unlinked.map((u) => u.pos), ...data.hidden.map((u) => u.pos)];
  all.forEach((pos) => {
    assert.equal(pos.sheet, TEST_SHEET); assert.equal(pos.page, 0);
    assert.ok(pos.x - pos.w / 2 >= 20 && pos.x + pos.w / 2 <= TEST_PAGE.w - 20, `x of ${pos.text}`);
    assert.ok(pos.y - pos.h / 2 >= 20 && pos.y + pos.h / 2 <= TEST_PAGE.h - 20, `y of ${pos.text}`);
    assert.ok(Math.abs(pos.w - captionWidth(pos.text)) < 0.1, `width of ${pos.text}`);
    assert.ok(text.includes(`(${pos.text}) Tj`), `${pos.text} is printed on the PDF`);
  });
});

test('test plan data: captions do not overlap (the shared mark is one caption)', () => {
  const boxes = new Map(); [...data.points.filter((p) => p.pos).map((p) => p.pos), ...data.unlinked.map((u) => u.pos), ...data.hidden.map((u) => u.pos)].forEach((p) => boxes.set(p.text, p));
  const list = [...boxes.values()];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i]; const b = list[j];
    assert.ok(Math.abs(a.x - b.x) >= (a.w + b.w) / 2 || Math.abs(a.y - b.y) >= (a.h + b.h) / 2, `${a.text} / ${b.text}`);
  }
});

test('test plan look: default frames, blue for the measured length, pink, gradient early and later, dark green, red', () => {
  ['FA/C-01', 'FA/B-01-02', 'FB/D-02', 'G-02'].forEach((l) => assert.equal(look(l).color, PLAN_PALETTE.gray, l));
  assert.equal(look('FA/C-02').color, PLAN_PALETTE.blue, 'a length only');
  assert.equal(look('FA/C-03').color, PLAN_PALETTE.pink);
  assert.equal(look('FB/D-01').color, PLAN_PALETTE.pink);
  const early = look('FA/C-04'); const later = look('FB/G-01');
  assert.equal(early.color, gradientColor(0)); assert.ok(early.j >= 1 && early.j < early.M);
  assert.ok(later.j > early.j && later.j < later.M, 'more works done than the early one, not all');
  assert.ok(later.color !== early.color && later.color !== PLAN_PALETTE.pink && later.color !== PLAN_PALETTE.full);
  const full = look('FA/C-05');
  assert.equal(full.color, PLAN_PALETTE.full); assert.equal(full.full, true); assert.ok(full.width > 1);
  const red = look('FA/W-01'); assert.equal(red.color, PLAN_PALETTE.red); assert.equal(red.red, true);
});

test('test plan look: the pull circles of a point with one cable of two pulled', () => {
  const k = look('FB/K-01');
  assert.deepEqual(k.pull, { done: 1, total: 2 });
  assert.equal(k.color, PLAN_PALETTE.pink);
  assert.equal(look('FA/C-03').pull, null, 'a finished pull has no circles');
});

test('test plan look: the standard «ЭМ» door configuration and its 6005 pull', () => {
  const cfg = doorCfgOf(point('FB/D-01'), ctx);
  assert.ok(cfg && cfg.cables.some((c) => c.cable === '6005' && c.count === 2));
  assert.equal(pointInfo(point('FB/D-01'), ctx).pulled !== '', true, 'the 6005 pull closes the door\'s pull');
  assert.equal(doorCfgOf(point('FB/D-02'), ctx), null);
});

test('test plan look: FB/C-10 and FB/C-11 share one mark, in the color of the least finished', () => {
  const a = point('FB/C-10'); const b = point('FB/C-11');
  assert.deepEqual(a.pos, b.pos);
  assert.equal(planColor(a, ctx).color, PLAN_PALETTE.pink);
  assert.equal(planColor(b, ctx).color, PLAN_PALETTE.gray);
  assert.equal(markColor([a, b].sort(comparePoints), ctx).color, PLAN_PALETTE.gray);
});

test('test plan data: no rack, off the drawing, unlinked and hidden', () => {
  assert.equal(point('G-02').cabinet, '');
  ['FC/C-01', 'FC/C-02'].forEach((l) => { assert.equal(point(l).pos, undefined); assert.equal(point(l).cabinet, 'FC'); });
  assert.deepEqual(data.unlinked.map((u) => u.label), ['X-99']);
  assert.deepEqual(data.hidden.map((u) => u.label), ['X-98']);
  assert.ok(!data.points.some((p) => ['X-99', 'X-98'].includes(p.label)), 'they are not points');
});

test('test plan look: FA/C-06 — everything done but the rack termination: a shade with every work ticked, dark green without it (idea 008)', () => {
  const pt = point('FA/C-06');
  assert.ok(pt.pos, 'FA/C-06 has a caption on the page');
  assert.ok(text.includes('(FA/C-06) Tj'));
  const shade = look('FA/C-06');
  assert.equal(shade.j, 4); assert.equal(shade.M, 5); assert.equal(shade.color, gradientColor(3 / 4)); assert.equal(shade.full, false);
  assert.ok(!data.journal.some((r) => r.pointId === pt.id && r.editWorkId === 'HIV_DEV'), 'HIV_DEV is the open work');
  const ctx2 = buildContext({
    projects: [{ id: 'P' }], points: data.points.map((p) => ({ projectId: 'P', ...p })), journal: data.journal, problemMarks: data.marks, configs: data.configs,
    catalog: CATALOG.map((w) => (w.id === 'HIV_DEV' ? { ...w, planColour: false } : w)), types: composedTypes(POINT_TYPES), cables: CABLES, devices: DEVICES, units: UNITS, cabinetSettings: [], shared: { problems: EXAMPLE_PROBLEMS },
  });
  const dark = planColor(ctx2.points.get(pt.id), ctx2);
  assert.equal(dark.color, PLAN_PALETTE.full); assert.equal(dark.full, true); assert.ok(dark.width > 1);
  // FA/C-05 stays dark green, FA/C-04 keeps its shade
  assert.equal(planColor(ctx2.points.get(point('FA/C-05').id), ctx2).color, PLAN_PALETTE.full);
  assert.equal(planColor(ctx2.points.get(point('FA/C-04').id), ctx2).color, look('FA/C-04').color);
});

test('test plan data: «Test drawing 2» — the same sheet under its own file name, its own id, no points on it (idea 009)', () => {
  const d2 = data.drawing2;
  assert.equal(d2.name, TEST_SHEET_2); assert.notEqual(d2.name, data.drawing.name);
  assert.notEqual(d2.id, data.drawing.id);
  assert.equal(d2.title, 'Test drawing 2');
  assert.deepEqual(d2.pages, data.drawing.pages);
  assert.ok(![...data.points.filter((p) => p.pos).map((p) => p.pos.sheet), ...data.unlinked.map((u) => u.pos.sheet), ...data.hidden.map((u) => u.pos.sheet)].includes(d2.name), 'no point, unlinked or hidden caption points at it');
});
