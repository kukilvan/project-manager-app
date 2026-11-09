// Свой набор работ на выбранных точках (окно «Изменить» точки или группы точек): что сейчас требуется, и что записать в точку.
import { compositionOf, tasksOf, ownWorksOf, cablesTotalOf, OWN_STAGES } from './compose.js';

const sumQty = (tasks, workId) => tasks.filter((t) => t.workId === workId).reduce((n, t) => n + t.qty, 0);
/** Сколько работы у точки по составу (без своего набора) */
export const baseQtyOf = (point, ctx, workId) => sumQty(tasksOf({ ...point, ownWorks: undefined }, ctx), workId);

/**
 * Работы выбранных точек (кроме протяжки): [{ workId, name, workType, have, min, max, own, perCable, removed }]
 * have — у скольких точек работа сейчас требуется; min/max — количество на точку (среди тех, у кого есть);
 * own — у скольких задано своё; perCable — у скольких своё «на каждый кабель»; removed — у скольких убрана.
 * skipped — точки старой схемы (тип без состава): у них своего набора работ нет.
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
 * Что записать в point.ownWorks после изменений: changes — Map workId → { op: 'set', qty, per } | { op: 'remove' } | { op: 'reset' }.
 * set — количество (на точку или на каждый кабель), работа добавится, если её нет; remove — убрать работу у точки;
 * reset — как по составу (своё значение стирается). → массив или null (своего набора нет).
 */
export function ownWorksPatch(point, ctx, changes) {
  const list = ownWorksOf(point).filter((o) => !changes.has(o.workId)).map((o) => ({ ...o }));
  changes.forEach((ch, workId) => {
    if (ch.op === 'reset') return;
    const base = baseQtyOf(point, ctx, workId);
    const qty = ch.op === 'remove' ? 0 : Number(ch.qty);
    if (!(qty >= 0)) return;
    if (qty === 0) { if (base > 0) list.push({ workId, qty: 0 }); return; }
    if (ch.per !== 'cable' && qty === base) return;            // как по составу — своё не нужно
    list.push({ workId, qty, ...(ch.per === 'cable' ? { per: 'cable' } : {}) });
  });
  return list.length ? list : null;
}
/** Сколько получится у точки после изменений (для подсказки) */
export const qtyAfter = (point, ctx, workId, ch) => {
  const own = ownWorksPatch(point, ctx, new Map([[workId, ch]]));
  return sumQty(tasksOf({ ...point, ownWorks: own }, ctx), workId);
};

