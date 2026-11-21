// Checks what «Что осталось» records (spec 7 § 4, § 10): remainingPreset for the record button, the pull limited to the ticked cables
// (pullGroups with onlyCables), and that a pull entry of «Несколько работ» reads the same as the one-work form's after the journal rows are written.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOG, POINT_TYPES, CABLES, DEVICES, UNITS, EXAMPLE_PROBLEMS, composedTypes,
  buildContext, pointInfo, entryLine, pullGroups, remainingPreset, pullWorkOf, leftTasks,
} from '../src/domain/index.js';
import { testPlanData } from '../src/domain/testplan.js';

const data = testPlanData();
// the test drawing's points, plus a biometric reader with nothing pulled and an old-scheme point (a type with no composition)
const extra = [
  { id: 'K02', label: 'FB/K-02', typeId: 'Коре биометри', cabinet: 'FB', deleted: false },
  { id: 'OLD1', label: 'O-01', typeId: 'Старый', cabinet: 'FB', deleted: false },
];
const mk = ({ entries = [], journal = [] } = {}) => buildContext({
  projects: [{ id: 'P' }], points: [...data.points, ...extra].map((p) => ({ projectId: 'P', ...p })),
  journal: [...data.journal, ...journal], problemMarks: data.marks, configs: data.configs, days: [{ id: 'D', date: '2026-11-21' }], entries,
  catalog: CATALOG, types: [...composedTypes(POINT_TYPES), { id: 'Старый', stages: ['Протяжка', 'Хивут'], defaultCable: '6005' }],
  cables: CABLES, devices: DEVICES, units: UNITS, cabinetSettings: [], shared: { problems: EXAMPLE_PROBLEMS },
});
const ctx = mk();
const P = (label) => [...ctx.points.values()].find((p) => p.label === label);
const S = (...v) => new Set(v);

test('the pull work is the first active one by points, never «Протяжка без точек»', () => {
  assert.equal(pullWorkOf(ctx).id, 'PR_PTS');
  const noPts = { ...ctx, catalog: new Map([...ctx.catalog].filter(([id]) => id !== 'PR_PTS')) };
  assert.equal(pullWorkOf(noPts), null, 'PR_MAN applies to no point');
});

test('remainingPreset: one w:, one p:, two w:, p: + w:, two p:', () => {
  const one = remainingPreset(S('w:HIV_KEY'), ['a'], ctx);
  assert.equal(one.mode, 'one'); assert.deepEqual(one.workIds, ['HIV_KEY']); assert.equal(one.pullCables, null); assert.deepEqual(one.left, []);
  assert.deepEqual(one.one, { workId: 'HIV_KEY', workType: 'Хивут' });
  const pull = remainingPreset(S('p:cat7'), ['a'], ctx);
  assert.equal(pull.mode, 'one'); assert.deepEqual(pull.workIds, ['PR_PTS']); assert.deepEqual(pull.pullCables, ['cat7']);
  assert.deepEqual(pull.one, { workType: 'Протяжка', workId: 'PR_PTS', cableId: 'cat7', onlyCables: ['cat7'] });
  const two = remainingPreset(S('w:HIV_KEY', 'w:INS_CAM'), ['a', 'b'], ctx);
  assert.equal(two.mode, 'many'); assert.deepEqual(two.workIds, ['HIV_KEY', 'INS_CAM']); assert.equal(two.pullCables, null); assert.equal(two.one, null);
  assert.deepEqual(two.pointIds, ['a', 'b']);
  const mixed = remainingPreset(S('p:cat7', 'w:HIV_KEY'), ['a'], ctx);
  assert.equal(mixed.mode, 'many'); assert.deepEqual(mixed.workIds, ['HIV_KEY', 'PR_PTS']); assert.deepEqual(mixed.pullCables, ['cat7']);
  const pulls = remainingPreset(S('p:cat7', 'p:6005'), ['a'], ctx);
  assert.equal(pulls.mode, 'many'); assert.deepEqual(pulls.workIds, ['PR_PTS'], 'the pull work once'); assert.deepEqual(pulls.pullCables, ['cat7', '6005']);
});

