// Drawing plan, the part shared by the app and the server: the color of a point (planColor), the plan legend, the drawing's points for the «PDF с номерами» and its fingerprint.
// Works marked «not in the plan colour» (planColour false, idea 008) are left out of the color only; the card, reports and sheets keep them.
// Statuses come from status.js, stages from compose.js, open problems from problems.js, what is left from remaining.js (the plan filter); the server side is src/tohnit/numbered.js. statusColor stays for the pull screen.
import { pointInfo } from './status.js';
import { STAGES } from './compose.js';
import { openProblemsOf } from './problems.js';
import { comparePoints } from './points.js';
import { leftTasks, missingStages } from './remaining.js';

// Color by status (the pull screen «🧵 Протяжки» still colors by status): measured — blue, pulled — yellow, then to green; faulty — red
const STATUS_COLORS = [['#9e9e9e', 'новая'], ['#2979ff', 'померяно'], ['#ffb300', 'протянуто частично'], ['#ffd600', 'протянуто'], ['#e4e000', 'захивучено'],
  ['#b5d800', 'установлено не всё'], ['#6ccf00', 'установлено'], ['#00c853', 'проверено'], ['#ff1744', 'проблема']];
const C = Object.fromEntries(STATUS_COLORS.map(([c, t]) => [t, c]));
export const statusColor = (st = '') => (st === 'Неисправна' ? C['проблема'] : st === 'Проверена' ? C['проверено'] : st === 'Установлена' ? C['установлено']
  : st.startsWith('Установлено') ? C['установлено не всё'] : st === 'Захивучена' ? C['захивучено'] : st === 'Протянута' ? C['протянуто']
  : st.startsWith('Протянуто') ? C['протянуто частично'] : st === 'Посчитана' ? C['померяно'] : C['новая']);

// Colors of the plan and «PDF с номерами»: a pulled point is pink, the works after the pull move it evenly from yellow to green (OKLab), all done — dark green
export const PLAN_PALETTE = { gray: '#9e9e9e', blue: '#2979ff', pink: '#E0609F', from: '#fdd835', to: '#2e9e45', full: '#1b5e20', red: '#ff1744' };
// A finished point's frame is this many times thicker (plan 2 → 3.5)
export const FULL_WIDTH = 1.75;

// ---- gradient in OKLab (matrices of Björn Ottosson): the shades between two ends are evenly spaced for any number of works ----
const toLin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const fromLin = (v) => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)));
const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
function toLab(hex) {
  const [r, g, b] = rgbOf(hex).map(toLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b); const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b); const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromLab([L, A, B]) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3; const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3; const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
/** The color at t (0 … 1) between two hex colors, interpolated in OKLab → hex; the ends come back exactly */
export function gradientColor(t, from = PLAN_PALETTE.from, to = PLAN_PALETTE.to) {
  if (t <= 0) return from;
  if (t >= 1) return to;
  const a = toLab(from); const b = toLab(to);
  return `#${fromLab(a.map((x, i) => x + (b[i] - x) * t)).map((v) => fromLin(v).toString(16).padStart(2, '0')).join('')}`;
}

// The legend of the plan and of both «PDF с номерами» legends: { color, ru, he, thick?, gradient?: [from, to], circles? }.
// The gradient strip stands for «works after the pull»; the circles line is only for the plan (the PDF has no circles)
export const PLAN_LEGEND = [
  { color: PLAN_PALETTE.gray, ru: 'новая', he: 'חדשה' },
  { color: PLAN_PALETTE.blue, ru: 'померяно', he: 'נמדד' },
  { color: PLAN_PALETTE.pink, ru: 'протянута', he: 'הושחלה' },
  { color: gradientColor(0.5), gradient: [PLAN_PALETTE.from, PLAN_PALETTE.to], ru: 'работы после протяжки', he: 'עבודות אחרי ההשחלה' },
  { color: PLAN_PALETTE.full, ru: 'готово', he: 'הושלם', thick: true },
  { color: PLAN_PALETTE.red, ru: 'проблема / неисправна', he: 'בעיה / תקלה' },
  { color: PLAN_PALETTE.pink, ru: 'кружочки — протянутые кабели', he: 'עיגולים – כבלים שהושחלו', circles: true },
];

