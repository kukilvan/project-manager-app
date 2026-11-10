// Text of the daily report («дох») in Russian, Hebrew and English (section 3.5, Appendix A).
// English names of works, cables, units etc. come from the interface dictionary (setNameTranslator).
// Built on points.js and compose.js; month.js, merge.js, export.js and the report views reuse its figures.
import { round2, cableCountFor } from './points.js';
import { taskQty } from './compose.js';

// Report format as in Ivan's real daily reports (WhatsApp): the date, on the next line the project and the helper,
// then each work as a separate paragraph. The one-line header (date project helper) is for the month list.
export const DOH_FORMAT = { headerSep: '\n', blockSep: '\n\n', oneLineSep: ' ' };

let trName = (s) => s;
/** Translation of names for the English report (Russian is what the data stores) */
export const setNameTranslator = (fn) => { trName = fn || ((s) => s); };
const en = (s) => (blank(s) ? s : trName(String(s)));

const blank = (v) => v === undefined || v === null || v === '';
const num = (v) => (blank(v) ? 0 : Number(v));

export function dateText(iso) { // 'YYYY-MM-DD' → 'DD.MM.YYYY'
  const [y, m, d] = String(iso).split('-');
  return `${d}.${m}.${y}`;
}

const isTime = (entry, work) => entry.workType === 'Время' || work?.unit === 'мин';
const entryPoints = (entry, ctx) => (entry.pointIds || []).map((id) => ctx.points.get(id)).filter(Boolean);

// «Итог шт» (total pieces): how many units of work (0 for time)
export function itogShtuk(entry, ctx) {
  const work = ctx.catalog.get(entry.workId);
  if (isTime(entry, work)) return 0;
  const pts = entryPoints(entry, ctx);
  // a point made of devices: as many units as this work has tasks (two doors with two readers — 4); otherwise 1 per point
  const portsOf = (p) => (Array.isArray(entry.portQty) ? entry.portQty.find((q) => q && q.id === p.id)?.v : undefined);   // port labels on some of the point's ports
  const base = pts.length ? pts.reduce((n, p) => n + (portsOf(p) ?? taskQty(p, ctx, entry) ?? 1), 0) : num(entry.quantity);
  return round2(base * (blank(work?.multiplier) ? 1 : Number(work.multiplier)));
}

export function pullFigures(entry, ctx) {
  const pts = entryPoints(entry, ctx);
  // portQty — how many of the point's cables are in this entry, if not all (for example after merging singles into a double)
  const portsOf = (p) => (Array.isArray(entry.portQty) ? entry.portQty.find((q) => q && q.id === p.id)?.v : undefined);
  const cablesIn = (p) => portsOf(p) ?? taskQty(p, ctx, entry) ?? cableCountFor(p, ctx, entry.cableId);
  if (pts.length) {
    return {
      // only cables of this entry's kind (a point may have several kinds)
      count: round2(pts.reduce((s, p) => s + cablesIn(p), 0)),
      meters: round2(pts.reduce((s, p) => s + (Number(p.length) || 0) * cablesIn(p), 0)),
    };
  }
  return { count: num(entry.quantity), meters: num(entry.meters) };
}

/** Time in the report: minutes are folded into hours and a remainder — 95 → «1 ч 35 мин» (Hebrew: «שעה ו-35 דקות», English: «1 h 35 min»).
 * In the app time is still entered in minutes. */
export function dur(min, lang = 'ru') {
  const n = Number(min); if (blank(min) || !Number.isFinite(n)) return String(min ?? '');
  const h = Math.floor(n / 60); const m = round2(n - h * 60);
  if (lang === 'he') {
    if (!h) return `${m} דקות`;
    const hs = h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : `${h} שעות`;
    return m ? `${hs} ו-${m} דקות` : hs;
  }
  if (lang === 'en') return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
  return h ? `${h} ч${m ? ` ${m} мин` : ''}` : `${m} мин`;
}
const langOf = (he, eng) => (he ? 'he' : eng ? 'en' : 'ru');

