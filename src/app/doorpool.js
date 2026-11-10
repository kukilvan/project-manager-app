// The shared pool of door configurations (pool_doorcfg): a new kind of door gets there by itself (any member writes it),
// only the pool administrator deletes. A project keeps copies of the configurations it uses or has pinned (the configs collection),
// so a configuration deleted from the pool keeps working on the project's doors.
// Builds on pool.js and the repo's `listenPool`/`savePool`; door logic comes from src/domain.
import { state, getRepo, currentProject } from './store.js';
import { toast } from './ui.js';
import { isPoolAdmin, pool } from './pool.js';
import { poolMaps, takeFromPoolOps, isDoorCfg, doorCfgName, standardDoorCfgs, doorPinsOf, makeDoorCfg } from '../domain/index.js';

export const doorPool = new Map();
const subs = new Set();
export const onDoorPool = (fn) => { subs.add(fn); return () => subs.delete(fn); };
let started = false;
export function startDoorPool() {
  if (started || !getRepo()) return; started = true;
  getRepo().listenPool('doorcfg', (docs) => {
    doorPool.clear(); docs.filter((x) => !x.deleted && isDoorCfg(x)).forEach((x) => doorPool.set(x.id, x));
    subs.forEach((f) => { try { f(); } catch { /* ok */ } });
  });
}

const bare = (c) => ({ name: c.name, devices: c.devices, cables: c.cables, kind: 'door' });
// the entry with an up-to-date name (from the short device names of the project)
const named = (c) => ({ ...c, name: doorCfgName(state.ctx, c.devices, c.cables) });

/** All known door configurations: standard, the project's, the pool's → Map id → cfg */
export function allDoorCfgs() {
  const m = new Map();
  standardDoorCfgs(state.ctx).forEach((c) => m.set(c.id, c));
  doorPool.forEach((c, id) => { if (!m.has(id)) m.set(id, named(c)); });
  state.ctx.configs.forEach((c, id) => { if (isDoorCfg(c)) m.set(id, { ...named(c), standard: m.get(id)?.standard }); });
  return m;
}
export const pinsOf = () => doorPinsOf(currentProject(), state.ctx);

/** A configuration came into use (chosen for a door or pinned): a copy goes into the project and into the shared pool if it is not there */
export function useDoorCfg(cfg) {
  const p = currentProject(); const repo = getRepo();
  const full = isDoorCfg(cfg) && cfg.id ? cfg : makeDoorCfg(state.ctx, cfg.devices, cfg.cables);
  // devices and cables of a configuration from another project: take the missing ones from the shared pool; if they are not there either — do not move it
  if (!state.ctx.configs.has(full.id)) {
    const ops = []; const missing = []; const maps = poolMaps(pool);
    (full.devices || []).forEach((d) => { if (!state.ctx.devices.has(d.deviceId)) { if (maps.devices.has(d.deviceId)) takeFromPoolOps(state.ctx, maps, 'devices', d.deviceId, ops); else missing.push(d.deviceId); } });
    (full.cables || []).forEach((c) => { if (!state.ctx.cables.has(c.cable)) { if (maps.cables.has(c.cable)) takeFromPoolOps(state.ctx, maps, 'cables', c.cable, ops); else missing.push(c.cable); } });
    if (missing.length) { toast(`Конфигурацию нельзя перенести: в проекте и в общем пуле нет «${missing.join('», «')}»`); return ''; }
    if (ops.length) repo.save(p.id, ops);
  }
  if (!state.ctx.configs.has(full.id)) repo.save(p.id, [{ coll: 'configs', id: full.id, data: { ...bare(full), deleted: false } }]);
  if (!doorPool.has(full.id)) { try { repo.savePool([{ coll: 'doorcfg', id: full.id, data: { ...bare(full), deleted: false } }]); } catch (e) { console.warn('doorcfg pool', e); } }
  return full.id;
}
/** id of the chosen configuration → make sure it is in the project (a standard or pool one is copied). Empty → '' */
export function ensureDoorCfg(id) {
  if (!id || id === '__clear') return '';
  if (state.ctx.configs.has(id)) return id;
  const c = allDoorCfgs().get(id); return c ? useDoorCfg(c) : id;
}
export function setPins(list) { getRepo().saveProject(currentProject().id, { doorPins: [...new Set(list)] }); }
export function pin(cfg) { const id = typeof cfg === 'string' ? cfg : useDoorCfg(cfg); if (!id) return; const list = pinsOf(); if (!list.includes(id)) setPins([...list, id]); }
export const unpin = (id) => setPins(pinsOf().filter((x) => x !== id));
export const canDeleteFromPool = () => isPoolAdmin();
export function deleteFromPool(id) { if (isPoolAdmin()) getRepo().savePool([{ coll: 'doorcfg', id, remove: true }]); }
/** Deleting a configuration: unpin, remove the project's copy (if no door uses it) and — for the administrator — remove it from the shared pool.
 *  Returns { ok, reason, pool } */
export function deleteDoorCfg(id) {
  const c = allDoorCfgs().get(id);
  if (!c) return { ok: false, reason: 'нет такой' };
  if (c.standard) return { ok: false, reason: 'стандартную удалить нельзя — её можно только открепить' };
  const n = usageOf(id); if (n) return { ok: false, reason: `она стоит на дверях проекта (${n}) — сначала смените им конфигурацию` };
  const p = currentProject(); const repo = getRepo();
  if (pinsOf().includes(id)) unpin(id);
  if (state.ctx.configs.has(id)) repo.remove(p.id, 'configs', id);
  const admin = canDeleteFromPool();
  if (admin && doorPool.has(id)) deleteFromPool(id);
  return { ok: true, pool: admin, stays: !admin && doorPool.has(id) };
}
/** How many points of the project have this configuration */
export const usageOf = (id) => [...state.ctx.points.values()].filter((p) => p.configId === id).length;
