// Drawing plan, the part shared by the app and the server: the progress color of a point (planColor), the plan legend, the drawing's points for the «PDF с номерами» and its fingerprint.
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

// Progress colors of the plan and «PDF с номерами» (palette «Жёлтые чуть темнее», chosen by the owner): steps 1–4 ≈ 20% … 80% of the stages done
export const PLAN_PALETTE = { gray: '#9e9e9e', blue: '#2979ff', steps: ['#f2c80f', '#c0ca33', '#8bc34a', '#43a047'], full: '#1b5e20', red: '#ff1744' };
// A finished point's frame is this many times thicker (plan 2 → 3.5)
export const FULL_WIDTH = 1.75;
// The legend of the plan and of both «PDF с номерами» legends: { color, ru, he, thick? }
export const PLAN_LEGEND = [
  { color: PLAN_PALETTE.gray, ru: 'новая', he: 'חדשה' },
  { color: PLAN_PALETTE.blue, ru: 'померяно', he: 'נמדד' },
  ...PLAN_PALETTE.steps.map((color, i) => ({ color, ru: `≈ ${(i + 1) * 20}%`, he: `≈ ${(i + 1) * 20}%` })),
  { color: PLAN_PALETTE.full, ru: 'готово', he: 'הושלם', thick: true },
  { color: PLAN_PALETTE.red, ru: 'проблема / неисправна', he: 'בעיה / תקלה' },
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

/**
 * The color of a point on the plan → { color, done: bool[] (one per stage of S), stages, k, n, step, full, width, red }.
 * First rule that fires: an open problem or «Неисправна» → red; nothing started (or no stages) → blue with a length, else gray;
 * every stage done → dark green, full, width ×1.75; otherwise step clamp(round(k / n × 5), 1, 4) of the palette.
 * The plan shows no stage dots: the owner found them more in the way than helpful at the check of ticket 6.5. infoFn — the status function (the app passes its cached infoOf).
 */
export function planColor(point, ctx, infoFn = pointInfo) {
  const info = infoFn(point, ctx);
  const { list, started } = pointStages(point, ctx, info);
  const done = list.map((x) => x.done); const n = list.length; const k = done.filter(Boolean).length;
  const base = { done, stages: list.map((x) => x.stage), k, n, step: 0, full: false, width: 1, red: false };
  if (openProblemsOf(point, ctx).length || info.status === 'Неисправна') return { ...base, color: PLAN_PALETTE.red, red: true };
  if (!n || !started) return { ...base, color: blank(point.length) ? PLAN_PALETTE.gray : PLAN_PALETTE.blue };
  if (k === n) return { ...base, color: PLAN_PALETTE.full, full: true, width: FULL_WIDTH };
  const step = Math.min(4, Math.max(1, Math.round((k / n) * 5)));
  return { ...base, color: PLAN_PALETTE.steps[step - 1], step };
}

// A mark shared by several points (a pair, a triple, one tag): red when any point is red; otherwise the least finished point
// (smallest k / n, then the first label) gives the color
export function markColor(points, ctx, infoFn = pointInfo) {
  const all = [...points].sort(comparePoints).map((p) => planColor(p, ctx, infoFn));
  const red = all.find((c) => c.red); if (red) return red;
  const ratio = (c) => (c.n ? c.k / c.n : 0);
  return all.reduce((best, c) => (ratio(c) < ratio(best) ? c : best), all[0]);
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
const NUMBERED_V = 2;
// Fingerprint of the «PDF с номерами» content: changed points, colors, hidden ones or icons give a different one
export function numberedHash(input, d, icons = {}, extra = '') {
  const s = JSON.stringify([NUMBERED_V, input.map((x) => [x.label, x.typeId, Math.round(x.pos.x), Math.round(x.pos.y), x.pos.page || 0, x.pos.icon ? 1 : 0, x.color]),
    (d.hidden || []).map((m) => [Math.round(m.pos.x), Math.round(m.pos.y)]), d.title || d.name, extra, Object.keys(icons).sort().map((k) => [k, (icons[k].png || '').length])]);
  let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
