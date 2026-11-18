// Checks the plan colors by progress (src/domain/plan.js): planColor by the table of stage 6 § 4.1, the shared-mark rule, the legend and palette,
// the «PDF с номерами» input and fingerprint, the plan filter groups, and leftTasks of src/domain/remaining.js against the old «Что осталось» function.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOG, POINT_TYPES, CABLES, UNITS, CULPRITS, DELAY_REASONS, EXAMPLE_PROBLEMS,
  buildContext, pointInfo, missingStages, leftTasks,
  planColor, markColor, pointStages, PLAN_PALETTE, PLAN_LEGEND, FULL_WIDTH, numberedInput, numberedHash, planFilterMatch, planFilterGroups, LEFT_FILTERS,
} from '../src/domain/index.js';

const project = { id: 'P1', name: 'Mega Or' };
const TYPES = [
  ...POINT_TYPES,
  { id: 'Два', stages: ['Протяжка', 'Хивут'] },
  { id: 'Одна', defaultCable: '6005', defaultCables: 1, extraCables: [{ cable: 'cat7', count: 1 }], stages: ['Протяжка'] },
  { id: 'Старый' },  // a legacy type without `stages`: all five count
  { id: 'Интерком', defaultCable: '6005', defaultCables: 1, extraCables: [{ cable: 'cat7', count: 1 }], stages: ['Протяжка', 'Хивут'] },
  { id: 'Комп', devices: [{ deviceId: 'DV', count: 1 }] },
  { id: 'Пусто', devices: [] },  // composite, no works at all
];
const DEVICES = [{ id: 'DV', name: 'Прибор', cables: [{ cable: 'cat7', count: 1 }], workIds: ['INS_CAM'] }];
const ACTION = { PR_PTS: 'Протяжка', HIV_KEY: 'Хивут', INS_CAM: 'Установка', CHK_FLUKE: 'Проверка', SHL: 'Шилют' };
// works done on points: [pointId, workId, extra?] → entries and journal rows of one day
function make(points, works = [], extra = {}) {
  const entries = works.map(([pid, w, x], i) => ({ id: `e${i + 1}`, dayId: 'D1', workType: ACTION[w] || 'Протяжка', workId: w, pointIds: [pid], result: 'Работает', createdAt: i + 1, ...(x || {}) }));
  const journal = entries.map((e) => ({ id: `j-${e.id}`, entryId: e.id, pointId: e.pointIds[0] }));
  return buildContext({
    projects: [project], points: points.map((p) => ({ projectId: 'P1', cabinet: '1A', ...p })), days: [{ id: 'D1', projectId: 'P1', date: '2026-11-18' }], entries, journal,
    cabinetSettings: [], catalog: CATALOG, types: TYPES, cables: CABLES, devices: DEVICES, units: UNITS, culprits: CULPRITS, delayReasons: DELAY_REASONS, ...extra,
  });
}
const FIVE = ['PR_PTS', 'HIV_KEY', 'INS_CAM', 'CHK_FLUKE', 'SHL'];
const first = (id, n, order = FIVE) => order.slice(0, n).map((w) => [id, w]);
const colorOf = (typeId, works, pt = {}) => { const ctx = make([{ id: 'a', label: 'A-01', typeId, ...pt }], works); return planColor(ctx.points.get('a'), ctx); };

test('план: палитра «Жёлтые чуть темнее» и легенда', () => {
  assert.deepEqual(PLAN_PALETTE.steps, ['#f2c80f', '#c0ca33', '#8bc34a', '#43a047']);
  assert.equal(PLAN_PALETTE.full, '#1b5e20'); assert.equal(PLAN_PALETTE.red, '#ff1744');
  assert.equal(PLAN_PALETTE.gray, '#9e9e9e'); assert.equal(PLAN_PALETTE.blue, '#2979ff');
  assert.deepEqual(PLAN_LEGEND.map((x) => x.ru), ['новая', 'померяно', '≈ 20%', '≈ 40%', '≈ 60%', '≈ 80%', 'готово', 'проблема / неисправна']);
  assert.deepEqual(PLAN_LEGEND.map((x) => x.he), ['חדשה', 'נמדד', '≈ 20%', '≈ 40%', '≈ 60%', '≈ 80%', 'הושלם', 'בעיה / תקלה']);
  assert.deepEqual(PLAN_LEGEND.filter((x) => x.thick).map((x) => x.color), ['#1b5e20']);
  assert.ok(LEFT_FILTERS.some(([v, t]) => v === 'Шилют' && t === 'Осталось: шилют'));
});

