// Point merge: the same point recorded in two ways — a double «FC/B05-06» and singles «FC/B05» + «FC/B06» (the old drawing parsing split doubles into singles, the new one keeps them double).
// This module finds such groups and works out the merge: which form to keep, where the works go (daily report entries, journal, pulls),
// and what does not add up (the quantity in the report, a work the kept point lacks, different metres).
// Built on doh.js, compose.js and points.js; used by pointsimport.js and the point merge and drawing views.
import { itogShtuk, pullFigures } from './doh.js';
import { taskQty, compositionOf, isPortCable } from './compose.js';
import { cableListOf } from './points.js';

const RANGE = /^(.*?)(\d+)-(\d+)$/;
const blank = (v) => v === undefined || v === null || v === '';

/** Groups: a double (triple…) point and all its singles in the same rack. points — the live points. */
export function findSameGroups(points) {
  const live = points.filter((p) => !p.deleted);
  const key = (cab, label) => `${cab || ''}\u0000${label}`;
  const by = new Map(live.map((p) => [key(p.cabinet, p.label), p]));
  const out = [];
  for (const d of live) {
    const m = String(d.label || '').match(RANGE); if (!m) continue;
    const [, pre, a, b] = m; const lo = Number(a); const hi = Number(b);
    if (!(hi > lo) || hi - lo > 7) continue;
    const singles = [];
    for (let n = lo; n <= hi; n++) {
      const s = by.get(key(d.cabinet, `${pre}${String(n).padStart(a.length, '0')}`)) || by.get(key(d.cabinet, `${pre}${n}`));
      if (!s || s.id === d.id) { singles.length = 0; break; }
      singles.push(s);
    }
    if (singles.length === hi - lo + 1) out.push({ double: d, singles });
  }
  // singles in a row on one mark (FC/B09 + FC/B10 sit under the caption «FC/B09-10») and there is no double point — make one
  const used = new Set(out.flatMap((g) => g.singles.map((x) => x.id)));
  const mark = new Map();
  for (const p of live) {
    if (used.has(p.id) || !p.pos) continue;
    const m = String(p.label || '').match(/^(.*?)(\d+)$/); if (!m) continue;
    const k = `${p.cabinet || ''}|${p.pos.sheet || ''}|${p.pos.page || 0}|${Math.round(p.pos.x)}|${Math.round(p.pos.y)}|${m[1]}|${p.typeId || ''}`;
    if (!mark.has(k)) mark.set(k, []); mark.get(k).push({ p, pre: m[1], n: Number(m[2]), w: m[2].length });
  }
  for (const list of mark.values()) {
    if (list.length < 2 || list.length > 8) continue;
    list.sort((a, b) => a.n - b.n);
    if (!list.every((x, i) => i === 0 || x.n === list[i - 1].n + 1)) continue;
    const { pre, w } = list[0]; const lo = list[0].n; const hi = list[list.length - 1].n;
    const newLabel = `${pre}${String(lo).padStart(w, '0')}-${String(hi).padStart(w, '0')}`;
    if (by.has(key(list[0].p.cabinet, newLabel))) continue;
    out.push({ double: null, singles: list.map((x) => x.p), newLabel });
  }
  const name = (g) => (g.double ? g.double.label : g.newLabel);
  return out.sort((x, y) => String(name(x)).localeCompare(String(name(y)), 'ru', { numeric: true }));
}

/** Cables of a double point assembled from singles: the sum of the singles' cables (each has its own «cat7×1») or by type */
function summedCables(singles) {
  if (!singles.every((x) => Array.isArray(x.cableOverride) && x.cableOverride.length)) return null;
  const m = new Map(); singles.forEach((x) => x.cableOverride.forEach((c) => m.set(c.cable, (m.get(c.cable) || 0) + (Number(c.count) || 0))));
  return [...m.entries()].map(([cable, count]) => ({ cable, count }));
}
/** What changes on the point that becomes double (if there is no double point yet) */
export function newDoublePatch(group) {
  return group.double ? null : { label: group.newLabel, cableOverride: summedCables(group.singles) };
}

