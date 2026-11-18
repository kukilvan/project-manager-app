// Problems on points (ADR 0017): which shared problems fit a point, the open and solved marks of a point, the write operations for marking and solving, labels and counts.
// Pure; reached through src/domain/index.js. Problems come from the pool `pool_problems` (`ctx.problems`, deleted ones too), marks from the project
// subcollection `problemMarks` (`ctx.marksByPoint`, built by context.js). Used by the problem views, the «Точки» list, «Проект», the point merge and the seeding of src/app/shared.js.

// The example problems written into an empty `pool_problems` (src/app/shared.js); fixed ids, so two devices seeding at once make one set
export const EXAMPLE_PROBLEMS = [
  { id: 'pr_magnet', name: 'Магнит индикация', nameHe: 'מגנט חיווי', types: ['Дверь'], descs: [{ id: 'd_notdrilled', ru: 'Не просверлены двери', he: 'הדלתות לא קדוחות' }] },
  { id: 'pr_lock', name: 'Замок', nameHe: 'מנעול', types: ['Дверь'], descs: [{ id: 'd_nopower', ru: 'Нет питания на замке', he: 'אין מתח במנעול' }] },
  { id: 'pr_cable', name: 'Кабель', nameHe: 'כבל', types: [], descs: [{ id: 'd_damaged', ru: 'Кабель повреждён', he: 'כבל פגום' }, { id: 'd_short', ru: 'Кабель не дотянут', he: 'הכבל לא הושחל עד הסוף' }] },
  { id: 'pr_access', name: 'Доступ', nameHe: 'גישה', types: [], descs: [{ id: 'd_noaccess', ru: 'Нет доступа в помещение', he: 'אין גישה לחדר' }] },
];

// An open mark: not solved and not deleted
export const isOpenMark = (m) => !!m && !m.deleted && !m.solvedAt;

// The order of a point's marks: open first by marking time, newest first; then solved by solving time, newest first
export function sortMarks(marks) {
  return [...marks].sort((a, b) => {
    const oa = isOpenMark(a); const ob = isOpenMark(b);
    if (oa !== ob) return oa ? -1 : 1;
    return oa ? (b.markedAt || 0) - (a.markedAt || 0) : (b.solvedAt || 0) - (a.solvedAt || 0);
  });
}

// Live problems, by name (Russian)
export const liveProblems = (ctx) => [...(ctx.problems?.values() || [])].filter((p) => !p.deleted)
  .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'));

// A problem fits a point when its types are empty, list the point's type id, or list the group of the point's type («Дверь» covers every door type)
export function problemFits(problem, point, ctx) {
  const types = Array.isArray(problem?.types) ? problem.types : [];
  if (!types.length) return true;
  if (types.includes(point?.typeId)) return true;
  const group = String(ctx.types?.get(point?.typeId)?.group || '').trim();
  return !!group && types.includes(group);
}

// What the marking form offers for the selected points → { list, partial }: live problems that fit every point, by name;
// partial — some live problems were left out (the form shows the hint)
export function problemsForPoints(points, ctx) {
  const live = liveProblems(ctx);
  const list = live.filter((pr) => points.every((p) => problemFits(pr, p, ctx)));
  return { list, partial: list.length < live.length };
}

// All marks of a point in display order (open first)
export const marksOf = (point, ctx) => ctx.marksByPoint?.get(point?.id) || [];

// The open marks of a point, one per problem (the newest of two marks made offline by two members)
export function openProblemsOf(point, ctx) {
  const seen = new Set();
  return marksOf(point, ctx).filter((m) => isOpenMark(m) && !seen.has(m.problemId) && seen.add(m.problemId));
}

// Marking: one operation per point. A problem already open on the point updates that mark (description, who and when); otherwise a new mark
// (no id: the repo gives one). choice: { problemId, descId, text } — at most one of descId / text; by: { uid, name }.
export function markOps(pointIds, { problemId, descId = null, text = null }, by, now, ctx) {
  const desc = text ? { descId: null, text } : { descId: descId || null, text: null };
  const stamp = { ...desc, markedAt: now, markedBy: by?.uid || '', markedByName: by?.name || '' };
  return pointIds.map((pid) => {
    const open = marksOf({ id: pid }, ctx).find((m) => isOpenMark(m) && m.problemId === problemId);
    if (open) return { coll: 'problemMarks', id: open.id, data: stamp };
    return { coll: 'problemMarks', data: { pointId: pid, problemId, ...stamp, solvedAt: null, solvedBy: null, solvedByName: null } };
  });
}

// Solving: every open mark of the problem (problemId null — of every problem) on the points, duplicates included
export function solveOps(pointIds, problemId, by, now, ctx) {
  const data = { solvedAt: now, solvedBy: by?.uid || '', solvedByName: by?.name || '' };
  return pointIds.flatMap((pid) => marksOf({ id: pid }, ctx)
    .filter((m) => isOpenMark(m) && (problemId == null || m.problemId === problemId))
    .map((m) => ({ coll: 'problemMarks', id: m.id, data })));
}

// Names in the display language: Hebrew UI — the Hebrew name and description; any other — Russian (reference lists have no English)
export const problemName = (problem, lang = 'ru') => (problem ? String((lang === 'he' && problem.nameHe) || problem.name || problem.id || '') : '');
export const descText = (desc, lang = 'ru') => (desc ? String((lang === 'he' && desc.he) || desc.ru || '') : '');

// The description of a mark: own text as written, or the ready description (deleted ones too), or ''
export function markDesc(mark, ctx, lang = 'ru') {
  if (mark?.text) return String(mark.text);
  if (!mark?.descId) return '';
  const d = (ctx.problems?.get(mark.problemId)?.descs || []).find((x) => x.id === mark.descId);
  return descText(d, lang);
}
// The name of a mark's problem (a deleted problem still has its name; an unknown one shows its id)
export const markName = (mark, ctx, lang = 'ru') => problemName(ctx.problems?.get(mark?.problemId), lang) || String(mark?.problemId || '');

// «<problem>: <description>» or «<problem>»
export function problemLabel(mark, ctx, lang = 'ru') {
  const name = markName(mark, ctx, lang); const desc = markDesc(mark, ctx, lang);
  return desc ? `${name}: ${desc}` : name;
}

// Open problems over the points → { points: points with an open problem, marks: open problems (one per point and problem), byProblem: Map problemId → points }
export function problemCounts(points, ctx) {
  const byProblem = new Map(); let n = 0; let marks = 0;
  points.forEach((p) => {
    const open = openProblemsOf(p, ctx); if (!open.length) return;
    n += 1; marks += open.length;
    open.forEach((m) => byProblem.set(m.problemId, (byProblem.get(m.problemId) || 0) + 1));
  });
  return { points: n, marks, byProblem };
}

// A Cyrillic letter in own text (own text goes to the management sheet in Hebrew; Latin letters and digits are allowed)
export const hasCyrillic = (s) => /[Ѐ-ӿ]/.test(String(s || ''));
