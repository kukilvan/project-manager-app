// Filter of points by door configuration for lists and the plan: «Без запирания», «Без конфигурации» and each configuration with its point count.
// Reads the catalog from store.js and doorpool.js; door logic comes from src/domain. cfgOptions/cfgSetMatch serve the several-value filter (spec 7 § 1.4).
import { state } from './store.js';
import { usesConfig, doorPartOf, doorCfgOf } from '../domain/index.js';
import { anyOf } from '../domain/filters.js';
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
/** Several-value matching: an empty set passes all, otherwise any ticked value matches by cfgMatch */
export const cfgSetMatch = (set, p) => anyOf(set, (v) => cfgMatch(v, p));
/** Options of the several-value filter: [{ value, text, count }] (empty — no configurations, no filter needed) */
export function cfgOptions(points) {
  const all = allDoorCfgs(); const n = new Map(); let none = 0; let nolock = 0;
  points.forEach((p) => {
    if (p.configId) { n.set(p.configId, (n.get(p.configId) || 0) + 1); const c = doorCfgOf(p, state.ctx); if (c && !hasLock(c)) nolock++; }
    else if (isDoor(p)) none++;
  });
  if (!n.size && !none) return [];
  const list = [...n].map(([id, k]) => ({ value: id, text: all.get(id)?.name || state.ctx.configs.get(id)?.name || id, count: k })).sort((a, b) => a.text.localeCompare(b.text, 'ru'));
  return [...(nolock ? [{ value: NOLOCK, text: '⚠ Без запирания', count: nolock }] : []), ...(none ? [{ value: NONE, text: 'Без конфигурации', count: none }] : []), ...list];
}