/** The project's single points for a double label («FC/B05-06» → [FC/B05, FC/B06]) or null */
export function singlesOf(label, cabinet, points) {
  const m = String(label || '').match(RANGE); if (!m) return null;
  const [, pre, a, b] = m; const lo = Number(a); const hi = Number(b); if (!(hi > lo) || hi - lo > 7) return null;
  const out = [];
  for (let n = lo; n <= hi; n++) {
    const want = [`${pre}${String(n).padStart(a.length, '0')}`, `${pre}${n}`];
    const s = points.find((p) => !p.deleted && (p.cabinet || '') === (cabinet || '') && want.includes(p.label)); if (!s) return null; out.push(s);
  }
  return out;
}

const isPull = (e) => e.workType === 'Протяжка';
const portsOf = (e, id) => (Array.isArray(e.portQty) ? e.portQty.find((q) => q && q.id === id)?.v : undefined);
/** How many units the point gives in an entry (cables — for a pull, pieces — for the rest) */
export function countIn(e, id, ctx) {
  const one = { ...e, pointIds: [id] };
  return isPull(e) ? pullFigures(one, ctx).count : itogShtuk(one, ctx);
}

/**
 * What happens when the group is merged. mode: 'double' — keep the double, remove the singles; 'singles' — the opposite.
 * data: { entries, journal, pulls } — the project's live records. ctx — the context (points, reference lists).
 * → { kept: [ids], removed: [ids], entries: [{ id, label, before, after, unexpected, transfer: true, keepCount }], notes: [strings] }
 */
export function previewMerge(group, mode, data, ctx) {
  const make = !group.double;   // there is no double — the first single becomes the double
  const kept = make ? [group.singles[0].id] : mode === 'double' ? [group.double.id] : group.singles.map((s) => s.id);
  const removed = make ? group.singles.slice(1).map((s) => s.id) : mode === 'double' ? group.singles.map((s) => s.id) : [group.double.id];
  const patch = newDoublePatch(group);
  // the «after» quantity is already counted with the new name and cables of the kept point
  const ctxA = patch ? { ...ctx, points: new Map(ctx.points).set(kept[0], { ...ctx.points.get(kept[0]), ...patch, cableOverride: patch.cableOverride ?? undefined }) } : ctx;
  const all = new Set([...kept, ...removed]);
  const entries = [];
  for (const e of data.entries) {
    const ids = e.pointIds || []; if (!ids.some((id) => removed.includes(id) || (patch && id === kept[0]))) continue;
    const day = ctx.days.get(e.dayId);
    const work = ctx.catalog.get(e.workId);
    const before = ids.filter((id) => all.has(id)).reduce((n, id) => n + countIn(e, id, ctx), 0);
    const after = kept.reduce((n, id) => n + countIn({ ...e, portQty: (e.portQty || []).filter((q) => q.id !== id) }, id, ctxA), 0);
    // the work is «foreign» to the kept point: it has no such task (a pull is always its own)
    const unexpected = !isPull(e) && !!work && !['Время', 'Текст'].includes(e.workType) && kept.every((id) => { const p = ctxA.points.get(id); return p && compositionOf(p, ctxA) && taskQty(p, ctxA, e) === null; });
    entries.push({ id: e.id, date: day?.date || '', name: work?.name || e.workType, workType: e.workType, before, after, unexpected, transfer: true, keepCount: before !== after && (mode === 'double' || make) });
  }
  const notes = [];
  const pts = (ids) => ids.map((id) => ctx.points.get(id)).filter(Boolean);
  const lens = [...new Set(pts(removed).map((p) => p.length).filter((v) => !blank(v)))];
  if (lens.length > 1) notes.push(`разная длина: ${lens.join(' и ')} м — останется ${Math.max(...lens)} м`);
  for (const f of ['mac', 'serial']) { const vs = [...new Set(pts([...removed, ...kept]).map((p) => p[f]).filter((v) => !blank(v)))]; if (vs.length > 1) notes.push(`разные ${f === 'mac' ? 'MAC' : 'серийные номера'}: ${vs.join(', ')} — останется ${vs[0]}`); }
  for (const pl of data.pulls) {
    if (!(pl.pointIds || []).some((id) => removed.includes(id))) continue;
    const vals = (arr) => [...new Set((arr || []).filter((x) => removed.includes(x.id)).map((x) => x.v))];
    const m = vals(pl.meters); if (m.length > 1) notes.push(`протяжка: разный метраж (${m.join(' и ')} м) — останется ${Math.max(...m)} м`);
    for (const k of ['finished', 'checked']) {
      const inPull = removed.filter((id) => pl.pointIds.includes(id)); const n = inPull.filter((id) => (pl[k] || []).includes(id)).length;
      if (n && n < inPull.length) notes.push(`протяжка: ${k === 'finished' ? 'протянута' : 'отмечена'} только часть одинарных — у ${mode === 'double' ? 'двойной' : 'одинарных'} отметки не будет`);
    }
  }
  return { kept, removed, entries, notes, patch };
}

