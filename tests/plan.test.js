// Checks the plan colors (src/domain/plan.js): planColor by the rules of idea 006 (pink for pulled, an OKLab gradient by the works after the pull, circles for an unfinished pull), the shared-mark rule, the legend and palette,
// the «PDF с номерами» input and fingerprint, the plan filter groups, and leftTasks of src/domain/remaining.js against the old «Что осталось» function.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOG, POINT_TYPES, CABLES, UNITS, CULPRITS, DELAY_REASONS, EXAMPLE_PROBLEMS,
  buildContext, pointInfo, missingStages, leftTasks,
  planColor, markColor, pointStages, gradientColor, PLAN_PALETTE, PLAN_LEGEND, FULL_WIDTH, numberedInput, numberedHash, planFilterMatch, planFilterGroups, LEFT_FILTERS,
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
  { id: 'Без протяжки', stages: ['Хивут', 'Проверка'] },  // no pull stage: never pink
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

test('план: палитра и легенда', () => {
  assert.deepEqual({ ...PLAN_PALETTE }, { gray: '#9e9e9e', blue: '#2979ff', pink: '#E0609F', from: '#fdd835', to: '#2e9e45', full: '#1b5e20', red: '#ff1744' });
  assert.deepEqual(PLAN_LEGEND.map((x) => x.ru), ['новая', 'померяно', 'протянута', 'работы после протяжки', 'готово', 'проблема / неисправна', 'кружочки — протянутые кабели']);
  assert.deepEqual(PLAN_LEGEND.map((x) => x.he), ['חדשה', 'נמדד', 'נמשכה', 'עבודות אחרי המשיכה', 'הושלם', 'בעיה / תקלה', 'עיגולים – כבלים שנמשכו']);
  assert.deepEqual(PLAN_LEGEND.filter((x) => x.thick).map((x) => x.color), ['#1b5e20']);
  assert.deepEqual(PLAN_LEGEND.find((x) => x.gradient).gradient, ['#fdd835', '#2e9e45']);
  assert.deepEqual(PLAN_LEGEND.filter((x) => x.circles).map((x) => x.ru), ['кружочки — протянутые кабели']);
  assert.equal(PLAN_LEGEND.find((x) => x.ru === 'протянута').color, '#E0609F');
  assert.ok(LEFT_FILTERS.some(([v, t]) => v === 'Шилют' && t === 'Осталось: шилют'));
});

test('план: градиент OKLab — концы точные, оттенки между ними идут ровно', () => {
  assert.equal(gradientColor(0), '#fdd835'); assert.equal(gradientColor(1), '#2e9e45');
  assert.equal(gradientColor(-1), '#fdd835'); assert.equal(gradientColor(2), '#2e9e45');
  assert.equal(gradientColor(1 / 3), '#c1c63f'); assert.equal(gradientColor(2 / 3), '#82b244');
  // the lightness goes down evenly from the yellow to the green
  const lum = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const steps = Array.from({ length: 10 }, (_, i) => lum(gradientColor(i / 9)));
  const d = steps.slice(1).map((v, i) => steps[i] - v);
  assert.ok(d.every((x) => x > 0)); assert.ok(Math.max(...d) / Math.min(...d) < 3);
});

test('план: протянута и больше ничего — одна розовая у точек разных типов', () => {
  // 5, 4, 3 and 2 stages: the number of works after the pull does not matter
  assert.equal(colorOf('Камера', first('a', 1)).color, '#E0609F');
  assert.equal(colorOf('Точка', first('a', 1, ['PR_PTS', 'HIV_KEY', 'CHK_FLUKE', 'SHL'])).color, '#E0609F');
  assert.equal(colorOf('Бакар', first('a', 1, ['PR_PTS', 'HIV_KEY', 'CHK_FLUKE'])).color, '#E0609F');
  assert.equal(colorOf('Два', first('a', 1)).color, '#E0609F');
  const c = colorOf('Камера', first('a', 1));
  assert.equal(c.pull, null); assert.equal(c.full, false); assert.equal(c.width, 1); assert.equal(c.started, true);
  // a composite point: the pull done, its works not
  const ctx = make([{ id: 'a', label: 'A-01', typeId: 'Комп' }], [['a', 'PR_PTS']]);
  const k = planColor(ctx.points.get('a'), ctx); assert.equal(k.color, '#E0609F'); assert.equal(k.pull, null);
});

