// Points: natural sorting, cables and metrage (sections 3.4, 3.8, Appendix A).
// Basic helpers that most domain modules build on (status, composition, reports, import) and the points views call; pure.

const pad = (s, n) => String(s).padStart(n, '0');
const blank = (v) => v === undefined || v === null || v === '';
export const round2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;

// «Sort»: the last number of the label (EXTRACTNUMBERS + ABS), 0 if there are no numbers.
export function sortNumber(label) {
  const nums = String(label ?? '').match(/\d+(?:\.\d+)?/g);
  return nums ? Number(nums[nums.length - 1]) : 0;
}

// «Point key» = <before the first "-"> | <letters before the number> | <integer part of the number, 5 digits> | <fractional part, 3 digits>
// For «1A-01-02»: the point code is «01-02», the number is taken as the leading number of the code.
// ASSUMPTION: the description does not say how to take the number from a code like «01-02»; the leading number (1) is taken.
export function pointKey(label) {
  const s = String(label ?? '');
  const dash = s.indexOf('-');
  const prefix = dash >= 0 ? s.slice(0, dash) : '';
  const code = dash >= 0 ? s.slice(dash + 1) : s;
  const lead = /^\D*/.exec(code)[0]; // leading non-digit characters
  const rest = code.slice(lead.length);
  const m = /^(\d+)(?:\.(\d+))?/.exec(rest);
  const whole = m ? m[1] : '0';
  const frac = m && m[2] ? m[2] : '0';
  return `${prefix}|${lead}|${pad(whole, 5)}|${pad(frac.slice(0, 3), 3)}`;
}

// Natural comparison of labels: numbers inside are compared as numbers anywhere (D2/2 < D2/10, GA1/C-9 < GA1/C-10, 07.In-3 < 07.In-12)
// Separators («-», «/», «_», «.», space) and leading zeros do not matter: «1A/01-02» < «1A-09-10», «AP-3» = «AP03» in order.
const natCollator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });
const labelTokens = (x) => (String(x ?? '').match(/\d+|[^\d\s\-/_.\\|,:;]+/g) || []).map((t) => (/^\d+$/.test(t) ? Number(t) : t));
export function compareLabels(x, y) {
  const a = labelTokens(x); const b = labelTokens(y);
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const p = a[i]; const q = b[i];
    if (typeof p === 'number' && typeof q === 'number') { if (p !== q) return p - q; continue; }
    if (typeof p === 'number') return -1;
    if (typeof q === 'number') return 1;
    const c = natCollator.compare(p, q); if (c) return c;
  }
  if (a.length !== b.length) return a.length - b.length;
  return natCollator.compare(String(x ?? ''), String(y ?? '')) || (String(x ?? '') < String(y ?? '') ? -1 : String(x ?? '') > String(y ?? '') ? 1 : 0);
}

// Comparison of points: rack → type → label (natural, by numbers).
export function comparePoints(a, b) {
  return compareLabels(a.cabinet ?? '', b.cabinet ?? '') || compareLabels(a.typeId ?? '', b.typeId ?? '') || compareLabels(a.label, b.label);
}

// Cables of a point. The main cable and its count: the rack setting (project + rack + type), otherwise the point type's values.
// Extra cables of other kinds (extraCables: [{ cable, count }]) — e.g. an intercom: 6005×1 + cat7×1.
const settingOf = (point, ctx, pred) => ctx.cabinetSettings.find((x) => x.projectId === point.projectId && x.cabinet === point.cabinet
  && x.typeId === point.typeId && pred(x));
const cleanList = (list) => (Array.isArray(list) ? list : [])
  .filter((c) => c && !blank(c.cable) && Number(c.count) > 0).map((c) => ({ cable: String(c.cable), count: Number(c.count) }));
const own = (point) => (Array.isArray(point?.cableOverride) ? cleanList(point.cableOverride) : null);  // the point's own cables as a whole
export function cableOf(point, ctx) {
  const o = own(point); if (o) return o[0]?.cable;
  const s = settingOf(point, ctx, (x) => !blank(x.cable));
  return s ? s.cable : ctx.types.get(point.typeId)?.defaultCable;
}
// Count of cables of the main kind
export function mainCablesCountOf(point, ctx) {
  const o = own(point); if (o) return o[0]?.count ?? 0;
  const s = settingOf(point, ctx, (x) => !blank(x.cables));
  return Number(s ? s.cables : ctx.types.get(point.typeId)?.defaultCables ?? 0);
}
export function extraCablesOf(point, ctx) {
  const o = own(point); if (o) return o.slice(1);
  const s = settingOf(point, ctx, (x) => Array.isArray(x.extraCables));
  return cleanList(s ? s.extraCables : ctx.types.get(point.typeId)?.extraCables);
}
// All cables of a point by kind: [{ cable, count }], the first is the main one; equal kinds are added up
export function cableListOf(point, ctx) {
  const out = [];
  const add = (cable, count) => {
    if (blank(cable) || !(count > 0)) return;
    const x = out.find((c) => c.cable === cable);
    if (x) x.count += count; else out.push({ cable, count });
  };
  add(cableOf(point, ctx), mainCablesCountOf(point, ctx));
  extraCablesOf(point, ctx).forEach((c) => add(c.cable, c.count));
  return out;
}
// Total cables of the point (all kinds)
export const cablesCountOf = (point, ctx) => cableListOf(point, ctx).reduce((n, c) => n + c.count, 0) || mainCablesCountOf(point, ctx);
// How many cables of kind cableId the point has; kind not given or not found — the main one (as before)
export function cableCountFor(point, ctx, cableId) {
  const list = cableListOf(point, ctx);
  const x = !blank(cableId) && list.find((c) => c.cable === cableId);
  return x ? x.count : (list[0]?.count ?? mainCablesCountOf(point, ctx));
}
// «cat7×1, 6005×2» ⇄ [{ cable, count }]
export const cablesText = (list, sep = ' + ') => (list || []).map((c) => `${c.cable}×${c.count}`).join(sep);
export function parseCables(text) {
  const out = []; const bad = [];
  String(text ?? '').split(/[,;+\n]/).map((x) => x.trim()).filter(Boolean).forEach((part) => {
    const m = /^(.+?)\s*[×xхX*]\s*(\d+(?:[.,]\d+)?)$/.exec(part);
    if (m) out.push({ cable: m[1].trim(), count: Number(m[2].replace(',', '.')) }); else bad.push(part);
  });
  return { list: out, bad };
}
// Metrage = length per 1 cable × number of cables (all kinds); no length — 0
export const metrageOf = (point, ctx) => round2((Number(point.length) || 0) * cablesCountOf(point, ctx));