/**
 * Write operations for the merge (after the person has looked at the preview and maybe changed transfer/keepCount).
 * → { ops: [{ coll, id, data }], remove: [{ coll, id }] }
 */
export function mergeOps(group, mode, pv, data, ctx) {
  const { kept, removed } = pv; const rem = new Set(removed);
  const ops = []; const remove = [];
  const choice = new Map(pv.entries.map((x) => [x.id, x]));
  const replace = (ids) => { const out = []; ids.forEach((id) => { const list = rem.has(id) ? kept : [id]; list.forEach((k) => { if (!out.includes(k)) out.push(k); }); }); return out; };
  const transferred = new Set();
  // daily report entries
  for (const e of data.entries) {
    const ids = e.pointIds || []; if (!ids.some((id) => rem.has(id) || (pv.patch && id === kept[0]))) continue;
    const c = choice.get(e.id) || { transfer: true };
    let portQty = (e.portQty || []).filter((q) => !rem.has(q.id));
    let pointIds;
    if (c.transfer) {
      pointIds = replace(ids); transferred.add(e.id);
      // keep the quantity as it was in the report: the kept point gets as many units as the removed ones gave
      if (c.keepCount && c.before !== c.after && kept.length === 1) {
        const k = kept[0]; const others = ids.filter((id) => rem.has(id) || id === k);
        const v = others.reduce((n, id) => n + countIn(e, id, ctx), 0);
        portQty = [...portQty.filter((q) => q.id !== k), { id: k, v }];
      }
    } else pointIds = ids.filter((id) => !rem.has(id));
    const data1 = { pointIds };
    if (portQty.length || (e.portQty || []).length) data1.portQty = portQty;
    ops.push({ coll: 'entries', id: e.id, data: data1 });
  }
  // journal: the removed points' rows → the kept ones
  const have = new Set(data.journal.map((r) => r.id));
  for (const r of data.journal) {
    if (!rem.has(r.pointId)) continue;
    if (r.entryId) {
      if (transferred.has(r.entryId)) kept.forEach((k) => { const id = `${r.entryId}_${k}`; if (!have.has(id)) { have.add(id); ops.push({ coll: 'journal', id, data: { entryId: r.entryId, pointId: k, deleted: false } }); } });
    } else if (r.editWorkId) {
      kept.forEach((k) => { const id = `edit_${k}_${r.editWorkId}`; if (!have.has(id)) { have.add(id); ops.push({ coll: 'journal', id, data: { pointId: k, entryId: null, editDate: r.editDate ?? null, editWorkId: r.editWorkId, ...(r.editCableId ? { editCableId: r.editCableId } : {}), ...(r.editDeviceIds ? { editDeviceIds: r.editDeviceIds } : {}), deleted: false } }); } });
    }
    remove.push({ coll: 'journal', id: r.id });
  }
  // pulls
  for (const pl of data.pulls) {
    if (!(pl.pointIds || []).some((id) => rem.has(id))) continue;
    const upd = { pointIds: replace(pl.pointIds) };
    for (const k of ['meters', 'fixed', 'kept']) {
      if (!Array.isArray(pl[k])) continue;
      const arr = pl[k].filter((x) => !rem.has(x.id)); const from = pl[k].filter((x) => rem.has(x.id)).map((x) => x.v).filter((v) => !blank(v));
      if (from.length) kept.forEach((kid) => { if (!arr.some((x) => x.id === kid)) arr.push({ id: kid, v: Math.max(...from.map(Number)) }); });
      upd[k] = arr;
    }
    for (const k of ['finished', 'checked']) {
      if (!Array.isArray(pl[k])) continue;
      const inPull = pl.pointIds.filter((id) => rem.has(id)); const all = inPull.length && inPull.every((id) => pl[k].includes(id));
      const arr = pl[k].filter((id) => !rem.has(id)); if (all) kept.forEach((kid) => { if (!arr.includes(kid)) arr.push(kid); });
      upd[k] = arr;
    }
    ops.push({ coll: 'pulls', id: pl.id, data: upd });
  }
  // point fields: what the kept point lacks is taken from the removed ones
  const src = removed.map((id) => ctx.points.get(id)).filter(Boolean);
  for (const kid of kept) {
    const k = ctx.points.get(kid); if (!k) continue; const patch = {};
    if (pv.patch && kid === kept[0]) { patch.label = pv.patch.label; patch.cableOverride = pv.patch.cableOverride; }
    const lens = src.map((p) => p.length).filter((v) => !blank(v)).map(Number);
    if (blank(k.length) && lens.length) patch.length = Math.max(...lens);
    for (const f of ['panel', 'port', 'mac', 'serial', 'configId', 'delayReasonId']) { if (blank(k[f])) { const v = src.map((p) => p[f]).find((x) => !blank(x)); if (!blank(v)) patch[f] = v; } }
    const notes = [...new Set([k.note, ...src.map((p) => p.note)].filter((v) => !blank(v)))];
    if (notes.length > 1 || (notes.length === 1 && blank(k.note))) patch.note = notes.join('; ');
    if (Object.keys(patch).length) ops.push({ coll: 'points', id: kid, data: patch });
  }
  removed.forEach((id) => remove.push({ coll: 'points', id }));
  return { ops, remove };
}

/**
 * Cables by point number (network points: one cable kind, cat7): a single — 1 cable, a double «B05-06» — 2, a triple — 3…
 * Returns the cableOverride to set, or null (it matches the type, an own value is already set, not a network point).
 * A point's own value (cableOverride) is an exception and is not touched.
 */
export function cablesByLabel(point, ctx) {
  if (Array.isArray(point.cableOverride) && point.cableOverride.length) return null;
  if (!ctx.types.has(point.typeId)) return null;
  const list = cableListOf({ ...point, cableOverride: undefined }, ctx);
  if (list.length !== 1 || !isPortCable(list[0].cable)) return null;
  const m = String(point.label || '').match(RANGE);
  const n = m ? Number(m[3]) - Number(m[2]) + 1 : 1;
  if (!(n >= 1 && n <= 8) || n === list[0].count) return null;
  return [{ cable: list[0].cable, count: n }];
}
/** The project's points whose number of cables does not match the label (without an own value) */
export const cablesMismatch = (points, ctx) => points.filter((p) => !p.deleted).map((p) => ({ p, want: cablesByLabel(p, ctx) })).filter((x) => x.want);