const blank = (v) => v === undefined || v === null || v === '';

// The point's stages S in the order pull, termination, installation, check, port labels (STAGES of compose.js) → { list: [{ stage, done }], started }.
// Composite points: the stages that have tasks, a stage done when all its tasks are; legacy points: the type's `stages` (all five when the type has none).
// started — any work on the stages: a done stage or a done task (composite), a done stage or a pulled cable (legacy).
export function pointStages(point, ctx, info = pointInfo(point, ctx)) {
  if (info.composed) {
    const st = info.stageStats;
    const list = info.stages.map((s) => ({ stage: s, done: st[s].total > 0 && st[s].done >= st[s].total }));
    return { list, started: info.stages.some((s) => st[s].done > 0) };
  }
  const type = ctx.types.get(point.typeId);
  const names = Array.isArray(type?.stages) ? STAGES.filter((s) => type.stages.includes(s)) : STAGES;
  const ok = { 'Протяжка': !!info.pulled, 'Хивут': !!info.hived, 'Установка': info.install === 'Установлено', 'Проверка': !!info.checked, 'Шилют': !!info.shilut };
  const list = names.map((s) => ({ stage: s, done: ok[s] }));
  return { list, started: list.some((x) => x.done) || info.pullDone > 0 };
}

// The pull in cables: { done, total } — a composite point counts the quantity of its pull tasks (a «6005×3» task is three cables), a legacy one the counts of its cable kinds
function pullCables(info) {
  if (info.composed) {
    const t = info.tasks.filter((x) => x.stage === 'Протяжка');
    return { done: t.filter((x) => x.done).reduce((n, x) => n + x.qty, 0), total: t.reduce((n, x) => n + x.qty, 0) };
  }
  return { done: info.cableList.filter((c) => info.pulledKinds.includes(c.cable)).reduce((n, c) => n + c.count, 0), total: info.cableList.reduce((n, c) => n + c.count, 0) };
}
// The works after the pull → { M, j }: the point's tasks other than the pull (composite — each line of the card's work list), the type's other stages (legacy); j of them done
function worksAfterPull(info, list) {
  const w = info.composed ? info.tasks.filter((t) => t.stage !== 'Протяжка') : list.filter((x) => x.stage !== 'Протяжка');
  return { M: w.length, j: w.filter((x) => x.done).length };
}

// ---- works kept out of the plan colour (idea 008): a project setting `planColour: false` on a catalog work ----
/** Does the work count in the plan colour? A missing work and a «Протяжка» work always count; otherwise unless `planColour` is exactly false */
export const inPlanColour = (work) => !work || work.workType === 'Протяжка' || work.planColour !== false;
// The point status for the colour: a composite point without the tasks of the works kept out of the colour (stage counts recounted, empty stages gone).
// Returns `info` itself when nothing is dropped and never changes it (the app passes its cached infoOf); a legacy point has no such works.
function colourInfo(info, ctx) {
  if (!info.composed) return info;
  const tasks = info.tasks.filter((t) => t.stage === 'Протяжка' || inPlanColour(ctx.catalog.get(t.workId)));
  if (tasks.length === info.tasks.length) return info;
  const stageStats = Object.fromEntries(STAGES.map((s) => { const l = tasks.filter((t) => t.stage === s); return [s, { total: l.length, done: l.filter((t) => t.done).length }]; }));
  return { ...info, tasks, stageStats, stages: STAGES.filter((s) => stageStats[s].total > 0) };
}
/**
 * What the work form of the project writes for the box «Учитывать в цвете точки на плане» (merged into the work's data): nothing for a «Протяжка» work (the field is ignored),
 * `{ planColour: false }` when unticked, `{ planColour: true }` when ticked again on a work that had false, else nothing (a never-unticked work keeps no field).
 */