test('план: j работ после протяжки из M — ровный сдвиг от жёлтого к зелёному', () => {
  // «Камера»: M = 4 works after the pull (termination, installation, check, port labels)
  const col = (n) => colorOf('Камера', first('a', n));
  assert.deepEqual([2, 3, 4].map((n) => col(n).color), ['#fdd835', '#c1c63f', '#82b244']);
  assert.deepEqual([2, 3, 4].map((n) => [col(n).j, col(n).M]), [[1, 4], [2, 4], [3, 4]]);
  // «Бакар»: M = 2 — the first work is the yellow end; all done is the dark green
  const three = ['PR_PTS', 'HIV_KEY', 'CHK_FLUKE'];
  assert.equal(colorOf('Бакар', first('a', 2, three)).color, '#fdd835');
  assert.equal(colorOf('Бакар', first('a', 3, three)).color, '#1b5e20');
  // M = 10 (a composite point made by hand): the colors follow t = (j − 1) / 9 and the last work is the dark green
  const info = (j) => {
    const tasks = [{ stage: 'Протяжка', done: true, qty: 1 }, ...Array.from({ length: 10 }, (_, i) => ({ stage: 'Хивут', done: i < j, qty: 1 }))];
    return { composed: true, tasks, stages: ['Протяжка', 'Хивут'], stageStats: { 'Протяжка': { total: 1, done: 1 }, 'Хивут': { total: 10, done: j } }, status: 'Захивучена', pulled: '2026-11-18', pullDone: 1, pullTotal: 1 };
  };
  const pt = { id: 'x', label: 'X-01', typeId: 'Камера' }; const ctx = make([pt]);
  for (let j = 1; j <= 9; j++) assert.equal(planColor(ctx.points.get('x'), ctx, () => info(j)).color, gradientColor((j - 1) / 9), `j = ${j}`);
  assert.equal(planColor(ctx.points.get('x'), ctx, () => info(10)).color, '#1b5e20');
  // M = 1 («Два»: pull and termination): pulled — pink, done — dark green; the gradient is not used
  assert.equal(colorOf('Два', first('a', 1)).color, '#E0609F'); assert.equal(colorOf('Два', first('a', 2)).color, '#1b5e20');
});

test('план: всё сделано — тёмно-зелёная толстая рамка', () => {
  const c = colorOf('Камера', first('a', 5));
  assert.equal(c.color, '#1b5e20'); assert.equal(c.full, true); assert.equal(c.width, FULL_WIDTH); assert.equal(FULL_WIDTH * 2, 3.5);
  assert.equal(c.pull, null);
  // a checked point without shilut: 3 of 4 works, not dark green yet
  const d = colorOf('Камера', first('a', 4));
  assert.equal(d.color, '#82b244'); assert.deepEqual(d.done, [true, true, true, true, false]); assert.equal(d.full, false);
});

test('план: ничего не начато — серая, с длиной синяя', () => {
  const g = colorOf('Камера', []); assert.equal(g.color, '#9e9e9e'); assert.equal(g.pull, null); assert.equal(g.started, false);
  const b = colorOf('Камера', [], { length: 12 }); assert.equal(b.color, '#2979ff');
  // a composite point whose type has no works: gray / blue
  assert.equal(colorOf('Пусто', []).color, '#9e9e9e'); assert.equal(colorOf('Пусто', [], { length: 5 }).color, '#2979ff');
  assert.equal(colorOf('Пусто', []).n, 0);
});

