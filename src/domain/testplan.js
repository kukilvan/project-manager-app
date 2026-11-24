// The test drawing: a generated one-page PDF and the points, journal rows, problem marks and door configuration that show every progress look of the plan.
// A second entry, «Test drawing 2», is the same PDF under its own file name with no points, for switching drawings.
// Pure, no DOM and no network; built on seed.js (types, devices) and doorcfg.js (the standard «ЭМ» door). The app side is src/app/testplan.js, started by `?mem=1&memPlan=1` (spec 7 § 6).
// Positions are PDF points; `pos` is the caption's center from the top-left corner, as the plan reads it.
import { POINT_TYPES, DEVICES, composedTypes } from './seed.js';
import { standardDoorCfgs, doorLockOf } from './doorcfg.js';

export const TEST_SHEET = 'test-plan.pdf';
export const TEST_SHEET_2 = 'test-plan-2.pdf';
export const TEST_PAGE = { w: 600, h: 400 };
const FONT = 9;                  // caption size, Helvetica
const BOX_H = 8;                 // height of a caption's frame
const DATE = '2026-11-20';       // the day every journal row carries

// Helvetica advance widths (1/1000 em) of the characters a caption may use
const WIDTH = { ' ': 278, '-': 333, '/': 278, 0: 556, 1: 556, 2: 556, 3: 556, 4: 556, 5: 556, 6: 556, 7: 556, 8: 556, 9: 556,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611 };
export const captionWidth = (text) => [...String(text)].reduce((n, ch) => n + (WIDTH[ch] ?? 556), 0) * FONT / 1000;

// [text, left x, baseline y] in PDF coordinates (origin bottom-left); rooms are grey rectangles [x, y, w, h]
const ROOMS = [[30, 200, 270, 180], [320, 200, 250, 180], [30, 30, 540, 140]];
const CAPTIONS = [
  ['FA/C-01', 50, 340], ['FA/C-02', 150, 340], ['FA/C-03', 50, 300], ['FA/C-04', 150, 300], ['FA/C-05', 50, 260], ['FA/W-01', 150, 260], ['FA/B-01-02', 210, 225], ['FA/C-06', 50, 225],
  ['FB/K-01', 340, 340], ['FB/D-01', 440, 340], ['FB/D-02', 340, 300], ['FB/G-01', 440, 300], ['FB/C-10 FB/C-11', 340, 260], ['G-02', 500, 260],
  ['X-99', 60, 120], ['X-98', 160, 120],
];
const placeOf = ([text, x, y]) => {
  const w = Math.round(captionWidth(text) * 10) / 10;
  return { sheet: TEST_SHEET, page: 0, x: Math.round((x + w / 2) * 10) / 10, y: Math.round((TEST_PAGE.h - (y + 3)) * 10) / 10, w, h: BOX_H, pw: TEST_PAGE.w, ph: TEST_PAGE.h, text };
};
const posByText = new Map(CAPTIONS.map((c) => [c[0], placeOf(c)]));

