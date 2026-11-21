// Own English names of catalog items (`nameEn`, stage 7): what a form writes and the name → English map the translation layer lays over the English screen.
// Pure; reached through src/domain/index.js. Used by the reference-list forms (settings.js), the problem form (problems.js) and ctxNames in shell.js.

/** The `nameEn` part of a saved item: the trimmed value when not empty; '' when the item had one before (it clears the old value); nothing for an item that never had one, so its pool fingerprint does not change */
export function nameEnPatch(value, existing) {
  const v = String(value ?? '').trim();
  if (v) return { nameEn: v };
  return existing?.nameEn ? { nameEn: '' } : {};
}

/** Names → own English names for the English screen: works, devices and problems by name; types and cables by id; only items with a non-empty `nameEn` */
export function ownNameMap(ctx) {
  const m = {};
  const add = (key, en) => { const k = String(key ?? '').trim(); const v = String(en ?? '').trim(); if (k && v) m[k] = v; };
  const live = (list) => [...(list instanceof Map ? list.values() : list || [])].filter((x) => x && !x.deleted);
  live(ctx?.catalog).forEach((x) => add(x.name, x.nameEn));
  live(ctx?.devices).forEach((x) => add(x.name, x.nameEn));
  live(ctx?.problems).forEach((x) => add(x.name, x.nameEn));
  live(ctx?.types).forEach((x) => add(x.id, x.nameEn));
  live(ctx?.cables).forEach((x) => add(x.id, x.nameEn));
  return m;
}