test('remainingPreset: s: keys of old points cannot be recorded; nothing ticked is none', () => {
  const only = remainingPreset(S('s:Хивут'), ['a'], ctx);
  assert.equal(only.mode, 'none'); assert.deepEqual(only.workIds, []); assert.deepEqual(only.left, ['Хивут']);
  const mixed = remainingPreset(S('s:Хивут', 'w:HIV_KEY', 'w:INS_CAM'), ['a'], ctx);
  assert.equal(mixed.mode, 'many'); assert.deepEqual(mixed.workIds, ['HIV_KEY', 'INS_CAM']); assert.deepEqual(mixed.left, ['Хивут']);
  assert.equal(remainingPreset(S(), [], ctx).mode, 'none');
  assert.equal(remainingPreset(undefined, undefined, ctx).mode, 'none');
});

test('pull limit: FB/K-01 has 6005 pulled and cat7 left — only cat7; a reader with both left keeps the ticked one', () => {
  const k1 = P('FB/K-01'); const k2 = P('FB/K-02');
  assert.deepEqual(leftTasks(k1, ctx).filter((t) => t.key.startsWith('p:')).map((t) => t.key), ['p:cat7']);
  const main = (p) => pointInfo(p, ctx).cable;
  assert.deepEqual(pullGroups([k1], ctx, null, main, ['cat7']), { groups: [['cat7', [k1.id]]], done: [] });
  assert.deepEqual(pullGroups([k1], ctx, null, main, ['6005']), { groups: [], done: ['FB/K-01'] }, '6005 is done there');
  // without the limit the reader with nothing pulled gives both cables (bug D3 when only cat7 was ticked)
  assert.deepEqual(pullGroups([k2], ctx, null, main).groups.map(([c]) => c).sort(), ['6005', 'cat7']);
  assert.deepEqual(pullGroups([k2], ctx, null, main, ['cat7']).groups, [['cat7', [k2.id]]]);
  assert.deepEqual(pullGroups([k1, k2], ctx, null, main, ['cat7', '6005']).groups.sort(), [['6005', [k2.id]], ['cat7', [k1.id, k2.id]]]);
});

test('pull limit: an old point goes by its main cable', () => {
  const old = P('O-01');
  assert.ok(!pointInfo(old, ctx).composed, 'an old-scheme point');
  assert.deepEqual(pullGroups([old], ctx, null, () => '6005', ['6005']).groups, [['6005', [old.id]]]);
  assert.deepEqual(pullGroups([old], ctx, null, () => '6005', ['cat7']), { groups: [], done: ['O-01'] });
});

test('entries alike: a pull of «Несколько работ» for one cable and of the one-work form give the same report line and point status', () => {
  const k1 = P('FB/K-01'); const k2 = P('FB/K-02');
  const pointIds = [k1.id, k2.id];
  // «Несколько работ» (batchForm) writes these fields only
  const batch = { id: 'E1', dayId: 'D', workType: 'Протяжка', workId: 'PR_PTS', pointIds, cableId: 'cat7', result: undefined };
  // the one-work form (saveGroups) writes the extras too; clean() in repo.js stores the empty ones as null
  const form = { id: 'E1', dayId: 'D', workType: 'Протяжка', workId: 'PR_PTS', pointIds, cableId: 'cat7', deviceIds: null,
    minutes: null, culprit: null, note: null, delayReason: null, delayCulprit: null, delayNote: null, delayMinutes: null, result: null };
  // the journal rows syncJournal writes for the entry
  const journal = pointIds.map((pid) => ({ id: `E1_${pid}`, entryId: 'E1', pointId: pid, deleted: false }));
  const a = mk({ entries: [batch], journal }); const b = mk({ entries: [form], journal });
  assert.equal(entryLine(batch, a), entryLine(form, b));
  assert.equal(entryLine(batch, a, 'he'), entryLine(form, b, 'he'));
  assert.match(entryLine(batch, a), /cat7/);
  pointIds.forEach((id) => assert.deepEqual(pointInfo(a.points.get(id), a), pointInfo(b.points.get(id), b)));
  // after the entry FB/K-01 is fully pulled; FB/K-02 still waits for 6005 only
  assert.equal(!!pointInfo(a.points.get(k1.id), a).pulled, true);
  assert.deepEqual(leftTasks(a.points.get(k2.id), a).filter((t) => t.key.startsWith('p:')).map((t) => t.key), ['p:6005']);
});
