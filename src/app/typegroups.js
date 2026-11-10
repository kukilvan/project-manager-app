// Shared groups of point types (e.g. «Дверь» holds every door type with its own devices and cables) for type filters.
// In a type filter the groups come first («▸ Все: Дверь»), then each type on its own; a group filter value is 'grp:<name>'.
// Reads the type catalogue from store.js (`state.ctx`).
import { state } from './store.js';

export const GRP = 'grp:';
export const groupOf = (typeId, ctx = state.ctx) => String(ctx?.types?.get(typeId)?.group || '').trim();
export const typeMatch = (f, typeId) => !f || (f.startsWith(GRP) ? groupOf(typeId) === f.slice(GRP.length) : typeId === f);
export const allGroups = (ctx = state.ctx) => [...new Set([...(ctx?.types?.values() || [])].map((t) => String(t.group || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));

/** Filter options for the types present in the list: [[value, text]] */
export function typeFilterOptions(typeIds) {
  const ids = [...new Set(typeIds)].sort((a, b) => String(a).localeCompare(String(b), 'ru'));
  const n = new Map(); ids.forEach((t) => { const g = groupOf(t); if (g) n.set(g, (n.get(g) || 0) + 1); });
  const groups = [...n.keys()].sort((a, b) => a.localeCompare(b, 'ru')).map((g) => [GRP + g, `▸ Все: ${g} (типов: ${n.get(g)})`]);
  return [...groups, ...ids.map((t) => [t, t])];
}
export const typeFilterValid = (f, typeIds) => !f || typeFilterOptions(typeIds).some(([v]) => v === f);