test('план: часть кабелей протянута — розовая и кружочки по кабелям', () => {
  // «Интерком»: 6005 and cat7; only 6005 pulled, no other work: pink with a circle per cable
  const c = colorOf('Интерком', [['a', 'PR_PTS', { cableId: '6005' }]]);
  assert.equal(c.color, '#E0609F'); assert.deepEqual(c.pull, { done: 1, total: 2 }); assert.deepEqual(c.done, [false, false]);
  // other works already done: the gradient colour (the only work after the pull, the pull unfinished — the top shade) and the circles stay
  const w = colorOf('Интерком', [['a', 'PR_PTS', { cableId: '6005' }], ['a', 'HIV_KEY']]);
  assert.equal(w.color, '#2e9e45'); assert.deepEqual(w.pull, { done: 1, total: 2 }); assert.equal(w.full, false);
  // «Камера»: a work done before any cable is pulled — the gradient colour, all circles empty
  const first1 = colorOf('Камера', [['a', 'HIV_KEY']]);
  assert.equal(first1.color, '#fdd835'); assert.deepEqual(first1.pull, { done: 0, total: 1 });
  // all the works after the pull done, the pull not: the top shade, not dark green
  const all = colorOf('Камера', first('a', 5).slice(1));
  assert.equal(all.color, '#2e9e45'); assert.equal(all.full, false); assert.deepEqual(all.pull, { done: 0, total: 1 });
  // the last cable pulled: the circles go
  const done = colorOf('Интерком', [['a', 'PR_PTS', { cableId: '6005' }], ['a', 'PR_PTS', { cableId: 'cat7' }]]);
  assert.equal(done.color, '#E0609F'); assert.equal(done.pull, null);
  // a type whose only stage is the pull, partly pulled
  const ctx = make([{ id: 'a', label: 'A-01', typeId: 'Одна' }], [['a', 'PR_PTS', { cableId: '6005' }]]);
  const one = planColor(ctx.points.get('a'), ctx); assert.equal(one.color, '#E0609F'); assert.deepEqual(one.pull, { done: 1, total: 2 });
});

test('план: кружочки считают кабели, а не задачи (строка 6005×3 — три кабеля)', () => {
  const pt = { id: 'a', label: 'A-01', typeId: 'Комп', cableOverride: [{ cable: '6005', count: 3 }, { cable: 'cat7', count: 2 }] };
  const part = make([pt], [['a', 'PR_PTS', { cableId: '6005' }]]); const c = planColor(part.points.get('a'), part);
  assert.equal(c.color, '#E0609F'); assert.deepEqual(c.pull, { done: 3, total: 5 });
  const none = make([pt], []); assert.equal(planColor(none.points.get('a'), none).pull, null);  // nothing started: no circles
  const full = make([pt], [['a', 'PR_PTS', { cableId: '6005' }], ['a', 'PR_PTS', { cableId: 'cat7' }]]); assert.equal(planColor(full.points.get('a'), full).pull, null);
  // a legacy point: the counts of its cable kinds
  const old = make([{ id: 'a', label: 'A-01', typeId: 'Интерком', cableOverride: [{ cable: '6005', count: 3 }, { cable: 'cat7', count: 1 }] }], [['a', 'PR_PTS', { cableId: '6005' }]]);
  assert.deepEqual(planColor(old.points.get('a'), old).pull, { done: 3, total: 4 });
});

test('план: тип без этапа протяжки — без розового, по всем его работам', () => {
  const noPull = (n) => { const ctx = make([{ id: 'a', label: 'A-01', typeId: 'Без протяжки' }], ['HIV_KEY', 'CHK_FLUKE'].slice(0, n).map((w) => ['a', w])); return planColor(ctx.points.get('a'), ctx); };
  assert.equal(noPull(0).color, '#9e9e9e');
  assert.equal(noPull(1).color, '#fdd835'); assert.equal(noPull(1).pull, null);   // 1 of 2 works
  assert.equal(noPull(2).color, '#1b5e20');                                       // both
});