export const planColourPatch = (ticked, existing, workType) => (workType === 'Протяжка' ? {} : !ticked ? { planColour: false } : existing?.planColour === false ? { planColour: true } : {});

/**
 * The color of a point on the plan → { color, done: bool[] (one per stage of S), stages, k, n, full, width, red, started, j, M, pull }.
 * First rule that fires: an open problem or «Неисправна» → red; nothing started (or no stages) → blue with a length, else gray;
 * every stage done → dark green, full, width ×1.75; j of M works after the pull done (j ≥ 1, and j < M or the pull unfinished) → the OKLab gradient yellow → green at t = (j − 1) / (M − 1)
 * (t = 1 when M = 1: the only work is done, the pull is not); otherwise (the pull started or done, nothing after it) → pink. A type without a pull stage never gets pink.
 * pull: { done, total } in cables while the pull of a started point is unfinished (the plan draws a circle per cable), else null.
 * The plan shows no stage dots: the owner found them more in the way than helpful at the check of ticket 6.5. infoFn — the status function (the app passes its cached infoOf).
 * Works with `planColour: false` (not «Протяжка») are left out of the status the colour is built from (colourInfo); markColor, the numbered PDF and its fingerprint follow, the card and reports do not.
 */
export function planColor(point, ctx, infoFn = pointInfo) {
  const info = colourInfo(infoFn(point, ctx), ctx);
  const { list, started } = pointStages(point, ctx, info);
  const done = list.map((x) => x.done); const n = list.length; const k = done.filter(Boolean).length;
  const { M, j } = worksAfterPull(info, list);
  const base = { done, stages: list.map((x) => x.stage), k, n, full: false, width: 1, red: false, started: false, j, M, pull: null };
  if (openProblemsOf(point, ctx).length || info.status === 'Неисправна') return { ...base, color: PLAN_PALETTE.red, red: true };
  if (!n || !started) return { ...base, color: blank(point.length) ? PLAN_PALETTE.gray : PLAN_PALETTE.blue };
  const pc = list.some((x) => x.stage === 'Протяжка' && !x.done) ? pullCables(info) : null;
  const on = { ...base, started: true, pull: pc && pc.total > 0 ? pc : null };
  if (k === n) return { ...on, color: PLAN_PALETTE.full, full: true, width: FULL_WIDTH };
  if (j >= 1) return { ...on, color: gradientColor(M > 1 ? (j - 1) / (M - 1) : 1) };
  return { ...on, color: PLAN_PALETTE.pink };
}

// How far a point is: not started < pull unfinished (by the share of cables) < pulled only < works after the pull (by j / M) < finished
const progressOf = (c) => (!c.started ? -1 : c.pull ? c.pull.done / c.pull.total : 1 + (c.M ? c.j / c.M : 0));
// A mark shared by several points (a pair, a triple, one tag): red when any point is red; otherwise the least finished point
// (progressOf, then the first label) gives the color and the circles
export function markColor(points, ctx, infoFn = pointInfo) {
  const all = [...points].sort(comparePoints).map((p) => planColor(p, ctx, infoFn));
  const red = all.find((c) => c.red); if (red) return red;
  return all.reduce((best, c) => (progressOf(c) < progressOf(best) ? c : best), all[0]);
}

// ---- the plan's stage filter: matching points stay bright, the others go pale ----
// Group «Осталось»: [value, label]; group «Работа»: `w|<key of leftTasks>`; group «Проблемы»: `pr|*` (any open problem) or `pr|<problemId>`
export const LEFT_FILTERS = [['Длина', 'Осталось: длина (не померяно)'], ['Протяжка', 'Осталось: протяжка'], ['Дотянуть', 'Осталось: дотянуть'], ['Хивут', 'Осталось: хивут'],
  ['Установка', 'Осталось: установка'], ['Проверка', 'Осталось: проверка'], ['Шилют', 'Осталось: шилют']];