// Label of the next point: the last (by number) point of this type in this rack + 1 in the same format.
// Pairs «17-18» → «19-20»; leading zeros are kept (C-083 → C-084); no such points — ''.
export function nextLabel(points, typeId, cabinet = '') {
  const same = [...points].filter((p) => p.typeId === typeId && (p.cabinet || '') === (cabinet || '') && !/#\d+$/.test(p.label)).sort((a, b) => compareLabels(a.label, b.label));
  const last = same[same.length - 1]?.label; if (!last) return '';
  const used = new Set([...points].map((p) => p.label));
  const pad = (n, w) => String(n).padStart(w, '0');
  const bump = (l) => {
    const pair = l.match(/^(.*?)(\d+)([-_/])(\d+)$/);
    if (pair && +pair[4] === +pair[2] + 1) { const st = +pair[4] - +pair[2] + 1; return `${pair[1]}${pad(+pair[2] + st, pair[2].length)}${pair[3]}${pad(+pair[4] + st, pair[4].length)}`; }
    const m = l.match(/^(.*?)(\d+)(\D*)$/); if (!m) return '';
    return `${m[1]}${pad(+m[2] + 1, m[2].length)}${m[3]}`;
  };
  let next = bump(last); let guard = 0;
  while (next && used.has(next) && guard++ < 500) next = bump(next);
  return next;
}

// Caption for several points on one plan mark: in sequence (TV13, TV14 … TV19) — «TV13-19»; scattered — each separately, in order
export function combineLabels(labels) {
  const ls = [...new Set(labels)].sort((a, b) => compareLabels(a, b));
  if (ls.length < 2) return ls;
  const ps = ls.map((l) => l.match(/^(.*?)(\d+)$/));
  if (ps.every(Boolean) && ps.every((m) => m[1] === ps[0][1])) {
    const nums = ps.map((m) => +m[2]);
    if (nums.every((n, i) => i === 0 || n === nums[i - 1] + 1)) return [`${ls[0]}-${ps[ps.length - 1][2]}`];
  }
  return ls;
}

// Replaces/removes text (at the start, at the end or anywhere): the first step of the group rename (renameLabel).
function replaced(label, { find = '', replace = '', where = 'any' } = {}) {
  let s = String(label);
  if (find) {
    if (where === 'start') { if (s.startsWith(find)) s = replace + s.slice(find.length); }
    else if (where === 'end') { if (s.endsWith(find)) s = s.slice(0, s.length - find.length) + replace; }
    else s = s.split(find).join(replace);
  }
  return s;
}
// Number shift: a pair «17-18» moves as a whole; returns { text, nums } — the new string and the new number value(s)
function shifted(s, n) {
  const pad = (v, w) => (v < 0 ? String(v) : String(v).padStart(w, '0'));
  const pair = s.match(/^(.*?)(\d+)([-_/])(\d+)(\D*)$/);
  if (pair && +pair[4] === +pair[2] + 1) {
    const a = +pair[2] + n; const b = +pair[4] + n;
    return { text: `${pair[1]}${pad(a, pair[2].length)}${pair[3]}${pad(b, pair[4].length)}${pair[5]}`, nums: [a, b] };
  }
  const m = s.match(/^(.*?)(\d+)(\D*)$/);
  if (m) { const a = +m[2] + n; return { text: `${m[1]}${pad(a, m[2].length)}${m[3]}`, nums: [a] }; }
  return { text: s, nums: [] };
}
// Group rename: replace/remove text (at the start, at the end or anywhere), shift the number, add to the start/end.
// The number is the last number; a pair «17-18» shifts as a whole. Leading zeros are kept.
export function renameLabel(label, op = {}) {
  const { shift = 0, prefix = '', suffix = '' } = op;
  let s = replaced(label, op);
  const n = Math.trunc(Number(shift) || 0);
  if (n) s = shifted(s, n).text;
  return `${prefix}${s}${suffix}`;
}
// Shift problem: 'negative' — the number would become negative (not allowed), 'zero' — it becomes zero (warn), '' — all fine
export function renameIssue(label, op = {}) {
  const n = Math.trunc(Number(op.shift) || 0); if (!n) return '';
  const { nums } = shifted(replaced(label, op), n);
  return nums.some((v) => v < 0) ? 'negative' : nums.some((v) => v === 0) ? 'zero' : '';
}

// A label is «taken» only within one rack: equal labels in different racks are allowed, and so when only one of the points has a rack.
// Two points without a rack count as one place (otherwise loading a file again would duplicate the points).
export const sameLabelClash = (a, b) => !!a && !!b && a.label === b.label && (a.cabinet || '') === (b.cabinet || '');
export const labelKey = (label, cabinet) => `${cabinet || ''}\u0000${label}`;
