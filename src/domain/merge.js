// Одна и та же точка, записанная по-разному: двойная «FC/B05-06» и одинарные «FC/B05» + «FC/B06» (старый разбор тохнита
// делил двойные на одинарные, новый — оставляет двойными). Здесь: найти такие группы и посчитать объединение —
// какой вид оставить, куда перейдут работы (записи дохa, журнал, протяжки), что не сходится (количество в отчёте,
// работа, которой у оставляемой точки нет, разные метры).
import { itogShtuk, pullFigures } from './doh.js';
import { taskQty, compositionOf } from './compose.js';

const RANGE = /^(.*?)(\d+)-(\d+)$/;
const blank = (v) => v === undefined || v === null || v === '';

/** Группы: двойная (тройная…) точка и все её одинарные в том же шкафу. points — живые точки. */
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
  return out.sort((x, y) => String(x.double.label).localeCompare(String(y.double.label), 'ru', { numeric: true }));
}

/** Одинарные точки проекта для двойного обозначения («FC/B05-06» → [FC/B05, FC/B06]) или null */
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
/** Сколько единиц даёт точка в записи (кабелей — для протяжки, штук — для остальных) */
export function countIn(e, id, ctx) {
  const one = { ...e, pointIds: [id] };
  return isPull(e) ? pullFigures(one, ctx).count : itogShtuk(one, ctx);
}

/**
 * Что будет при объединении группы. mode: 'double' — оставить двойную, одинарные убрать; 'singles' — наоборот.
 * data: { entries, journal, pulls } — живые записи проекта. ctx — контекст (точки, справочники).
 * → { kept: [ids], removed: [ids], entries: [{ id, label, before, after, unexpected, transfer: true, keepCount }], notes: [строки] }
 */
export function previewMerge(group, mode, data, ctx) {
  const kept = mode === 'double' ? [group.double.id] : group.singles.map((s) => s.id);
  const removed = mode === 'double' ? group.singles.map((s) => s.id) : [group.double.id];
  const all = new Set([...kept, ...removed]);
  const entries = [];
  for (const e of data.entries) {
    const ids = e.pointIds || []; if (!ids.some((id) => removed.includes(id))) continue;
    const day = ctx.days.get(e.dayId);
    const work = ctx.catalog.get(e.workId);
    const before = ids.filter((id) => all.has(id)).reduce((n, id) => n + countIn(e, id, ctx), 0);
    const after = kept.reduce((n, id) => n + countIn({ ...e, portQty: (e.portQty || []).filter((q) => q.id !== id) }, id, ctx), 0);
    // работа «чужая» для оставляемой точки: у неё нет такой задачи (протяжка — всегда своя)
    const unexpected = !isPull(e) && !!work && !['Время', 'Текст'].includes(e.workType) && kept.every((id) => { const p = ctx.points.get(id); return p && compositionOf(p, ctx) && taskQty(p, ctx, e) === null; });
    entries.push({ id: e.id, date: day?.date || '', name: work?.name || e.workType, workType: e.workType, before, after, unexpected, transfer: true, keepCount: before !== after && mode === 'double' });
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
  return { kept, removed, entries, notes };
}

/**
 * Операции записи для объединения (после того как человек посмотрел preview и, может быть, поменял transfer/keepCount).
 * → { ops: [{ coll, id, data }], remove: [{ coll, id }] }
 */
export function mergeOps(group, mode, pv, data, ctx) {
  const { kept, removed } = pv; const rem = new Set(removed);
  const ops = []; const remove = [];
  const choice = new Map(pv.entries.map((x) => [x.id, x]));
  const replace = (ids) => { const out = []; ids.forEach((id) => { const list = rem.has(id) ? kept : [id]; list.forEach((k) => { if (!out.includes(k)) out.push(k); }); }); return out; };
  const transferred = new Set();
  // записи дохa
  for (const e of data.entries) {
    const ids = e.pointIds || []; if (!ids.some((id) => rem.has(id))) continue;
    const c = choice.get(e.id) || { transfer: true };
    let portQty = (e.portQty || []).filter((q) => !rem.has(q.id));
    let pointIds;
    if (c.transfer) {
      pointIds = replace(ids); transferred.add(e.id);
      // сохранить количество, как было в отчёте: у оставляемой точки — столько же единиц, сколько давали убранные
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
  // журнал: строки убираемых точек → оставляемым
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
  // протяжки
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
  // поля точки: чего нет у оставляемой — берём у убираемых
  const src = removed.map((id) => ctx.points.get(id)).filter(Boolean);
  for (const kid of kept) {
    const k = ctx.points.get(kid); if (!k) continue; const patch = {};
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
