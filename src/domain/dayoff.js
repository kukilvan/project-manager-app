// Day off: the ready reasons, the text of a day off in Russian, Hebrew and English, and the check against a day of another project on the same date.
// Pure; used by doh.js (report lines), month.js, export.js and the day form in views/doh.js. Reached through src/domain/index.js.

const blank = (v) => v === undefined || v === null || v === '';

export const DAY_OFF_REASONS = [
  { id: 'personal', ru: 'Личное', he: 'אישי' },
  { id: 'holiday', ru: 'Праздник', he: 'חג' },
  { id: 'sick', ru: 'Болезнь', he: 'מחלה' },
  { id: 'other', ru: 'Другое', he: 'אחר' },
];
// Reasons taken out of the form at the owner's request (2026-11-17); days saved with them keep their text
const RETIRED_REASONS = [
  { id: 'shabbat', ru: 'Шаббат', he: 'שבת' },
  { id: 'nowork', ru: 'Нет работы на объекте', he: 'אין עבודה באתר' },
  { id: 'weather', ru: 'Погода', he: 'מזג אוויר' },
];

export const isDayOff = (day) => !!day && day.off === true;

/** The reason of a day off in `ru` or `he`; for «other» the own text as typed, in every language.
 * `tr` translates the Russian reason for English (the interface dictionary); without it English stays Russian. */
export function dayOffText(day, lang = 'ru', tr = (s) => s) {
  const r = [...DAY_OFF_REASONS, ...RETIRED_REASONS].find((x) => x.id === day?.offReason);
  if (!r) return blank(day?.offText) ? '' : String(day.offText);
  if (r.id === 'other') return blank(day.offText) ? (lang === 'he' ? r.he : lang === 'en' ? tr(r.ru) : r.ru) : String(day.offText);
  return lang === 'he' ? r.he : lang === 'en' ? tr(r.ru) : r.ru;
}

/** One line of a day off for the reports: «DD.MM.YYYY — выходной — Праздник» (Hebrew «יום חופש», English «day off»). `date` is already formatted. */
export function dayOffLine(day, lang, date, tr) {
  const word = lang === 'he' ? 'יום חופש' : lang === 'en' ? 'day off' : 'выходной';
  return [date, word, dayOffText(day, lang, tr)].filter((x) => !blank(x)).join(' — ');
}

/** Does the date clash with a day of another project? `days` carry `projectId` (as `allDays()` gives them), `projects` are the live ones.
 * `off: true` — we want to make the date a day off: a working day elsewhere is a clash `{ kind: 'work', project }`;
 * `off: false` — we want a working day: a day off elsewhere is a clash `{ kind: 'off', project }`. Deleted days, days of other (archived, deleted) projects
 * and days of the same project are ignored. The earliest created day wins when there are several. */
export function dayConflict(days, projects, { date, projectId, dayId, off }) {
  const live = new Map((projects || []).map((p) => [p.id, p]));
  const hits = (days || []).filter((d) => !d.deleted && d.date === date && d.projectId !== projectId && d.id !== dayId
    && live.has(d.projectId) && (off ? !isDayOff(d) : isDayOff(d)))
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  return hits.length ? { kind: off ? 'work' : 'off', project: live.get(hits[0].projectId) } : null;
}
