// Adds points from a file (for example after a drawing is parsed): parses it, plans the import and builds the write operations.
// Format: { format: 'polevoy-points-1', source?, floor?, sheet?: { pdf, pages: [{ w, h }] },
//   points: [{ label, typeId, planName?, cabinet?, floor?, note?, devices?, cables?, pos?: { page, x, y, w, h } }],
//   types?: [{ id, nameHe, devices, cables, workIds }], devices?: [{ id, name, nameHe, cables, workIds }] }
// Replaces nothing: existing points (the same label) are skipped; new types and devices from the file are created if missing.
// Built on typelib.js, status.js and merge.js; used by pool.js.
import { addBundleOps } from './typelib.js';
import { cableOverrideFor } from './status.js';
import { cablesByLabel } from './merge.js';
export const POINTS_FORMAT = 'polevoy-points-1';
// System type for «sort out later» points: not shown in the type reference list and not sent to the shared pool
export const UNSORTED_TYPE = 'Не разобрано';
export const isSystemType = (t) => !!t && (t.system === true || t.id === UNSORTED_TYPE);
const s = (v) => (v === undefined || v === null ? '' : String(v).trim());

export function parsePointsFile(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Файл не читается как JSON'); }
  if (data?.format !== POINTS_FORMAT) throw new Error(`Это не файл точек (нужен format: "${POINTS_FORMAT}")`);
  if (!Array.isArray(data.points)) throw new Error('В файле нет списка точек (points)');
  return data;
}

// Suspicious labels: do not look like a point number
export function labelProblems(label) {
  const out = [];
  if (!label) return ['пустое обозначение'];
  if (/[А-Яа-яЁё]/.test(label)) out.push('русские буквы');
  if (/[֐-׿]/.test(label)) out.push('иврит');
  if (/\s/.test(label)) out.push('пробел');
  if (/^H\s*=?\s*\d/i.test(label)) out.push('похоже на высоту установки');
  if (label.length > 20) out.push('слишком длинное');
  if (!/\d/.test(label)) out.push('нет цифр');
  return out;
}

// pool — the shared pool of types (Map id → bundle): a type that is neither in the project nor in the file is taken from there;
// not there either — an empty type with this name is created (its composition is set up later in «Типы точек»)
// requireCabinet: points without a rack are not added but go to noCabinet (the app asks for a rack for them)
export function planPointsImport(ctx, data, pool = new Map(), { requireCabinet = false } = {}) {
  const fileTypes = new Map((data.types || []).map((t) => [s(t.id), t]));
  const fileDevices = new Map((data.devices || []).map((d) => [s(d.id), d]));
  // equal labels are allowed in different racks (and in a rack + without a rack): «already exists» only means the same label in the same rack
  const key = (p) => `${p.cabinet || ''}\u0000${p.label}`;
  const have = new Map([...ctx.points.values()].map((p) => [key(p), p]));
  const cabsOf = new Map(); [...ctx.points.values()].forEach((p) => { if (!cabsOf.has(p.label)) cabsOf.set(p.label, new Set()); cabsOf.get(p.label).add(p.cabinet || ''); });
  const alsoIn = new Map();   // point to add → the racks in which such a label already exists
  const seen = new Set();
  const add = []; const skipped = []; const errors = []; const warnings = []; const noCabinet = [];
  const fromPool = new Map(); const blank = new Set();
  data.points.forEach((raw, i) => {
    const p = { ...raw, label: s(raw.label), typeId: s(raw.typeId), cabinet: s(raw.cabinet) || s(data.cabinet), floor: s(raw.floor) || s(data.floor), planName: s(raw.planName), note: s(raw.note) };
    const where = `строка ${i + 1}${p.label ? ` (${p.label})` : ''}`;
    if (!p.label) { errors.push(`${where}: нет обозначения`); return; }
    if (!p.typeId) { errors.push(`${where}: нет типа`); return; }
    if (!ctx.types.has(p.typeId) && !fileTypes.has(p.typeId)) {
      if (!fromPool.has(p.typeId) && !blank.has(p.typeId)) (pool.get(p.typeId) ? fromPool.set(p.typeId, pool.get(p.typeId)) : blank.add(p.typeId));
    }
    if (requireCabinet && !p.cabinet) { noCabinet.push(p); return; }
    if (seen.has(key(p))) { errors.push(`${where}: обозначение повторяется в файле${p.cabinet ? ` (шкаф ${p.cabinet})` : ''}`); return; }
    seen.add(key(p));
    if (have.has(key(p))) { skipped.push(p.label); return; }
    const other = [...(cabsOf.get(p.label) || [])]; if (other.length) alsoIn.set(key(p), other.map((c) => c || 'без шкафа').join(', '));
    const bad = labelProblems(p.label); if (bad.length) warnings.push(`${p.label}: ${bad.join(', ')}`);
    (Array.isArray(p.devices) ? p.devices : []).forEach((d) => { if (!ctx.devices.has(d.deviceId) && !fileDevices.has(d.deviceId)) errors.push(`${where}: устройства «${d.deviceId}» нет`); });
    add.push(p);
  });
  const newTypes = [...fileTypes.values()].filter((t) => !ctx.types.has(s(t.id)) && add.some((p) => p.typeId === s(t.id)));
  const newDevices = [...fileDevices.values()].filter((d) => !ctx.devices.has(s(d.id)));
  newTypes.forEach((t) => (t.devices || []).forEach((d) => { if (!ctx.devices.has(d.deviceId) && !fileDevices.has(d.deviceId)) errors.push(`Тип «${t.id}»: устройства «${d.deviceId}» нет`); }));
  const byType = {}; add.forEach((p) => { const k = `${p.cabinet || 'без шкафа'} · ${p.typeId}`; byType[k] = (byType[k] || 0) + 1; });
  const poolTypes = [...fromPool.values()].filter((b) => add.some((p) => p.typeId === b.type.id));
  const blankTypes = [...blank].filter((id) => add.some((p) => p.typeId === id));
  return { add, skipped, errors, warnings, newTypes, newDevices, byType, poolTypes, blankTypes, alsoIn, noCabinet, ctx };
}

