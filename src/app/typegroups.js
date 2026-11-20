// Shared groups of point types (e.g. «Дверь» holds every door type with its own devices and cables) for type filters.
// In a type filter the groups come first («▸ Все: Дверь»), then each type on its own; a group filter value is 'grp:<name>'.
// Reads the type catalog from store.js (`state.ctx`). typeOptions() builds the options of the several-value filter, where a group line only ticks its members (spec 7 D7).
import { state } from './store.js';

export const GRP = 'grp:';
export const groupOf = (typeId, ctx = state.ctx) => String(ctx?.types?.get(typeId)?.group || '').trim();
export const allGroups = (ctx = state.ctx) => [...new Set([...(ctx?.types?.values() || [])].map((t) => String(t.group || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));

/** Filter options for the types present in the list: [[value, text]] */
export function typeFilterOptions(typeIds) {
  const ids = [...new Set(typeIds)].sort((a, b) => String(a).localeCompare(String(b), 'ru'));
  const n = new Map(); ids.forEach((t) => { const g = groupOf(t); if (g) n.set(g, (n.get(g) || 0) + 1); });
  const groups = [...n.keys()].sort((a, b) => a.localeCompare(b, 'ru')).map((g) => [GRP + g, `▸ Все: ${g} (типов: ${n.get(g)})`]);
  return [...groups, ...ids.map((t) => [t, t])];
}

/** Options of the several-value type filter: group lines (kind 'group' with members), then each type; `countOf(typeId)` gives the point count */
export function typeOptions(typeIds, countOf = () => undefined, ctx = state.ctx) {
  const ids = [...new Set(typeIds)].sort((a, b) => String(a).localeCompare(String(b), 'ru'));
  const members = new Map(); ids.forEach((t) => { const g = groupOf(t, ctx); if (g) members.set(g, [...(members.get(g) || []), t]); });
  const sum = (list) => { const c = list.map((t) => countOf(t)); return c.every((x) => typeof x === 'number') ? c.reduce((a, b) => a + b, 0) : undefined; };
  const groups = [...members.keys()].sort((a, b) => a.localeCompare(b, 'ru'))
    .map((g) => ({ value: GRP + g, text: `▸ Все: ${g} (типов: ${members.get(g).length})`, kind: 'group', members: members.get(g), count: sum(members.get(g)) }));
  return [...groups, ...ids.map((t) => ({ value: t, text: t, count: countOf(t) }))];
}
