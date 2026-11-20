// Pure rules of the plan's filters: the stage options of one drawing, several-value stage matching and the focus-point rule (spec 7 § 2.3).
// Rack options and missing shared values come from filters.js; the plan screen (src/app/views/planmodal.js) builds its buttons from these. Tested by tests/planfilters.test.js.
import { LEFT_FILTERS, planFilterMatch } from './plan.js';
import { anyOf } from './filters.js';

/**
 * Options of the plan's stage window from planFilterGroups() of the drawing's points: «Осталось» (the LEFT_FILTERS lines, no counts),
 * «Работа» (works waiting, with counts, pulls first), «Проблемы» («⚠ С проблемами» and each problem, only when some point has an open problem).
 * `problemLabel(problemId)` gives the problem's name.
 */
export function stageOptions(groups, problemLabel = (id) => id) {
  const works = groups?.works || []; const probs = groups?.problems || { n: 0, list: [] };
  const single = probs.list.map((x) => ({ value: `pr|${x.problemId}`, text: `Проблема: ${problemLabel(x.problemId) || x.problemId}`, count: x.n }));
  return [
    { value: 'h|left', text: 'Осталось', kind: 'head' },
    ...LEFT_FILTERS.map(([value, text]) => ({ value, text })),
    ...(works.length ? [{ value: 'h|work', text: 'Работа', kind: 'head' }, ...works.map((w) => ({ value: `w|${w.key}`, text: w.label, count: w.n }))] : []),
    ...(probs.n ? [{ value: 'h|prob', text: 'Проблемы', kind: 'head' },
      { value: 'pr|*', text: '⚠ С проблемами', kind: 'any', members: single.map((o) => o.value), count: probs.n }, ...single] : []),
  ];
}

/** A point is bright when it matches any ticked stage value; an empty set — every point. */
export function stageMatch(set, point, ctx, infoFn) {
  return anyOf(set, (v) => planFilterMatch(v, point, ctx, infoFn));
}

/** The points drawn on the plan: those that pass the filters, plus the point in focus even when the filters hide it (spec 7 § 2.3). */
export function shownPoints(points, pass, focusId = null) {
  return points.filter((p) => pass(p) || (focusId != null && p.id === focusId));
}

/** «Под фильтры на этом чертеже точек нет»: filters are on, no plan mode, and no point of the drawing passes them. */
export function noneUnderFilters(points, pass, { active, mode = false }) {
  return !!active && !mode && !points.some(pass);
}
