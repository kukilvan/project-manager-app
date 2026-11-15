// Caption pattern builder from examples: a caption is cut into parts (letters / digits / signs) and a person says what each part means.
// Example: C2/04 → «C» constant (a camera) · «2» does not matter (the floor) · «/» in place · «04» the number (2 digits).
// Pure functions with no imports; engine.js uses segment, and src/app/views/catalogview.js drives the builder.

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
const kindOf = (t) => (/^[A-Za-z]/.test(t) ? 'L' : /^[֐-׿]/.test(t) ? 'H' : /^\d/.test(t) ? 'D' : /^\s/.test(t) ? 'S' : 'P');
export const tokenize = (s) => String(s || '').trim().match(/[A-Za-z]+|[֐-׿]+|\d+|\s+|./g) || [];

// Roles of the parts: what can be chosen for letters and for digits
export const ROLES = {
  L: [['const', 'постоянно (как в примерах)'], ['any', 'любые буквы'], ['cab', 'шкаф']],
  H: [['const', 'постоянно (как в примерах)'], ['any', 'любые буквы иврита']],
  D: [['num', 'номер (столько цифр, как в примерах)'], ['numAny', 'номер (любой длины)'], ['any', 'не важно (любое число)'], ['const', 'постоянно (как в примерах)'], ['cab', 'шкаф']],
};

/** examples → parts. All examples must be of one kind (the same order of letters/digits/signs). */
export function segment(samples) {
  const list = [...new Set((samples || []).map((s) => String(s).trim()).filter(Boolean))];
  if (!list.length) return { ok: false, error: 'Введите примеры подписей' };
  const toks = list.map(tokenize);
  const key = (x) => { const k = kindOf(x); return k === 'P' ? `P${x}` : k; };
  // the base is the longest example; parts may be missing in the others (then the part is optional: GA1/… and GB/…)
  const bi = toks.reduce((m, t, i) => (t.length > toks[m].length ? i : m), 0); const base = toks[bi].map(key);
  const align = (t) => {  // match in order (LCS); every part of an example must find a place in the base
    const k = t.map(key); const n = base.length; const m = k.length;
    const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = base[i] === k[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    if (L[0][0] !== m) return null;
    const out = new Array(n).fill(null); let i = 0; let j = 0;
    while (i < n && j < m) { if (base[i] === k[j]) { out[i++] = t[j++]; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else return null; }
    if (j !== m || out.some((v, x) => v == null && base[x][0] === 'P')) return null;  // signs (/, -, .) must be in all examples
    return out;
  };
  const rows = []; const bad = [];
  toks.forEach((t, i) => { const r = align(t); if (r) rows.push(r); else bad.push(list[i]); });
  if (bad.length) return { ok: false, error: `Примеры разного вида: ${bad.slice(0, 3).join(', ')} не похожи на ${list[bi]}. Разбейте на отдельные правила.`, samples: list };
  const segs = toks[bi].map((t, i) => {
    const vals = rows.map((r) => r[i]).filter((v) => v != null); const kind = kindOf(t);
    return { kind, values: [...new Set(vals)], minLen: Math.min(...vals.map((v) => v.length)), maxLen: Math.max(...vals.map((v) => v.length)), optional: vals.length < rows.length };
  });
  return { ok: true, segs, samples: list };
}

/** default roles: the same in all examples is constant; the last varying number is the number; the other varying parts are «не важно» / any */
export function defaultRoles(segs) {
  const lastNum = segs.map((s, i) => (s.kind === 'D' && s.values.length > 1 ? i : -1)).filter((i) => i >= 0).pop();
  return segs.map((s, i) => {
    if (s.kind === 'P' || s.kind === 'S') return 'const';
    if (s.values.length === 1) return 'const';
    if (s.kind === 'D') return i === lastNum ? 'num' : 'any';
    return 'any';
  });
}

/** parts + roles → { re, cab } (cab is the same pattern with parentheses around the rack; '' means the caption has no rack) */
export function buildPattern(segs, roles) {
  const piece = (s, r) => {
    if (s.kind === 'S') return '\\s*';
    if (s.kind === 'P') return esc(s.values[0]);
    if (r === 'const') return s.values.length === 1 ? esc(s.values[0]) : `(?:${s.values.map(esc).join('|')})`;
    if (s.kind === 'D') return r === 'num' ? (s.minLen === s.maxLen ? `\\d{${s.minLen}}` : `\\d{${s.minLen},${s.maxLen}}`) : '\\d+';
    return s.kind === 'H' ? '[֐-׿]+' : '[A-Za-z]+';
  };
  const ps = segs.map((s, i) => (s.optional ? `(?:${piece(s, roles[i])})?` : piece(s, roles[i])));
  const re = `^${ps.join('')}$`;
  const cabIdx = roles.map((r, i) => (r === 'cab' ? i : -1)).filter((i) => i >= 0);
  let cab = '';
  if (cabIdx.length) {
    const a = cabIdx[0]; const b = cabIdx[cabIdx.length - 1];  // the rack runs from the first to the last marked part (with the signs between them)
    cab = `^${ps.slice(0, a).join('')}(${ps.slice(a, b + 1).join('')})${ps.slice(b + 1).join('')}$`;
  }
  return { re, cab };
}

/** a short human description: «C · (не важно) · / · №(2)» */
export function describeParts(segs, roles) {
  return segs.map((s, i) => {
    const r = roles[i];
    const q = s.optional ? '?' : '';
    if (s.kind === 'S') return '␣';
    if (s.kind === 'P' || r === 'const') return s.values.join('|') + q;
    if (r === 'num') return s.minLen === s.maxLen ? `№(${s.minLen} цифр${s.minLen === 1 ? 'а' : s.minLen < 5 ? 'ы' : ''})` : `№(${s.minLen}–${s.maxLen} цифр)`;
    if (r === 'numAny') return `№${q}`;
    if (r === 'cab') return `шкаф${q}`;
    return `(любое)${q}`;
  }).join(' ');
}
