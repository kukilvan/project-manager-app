// Small shared helpers of the management sheets: file names, dates for Google Sheets, the update stamp text and the data hash.
// Used by report.js, the rack table (src/app/racktablecore.js) and the managers folder view.
export const TITLE_PREFIX = 'סטטוס נקודות – ';
const s = (v) => (v === undefined || v === null ? '' : String(v).trim());

// ISO date → Google Sheets serial number (the MAXIFS formulas work with numbers)
export function sheetSerial(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s(iso));
  if (!m) return '';
  return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000);
}

// File name: «סטטוס נקודות – <name HE|name> – <contractor> – <project HE|project>», without repeats
export function managerNames(p) {
  const parts = [s(p.nameHe) || s(p.name), s(p.contractor), s(p.objectHe) || s(p.object)].filter(Boolean);
  const display = parts.filter((x, i) => parts.indexOf(x) === i).join(' – ');
  return { display, title: TITLE_PREFIX + display };
}

// Data hash: when it has not changed, the manager's file is not rewritten
export function hashOf(obj) {
  const str = JSON.stringify(obj); let h1 = 0xdeadbeef ^ str.length; let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

// The update stamp of a sheet: «עודכן: 16/11/2026 02:00» / «Обновлено: …», 24-hour Israel time (summer time included)
const STAMP_LABEL = { he: 'עודכן', ru: 'Обновлено' };
export function stampText(date, lang) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(date).map((p) => [p.type, p.value]));
  return `${STAMP_LABEL[lang === 'ru' ? 'ru' : 'he']}: ${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}