export function planFilterMatch(value, point, ctx, infoFn = pointInfo) {
  if (!value) return true;
  if (value.startsWith('w|')) return leftTasks(point, ctx, infoFn(point, ctx)).some((t) => t.key === value.slice(2));
  if (value.startsWith('pr|')) { const open = openProblemsOf(point, ctx); return value === 'pr|*' ? open.length > 0 : open.some((m) => m.problemId === value.slice(3)); }
  if (value === 'Длина') return blank(point.length);
  const info = infoFn(point, ctx);
  if (value === 'Протяжка') return !info.pulled && !info.pullDone;
  if (value === 'Шилют') return pointStages(point, ctx, info).list.some((x) => x.stage === 'Шилют' && !x.done);
  return missingStages(point, ctx).includes(value);
}
// The «Работа» and «Проблемы» groups over the drawing's points → { works: [{ key, label, n }] (pulls first, then by name; only N > 0),
// problems: { n: points with an open problem, list: [{ problemId, n }] by count } }
export function planFilterGroups(points, ctx, infoFn = pointInfo) {
  const works = new Map(); const byProblem = new Map(); let withProblems = 0;
  for (const p of points) {
    leftTasks(p, ctx, infoFn(p, ctx)).forEach((t) => { const w = works.get(t.key) || { key: t.key, label: t.label, n: 0 }; w.n += 1; works.set(t.key, w); });
    const open = openProblemsOf(p, ctx); if (open.length) withProblems += 1;
    open.forEach((m) => byProblem.set(m.problemId, (byProblem.get(m.problemId) || 0) + 1));
  }
  const pull = (k) => (k.startsWith('p:') || k === 's:Протяжка' || k === 's:Дотянуть' ? 0 : 1);
  return {
    works: [...works.values()].sort((a, b) => pull(a.key) - pull(b.key) || a.label.localeCompare(b.label, 'ru')),
    problems: { n: withProblems, list: [...byProblem].map(([problemId, n]) => ({ problemId, n })).sort((a, b) => b.n - a.n || String(a.problemId).localeCompare(String(b.problemId))) },
  };
}

export const onDrawing = (p, d) => !!p.pos && !p.deleted && (p.pos.sheet === d.name || (d.aliases || []).includes(p.pos.sheet));
// One mark on the sheet: the same rounding as posKey of src/app/drawings.js and the groups of numbered.js
const markKey = (pos) => `${pos.page || 0}|${Math.round(pos.x)}|${Math.round(pos.y)}`;

/** The drawing's points for the PDF: [{ label, typeId, pos, color, full }] — the color of the point's mark (shared marks follow markColor) */
export function numberedInput(points, ctx, d) {
  const list = [...points].filter((p) => onDrawing(p, d));
  const groups = new Map(); list.forEach((p) => { const k = markKey(p.pos); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); });
  const colors = new Map([...groups].map(([k, g]) => [k, markColor(g, ctx)]));
  return list.map((p) => { const c = colors.get(markKey(p.pos)); return { label: p.label, typeId: p.typeId, pos: p.pos, color: c.color, full: c.full }; })
    .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
}
// The look of «PDF с номерами» (colors, legend): a new value changes every fingerprint, so the nightly job re-renders each file once
// (4: the Hebrew legend says השחלה for the pull, as the rest of the app and the management sheet)
const NUMBERED_V = 4;
// Fingerprint of the «PDF с номерами» content: changed points, colors, hidden ones or icons give a different one
export function numberedHash(input, d, icons = {}, extra = '') {
  const s = JSON.stringify([NUMBERED_V, input.map((x) => [x.label, x.typeId, Math.round(x.pos.x), Math.round(x.pos.y), x.pos.page || 0, x.pos.icon ? 1 : 0, x.color]),
    (d.hidden || []).map((m) => [Math.round(m.pos.x), Math.round(m.pos.y)]), d.title || d.name, extra, Object.keys(icons).sort().map((k) => [k, (icons[k].png || '').length])]);
  let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