// Position of a point on the drawing sheet (for the future plan in the app): PDF pt from the top-left corner + sheet size and file name
export function posOf(p, data) {
  const q = p.pos; const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  if (!q || n(q.x) === null || n(q.y) === null) return undefined;
  const page = Number.isInteger(q.page) ? q.page : 0; const sz = data?.sheet?.pages?.[page] || {};
  const out = { page, x: q.x, y: q.y };
  if (n(q.w) !== null) out.w = q.w; if (n(q.h) !== null) out.h = q.h;
  if (n(sz.w) !== null) out.pw = sz.w; if (n(sz.h) !== null) out.ph = sz.h;
  if (data?.sheet?.pdf) out.sheet = String(data.sheet.pdf);
  return out;
}

// Write operations (after the preview)
export function pointsImportOps(plan, newId, data) {
  const ops = [];
  plan.newDevices.forEach((d) => ops.push({ coll: 'devices', id: s(d.id), data: { name: d.name || d.id, nameHe: d.nameHe || '', cables: d.cables || [], workIds: d.workIds || [] } }));
  plan.newTypes.forEach((t) => ops.push({ coll: 'types', id: s(t.id), data: { nameHe: t.nameHe || '', devices: t.devices || [], cables: t.cables || [], workIds: t.workIds || [] } }));
  if (plan.ctx) (plan.poolTypes || []).forEach((b) => addBundleOps(plan.ctx, b, ops)); // a type from the shared pool — together with devices, cables, works
  (plan.blankTypes || []).forEach((id) => ops.push({ coll: 'types', id, data: { nameHe: '', devices: [], cables: [], workIds: [], ...(id === UNSORTED_TYPE ? { system: true } : {}) } }));
  // for «cables by label» — the project's types together with those that come from the file and the shared pool
  const lctx = plan.ctx && { ...plan.ctx, types: new Map([...plan.ctx.types, ...(plan.poolTypes || []).map((b) => [b.type.id, b.type]), ...(plan.newTypes || []).map((t) => [s(t.id), t])]) };
  plan.add.forEach((p) => ops.push({ coll: 'points', id: newId(), data: {
    label: p.label, typeId: p.typeId, cabinet: p.cabinet || undefined, floor: p.floor || undefined, planName: p.planName || undefined, note: p.note || undefined,
    ...(Array.isArray(p.devices) ? { devices: p.devices } : {}), ...(Array.isArray(p.cables) ? { cables: p.cables } : {}),
    ...(posOf(p, data) ? { pos: posOf(p, data) } : {}),
    ...(Array.isArray(p.cableOverride) && (!plan.ctx || cableOverrideFor(p.cableOverride, plan.ctx, p.typeId, p.cabinet)) ? { cableOverride: p.cableOverride }
      // cables by label: a single network point — 1 cable, a double one — 2… (if the point has no cables of its own)
      : !Array.isArray(p.cableOverride) && !Array.isArray(p.cables) && !Array.isArray(p.devices) && lctx && cablesByLabel({ label: p.label, typeId: p.typeId, cabinet: p.cabinet }, lctx)
        ? { cableOverride: cablesByLabel({ label: p.label, typeId: p.typeId, cabinet: p.cabinet }, lctx) } : {}),
  } }));
  return ops;
}
