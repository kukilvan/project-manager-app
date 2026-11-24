// The plan's view memory: the record kept on this device (last drawing, and per drawing the page, centre and zoom), its validation, the choice of the drawing to open and centre ↔ corner of a view.
// Pure, no DOM and no storage: src/app/views/planmodal.js reads and writes `pz.planView.<projectId>` and src/app/views/planview.js uses centreOf / cornerOf (spec 8 § 2).

const S_MIN = 0.05; const S_MAX = 20;   // the viewer's zoom limits
const r1 = (n) => Math.round(n * 10) / 10;
const r3 = (n) => Math.round(n * 1000) / 1000;
const num = (n) => typeof n === 'number' && Number.isFinite(n);
const validView = (v) => !!v && typeof v === 'object' && Number.isInteger(v.page) && v.page >= 0 && num(v.x) && num(v.y) && num(v.s) && v.s >= S_MIN && v.s <= S_MAX;
const pick = (v) => ({ page: v.page, x: v.x, y: v.y, s: v.s });

/** The stored text → `{ last, views }`; anything broken is dropped silently and never throws */
export function parsePlanMemory(text) {
  const none = { last: null, views: {} };
  let raw; try { raw = JSON.parse(text); } catch { return none; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return none;
  const last = typeof raw.last === 'string' && raw.last ? raw.last : null;
  const src = raw.views && typeof raw.views === 'object' && !Array.isArray(raw.views) ? raw.views : {};
  const views = Object.fromEntries(Object.entries(src).filter(([, v]) => validView(v)).map(([id, v]) => [id, pick(v)]));
  return { last, views };
}

/** The remembered view of a drawing for the opened file (`pages` — `[{ w, h }]`): `{ page, x, y, s }` with the centre kept on the page, or `null` */
export function viewFor(record, drawingId, pages) {
  const v = record?.views?.[drawingId];
  if (!validView(v) || !Array.isArray(pages) || v.page >= pages.length) return null;
  const pg = pages[v.page]; if (!pg) return null;
  return { page: v.page, x: Math.min(Math.max(v.x, 0), pg.w), y: Math.min(Math.max(v.y, 0), pg.h), s: v.s };
}

/** A new record: `last` = the drawing, its view stored rounded (x, y to 0.1, s to 0.001), entries of drawings not in `liveIds` dropped (the drawing itself too) */
export function rememberView(record, drawingId, view, liveIds) {
  const live = new Set(liveIds || []);
  const old = record?.views || {};
  const views = Object.fromEntries(Object.entries(old).filter(([id, v]) => live.has(id) && id !== drawingId && validView(v)));
  if (!live.has(drawingId)) return { last: live.has(record?.last) ? record.last : null, views };   // the drawing was removed meanwhile: nothing is kept for it
  if (validView(view)) views[drawingId] = { page: view.page, x: r1(view.x), y: r1(view.y), s: r3(view.s) };
  return { last: drawingId, views };
}

/** Which drawing the plan opens (spec 8 D9): the first of an internal redraw's choice, the opening point's drawing, the placing point's floor, the one shown now, the remembered last that is in `ids`; else the first; else `null` */
export function drawingToOpen({ ids = [], selectId, pointId, placeId, currentId, last } = {}) {
  return [selectId, pointId, placeId, currentId, last].find((id) => id && ids.includes(id)) ?? ids[0] ?? null;
}

/** The drawing point at the middle of a `w` × `h` viewer whose corner is `ox, oy` at zoom `s` */
export const centreOf = ({ s, ox, oy }, w, h) => ({ x: ox + w / (2 * s), y: oy + h / (2 * s), s });

/** The corner `ox, oy` that puts the drawing point `x, y` in the middle of a `w` × `h` viewer at zoom `s` (the inverse of `centreOf`) */
export const cornerOf = ({ x, y, s }, w, h) => ({ s, ox: x - w / (2 * s), oy: y - h / (2 * s) });