const tail = (entry, ctx, he, eng = false) => ({
  minutes: !blank(entry.minutes) ? `, ${dur(entry.minutes, langOf(he, eng))}` : '',
  note: !blank(entry.note) ? `. ${entry.note}` : '',
  culprit: !blank(entry.culprit)
    ? ` (${he ? (ctx.culprits.get(entry.culprit)?.he ?? entry.culprit) : eng ? en(entry.culprit) : entry.culprit})` : '',
});

// Delay on a work: «Задержка: нет доступа, Электрики, ждали ключ — 40 мин» (Hebrew: «עיכוב: …»). Empty if nothing is given.
export function delayLine(entry, ctx, lang = 'ru') {
  if (!entry || entry.workType === 'Текст') return '';
  const he = lang === 'he'; const eng = lang === 'en';
  const loc = (v, list) => (he ? (list.get(v)?.he || v) : eng ? en(v) : v);
  const reason = blank(entry.delayReason) ? '' : loc(entry.delayReason, ctx.delayReasons);
  const culprit = blank(entry.delayCulprit) ? '' : loc(entry.delayCulprit, ctx.culprits);
  const note = blank(entry.delayNote) ? '' : String(entry.delayNote);
  const mins = blank(entry.delayMinutes) ? '' : dur(entry.delayMinutes, lang);
  const parts = [reason, culprit, note].filter(Boolean);
  if (!parts.length && !mins) return '';
  const head = he ? 'עיכוב' : eng ? 'Delay' : 'Задержка';
  return `${head}: ${parts.join(', ')}${parts.length && mins ? ' — ' : ''}${mins}`;
}

/** The work line and right under it the delay (if any) */
export function entryLine(entry, ctx, lang = 'ru') {
  const main = workLine(entry, ctx, lang); const d = delayLine(entry, ctx, lang);
  return d ? `${main}${main ? '\n' : ''}${d}` : main;
}

function workLine(entry, ctx, lang = 'ru', sum = null) {
  const he = lang === 'he'; const eng = lang === 'en';
  const work = ctx.catalog.get(entry.workId);
  const name = he ? work?.nameHe : eng ? en(work?.name) : work?.name;
  const t = tail(sum?.minutes !== undefined ? { ...entry, minutes: sum.minutes } : entry, ctx, he, eng);
  const unit = ctx.units.get(work?.unit);

  if (entry.workType === 'Текст') return String(entry.note ?? ''); // a free line without figures

  if (isTime(entry, work)) { // «Время» and any works measured in minutes
    return `${[name, dur(sum?.minutes ?? entry.minutes ?? '', langOf(he, eng))].filter(Boolean).join(' ')}${t.culprit}${t.note}`;
  }
  if (entry.workType === 'Протяжка') {
    const cable = ctx.cables.get(entry.cableId);
    const { count, meters } = sum?.pull || pullFigures(entry, ctx);
    const meterMode = cable?.accounting === 'Метры';
    if (he) {
      return `השחלת ${cable?.nameHe ?? entry.cableId ?? ''}: ${count}${meterMode ? ` כבלים, ${meters} מטר` : ' נקודות'}${t.minutes}${t.culprit}${t.note}`;
    }
    if (eng) return `Cable pull ${en(entry.cableId ?? '')}: ${count}${meterMode ? ` cables, ${meters} m` : ' points'}${t.minutes}${t.culprit}${t.note}`;
    return `Протяжка ${entry.cableId ?? ''}: ${count}${meterMode ? ` каб., ${meters} м` : ' точек'}${t.minutes}${t.culprit}${t.note}`;
  }
  const bad = entry.result === 'Не работает' ? (he ? ' (לא תקין)' : eng ? ' (not working)' : ' (не работает)') : '';
  return `${name} ${sum?.shtuk ?? itogShtuk(entry, ctx)} ${he ? (unit?.he ?? work?.unit) : eng ? en(work?.unit) : work?.unit}${bad}${t.minutes}${t.culprit}${t.note}`;
}