test('план: шаг цвета по таблице § 4.1 (5, 4, 3, 2 этапа)', () => {
  const step = (typeId, n, order) => colorOf(typeId, first('a', n, order)).step;
  assert.deepEqual([1, 2, 3, 4].map((n) => step('Камера', n)), [1, 2, 3, 4]);                     // 5 stages
  const four = ['PR_PTS', 'HIV_KEY', 'CHK_FLUKE', 'SHL'];                                        // «Точка»: 4 stages
  assert.deepEqual([1, 2, 3].map((n) => step('Точка', n, four)), [1, 3, 4]);
  const three = ['PR_PTS', 'HIV_KEY', 'CHK_FLUKE'];                                              // «Бакар»: 3 stages
  assert.deepEqual([1, 2].map((n) => step('Бакар', n, three)), [2, 3]);
  assert.equal(step('Два', 1), 3);                                                               // 2 stages
  const c = colorOf('Камера', first('a', 2));
  assert.equal(c.color, '#c0ca33'); assert.deepEqual(c.done, [true, true, false, false, false]); assert.equal(c.dots, true); assert.equal(c.full, false); assert.equal(c.width, 1);
  assert.deepEqual(c.stages, ['Протяжка', 'Хивут', 'Установка', 'Проверка', 'Шилют']);
  // the dots leave out the pull (the yellow shows it): termination done, installation, check and labels not
  assert.deepEqual(c.dotDone, [true, false, false, false]);
  // pulled only, no other work: no dots at all (the yellow says it)
  const pulled = colorOf('Камера', first('a', 1)); assert.equal(pulled.step, 1); assert.equal(pulled.dots, false);
  assert.equal(colorOf('Точка', first('a', 1, ['PR_PTS'])).dots, false);
});

test('план: всё сделано — тёмно-зелёная толстая рамка, без кружков', () => {
  const c = colorOf('Камера', first('a', 5));
  assert.equal(c.color, '#1b5e20'); assert.equal(c.full, true); assert.equal(c.width, FULL_WIDTH); assert.equal(FULL_WIDTH * 2, 3.5); assert.equal(c.dots, false);
  // a checked point without shilut: step 4 of 5, four filled dots and one empty
  const d = colorOf('Камера', first('a', 4));
  assert.equal(d.color, '#43a047'); assert.deepEqual(d.done, [true, true, true, true, false]); assert.deepEqual(d.dotDone, [true, true, true, false]);
});

test('план: ничего не начато — серая, с длиной синяя, без кружков', () => {
  const g = colorOf('Камера', []); assert.equal(g.color, '#9e9e9e'); assert.equal(g.dots, false);
  const b = colorOf('Камера', [], { length: 12 }); assert.equal(b.color, '#2979ff'); assert.equal(b.dots, false);
  // a composite point whose type has no works: gray / blue
  assert.equal(colorOf('Пусто', []).color, '#9e9e9e'); assert.equal(colorOf('Пусто', [], { length: 5 }).color, '#2979ff');
  assert.equal(colorOf('Пусто', []).n, 0);
});

test('план: часть кабелей протянута — шаг 1, кружков нет', () => {
  const c = colorOf('Интерком', [['a', 'PR_PTS', { cableId: '6005' }]]);
  assert.equal(c.step, 1); assert.equal(c.color, '#f2c80f'); assert.deepEqual(c.done, [false, false]); assert.equal(c.dots, false); assert.deepEqual(c.dotDone, [false]);
  // a type whose only stage is the pull has no dots at all
  const ctx = make([{ id: 'a', label: 'A-01', typeId: 'Одна' }], [['a', 'PR_PTS', { cableId: '6005' }]]);
  const one = planColor(ctx.points.get('a'), ctx); assert.equal(one.step, 1); assert.deepEqual(one.dotDone, []); assert.equal(one.dots, false);
});

