// Door configurations (new scheme): there is one point type, «Дверь», and the kind of door is set by its configuration.
// A configuration = composition (devices with counts) + the door's cables (kind × count, separate from the devices:
//   a door often has a box where 2–3 cables fan out to all the devices). The name is built from the composition by itself.
// The configuration id is a fingerprint of the composition: identical doors in different projects are one configuration in the shared pool.
// Storage: the shared pool (pool_doorcfg) + a copy in the project (configs) for those that are used or pinned.
// Old configurations ({ name, components: [works] }) keep working the old way.
// Built on seed.js; used by compose.js and report.js.

import { DEVICES, CATALOG, CABLES } from './seed.js';

// Door parts: the order is the same as in the picker window and in the name
export const DOOR_PARTS = [
  { key: 'lock', name: 'Запирание', one: true, max: 2, hint: 'только одно на дверь' },
  { key: 'reader', name: 'Считыватель', max: 2 },
  { key: 'button', name: 'Кнопки', max: 1 },
  { key: 'sensor', name: 'Датчики', max: 2 },
  { key: 'extra', name: 'Дополнительно', max: 2 },
];
export const DOOR_PART_NAMES = Object.fromEntries(DOOR_PARTS.map((p) => [p.key, p.name]));

// Role of a device for the rules and short names: by the id of the standard library or by the name
const ROLE_BY_ID = { DV_EMAG: 'em', DV_MANUL: 'mh', DV_KORE: 'kore', DV_BIO: 'bio', DV_LPTIHA: 'ptiha', DV_LNIPUTZ: 'niputz', DV_MAGNIT: 'magnit', DV_INT: 'intercom', DV_KEYB: 'keyb' };
export function doorRole(dev) {
  if (!dev) return '';
  if (dev.doorRole) return dev.doorRole;
  if (ROLE_BY_ID[dev.id]) return ROLE_BY_ID[dev.id];
  const n = String(dev.name || dev.id || '').toLowerCase();
  if (/электро\s*-?\s*магнит|^эм\b/.test(n)) return 'em';
  if (/мануль|электро\s*-?\s*замок|^мх\b/.test(n)) return 'mh';
  if (/биометр/.test(n)) return 'bio';
  if (/коре|считыват/.test(n)) return 'kore';
  if (/птих/.test(n)) return 'ptiha';
  if (/нипуц/.test(n)) return 'niputz';
  if (/магнит/.test(n)) return 'magnit';
  if (/интерком/.test(n)) return 'intercom';
  if (/цофар|сирен/.test(n)) return 'tsofar';
  if (/киборд|клавиат/.test(n)) return 'keyb';
  return '';
}
const PART_BY_ROLE = { em: 'lock', mh: 'lock', kore: 'reader', bio: 'reader', keyb: 'reader', ptiha: 'button', niputz: 'button', magnit: 'sensor', intercom: 'extra', tsofar: 'extra' };
/** The device's door part: its own (the doorPart field in «Устройства»), by role, or '' (not for a door). 'none' — explicitly not for a door */
export function doorPartOf(dev) {
  if (!dev) return '';
  if (dev.doorPart === 'none') return '';
  if (dev.doorPart && DOOR_PART_NAMES[dev.doorPart]) return dev.doorPart;
  return PART_BY_ROLE[doorRole(dev)] || '';
}
const SHORT = { em: 'ЭМ', mh: 'МХ', kore: 'коре', bio: 'коре биометри', ptiha: 'птиха', niputz: 'нипуц', magnit: 'магнит', intercom: 'интерком', tsofar: 'цофар', keyb: 'киборд' };
const PLURAL = { магнит: 'магнита' };
export const doorShortOf = (dev) => String(dev?.short || SHORT[doorRole(dev)] || dev?.name || dev?.id || '?').trim();

/** The project's devices that can be on a door, by part: { lock: [dev…], … } */
export function doorDevices(ctx) {
  const out = Object.fromEntries(DOOR_PARTS.map((p) => [p.key, []]));
  [...(ctx.devices?.values() || [])].filter((d) => !d.deleted).forEach((d) => { const k = doorPartOf(d); if (k) out[k].push(d); });
  const ord = ['em', 'mh', 'kore', 'bio', 'keyb', 'ptiha', 'niputz', 'magnit', 'intercom', 'tsofar'];
  Object.values(out).forEach((list) => list.sort((a, b) => ((ord.indexOf(doorRole(a)) + 1 || 99) - (ord.indexOf(doorRole(b)) + 1 || 99)) || String(a.name).localeCompare(String(b.name), 'ru')));
  return out;
}

const clean = (list, key) => (Array.isArray(list) ? list : []).filter((x) => x && x[key] && Number(x.count) > 0).map((x) => ({ [key]: String(x[key]), count: Math.round(Number(x.count)) }));

/**
 * Rules when a device's count changes (hints — everything can be changed by hand afterwards).
 * sel: Map deviceId → count. Returns a new Map.
 * - only one kind of lock; with it a magnet indicator (if there is no sensor); an electromagnet → «птиха», «нипуц» and a reader (if there is no reader)
 * - 2 readers → no «птиха»
 */
