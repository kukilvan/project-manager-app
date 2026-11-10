// Cable pulls («Протяжки»): choose points on the plan → «до шкафа» (to the rack) → metres per point → checklist → finish (written into the daily report).
// A pull record: { name, createdAt, drawingId, screen, curId, pointIds, base, meters: {id: own}, kept: {id: total from the card},
//   checked: [id], finished: [id], finishedAt, deleted }
// Pure; used by the points view and the pull view (src/app/views).

export const PULL_STATUSES = [
  ['Завершена', '#34c759'], ['Завершена частично', '#ffcc00'], ['Есть метраж', '#2f7cf6'],
  ['Частично есть метраж', '#0fa5a0'], ['Точки выбраны', '#ff3b30'], ['Заготовка', '#8e8e93'],
];
export const pullColor = (st) => (PULL_STATUSES.find(([s]) => s === st) || [])[1] || '#8e8e93';

const ids = (pull) => pull?.pointIds || [];
// meters / kept are stored as a list [{id, v}] (a map in the database would not lose deleted keys on merge)
export const pairsToMap = (x) => (Array.isArray(x) ? Object.fromEntries(x.filter((e) => e && e.id != null).map((e) => [e.id, e.v])) : (x || {}));
export const mapToPairs = (m) => Object.entries(m || {}).filter(([, v]) => v != null).map(([id, v]) => ({ id, v }));
const val = (pull, key, id) => { const v = pairsToMap(pull?.[key])[id]; return v == null ? null : v; };
export const isMeasured = (pull, id) => val(pull, 'kept', id) != null || val(pull, 'meters', id) != null;
/** Total metrage of a point in the pull (to the rack + own; or the one kept from the card), otherwise null */
export function pullTotal(pull, id) {
  const fx = val(pull, 'fixed', id); if (fx != null) return Number(fx); // a pulled point — the total is fixed
  const k = val(pull, 'kept', id); if (k != null) return Number(k);
  const m = val(pull, 'meters', id); if (m == null) return null;
  return (Number(pull.base) || 0) + Number(m);
}
/** The metrage in the pull and the length in the point's card must match. If the length in the card was erased or changed after it was entered in the pull,
 *  the card is the truth: erased → the point is «without metrage» again; changed → the pull gets «kept from the card» with the new total.
 *  Pulled (finished) points are not touched. Returns the same pull if there is nothing to change. */
export function reconcilePull(pull, pointOf) {
  if (!pull) return pull;
  const fin = new Set(pull.finished || []); const m = pairsToMap(pull.meters); const k = pairsToMap(pull.kept); let changed = false;
  for (const id of ids(pull)) {
    if (fin.has(id) || (m[id] == null && k[id] == null)) continue;
    const pt = pointOf(id); if (!pt) continue;
    const len = pt.length; const total = pullTotal(pull, id);
    if (len === undefined || len === null || len === '' || Number.isNaN(Number(len))) { delete m[id]; delete k[id]; changed = true; }
    else if (Number(len) !== total) { delete m[id]; k[id] = Number(len); changed = true; }
  }
  return changed ? { ...pull, meters: mapToPairs(m), kept: mapToPairs(k) } : pull;
}
// needs(id) → false for points without a cable: they need no metrage and are not counted
export function pullStatus(pull, exists, needs) {
  const all = exists ? ids(pull).filter((id) => exists(id) || (pull?.finished || []).includes(id)) : ids(pull); const fin = new Set(pull?.finished || []);
  const need = needs ? all.filter(needs) : all;
  if (fin.size) return need.every((id) => fin.has(id)) ? 'Завершена' : 'Завершена частично';
  if (!all.length) return 'Заготовка';
  if (!need.length) return 'Есть метраж';
  const m = need.filter((id) => isMeasured(pull, id)).length;
  if (m === need.length) return 'Есть метраж';
  if (m) return 'Частично есть метраж';
  return 'Точки выбраны';
}
export const canDeletePull = (pull) => pullStatus(pull) !== 'Завершена';

/** The point of the list nearest to from (one drawing page — the nearest first; then the others) */
export function nearestPoint(from, list) {
  if (!list.length) return null;
  if (!from?.pos) return list[0];
  const pg = from.pos.page || 0;
  const dist = (p) => ((p.pos?.page || 0) === pg ? 0 : 1e9) + Math.hypot((p.pos?.x || 0) - from.pos.x, (p.pos?.y || 0) - from.pos.y);
  return [...list].sort((a, b) => dist(a) - dist(b))[0];
}
/** Name with the creation date and time: «Коридор B — 22.10.2026 18:40» */
export function pullTitle(pull) {
  const d = new Date(pull?.createdAt || 0);
  const t = d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
  return `${pull?.name || 'Протяжка'} — ${t}`;
}

/** The copy of the pull that another phone saved later: take from it what I lack (someone else's metrage, «pulled») */
export function mergeRemote(mine, remote) {
  if (!remote) return mine;
  const out = { ...mine };
  out.finished = [...new Set([...(mine.finished || []), ...(remote.finished || [])])];
  for (const key of ['meters', 'kept', 'fixed']) {
    const a = pairsToMap(mine[key]); const b = pairsToMap(remote[key]);
    const other = key === 'meters' ? pairsToMap(mine.kept) : key === 'kept' ? pairsToMap(mine.meters) : {};
    for (const [id, v] of Object.entries(b)) if (a[id] == null && other[id] == null && (key === 'fixed' || (mine.pointIds || []).includes(id))) a[id] = v;
    out[key] = mapToPairs(a);
  }
  out.checked = [...new Set([...(mine.checked || []), ...(remote.checked || []).filter((id) => out.finished.includes(id))])];
  out.pointIds = [...new Set([...(mine.pointIds || []), ...out.finished.filter((id) => !(mine.pointIds || []).includes(id) && (remote.pointIds || []).includes(id))])];
  return out;
}