test('план: открытая проблема и «Неисправна» красные при любом прогрессе', () => {
  const marks = [{ id: 'm1', pointId: 'a', problemId: 'pr_cable', markedAt: 1 }];
  const ctx = make([{ id: 'a', label: 'A-01', typeId: 'Камера' }], first('a', 5), { problemMarks: marks, shared: { problems: EXAMPLE_PROBLEMS } });
  const r = planColor(ctx.points.get('a'), ctx);
  assert.equal(r.color, '#ff1744'); assert.equal(r.red, true); assert.equal(r.full, false); assert.equal(r.dots, false);
  // a solved mark is not red any more
  const ctx2 = make([{ id: 'a', label: 'A-01', typeId: 'Камера' }], first('a', 5), { problemMarks: [{ ...marks[0], solvedAt: 2 }], shared: { problems: EXAMPLE_PROBLEMS } });
  assert.equal(planColor(ctx2.points.get('a'), ctx2).color, '#1b5e20');
  // «Неисправна» over two done stages; red until a check without fault
  const bad = colorOf('Камера', [...first('a', 3), ['a', 'CHK_FLUKE', { result: 'Не работает' }]]);
  assert.equal(bad.color, '#ff1744');
  const fixed = colorOf('Камера', [...first('a', 3), ['a', 'CHK_FLUKE', { result: 'Не работает' }], ['a', 'CHK_FLUKE']]);
  assert.equal(fixed.color, '#43a047');
});

test('план: старая точка по этапам типа, тип без `stages` — по всем пяти', () => {
  // «Бакар» has three stages: pull + termination done → 2 of 3 → step 3
  assert.equal(colorOf('Бакар', first('a', 2)).step, 3);
  assert.equal(colorOf('Бакар', first('a', 2)).n, 3);
  const old = colorOf('Старый', first('a', 1));
  assert.equal(old.n, 5); assert.equal(old.step, 1);
  // a composite point: the stages that have tasks (cat7 brings two terminations, the check and port labels; the device its installation)
  const ctx = make([{ id: 'a', label: 'A-01', typeId: 'Комп' }], [['a', 'PR_PTS'], ['a', 'HIV_KEY'], ['a', 'HIV_DEV']]);
  const st = pointStages(ctx.points.get('a'), ctx);
  assert.deepEqual(st.list.map((x) => `${x.stage}:${x.done ? 1 : 0}`), ['Протяжка:1', 'Хивут:1', 'Установка:0', 'Проверка:0', 'Шилют:0']);
  assert.equal(planColor(ctx.points.get('a'), ctx).step, 2);
  // one of two terminations done: the stage is not done yet, but the work is started
  const half = make([{ id: 'a', label: 'A-01', typeId: 'Комп' }], [['a', 'HIV_KEY']]);
  assert.deepEqual(planColor(half.points.get('a'), half).done, [false, false, false, false, false]); assert.equal(planColor(half.points.get('a'), half).step, 1);
  assert.equal(planColor(half.points.get('a'), half).dots, true);  // work beyond the pull: the dots show, all empty
});

test('план: общая отметка следует за наименее законченной точкой, красная — если любая красная', () => {
  const pos = { sheet: 'a.pdf', page: 0, x: 10, y: 10, w: 8, h: 8 };
  const ctx = make([{ id: 'a', label: 'TV-13', typeId: 'Камера', pos }, { id: 'b', label: 'TV-14', typeId: 'Камера', pos }], [...first('a', 5), ...first('b', 2)]);
  const pts = [ctx.points.get('a'), ctx.points.get('b')];
  const m = markColor(pts, ctx);
  assert.equal(m.color, '#c0ca33'); assert.deepEqual(m.done, [true, true, false, false, false]); assert.deepEqual(m.dotDone, [true, false, false, false]);
  // equal progress: the first label
  const ctx2 = make([{ id: 'a', label: 'TV-14', typeId: 'Камера', length: 5 }, { id: 'b', label: 'TV-13', typeId: 'Камера' }], []);
  assert.equal(markColor([ctx2.points.get('a'), ctx2.points.get('b')], ctx2).color, '#9e9e9e');
  const ctx3 = make([{ id: 'a', label: 'TV-13', typeId: 'Камера' }, { id: 'b', label: 'TV-14', typeId: 'Камера' }], [...first('a', 1), ['b', 'CHK_FLUKE', { result: 'Не работает' }]]);
  assert.equal(markColor([ctx3.points.get('a'), ctx3.points.get('b')], ctx3).color, '#ff1744');
  // «PDF с номерами»: both points of the pair carry the mark's color
  const input = numberedInput(ctx.points.values(), ctx, { name: 'a.pdf' });
  assert.deepEqual(input.map((x) => [x.label, x.color, x.full]), [['TV-13', '#c0ca33', false], ['TV-14', '#c0ca33', false]]);
});

