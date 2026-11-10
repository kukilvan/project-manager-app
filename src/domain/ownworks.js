// The own set of works on selected points (the point's or a group's «Изменить» window): what is required now and what to write into the point.
// Built on compose.js; used by the points view.
import { compositionOf, tasksOf, ownWorksOf, cablesTotalOf, OWN_STAGES } from './compose.js';

const sumQty = (tasks, workId) => tasks.filter((t) => t.workId === workId).reduce((n, t) => n + t.qty, 0);
/** How much work the point has by composition (without its own set) */
export const baseQtyOf = (point, ctx, workId) => sumQty(tasksOf({ ...point, ownWorks: undefined }, ctx), workId);

/**
 * Works of the selected points (except the pull): [{ workId, name, workType, have, min, max, own, perCable, removed }]
 * have — on how many points the work is currently required; min/max — quantity per point (among those that have it);
 * own — on how many it is set explicitly; perCable — on how many the own value is «per cable»; removed — on how many it is removed.
 * skipped — legacy points (type without a composition): they have no own set of works.
 */
export function worksSummary(points, ctx) {
  const rows = new Map(); const ok = []; const skipped = [];
  points.forEach((p) => (compositionOf(p, ctx) ? ok : skipped).push(p));
  const row = (workId) => {
    if (!rows.has(workId)) {
      const w = ctx.catalog.get(workId);
      rows.set(workId, { workId, name: w?.name || workId, workType: w?.workType || '', have: 0, min: Infinity, max: 0, own: 0, perCable: 0, removed: 0 });
    }
    return rows.get(workId);
  };
  ok.forEach((p) => {
    const tasks = tasksOf(p, ctx);
    [...new Set(tasks.filter((t) => t.stage !== 'Протяжка' && t.workId).map((t) => t.workId))].forEach((workId) => {
      const r = row(workId); const q = sumQty(tasks, workId);
      r.have += 1; r.min = Math.min(r.min, q); r.max = Math.max(r.max, q);
    });
    ownWorksOf(p).forEach((o) => {
      if (!ctx.catalog.has(o.workId)) return;
      const r = row(o.workId); r.own += 1;
      if (o.per === 'cable') r.perCable += 1;
      if (!(Number(o.qty) > 0)) r.removed += 1;
    });
  });
  const ord = (x) => { const i = OWN_STAGES.indexOf(x); return i < 0 ? 99 : i; };
  const list = [...rows.values()].map((r) => ({ ...r, min: r.have ? r.min : 0 }))
    .sort((a, b) => ord(a.workType) - ord(b.workType) || a.name.localeCompare(b.name, 'ru'));
  return { rows: list, points: ok, skipped };
}

/**
 * What to write into point.ownWorks after the changes: changes — Map workId → { op: 'set', qty, per } | { op: 'remove' } | { op: 'reset' }.
 * set — quantity (per point or per cable), the work is added if it is missing; remove — remove the work from the point;
 * reset — as by composition (the own value is erased). → an array or null (no own set).
 */
export function ownWorksPatch(point, ctx, changes) {
  const list = ownWorksOf(point).filter((o) => !changes.has(o.workId)).map((o) => ({ ...o }));
  changes.forEach((ch, workId) => {
    if (ch.op === 'reset') return;
    const base = baseQtyOf(point, ctx, workId);
    const qty = ch.op === 'remove' ? 0 : Number(ch.qty);
    if (!(qty >= 0)) return;
    if (qty === 0) { if (base > 0) list.push({ workId, qty: 0 }); return; }
    if (ch.per !== 'cable' && qty === base) return;            // as by composition — no own value needed
    list.push({ workId, qty, ...(ch.per === 'cable' ? { per: 'cable' } : {}) });
  });
  return list.length ? list : null;
}
/** How much the point will have after the changes (for the hint) */
export const qtyAfter = (point, ctx, workId, ch) => {
  const own = ownWorksPatch(point, ctx, new Map([[workId, ch]]));
  return sumQty(tasksOf({ ...point, ownWorks: own }, ctx), workId);
};

