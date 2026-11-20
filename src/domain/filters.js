// Pure rules of the several-value point filter: ticking, group lines, special lines, «all ticked = off», button text (spec 7 § 1.6).
// No DOM: the button and window live in src/app/views/multifilter.js; tested by tests/filters.test.js.
//
// Option shape: { value, text, label?, count?, kind: 'plain' | 'group' | 'any' | 'mode' | 'head', members?: [values] }.
// - 'group': a shortcut line that ticks or unticks its member values (D7); it is never stored in a set.
// - 'any': «⚠ С проблемами»; `members` are the single values it excludes (ticking one unticks the other side).
// - 'mode': a plan mode («❔ Не размеченые», «🙈 Скрытые»); excludes every plain value and the other modes.
// - 'head': a section heading, not tickable.
// `label` is the name shown in the button when it differs from `text` (text without its count).

const kindOf = (o) => o.kind || 'plain';

/** Values of the plain lines, in window order. */
export function plainValues(options) {
  return options.filter((o) => kindOf(o) === 'plain').map((o) => o.value);
}

/** Members of a group line that are present among the plain lines. */
function presentMembers(option, options) {
  const plain = new Set(plainValues(options));
  return (option.members || []).filter((v) => plain.has(v));
}

/** Whether a group line shows ticked: every present member ticked (no third state). */
export function groupState(set, option, options) {
  const members = options ? presentMembers(option, options) : option.members || [];
  return members.length > 0 && members.every((v) => set.has(v));
}

/** New set after a tap on `option`, applying the special-line rules of spec 7 § 1.3. */
export function toggleValue(set, option, options) {
  const next = new Set(set);
  const kind = kindOf(option);
  if (kind === 'head') return next;
  const modes = options.filter((o) => kindOf(o) === 'mode').map((o) => o.value);
  const anys = options.filter((o) => kindOf(o) === 'any');
  const dropModes = () => modes.forEach((v) => next.delete(v));
  const dropAnysOf = (v) => anys.forEach((a) => { if ((a.members || []).includes(v)) next.delete(a.value); });

  if (kind === 'group') {
    const members = presentMembers(option, options);
    if (groupState(set, option, options)) members.forEach((v) => next.delete(v));
    else { members.forEach((v) => { next.add(v); dropAnysOf(v); }); dropModes(); }
    return next;
  }
  if (next.has(option.value)) { next.delete(option.value); return next; }
  next.add(option.value);
  if (kind === 'any') (option.members || []).forEach((v) => next.delete(v));
  else if (kind === 'mode') {
    plainValues(options).forEach((v) => next.delete(v));
    modes.forEach((v) => { if (v !== option.value) next.delete(v); });
  } else { dropModes(); dropAnysOf(option.value); }
  return next;
}

/** «Отметить все»: every plain line (not the special lines; group lines follow their members). */
export function tickAll(options) {
  return new Set(plainValues(options));
}

/** «Снять все». */
export function clearAll() {
  return new Set();
}

/** Off: nothing ticked, or (covering filters: racks, types, D1) exactly every plain value ticked. */
export function isOff(set, options, { covering = false } = {}) {
  if (!set || set.size === 0) return true;
  if (!covering) return false;
  const plain = plainValues(options);
  if (!plain.length) return false;
  const plainSet = new Set(plain);
  return plain.every((v) => set.has(v)) && [...set].every((v) => plainSet.has(v));
}

/** The set to store on closing the window: empty when off by covering, else a copy. */
export function normalize(set, options, { covering = false } = {}) {
  return isOff(set, options, { covering }) ? new Set() : new Set(set);
}

/** The set without values that are no longer among the options (spec 7 § 1.5). */
export function prune(set, options) {
  const known = new Set(options.filter((o) => !['head', 'group'].includes(kindOf(o))).map((o) => o.value));
  return new Set([...set].filter((v) => known.has(v)));
}

/** Button text without the arrow (spec 7 § 1.1); `missing` are names of ticked shared values not in `options` (D2), named last. */
export function buttonText({ set, options, allText, prefix, missing = [], covering = false }) {
  if (!set || (set.size === 0 && !missing.length)) return allText;
  const mode = options.find((o) => kindOf(o) === 'mode' && set.has(o.value));
  if (mode) return mode.label || mode.text;
  if (!missing.length && isOff(set, options, { covering })) return allText;
  const names = options
    .filter((o) => !['head', 'group', 'mode'].includes(kindOf(o)) && set.has(o.value))
    .map((o) => o.label || o.text)
    .concat(missing);
  if (!names.length) return allText;
  if (names.length <= 2) return `${prefix}: ${names.join(', ')}`;
  return `${prefix}: ${names.length}`;
}

/** Matching: an empty set passes everything; otherwise some ticked value passes `test` (values of one filter add up). */
export function anyOf(set, test) {
  if (!set || set.size === 0) return true;
  for (const v of set) if (test(v)) return true;
  return false;
}

/** Rack matching: «Без шкафа» is `__none`. */
export function rackMatch(set, point) {
  return anyOf(set, (v) => v === (point.cabinet || '__none'));
}

/** Type matching by type id. */
export function typeSetMatch(set, point) {
  return anyOf(set, (v) => v === point.typeId);
}

/** Problems matching: `__any` — any open problem; ids — an open mark of any of them. `openIds` are the point's open problem ids. */
export function problemMatch(set, openIds) {
  return anyOf(set, (v) => (v === '__any' ? openIds.length > 0 : openIds.includes(v)));
}

/** Works matching («Что осталось»): the point still waits for any ticked work key; `left` is `leftTasks(point)`. Empty set passes all. */
export function worksMatch(set, left) {
  return anyOf(set, (key) => left.some((t) => t.key === key));
}

/** The one work key the record button of «Что осталось» can use: exactly one `w:` / `p:` key ticked (`s:` keys of old points cannot be recorded), else null.
 *  Ticket 7.6 replaces this by the several-works table of spec 7 § 4.1. */
export function singleWorkKey(set) {
  const rec = [...(set || [])].filter((k) => /^[wp]:/.test(k));
  return rec.length === 1 ? rec[0] : null;
}

/** Rack options of a list of points: «Шкаф X» by name (label X), then «Без шкафа» (`__none`); counts are points of the list. */
export function rackOptions(points) {
  const n = new Map(); points.forEach((p) => { const k = p.cabinet || '__none'; n.set(k, (n.get(k) || 0) + 1); });
  return [...n.keys()].filter((c) => c !== '__none').sort((a, b) => String(a).localeCompare(String(b), 'ru', { numeric: true }))
    .map((c) => ({ value: c, text: `Шкаф ${c}`, label: c, count: n.get(c) }))
    .concat(n.has('__none') ? [{ value: '__none', text: 'Без шкафа', count: n.get('__none') }] : []);
}

/** Ticked values that are not among the options (spec 7 D2: a shared value absent on this drawing), in the set's order. */
export function missingValues(set, options) {
  const known = new Set(options.filter((o) => !['head', 'group'].includes(kindOf(o))).map((o) => o.value));
  return [...(set || [])].filter((v) => !known.has(v));
}
