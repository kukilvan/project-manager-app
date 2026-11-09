// Текст «отчёта» (отчёт за день) на русском, иврите и английском (раздел 3.5, Приложение А).
// Английские названия работ, кабелей, единиц и т. п. берутся из словаря интерфейса (setNameTranslator).
import { round2, cableCountFor } from './points.js';
import { taskQty } from './compose.js';

// Формат отчёта как в настоящих дохах Ивана (WhatsApp): дата, на следующей строке объект и помощник,
// затем каждая работа отдельным абзацем. Однострочная шапка (дата объект помощник) — для месячного списка.
export const DOH_FORMAT = { headerSep: '\n', blockSep: '\n\n', oneLineSep: ' ' };

let trName = (s) => s;
/** Перевод названий для английского отчёта (по-русски хранится в данных) */
export const setNameTranslator = (fn) => { trName = fn || ((s) => s); };
const en = (s) => (blank(s) ? s : trName(String(s)));

const blank = (v) => v === undefined || v === null || v === '';
const num = (v) => (blank(v) ? 0 : Number(v));

export function dateText(iso) { // 'YYYY-MM-DD' → 'ДД.ММ.ГГГГ'
  const [y, m, d] = String(iso).split('-');
  return `${d}.${m}.${y}`;
}

const isTime = (entry, work) => entry.workType === 'Время' || work?.unit === 'мин';
const entryPoints = (entry, ctx) => (entry.pointIds || []).map((id) => ctx.points.get(id)).filter(Boolean);

// «Итог шт»: сколько единиц работы (0 для времени)
export function itogShtuk(entry, ctx) {
  const work = ctx.catalog.get(entry.workId);
  if (isTime(entry, work)) return 0;
  const pts = entryPoints(entry, ctx);
  // точка из устройств: столько единиц, сколько задач этой работы (две двери с двумя коре — 4); иначе 1 на точку
  const portsOf = (p) => (Array.isArray(entry.portQty) ? entry.portQty.find((q) => q && q.id === p.id)?.v : undefined);   // шилют части портов точки
  const base = pts.length ? pts.reduce((n, p) => n + (portsOf(p) ?? taskQty(p, ctx, entry) ?? 1), 0) : num(entry.quantity);
  return round2(base * (blank(work?.multiplier) ? 1 : Number(work.multiplier)));
}

export function pullFigures(entry, ctx) {
  const pts = entryPoints(entry, ctx);
  // portQty — сколько кабелей точки в этой записи, если не все (например, после объединения одинарных точек в двойную)
  const portsOf = (p) => (Array.isArray(entry.portQty) ? entry.portQty.find((q) => q && q.id === p.id)?.v : undefined);
  const cablesIn = (p) => portsOf(p) ?? taskQty(p, ctx, entry) ?? cableCountFor(p, ctx, entry.cableId);
  if (pts.length) {
    return {
      // только кабели вида этой записи (у точки их может быть несколько видов)
      count: round2(pts.reduce((s, p) => s + cablesIn(p), 0)),
      meters: round2(pts.reduce((s, p) => s + (Number(p.length) || 0) * cablesIn(p), 0)),
    };
  }
  return { count: num(entry.quantity), meters: num(entry.meters) };
}

/** Время в отчёте: минуты складываются в часы и остаток — 95 → «1 ч 35 мин» (иврит: «שעה ו-35 דקות», англ.: «1 h 35 min»).
 * В приложении время по-прежнему вводится в минутах. */
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

// Задержка к работе: «Задержка: нет доступа, Электрики, ждали ключ — 40 мин» (иврит: «עיכוב: …»). Пусто, если ничего не указано.
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

/** Строка работы и сразу под ней — задержка (если есть) */
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

  if (entry.workType === 'Текст') return String(entry.note ?? ''); // свободная строка без цифр

  if (isTime(entry, work)) { // «Время» и любые работы в минутах
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

// Однострочная шапка «ДД.ММ.ГГГГ Подрядчик Объект сам/с Помощником» (месячный список)
export function dohHeader(day, ctx, lang = 'ru') {
  const { date, place } = headerParts(day, ctx, lang);
  return `${date}${DOH_FORMAT.oneLineSep}${place}`;
}

export function dayEntries(day, ctx) {
  return [...ctx.entries.values()].filter((e) => e.dayId === day.id)
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

// Одинаковые работы за день пишутся одной строкой с суммой (протяжка cat7 в разных местах: 4 и 8 → 12).
// «Одинаковые» — та же работа, кабель, результат, пояснение, виновник, минуты; запись с задержкой, со свободным текстом
// или без работы остаётся отдельной строкой. Для работ во времени (мин) складываются минуты.
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

// Две первые строки отчёта: дата и место работы (для списка рабочих дней месяца)
export function dohTop(day, ctx, lang = 'ru') {
  const { date, place } = headerParts(day, ctx, lang);
  return `${date}${DOH_FORMAT.headerSep}${place}`;
}