const helperIsSelf = (h) => blank(h) || h === 'сам';

function headerParts(day, ctx, lang) {
  const he = lang === 'he';
  const p = ctx.projects.get(day.projectId) || {};
  const where = p.oneOff ? day.object
    : he ? `${p.nameHe || p.name} ${p.objectHe ?? ''}`.trim() : `${p.contractor ?? ''} ${p.object ?? ''}`.trim();
  const helper = he ? (day.helperHe ?? p.helperHe) : (day.helper ?? p.helper);
  const who = helperIsSelf(helper) ? (he ? ' לבד' : lang === 'en' ? ' alone' : ' сам') : (he ? ` עם ${helper}` : lang === 'en' ? ` with ${helper}` : ` с ${helper}`);
  return { date: dateText(day.date), place: `${where ?? ''}${who}` };
}

// One-line header «DD.MM.YYYY Contractor Project alone/with Helper» (month list)
export function dohHeader(day, ctx, lang = 'ru') {
  const { date, place } = headerParts(day, ctx, lang);
  return `${date}${DOH_FORMAT.oneLineSep}${place}`;
}

export function dayEntries(day, ctx) {
  return [...ctx.entries.values()].filter((e) => e.dayId === day.id)
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

// Identical works of a day are written as one line with the sum (a cat7 pull in different places: 4 and 8 → 12).
// «Identical» — the same work, cable, result, note, culprit, minutes; an entry with a delay, with free text
// or without a work stays a separate line. For works measured in time (min) the minutes are added up.
const mergeKey = (e, ctx) => {
  if (e.workType === 'Текст' || !e.workId && e.workType !== 'Протяжка' || [e.delayReason, e.delayCulprit, e.delayNote, e.delayMinutes].some((v) => !blank(v))) return null;
  const work = ctx.catalog.get(e.workId); const time = isTime(e, work);
  return JSON.stringify([e.workType, e.workId, e.cableId ?? '', e.result ?? '', e.culprit ?? '', e.note ?? '', time ? '' : (e.minutes ?? '')]);
};
export function dohLines(entries, ctx, lang = 'ru') {
  const groups = []; const byKey = new Map();
  for (const e of entries) {
    const k = mergeKey(e, ctx);
    if (k !== null && byKey.has(k)) byKey.get(k).list.push(e);
    else { const g = { list: [e] }; groups.push(g); if (k !== null) byKey.set(k, g); }
  }
  return groups.map(({ list }) => {
    if (list.length === 1) return entryLine(list[0], ctx, lang);
    const e = list[0]; const work = ctx.catalog.get(e.workId); let sum;
    if (isTime(e, work)) sum = { minutes: round2(list.reduce((n, x) => n + num(x.minutes), 0)) };
    else if (e.workType === 'Протяжка') { const f = list.map((x) => pullFigures(x, ctx)); sum = { pull: { count: round2(f.reduce((n, x) => n + x.count, 0)), meters: round2(f.reduce((n, x) => n + x.meters, 0)) } }; }
    else sum = { shtuk: round2(list.reduce((n, x) => n + itogShtuk(x, ctx), 0)) };
    return workLine(e, ctx, lang, sum);
  });
}

export function doh(day, ctx, lang = 'ru') {
  const { date, place } = headerParts(day, ctx, lang);
  const lines = dohLines(dayEntries(day, ctx), ctx, lang).filter((l) => l !== '');
  const blocks = [`${date}${DOH_FORMAT.headerSep}${place}`, ...lines];
  if (!blank(day.comment)) blocks.push(String(day.comment));
  return blocks.join(DOH_FORMAT.blockSep);
}

// The first two lines of the report: the date and the place of work (for the month's list of working days)
export function dohTop(day, ctx, lang = 'ru') {
  const { date, place } = headerParts(day, ctx, lang);
  return `${date}${DOH_FORMAT.headerSep}${place}`;
}