test('PDF с номерами: цвета плана, толстая рамка у готовой, отпечаток', () => {
  const at = (x) => ({ sheet: 'a.pdf', page: 0, x, y: 10, w: 8, h: 8 });
  const pts = [{ id: 'a', label: 'C-01', typeId: 'Камера', pos: at(10) }, { id: 'b', label: 'C-02', typeId: 'Камера', pos: at(40), length: 3 }, { id: 'c', label: 'C-03', typeId: 'Камера', pos: at(70) }];
  const ctx = make(pts, first('c', 5));
  const d = { name: 'a.pdf' };
  const input = numberedInput(ctx.points.values(), ctx, d);
  assert.deepEqual(input.map((x) => [x.label, x.color, x.full]), [['C-01', '#9e9e9e', false], ['C-02', '#2979ff', false], ['C-03', '#1b5e20', true]]);
  // two builds of an unchanged project give the same fingerprint
  const h1 = numberedHash(input, d); assert.equal(numberedHash(numberedInput(make(pts, first('c', 5)).points.values(), make(pts, first('c', 5)), d), d), h1);
  // a new color changes it
  const ctx2 = make(pts, [...first('c', 5), ['a', 'PR_PTS']]);
  assert.notEqual(numberedHash(numberedInput(ctx2.points.values(), ctx2, d), d), h1);
  // the new look changes the fingerprint even of a drawing whose colors stay the same (gray and blue): the old formula gave another value
  const oldHash = (inp, dd) => {
    const s = JSON.stringify([inp.map((x) => [x.label, x.typeId, Math.round(x.pos.x), Math.round(x.pos.y), x.pos.page || 0, x.pos.icon ? 1 : 0, x.color]),
      (dd.hidden || []).map((m) => [Math.round(m.pos.x), Math.round(m.pos.y)]), dd.title || dd.name, '', []]);
    let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  };
  const gray = numberedInput(make(pts.slice(0, 2)).points.values(), make(pts.slice(0, 2)), d);
  assert.notEqual(numberedHash(gray, d), oldHash(gray, d));
});

