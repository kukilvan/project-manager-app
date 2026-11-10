// Cyrillic ↔ Latin in point names: look-alike letters, layout-independent search and quick-input shortcuts.
// Look-alikes: «С108» typed in Cyrillic becomes C108 in Latin. Quick input («тв » → «TV ») works like T9.
// Used by src/app/ui.js; pure.
const LOOK = { 'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'У': 'Y', 'Х': 'X',
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x' };
const CYR = /[Ѐ-ӿ]/;

/** A name with look-alike letters → Latin. If the name holds a genuine Russian letter without a look-alike («Щит», «Б12»), it is left alone */
export function fixLatin(s) {
  if (typeof s !== 'string' || !CYR.test(s)) return s;
  for (const ch of s) if (CYR.test(ch) && !(ch in LOOK)) return s;
  return [...s].map((ch) => LOOK[ch] || ch).join('');
}
/** Search key: case-insensitive, look-alikes folded to Latin (in any word) */
export const latinKey = (s) => [...String(s ?? '').toLowerCase()].map((ch) => LOOK[ch] || LOOK[ch.toUpperCase()]?.toLowerCase() || ch).join('');
/** Whether the name has Cyrillic that can be fixed */
export const needsFix = (s) => typeof s === 'string' && fixLatin(s) !== s;

/** Rack: if one already exists (up to the keyboard layout), take the existing spelling, otherwise fix it */
export function fixCabinet(c, existing) {
  if (typeof c !== 'string' || !c) return c;
  if (existing.has(c)) return c;
  const k = latinKey(c); for (const e of existing) if (latinKey(e) === k) return e;
  return fixLatin(c);
}

// quick input
export const DEFAULT_SHORTCUTS = [['тв', 'TV'], ['кам', 'CAM'], ['ап', 'AP'], ['инт', 'INT'], ['ср', 'CR'], ['дв', 'DR'], ['г', 'G'], ['д', 'D']];
export const shortcutsToText = (list) => list.map(([k, v]) => `${k} = ${v}`).join('\n');
export function shortcutsFromText(text) {
  return String(text || '').split('\n').map((l) => l.split('=')).filter((p) => p.length >= 2)
    .map((p) => [p[0].trim().toLowerCase(), p.slice(1).join('=').trim()]).filter(([k, v]) => k && v);
}
const LETTER = /[A-Za-zЀ-ӿ]/;
/**
 * The character ch was just typed at position caret-1. If a whole word of letters before it matches a key, replace it with the value.
 * → { text, caret, from, to } or null
 */
export function expandShortcut(text, caret, dict) {
  if (caret < 2) return null;
  const ch = text[caret - 1]; if (LETTER.test(ch)) return null;
  let i = caret - 1; while (i > 0 && LETTER.test(text[i - 1])) i--;
  const word = text.slice(i, caret - 1); if (!word) return null;
  const hit = dict.find(([k]) => k === word.toLowerCase()); if (!hit) return null;
  const out = text.slice(0, i) + hit[1] + text.slice(caret - 1);
  return { text: out, caret: i + hit[1].length + 1, from: i, to: i + hit[1].length };
}