test('план: открытая проблема и «Неисправна» красные при любом прогрессе', () => {
  const marks = [{ id: 'm1', pointId: 'a', problemId: 'pr_cable', markedAt: 1 }];
  const ctx = make([{ id: 'a', label: 'A-01', typeId: 'Камера' }], first('a', 5), { problemMarks: marks, shared: { problems: EXAMPLE_PROBLEMS } });
  const r = planColor(ctx.points.get('a'), ctx);
  assert.equal(r.color, '#ff1744'); assert.equal(r.red, true); assert.equal(r.full, false); assert.equal(r.pull, null);
  // a solved mark is not red any more
  const ctx2 = make([{ id: 'a', label: 'A-01', typeId: 'Камера' }], first('a', 5), { problemMarks: [{ ...marks[0], solvedAt: 2 }], shared: { problems: EXAMPLE_PROBLEMS } });
  assert.equal(planColor(ctx2.points.get('a'), ctx2).color, '#1b5e20');
  // red over a partial pull: no circles
  const ctx3 = make([{ id: 'a', label: 'A-01', typeId: 'Интерком' }], [['a', 'PR_PTS', { cableId: '6005' }]], { problemMarks: marks, shared: { problems: EXAMPLE_PROBLEMS } });
  assert.equal(planColor(ctx3.points.get('a'), ctx3).color, '#ff1744'); assert.equal(planColor(ctx3.points.get('a'), ctx3).pull, null);
  // «Неисправна» over two done stages; red until a check without fault
  const bad = colorOf('Камера', [...first('a', 3), ['a', 'CHK_FLUKE', { result: 'Не работает' }]]);
  assert.equal(bad.color, '#ff1744');
  const fixed = colorOf('Камера', [...first('a', 3), ['a', 'CHK_FLUKE', { result: 'Не работает' }], ['a', 'CHK_FLUKE']]);
  assert.equal(fixed.color, '#82b244');
});

test('план: старая точка по этапам типа, тип без `stages` — по всем пяти', () => {
  // «Бакар» has three stages (M = 2): pull + termination done → one work after the pull → yellow
  assert.equal(colorOf('Бакар', first('a', 2)).color, '#fdd835');
  assert.equal(colorOf('Бакар', first('a', 2)).n, 3);
  const old = colorOf('Старый', first('a', 1));
  assert.equal(old.n, 5); assert.equal(old.M, 4); assert.equal(old.color, '#E0609F');
  // a composite point: the stages that have tasks (cat7 brings two terminations, the check and port labels; the device its installation)
  const ctx = make([{ id: 'a', label: 'A-01', typeId: 'Комп' }], [['a', 'PR_PTS'], ['a', 'HIV_KEY'], ['a', 'HIV_DEV']]);
  const st = pointStages(ctx.points.get('a'), ctx);
  assert.deepEqual(st.list.map((x) => `${x.stage}:${x.done ? 1 : 0}`), ['Протяжка:1', 'Хивут:1', 'Установка:0', 'Проверка:0', 'Шилют:0']);
  const comp = planColor(ctx.points.get('a'), ctx); assert.ok(comp.j >= 1 && comp.M > comp.j); assert.equal(comp.color, gradientColor(comp.M > 1 ? (comp.j - 1) / (comp.M - 1) : 1));
  // one of two terminations done: the stage is not done yet, but the work is done and the point is no longer pulled only
  const half = make([{ id: 'a', label: 'A-01', typeId: 'Комп' }], [['a', 'HIV_KEY']]);
  assert.deepEqual(planColor(half.points.get('a'), half).done, [false, false, false, false, false]); assert.equal(planColor(half.points.get('a'), half).j, 1);
});

