// Batch point generator (section 2.4): prefix + number (+ «-» and the next number for a pair) (+ suffix).
// Pure; reached through src/domain/index.js.
const pad = (n, digits) => String(n).padStart(Math.max(0, Number(digits) || 0), '0');

export const parseSuffixes = (text) => [...new Set(String(text ?? '').split(',').map((s) => s.trim()).filter(Boolean))];  // duplicates are removed

export const MAX_GENERATED = 2000;

export function generateLabels({ prefix = '', from, to, step = 1, digits = 0, suffixes = [], pair = false }) {
  const a = Number(from); const b = Number(to); let st = Number(step) || 1;
  if (pair && st < 2) st = 2;  // a pair «01-02» takes two numbers: the next one starts at 03, not 02
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a || st < 1) return [];
  const out = [];
  for (let n = a; n <= b && out.length < MAX_GENERATED; n += st) {
    const base = `${prefix}${pad(n, digits)}${pair ? `-${pad(n + 1, digits)}` : ''}`;
    if (suffixes.length) suffixes.forEach((s) => out.push(`${base}${s}`)); else out.push(base);
  }
  return [...new Set(out)].slice(0, MAX_GENERATED);
}

// How many points there would be without the limit (to warn about the cut to MAX_GENERATED)
export function generatedTotal({ from, to, step = 1, suffixes = [], pair = false }) {
  const a = Number(from); const b = Number(to); let st = Number(step) || 1;
  if (pair && st < 2) st = 2;
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a || st < 1) return 0;
  return (Math.floor((b - a) / st) + 1) * (suffixes.length || 1);
}
