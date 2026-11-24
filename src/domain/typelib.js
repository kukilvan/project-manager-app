// Shared pool of point types: the standard types + «my pool» (types saved from any project; kept in the personal settings).
// A type moves into a project together with everything it needs: devices, cables and catalog works. Seeds come from seed.js; used by pool.js and pointsimport.js.
// bare() copies an item without service fields and project-only fields (PROJECT_ONLY, ADR 0018), so every pool path stays free of them.
import { POINT_TYPES, DEVICES, CABLES, CATALOG, composedTypes } from './seed.js';

const META = ['createdAt', 'createdBy', 'createdByName', 'updatedAt', 'updatedBy', 'updatedByName', 'projectId', 'deleted',
  'deletedAt', 'deletedBy', 'deletedByName', 'updatedAtServer', '_pending'];
// Fields that belong to one project only and never go to the shared pool, its inbox or the personal type library (ADR 0018): a work's box «not in the plan colour»
export const PROJECT_ONLY = ['planColour'];
// A copy without the service fields and the project-only fields: what is stored in, sent to, hashed against and compared with the pool
export const bare = (x) => { const c = { ...x }; [...META, ...PROJECT_ONLY].forEach((k) => delete c[k]); return JSON.parse(JSON.stringify(c)); };

// Type bundle: { type, devices, cables, catalog } — from the project's reference lists (Maps) or from the library
export function bundleFrom(maps, typeId) {
  const type = maps.types.get(typeId);
  if (!type || type.system || typeId === 'Не разобрано') return null;  // system type — not into the pool
  const devices = []; const cables = []; const catalog = [];
  const addC = (id) => { const c = maps.cables.get(id); if (c && !cables.some((x) => x.id === id)) { cables.push(bare(c)); (c.workIds || []).forEach(addW); } };
  const addW = (id) => { const w = maps.catalog.get(id); if (w && !catalog.some((x) => x.id === id)) catalog.push(bare(w)); };
  (type.devices || []).forEach((d) => {
    const dv = maps.devices.get(d.deviceId);
    if (dv && !devices.some((x) => x.id === dv.id)) { devices.push(bare(dv)); (dv.cables || []).forEach((c) => addC(c.cable)); (dv.workIds || []).forEach(addW); }
  });
  (type.cables || []).forEach((c) => addC(c.cable));
  if (type.defaultCable) addC(type.defaultCable);
  (type.workIds || []).forEach(addW);
  return { type: bare(type), devices, cables, catalog };
}

const toMaps = (lists) => Object.fromEntries(Object.entries(lists).map(([k, v]) => [k, new Map(v.map((x) => [x.id, x]))]));
export function standardBundles() {
  const maps = toMaps({ types: composedTypes(POINT_TYPES), devices: DEVICES, cables: CABLES, catalog: CATALOG });
  return [...maps.types.keys()].map((id) => ({ ...bundleFrom(maps, id), source: 'standard' }));
}

// Pool: standard + my pool (a type of the same name from my pool replaces the standard one)
export function typePool(userLib = []) {
  const m = new Map(standardBundles().map((b) => [b.type.id, b]));
  (userLib || []).forEach((b) => { if (b?.type?.id) m.set(b.type.id, { ...b, source: 'mine' }); });
  return m;
}

// My pool after saving a project's types (same-named ones are replaced)
export function libWith(userLib, bundles) {
  const m = new Map((userLib || []).map((b) => [b.type.id, b]));
  bundles.filter(Boolean).forEach((b) => { const { source, ...rest } = b; m.set(b.type.id, rest); });
  return [...m.values()].sort((a, b) => a.type.id.localeCompare(b.type.id, 'ru'));
}

// Operations: add a type from the pool to the project. What the project lacks (or has deleted) is added; what exists is left alone.
export function addBundleOps(ctx, bundle, ops = []) {
  const has = (coll, id) => ctx[coll].has(id) || ops.some((o) => o.coll === coll && o.id === id);
  // deleted: false brings back an item the project deleted (project writes merge, so without it the item stays deleted)
  const put = (coll, x) => { if (!has(coll, x.id)) ops.push({ coll, id: x.id, data: { ...bare(x), deleted: false } }); };
  (bundle.catalog || []).forEach((w) => put('catalog', w));
  (bundle.cables || []).forEach((c) => put('cables', c));
  (bundle.devices || []).forEach((d) => put('devices', d));
  put('types', bundle.type);
  return ops;
}