test('план: общая отметка — красная, если любая красная; иначе наименее законченная, её же кружочки', () => {
  const pos = { sheet: 'a.pdf', page: 0, x: 10, y: 10, w: 8, h: 8 };
  const ctx = make([{ id: 'a', label: 'TV-13', typeId: 'Камера', pos }, { id: 'b', label: 'TV-14', typeId: 'Камера', pos }], [...first('a', 5), ...first('b', 2)]);
  const pts = [ctx.points.get('a'), ctx.points.get('b')];
  const m = markColor(pts, ctx);
  assert.equal(m.color, '#fdd835'); assert.deepEqual(m.done, [true, true, false, false, false]);
  // equal progress: the first label
  const ctx2 = make([{ id: 'a', label: 'TV-14', typeId: 'Камера', length: 5 }, { id: 'b', label: 'TV-13', typeId: 'Камера' }], []);
  assert.equal(markColor([ctx2.points.get('a'), ctx2.points.get('b')], ctx2).color, '#9e9e9e');
  const ctx3 = make([{ id: 'a', label: 'TV-13', typeId: 'Камера' }, { id: 'b', label: 'TV-14', typeId: 'Камера' }], [...first('a', 1), ['b', 'CHK_FLUKE', { result: 'Не работает' }]]);
  assert.equal(markColor([ctx3.points.get('a'), ctx3.points.get('b')], ctx3).color, '#ff1744');
  // the ranking: an unfinished pull (fewer cables first) < pulled only < works after the pull
  const rank = make([{ id: 'p', label: 'I-01', typeId: 'Интерком' }, { id: 'q', label: 'C-01', typeId: 'Камера' }, { id: 'r', label: 'C-02', typeId: 'Камера' }],
    [['p', 'PR_PTS', { cableId: '6005' }], ...first('q', 1), ...first('r', 3)]);
  const [p, q, r] = ['p', 'q', 'r'].map((id) => rank.points.get(id));
  const pick = (list) => { const c = markColor(list, rank); return { color: c.color, pull: c.pull }; };
  assert.deepEqual(pick([q, r, p]), { color: '#E0609F', pull: { done: 1, total: 2 } });   // the half-pulled one has the circles
  assert.deepEqual(pick([q, r]), { color: '#E0609F', pull: null });                        // pulled only goes before the one with works
  assert.deepEqual(pick([r]), { color: '#c1c63f', pull: null });
  // a point with a work but an unfinished pull is behind a point that is only pulled
  const mix = make([{ id: 'u', label: 'I-01', typeId: 'Интерком' }, { id: 'v', label: 'C-01', typeId: 'Камера' }], [['u', 'PR_PTS', { cableId: '6005' }], ['u', 'HIV_KEY'], ...first('v', 1)]);
  assert.deepEqual(markColor([mix.points.get('u'), mix.points.get('v')], mix).pull, { done: 1, total: 2 });
  // «PDF с номерами»: both points of the pair carry the mark's color
  const input = numberedInput(ctx.points.values(), ctx, { name: 'a.pdf' });
  assert.deepEqual(input.map((x) => [x.label, x.color, x.full]), [['TV-13', '#fdd835', false], ['TV-14', '#fdd835', false]]);
});

test('PDF с номерами: цвета плана, розовая у протянутой, толстая рамка у готовой, отпечаток', () => {
  const at = (x) => ({ sheet: 'a.pdf', page: 0, x, y: 10, w: 8, h: 8 });
  const pts = [{ id: 'a', label: 'C-01', typeId: 'Камера', pos: at(10) }, { id: 'b', label: 'C-02', typeId: 'Камера', pos: at(40), length: 3 }, { id: 'c', label: 'C-03', typeId: 'Камера', pos: at(70) },
    { id: 'd', label: 'C-04', typeId: 'Камера', pos: at(100) }, { id: 'e', label: 'C-05', typeId: 'Интерком', pos: at(130) }];
  const works = [...first('c', 5), ...first('d', 1), ['e', 'PR_PTS', { cableId: '6005' }]];
  const ctx = make(pts, works);
  const d = { name: 'a.pdf' };
  const input = numberedInput(ctx.points.values(), ctx, d);
  // no circles in the PDF: only the color and «full» go in
  assert.deepEqual(input.map((x) => [x.label, x.color, x.full]), [['C-01', '#9e9e9e', false], ['C-02', '#2979ff', false], ['C-03', '#1b5e20', true], ['C-04', '#E0609F', false], ['C-05', '#E0609F', false]]);
  assert.ok(input.every((x) => !('pull' in x)));
  // two builds of an unchanged project give the same fingerprint
  const h1 = numberedHash(input, d); assert.equal(numberedHash(numberedInput(make(pts, works).points.values(), make(pts, works), d), d), h1);
  // a new color changes it
  const ctx2 = make(pts, [...works, ['a', 'PR_PTS']]);
  assert.notEqual(numberedHash(numberedInput(ctx2.points.values(), ctx2, d), d), h1);
  // the new look changes the fingerprint even of a drawing whose colors stay the same (gray and blue): the old formula gave another value
  const oldHash = (inp, dd) => {
    const s = JSON.stringify([2, inp.map((x) => [x.label, x.typeId, Math.round(x.pos.x), Math.round(x.pos.y), x.pos.page || 0, x.pos.icon ? 1 : 0, x.color]),
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