export function applyDoorRules(ctx, sel, changedId, count) {
  const out = new Map(sel); const devOf = (id) => ctx.devices.get(id);
  const byRole = (r) => [...ctx.devices.values()].find((d) => !d.deleted && doorPartOf(d) && doorRole(d) === r);
  out.set(changedId, count);
  const dev = devOf(changedId); const part = doorPartOf(dev); const role = doorRole(dev);
  const total = (k) => [...out].filter(([id]) => doorPartOf(devOf(id)) === k).reduce((n, [, c]) => n + c, 0);
  const wasLock = part === 'lock' && (sel.get(changedId) || 0) > 0;   // the lock was already there — what is missing is not added again
  if (part === 'lock' && count > 0) {
    [...out.keys()].forEach((id) => { if (id !== changedId && doorPartOf(devOf(id)) === 'lock') out.set(id, 0); });
    if (wasLock) { /* only a count change */ } else {
    if (!total('sensor')) { const d = byRole('magnit'); if (d) out.set(d.id, 1); }   // magnet indicator — 1 by default
    if (role === 'em') {
      ['ptiha', 'niputz'].forEach((r) => { const d = byRole(r); if (d && !out.get(d.id)) out.set(d.id, 1); });
      if (!total('reader')) { const d = byRole('kore'); if (d) out.set(d.id, 1); }
    }
    }
  }
  if (part === 'reader' && total('reader') >= 2) { const d = byRole('ptiha'); if (d && out.get(d.id)) out.set(d.id, 0); }
  [...out].forEach(([id, c]) => { if (!(c > 0)) out.delete(id); });
  return out;
}

/** Door cables by composition (filled in automatically, can be changed): «ЭМ» — 6005×2, «МХ» — 6005×3; biometric and intercom — +cat7; «цофар» — +6005 */
export function autoDoorCables(ctx, devices) {
  let c6005 = 0; let cat7 = 0; let lock = ''; let lockN = 0;
  clean(devices, 'deviceId').forEach(({ deviceId, count }) => {
    const r = doorRole(ctx.devices.get(deviceId));
    if (r === 'em' || r === 'mh') { lock = lock || r; lockN += count; }
    if (r === 'bio' || r === 'intercom') cat7 += count;
    if (r === 'tsofar') c6005 += count;
  });
  if (lock) c6005 += (lock === 'mh' ? 3 : 2) * Math.max(1, lockN); else c6005 += 2;
  return [{ cable: '6005', count: c6005 }, { cable: 'cat7', count: cat7 }].filter((x) => x.count > 0);
}

// order of devices in the configuration and the name: by part, within a part by role/name
function sortDevices(ctx, devices) {
  const parts = doorDevices(ctx); const rank = new Map(); let i = 0;
  DOOR_PARTS.forEach((p) => parts[p.key].forEach((d) => rank.set(d.id, i++)));
  return clean(devices, 'deviceId').sort((a, b) => (rank.get(a.deviceId) ?? 999) - (rank.get(b.deviceId) ?? 999) || a.deviceId.localeCompare(b.deviceId));
}
const CABLE_ORDER = ['6005', 'cat7'];
const sortCables = (cables) => clean(cables, 'cable').sort((a, b) => ((CABLE_ORDER.indexOf(a.cable) + 1 || 99) - (CABLE_ORDER.indexOf(b.cable) + 1 || 99)) || a.cable.localeCompare(b.cable));

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
/** Configuration id by composition (the same composition → the same id) */
export function doorCfgId(devices, cables) {
  const d = clean(devices, 'deviceId').sort((a, b) => a.deviceId.localeCompare(b.deviceId)).map((x) => `${x.deviceId}*${x.count}`).join('+');
  const c = clean(cables, 'cable').sort((a, b) => a.cable.localeCompare(b.cable)).map((x) => `${x.cable}*${x.count}`).join('+');
  return `DC_${hash(`${d}|${c}`)}`;
}
/** Name: «ЭМ · коре · птиха · нипуц · магнит · 6005×2» */
export function doorCfgName(ctx, devices, cables) {
  const parts = sortDevices(ctx, devices).map(({ deviceId, count }) => {
    const s = doorShortOf(ctx.devices.get(deviceId) || { id: deviceId });
    return count > 1 ? `${count} ${PLURAL[s] || s}` : s;
  });
  const cab = sortCables(cables).map((c) => `${c.cable}×${c.count}`).join(' + ');
  return [...parts, cab].filter(Boolean).join(' · ') || 'пустая дверь';
}
/** Short form for lists and the plan: «ЭМ» / «МХ» */
export function doorCfgShort(ctx, cfg) {
  if (!isDoorCfg(cfg)) return '';
  const lock = cfg.devices.map((x) => ctx.devices.get(x.deviceId)).find((d) => doorPartOf(d) === 'lock' || ['em', 'mh'].includes(doorRole(d)));
  return lock ? doorShortOf(lock) : '';
}
export const isDoorCfg = (cfg) => !!cfg && Array.isArray(cfg.devices);
/** A configuration (the full record) from a composition */
export function makeDoorCfg(ctx, devices, cables) {
  const d = sortDevices(ctx, devices); const c = sortCables(cables);
  return { id: doorCfgId(d, c), name: doorCfgName(ctx, d, c), devices: d, cables: c, kind: 'door' };
}