/** The PDF bytes: one page, grey rooms, Helvetica captions, an xref table with true offsets and a true /Length */
export function testPlanPdf() {
  const content = [
    '0.6 G 0.8 w',
    ...ROOMS.map(([x, y, w, h]) => `${x} ${y} ${w} ${h} re S`),
    '0 g',
    ...CAPTIONS.map(([text, x, y]) => `BT /F1 ${FONT} Tf ${x} ${y} Td (${text}) Tj ET`),
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${TEST_PAGE.w} ${TEST_PAGE.h}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  let out = '%PDF-1.4\n'; const offsets = [];
  objects.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(out, (ch) => ch.charCodeAt(0));
}

// the points of spec 7 § 6.3: [label, type, rack, state] — state: what the journal and the point itself carry
const slug = (s) => s.replace(/[^A-Za-z0-9]+/g, '_');
const POINTS = [
  ['FA/C-01', 'Камера', 'FA'],
  ['FA/C-02', 'Камера', 'FA', { length: 25 }],
  ['FA/C-03', 'Камера', 'FA', { works: [['PR_PTS']] }],
  ['FA/C-04', 'Камера', 'FA', { works: [['PR_PTS'], ['HIV_KEY']] }],
  ['FA/C-05', 'Камера', 'FA', { works: [['PR_PTS'], ['HIV_KEY'], ['HIV_DEV'], ['INS_CAM'], ['CHK_FLUKE'], ['SHL']] }],
  // everything done except the rack termination «Подключение в шкафу» (HIV_DEV): the point of idea 008 (spec 8 D12)
  ['FA/C-06', 'Камера', 'FA', { works: [['PR_PTS'], ['HIV_KEY'], ['INS_CAM'], ['CHK_FLUKE'], ['SHL']] }],
  ['FA/W-01', 'Вайфай', 'FA', { works: [['PR_PTS']], problem: true }],
  ['FA/B-01-02', 'Бакар', 'FA'],
  ['FB/K-01', 'Коре биометри', 'FB', { works: [['PR_PTS', '6005']] }],
  ['FB/D-01', 'Дверь', 'FB', { door: true, works: [['PR_PTS', '6005']] }],
  ['FB/D-02', 'Дверь', 'FB'],
  ['FB/G-01', 'Галай', 'FB', { works: [['PR_PTS'], ['HIV_DEV'], ['INS_GALAI']] }],
  ['FB/C-10', 'Камера', 'FB', { at: 'FB/C-10 FB/C-11', works: [['PR_PTS']] }],
  ['FB/C-11', 'Камера', 'FB', { at: 'FB/C-10 FB/C-11' }],
  ['G-02', 'Галай', ''],
  ['FC/C-01', 'Камера', 'FC', { off: true }],
  ['FC/C-02', 'Камера', 'FC', { off: true }],
];

/**
 * Everything the app writes for the test drawing: { drawing, drawing2, points, journal, marks, unlinked, hidden, configs }.
 * The drawing entry has no size, author or time (the app adds them); the problem mark points at the example problem `pr_cable` (the app re-points it at the pool's «Кабель»).
 */
export function testPlanData() {
  const types = composedTypes(POINT_TYPES);
  const dctx = { devices: new Map(DEVICES.map((d) => [d.id, d])) };
  const door = standardDoorCfgs(dctx).find((c) => doorLockOf(dctx, c)?.role === 'em');   // the standard electromagnet door
  const points = []; const journal = []; const marks = [];
  POINTS.forEach(([label, typeId, cabinet, o = {}]) => {
    if (!types.some((t) => t.id === typeId)) throw new Error(`test drawing: no type ${typeId}`);
    const id = slug(label);
    points.push({ id, label, typeId, cabinet, ...(o.off ? {} : { pos: posByText.get(o.at || label) }), ...(o.length ? { length: o.length } : {}), ...(o.door ? { configId: door.id } : {}), deleted: false });
    (o.works || []).forEach(([workId, cableId]) => journal.push({ id: `edit_${id}_${workId}`, pointId: id, editDate: DATE, editWorkId: workId, ...(cableId ? { editCableId: cableId } : {}), entryId: null, deleted: false }));
    if (o.problem) marks.push({ id: `mark_${id}`, pointId: id, problemId: 'pr_cable', descId: 'd_damaged', text: null, markedAt: Date.parse(`${DATE}T08:00:00Z`), markedBy: 'test-user', markedByName: 'Test user', solvedAt: null, solvedBy: null, solvedByName: null, deleted: false });
  });
  return {
    drawing: { id: 'DR_test', name: TEST_SHEET, title: 'Test drawing', pages: [{ ...TEST_PAGE }] },
    drawing2: { id: 'DR_test2', name: TEST_SHEET_2, title: 'Test drawing 2', pages: [{ ...TEST_PAGE }] },   // the same PDF under its own file name, no points: to switch drawings (spec 8 D12)
    points, journal, marks, configs: [{ id: door.id, name: door.name, devices: door.devices, cables: door.cables, kind: 'door', deleted: false }],
    unlinked: [{ label: 'X-99', typeId: '', pos: posByText.get('X-99') }],
    hidden: [{ label: 'X-98', typeId: '', pos: posByText.get('X-98') }],
  };
}
