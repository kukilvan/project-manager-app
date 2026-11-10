// Filter of points by door configuration for lists and the plan: «Без запирания», «Без конфигурации» and each configuration with its point count.
// Reads the catalogue from store.js and doorpool.js; door logic comes from src/domain.
import { state } from './store.js';
import { usesConfig, doorPartOf, doorCfgOf } from '../domain/index.js';
import { allDoorCfgs } from './doorpool.js';

const NOLOCK = '__nolock'; const NONE = '__none';
const isDoor = (p) => usesConfig(state.ctx.types.get(p.typeId));
const hasLock = (cfg) => (cfg?.devices || []).some((d) => doorPartOf(state.ctx.devices.get(d.deviceId)) === 'lock');

/** Whether the point fits the filter value f ('' — any) */
export function cfgMatch(f, p) {
  if (!f) return true;
  if (f === NONE) return isDoor(p) && !p.configId;
  if (f === NOLOCK) { const c = doorCfgOf(p, state.ctx); return !!c && !hasLock(c); }
  return p.configId === f;
}
/** Filter options for a list of points: [[value, text]] (empty — no configurations, no filter needed) */
export function cfgFilterOptions(points) {
  const all = allDoorCfgs(); const n = new Map(); let none = 0; let nolock = 0;
  points.forEach((p) => {
    if (p.configId) { n.set(p.configId, (n.get(p.configId) || 0) + 1); const c = doorCfgOf(p, state.ctx); if (c && !hasLock(c)) nolock++; }
    else if (isDoor(p)) none++;
  });
  if (!n.size && !none) return [];
  const list = [...n].map(([id, k]) => [id, `${all.get(id)?.name || state.ctx.configs.get(id)?.name || id} (${k})`]).sort((a, b) => a[1].localeCompare(b[1], 'ru'));
  return [...(nolock ? [[NOLOCK, `⚠ Без запирания (${nolock})`]] : []), ...(none ? [[NONE, `Без конфигурации (${none})`]] : []), ...list];
}
export const cfgFilterValid = (f, points) => !f || cfgFilterOptions(points).some(([v]) => v === f);