/** Standard ones: «ЭМ» (reader, «птиха», «нипуц», magnet, 6005×2) and «МХ» (reader, magnet, 6005×3) — from the project's devices */
export function standardDoorCfgs(ctx) {
  const byRole = (r) => [...ctx.devices.values()].find((d) => !d.deleted && doorPartOf(d) && doorRole(d) === r);
  const pick = (roles) => roles.map(byRole);
  const out = [];
  const em = pick(['em', 'kore', 'ptiha', 'niputz', 'magnit']); const mh = pick(['mh', 'kore', 'magnit']);
  if (em.every(Boolean)) { const devs = em.map((d) => ({ deviceId: d.id, count: 1 })); out.push({ ...makeDoorCfg(ctx, devs, autoDoorCables(ctx, devs)), standard: true }); }
  if (mh.every(Boolean)) { const devs = mh.map((d) => ({ deviceId: d.id, count: 1 })); out.push({ ...makeDoorCfg(ctx, devs, autoDoorCables(ctx, devs)), standard: true }); }
  return out;
}
/** Pinned in the project (the order matters): project.doorPins or, if not set, the standard ones */
export const doorPinsOf = (project, ctx) => (Array.isArray(project?.doorPins) ? project.doorPins : standardDoorCfgs(ctx).map((c) => c.id));

/** The point's door configuration (new scheme) or null */
export function doorCfgOf(point, ctx) {
  const cfg = point?.configId ? ctx.configs?.get(point.configId) : null;
  return isDoorCfg(cfg) && !cfg.deleted ? cfg : null;
}

/** Standard door devices from the library that the project lacks (with their works and cables): write operations */
export function doorLibraryOps(ctx) {
  const ops = []; const has = (coll, id) => ctx[coll].has(id) || ops.some((o) => o.coll === coll && o.id === id);
  const roles = new Set(['em', 'mh', 'kore', 'bio', 'ptiha', 'niputz', 'magnit', 'intercom']);
  const present = new Set([...ctx.devices.values()].filter((d) => !d.deleted).map((d) => doorRole(d)));
  DEVICES.filter((d) => roles.has(doorRole(d)) && !present.has(doorRole(d)) && !ctx.devices.has(d.id)).forEach((d) => {
    d.workIds.forEach((w) => { const x = CATALOG.find((c) => c.id === w); if (x && !has('catalog', w)) ops.push({ coll: 'catalog', id: w, data: x }); });
    d.cables.forEach((c) => { const x = CABLES.find((k) => k.id === c.cable); if (x && !has('cables', x.id)) {
      x.workIds.forEach((w) => { const y = CATALOG.find((k) => k.id === w); if (y && !has('catalog', w)) ops.push({ coll: 'catalog', id: w, data: y }); });
      ops.push({ coll: 'cables', id: x.id, data: x });
    } });
    ops.push({ coll: 'devices', id: d.id, data: d });
  });
  return ops;
}

// ---- readable names: colour by door part (or the device's own colour), badges ----
export const DOOR_ROLE_COLORS = { em: '#e5484d', mh: '#2f7cf6' };
export const DOOR_PART_COLORS = { lock: '#e5484d', reader: '#9b5cf6', button: '#f08c00', sensor: '#0fa5a0', extra: '#e0479e' };
export const doorColorOf = (dev) => (dev?.color || DOOR_ROLE_COLORS[doorRole(dev)] || DOOR_PART_COLORS[doorPartOf(dev)] || '#8e8e93');
/** Parts of the name for drawing as badges: { items: [{ text, count, color, lock }], cables: [{ cable, count }] } */
export function doorTokens(ctx, cfg) {
  if (!isDoorCfg(cfg)) return { items: [], cables: [] };
  const items = sortDevices(ctx, cfg.devices).map(({ deviceId, count }) => {
    const dev = ctx.devices.get(deviceId) || { id: deviceId };
    return { text: doorShortOf(dev), count, color: doorColorOf(dev), lock: doorPartOf(dev) === 'lock' || ['em', 'mh'].includes(doorRole(dev)) };
  });
  return { items, cables: sortCables(cfg.cables) };
}
/** Colour of the door's short label («ЭМ»/«МХ») */
export function doorShortColor(ctx, cfg) {
  if (!isDoorCfg(cfg)) return '';
  const lock = cfg.devices.map((x) => ctx.devices.get(x.deviceId)).find((d) => doorPartOf(d) === 'lock' || ['em', 'mh'].includes(doorRole(d)));
  return lock ? doorColorOf(lock) : '';
}
