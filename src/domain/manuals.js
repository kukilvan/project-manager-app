// Manuals of the guide: photos of diagrams, PDFs, tables. A record is { id, title, section, fileId, fileName, mime, size, addedBy, addedAt, deleted }.
// Holds the section list and the visibility, grouping and filtering helpers; used by src/app/shell.js and the manuals view.
export const MANUAL_SECTIONS = ['Замки и двери', 'Хивут', 'Проверка', 'Установка', 'Шилют', 'Камеры и WiFi', 'Другое'];

/** 'image' | 'pdf' | 'other' — by file type or extension */
export function manualKind(m) {
  const mime = String(m?.mime || '').toLowerCase(); const name = String(m?.fileName || '').toLowerCase();
  if (mime.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|bmp)$/.test(name)) return 'image';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  return 'other';
}
export const manualIcon = (m) => ({ image: '🖼', pdf: '📄', other: '📎' })[manualKind(m)];

/** What to show this person: not deleted; one without a file on Drive only to whoever added it (they still need to send it to Drive) */
export function visibleManuals(list, myEmail = '') {
  const me = String(myEmail).toLowerCase();
  return (list || []).filter((m) => !m.deleted && (m.fileId || String(m.addedBy || '').toLowerCase() === me));
}
/** Filter by words (in title, section, file name) and groups by section; sections in MANUAL_SECTIONS order, custom ones after, by title within a section */
export function groupManuals(list, query = '') {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  const items = list.filter((m) => { const s = `${m.title} ${m.section} ${m.fileName}`.toLowerCase(); return words.every((w) => s.includes(w)); });
  const by = new Map();
  for (const m of items) { const k = m.section || 'Другое'; if (!by.has(k)) by.set(k, []); by.get(k).push(m); }
  const rank = (k) => { const i = MANUAL_SECTIONS.indexOf(k); return i < 0 ? 100 : i; };
  return [...by.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0], 'ru'))
    .map(([section, arr]) => ({ section, items: arr.sort((x, y) => String(x.title).localeCompare(String(y.title), 'ru', { numeric: true })) }));
}
export const sectionsIn = (list) => [...new Set([...MANUAL_SECTIONS, ...(list || []).map((m) => m.section).filter(Boolean)])];