test('план: фильтр — «Осталось: шилют», группа «Работа» и «Проблемы»', () => {
  const marks = [{ id: 'm1', pointId: 'b', problemId: 'pr_cable', markedAt: 1 }, { id: 'm2', pointId: 'c', problemId: 'pr_access', markedAt: 2 }, { id: 'm3', pointId: 'c', problemId: 'pr_cable', markedAt: 3 }];
  const ctx = make([{ id: 'a', label: 'C-01', typeId: 'Камера' }, { id: 'b', label: 'C-02', typeId: 'Камера' }, { id: 'c', label: 'B-01', typeId: 'Бакар' }],
    [...first('a', 4), ...first('b', 1)], { problemMarks: marks, shared: { problems: EXAMPLE_PROBLEMS } });
  const [a, b, c] = ['a', 'b', 'c'].map((id) => ctx.points.get(id));
  assert.equal(planFilterMatch('Шилют', a, ctx), true);
  assert.equal(planFilterMatch('Шилют', c, ctx), false);  // «Бакар» has no shilut stage
  assert.equal(planFilterMatch('Хивут', b, ctx), true); assert.equal(planFilterMatch('Хивут', a, ctx), false);
  assert.equal(planFilterMatch('', a, ctx), true);
  assert.equal(planFilterMatch('pr|*', a, ctx), false); assert.equal(planFilterMatch('pr|*', b, ctx), true);
  assert.equal(planFilterMatch('pr|pr_access', c, ctx), true); assert.equal(planFilterMatch('pr|pr_access', b, ctx), false);
  const g = planFilterGroups([a, b, c], ctx);
  assert.deepEqual(g.problems, { n: 2, list: [{ problemId: 'pr_cable', n: 2 }, { problemId: 'pr_access', n: 1 }] });
  const hiv = g.works.find((w) => w.key === 's:Хивут'); assert.equal(hiv.n, 2);
  assert.ok(g.works.every((w) => w.n > 0));
  assert.equal(g.works[0].key, 's:Протяжка');  // pulls first
  assert.equal(planFilterMatch('w|s:Хивут', b, ctx), true); assert.equal(planFilterMatch('w|s:Хивут', a, ctx), false);
  assert.deepEqual(planFilterGroups([a], make([{ id: 'a', label: 'C-01', typeId: 'Камера' }])).problems, { n: 0, list: [] });
});

// The old «Что осталось» function of views/points.js (before it moved to src/domain/remaining.js), with pointInfo for the cached status
function oldLeftTasksOf(point, ctx) {
  const info = pointInfo(point, ctx); const out = new Map();
  const add = (key, label, chip) => { if (!out.has(key)) out.set(key, { key, label, chip }); };
  if (info.composed) {
    info.tasks.filter((t) => !t.done).forEach((t) => {
      if (t.stage === 'Протяжка') add(`p:${t.cable}`, `Протяжка ${t.cable}`, 'pul');
      else { const w = ctx.catalog.get(t.workId); add(`w:${t.workId}`, w?.name || t.workId, { 'Хивут': 'hiv', 'Установка': 'ins', 'Проверка': 'chk' }[t.stage] || ''); out.get(`w:${t.workId}`).qty = (out.get(`w:${t.workId}`).qty || 0) + t.qty; }
    });
  } else {
    const type = ctx.types.get(point.typeId); const has = (st) => !type?.stages || type.stages.includes(st);
    if (has('Протяжка') && !info.pulled && !info.pullDone) add('s:Протяжка', 'Протяжка', 'pul');
    missingStages(point, ctx).forEach((m) => add(`s:${m}`, m, { 'Дотянуть': 'pul', 'Хивут': 'hiv', 'Установка': 'ins', 'Проверка': 'chk' }[m] || ''));
    if (has('Шилют') && !info.shilut && info.checked) add('s:Шилют', 'Шилют', '');
  }
  return [...out.values()];
}

test('leftTasks: тот же результат, что у старой функции «Что осталось»', () => {
  const pts = [
    { id: 'a', label: 'C-01', typeId: 'Камера' }, { id: 'b', label: 'C-02', typeId: 'Камера' }, { id: 'c', label: 'B-01', typeId: 'Бакар' },
    { id: 'i', label: 'I-01', typeId: 'Интерком' }, { id: 'k', label: 'K-01', typeId: 'Комп' }, { id: 'k2', label: 'K-02', typeId: 'Комп' },
    { id: 'o', label: 'O-01', typeId: 'Старый' }, { id: 'e', label: 'E-01', typeId: 'Пусто' }, { id: 'f', label: 'C-03', typeId: 'Камера' },
  ];
  const works = [...first('a', 4), ...first('b', 1), ['c', 'HIV_KEY'], ['i', 'PR_PTS', { cableId: '6005' }], ['k', 'PR_PTS'], ['k', 'INS_CAM'],
    ...first('o', 2), ...first('f', 3), ['f', 'CHK_FLUKE', { result: 'Не работает' }]];
  const ctx = make(pts, works);
  for (const p of ctx.points.values()) assert.deepEqual(leftTasks(p, ctx), oldLeftTasksOf(p, ctx), p.label);
  assert.ok(leftTasks(ctx.points.get('k'), ctx).some((t) => t.key.startsWith('w:')));
});
