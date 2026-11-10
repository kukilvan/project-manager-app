// Serial number and MAC address of a device: parses scanned barcodes and QR codes, normalises the values and finds duplicates.
// Pure; reached through src/domain/index.js and covered by tests/domain.test.js.

// Point types that carry a serial number / MAC (cameras and Wi-Fi by default; can be switched on in the type reference list)
export const hasDeviceId = (type) => (type ? (type.scanId ?? ['Камера', 'Вайфай'].includes(type.id)) : false);

const MAC_RE = /(?<![0-9A-Fa-f])[0-9A-Fa-f]{2}(?:[:\-.]?[0-9A-Fa-f]{2}){5}(?![0-9A-Fa-f])/g;

// MAC as AA:BB:CC:DD:EE:FF; not a MAC — an empty string
export function normalizeMac(text) {
  const hex = String(text ?? '').replace(/[^0-9A-Fa-f]/g, '');
  if (hex.length !== 12 || /[^0-9A-Fa-f]/.test(String(text).replace(/[:\-.\s]/g, ''))) return '';
  return hex.toUpperCase().match(/../g).join(':');
}

// All MACs inside a string (including 12 hexadecimal characters in a row)
export function macsIn(text) {
  const out = [];
  String(text ?? '').replace(MAC_RE, (m) => { const n = normalizeMac(m); if (n && !out.includes(n)) out.push(n); return m; });
  return out;
}

const SN_LABEL = /(?:\bS\/?N\b|\bSerial(?:\s*(?:No\.?|Number|#))?)\s*[:=#]?\s*([A-Za-z0-9][A-Za-z0-9\-_.]{3,})/gi;
const URL_PARAM = /[?&](?:sn|serial|serialno|serialnumber)=([^&#\s]+)/gi;

// Serial numbers named in the text («SN: …», «S/N …», «?sn=…»)
export function labeledSerials(text) {
  const out = [];
  const add = (v) => { const t = String(v).trim(); if (t && !out.includes(t)) out.push(t); };
  String(text ?? '').replace(SN_LABEL, (_, v) => { add(v); return _; });
  String(text ?? '').replace(URL_PARAM, (_, v) => { try { add(decodeURIComponent(v)); } catch { add(v); } return _; });
  return out;
}

// Candidate values for a field: kind = 'mac' | 'serial'. Returns [{value, note, sure}]; sure marks a confident candidate
export function candidatesFor(kind, texts) {
  const raws = [...new Set((texts || []).map((t) => String(t).trim()).filter(Boolean))];
  const out = []; const seen = new Set();
  const add = (value, note, sure) => { if (!value || seen.has(value)) return; seen.add(value); out.push({ value, note, sure }); };
  if (kind === 'mac') {
    raws.forEach((r) => macsIn(r).forEach((m) => add(m, 'MAC', true)));
    raws.forEach((r) => add(r, 'как считано', false));
    return out;
  }
  raws.forEach((r) => labeledSerials(r).forEach((s) => add(s, 'серийный номер', true)));
  const macLike = (r) => !!normalizeMac(r);
  raws.filter((r) => !macLike(r)).forEach((r) => add(r, 'как считано', false));
  raws.filter(macLike).forEach((r) => add(r, 'похоже на MAC', false));
  return out;
}

// Another point with the same serial number / MAC (ignoring case and separators)
export function findDuplicate(points, point, kind, value) {
  const key = (v) => (kind === 'mac' ? normalizeMac(v) || String(v).trim().toUpperCase() : String(v).trim().toUpperCase());
  const k = key(value); if (!k) return null;
  const field = kind === 'mac' ? 'mac' : 'serial';
  return [...points].find((p) => p.id !== point?.id && !p.deleted && p[field] && key(p[field]) === k) || null;
}
