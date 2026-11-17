// Management sheets: profiles (what to show) and building the sheets (colour legend, update stamp, point rows, the last rack sheet «Итоги по шкафам») with values only, no formulas.
// Profile: { id, name, main, lang: 'he'|'ru', cabinets: [], types: [], statuses: [], columns: [id…], layout: 'one'|'perCabinet', summary, sections, rackSheet, typeOrder: [type id…] }
// An empty list of racks/types/statuses = «all». `sections` (absent = on) puts a heading row «<type> — <count>» before the points of each type, in `typeOrderOf` order.
// `rackSheet` (absent = on) adds the last sheet with the progress of every rack: per stage the done count and the percent (rounded down) of the points whose type has the stage.
// Built on points.js, status.js, doorcfg.js, managers.js and rack.js; export.js reuses it for the Excel export.
import { comparePoints, cableListOf, cablesCountOf, metrageOf } from './points.js';
import { pointInfo, usesConfig } from './status.js';
import { doorCfgOf, doorLockOf, doorShortOf } from './doorcfg.js';
import { sheetSerial, hashOf, stampText, TITLE_PREFIX } from './managers.js';
import { panelText } from './rack.js';

export const NO_CABINET = '__none';

// kind: text | num | status | stage (the stage's date). stage — the name of a point-type stage; a type may lack it («—»)
export const COLUMNS = [
  { id: 'label', ru: 'Обозначение', he: 'נקודה', w: 140 },
  { id: 'planName', ru: 'Имя в плане', he: 'שם בתוכנית', w: 150 },
  { id: 'cabinet', ru: 'Шкаф', he: 'ארון', w: 90 },
  { id: 'floor', ru: 'Этаж', he: 'קומה', w: 70 },
  { id: 'type', ru: 'Тип', he: 'סוג', w: 120 },
  { id: 'cable', ru: 'Кабель', he: 'כבל', w: 110 },
  { id: 'cables', ru: 'Кабелей', he: "מס' כבלים", w: 85, kind: 'num' },
  { id: 'length', ru: 'Длина (орэх), м', he: "אורך (מ')", w: 100, kind: 'num' },
  { id: 'port', ru: 'Порт в свитче', he: 'פורט במתג', w: 90 },
  { id: 'panel', ru: 'Порт в панели', he: 'פורט בפנל', w: 110 },
  { id: 'serial', ru: 'Серийный номер', he: "מס' סידורי", w: 170 },
  { id: 'mac', ru: 'MAC', he: 'MAC', w: 150 },
  { id: 'config', ru: 'Конфигурация двери', he: 'תצורת דלת', w: 220 },
  { id: 'lockType', ru: 'Тип замка', he: 'סוג נעילה', w: 110 },
  { id: 'delay', ru: 'Причина задержки', he: 'סיבת עיכוב', w: 150 },
  { id: 'note', ru: 'Примечание', he: 'הערה', w: 220 },
  { id: 'status', ru: 'Статус', he: 'סטטוס', w: 135, kind: 'status' },
  { id: 'pulled', ru: 'Протянуто', he: 'הושחל', w: 105, kind: 'stage', stage: 'Протяжка' },
  { id: 'hived', ru: 'Захивучено', he: 'חווט', w: 105, kind: 'stage', stage: 'Хивут' },
  { id: 'installed', ru: 'Установлено', he: 'הותקן', w: 150, kind: 'stage', stage: 'Установка' },
  { id: 'checked', ru: 'Проверено', he: 'נבדק', w: 105, kind: 'stage', stage: 'Проверка' },
  { id: 'checkResult', ru: 'Результат проверки', he: 'תוצאת בדיקה', w: 135 },
  { id: 'shilut', ru: 'Шилют', he: 'שילוט', w: 105, kind: 'stage', stage: 'Шилют' },
  { id: 'lastBy', ru: 'Внёс последним', he: 'עודכן ע״י', w: 140 },
];
const colById = new Map(COLUMNS.map((c) => [c.id, c]));

// Point statuses (for the filter) and their captions in the table. The Hebrew is the old one (the managers have seen it), the new captions are to be checked.
export const STATUS_KEYS = ['Новая', 'Посчитана', 'Частично протянута', 'Протянута', 'Захивучена', 'Частично установлена', 'Установлена', 'Проверена', 'Неисправна'];
const STATUS_HE = { 'Новая': 'טרם נמשך', 'Посчитана': 'טרם נמשך', 'Протянута': 'נמשך', 'Захивучена': 'חווט', 'Установлена': 'הותקן', 'Проверена': 'נבדק', 'Неисправна': 'תקלה' };
export const statusKeyOf = (info) => (info.status.startsWith('Установлено ') ? 'Частично установлена'
  : info.status.startsWith('Протянуто ') ? 'Частично протянута' : info.status);

// Colour legend (one cell per colour, always columns A–F): the point row colors and the stage-cell colors it explains
const LEGEND = [
  { color: '#C6E5C9', ru: 'Выполнено', he: 'בוצע' },
  { color: '#FFF2B3', ru: 'В работе', he: 'בתהליך' },
  { color: '#FFE0B2', ru: 'Частично', he: 'בוצע חלקית' },
  { color: '#F4B6B6', ru: 'Неисправность', he: 'תקלה' },
  { color: '#EFEFEF', textColor: '#8C8C8C', ru: '— не относится к типу', he: '— לא רלוונטי לסוג' },
  { color: '#FFFFFF', ru: 'Пусто — ещё не сделано', he: 'ריק — טרם בוצע' },
];

const T = {
  title: { ru: 'Статус выполнения точек', he: 'סטטוס התקדמות נקודות' },
  project: { ru: 'Проект', he: 'פרויקט' },
  noCabinet: { ru: 'Без шкафа', he: 'ללא ארון' },
  noType: { ru: 'Без типа', he: 'ללא סוג' },
  partial: { ru: 'частично', he: 'הותקן חלקית' },
  partialPull: { ru: 'частично', he: 'חלקית' },
  ok: { ru: 'Работает', he: 'תקין' },
  bad: { ru: 'Не работает', he: 'לא תקין' },
  sum: {
    total: { ru: 'Всего точек', he: 'סה״כ נקודות' }, pulled: { ru: 'Протянуто', he: 'הושחל' }, hived: { ru: 'Захивучено', he: 'חווט' },
    installed: { ru: 'Установлено', he: 'הותקן' }, partial: { ru: 'Установлено частично', he: 'הותקן חלקית' }, checked: { ru: 'Проверено', he: 'נבדק' },
    faulty: { ru: 'Неисправно', he: 'תקלות' },
  },
};

// ---------- profiles ----------
export const defaultTables = () => [
  { id: 't_main', name: 'Для руководства', main: true, lang: 'he', cabinets: [], types: [], statuses: [], layout: 'one', summary: true, sections: true, rackSheet: true,
    columns: ['label', 'planName', 'type', 'cabinet', 'floor', 'cable', 'pulled', 'hived', 'installed', 'checked'] },
  { id: 't_ext', name: 'Расширенная', main: false, lang: 'ru', cabinets: [], types: [], statuses: [], layout: 'one', summary: true, sections: true, rackSheet: true,
    columns: ['label', 'planName', 'cabinet', 'floor', 'type', 'cable', 'cables', 'length', 'port', 'config', 'delay', 'status',
      'pulled', 'hived', 'installed', 'checked', 'checkResult', 'shilut', 'lastBy', 'note'] },
];
// The old «метраж» column is merged into the «длина» column: in saved profiles it is replaced and duplicates are removed
const fixColumns = (t) => ({ ...t, columns: [...new Set((t.columns || []).map((c) => (c === 'metrage' ? 'length' : c)))] });
export const tablesOf = (project) => (project?.tables?.length ? project.tables.map(fixColumns) : defaultTables());
export const mainTable = (project) => { const t = tablesOf(project); return t.find((x) => x.main) || t[0]; };
// A new list of profiles with the changes to one of them (patch); there is always exactly one main profile
export function withTable(project, id, patch) {
  const list = tablesOf(project).map((t) => (t.id === id ? { ...t, ...patch } : t));
  if (patch.main) list.forEach((t) => { t.main = t.id === id; });
  return list;
}

// ---------- building ----------
const safeSheet = (s) => String(s).replace(/[[\]*?:/\\]/g, '_').slice(0, 90) || '_';
const s = (v) => (v === undefined || v === null ? '' : v);

export function displayName(project, lang) {
  const p = lang === 'he' ? [project.nameHe || project.name, project.contractor, project.objectHe || project.object] : [project.name, project.contractor, project.object];
  const parts = p.map((x) => String(x ?? '').trim()).filter(Boolean);
  return parts.filter((x, i) => parts.indexOf(x) === i).join(' – ');
}
export function fileTitle(project, table) {
  if (table.fileName) return table.fileName;
  const d = displayName(project, table.lang);
  if (table.main) return table.lang === 'he' ? TITLE_PREFIX + d : `Статус точек – ${d}`;
  return `${d} – ${table.name}`;
}

// Stages of a point type (as set in the type)
const stagesOf = (type) => (type ? [...(type.stages || [])] : null);


// layout version: when it changes the tables are rebuilt even if the data is the same
const STYLE_V = 7;
const COLORS = { green: '#C6E5C9', grey: '#EFEFEF', orange: '#FFE0B2', red: '#F4B6B6', yellow: '#FFF2B3' };

// The lock type column: EM (electromagnet) or MH (electric lock) of the door configuration; old configurations and old
// door types by the EM / MH word in their name; a locking device of another kind — its short name; not a door — empty
const LOCK_NAMES = { em: { ru: 'ЭМ', he: 'אלקטרומגנט' }, mh: { ru: 'МХ', he: 'מנעול חשמלי' } };
function lockTypeOf(point, ctx, lang) {
  const type = ctx.types.get(point.typeId);
  const cfg = usesConfig(type) ? doorCfgOf(point, ctx) : null;
  const lock = cfg ? doorLockOf(ctx, cfg) : null;
  if (lock?.role) return LOCK_NAMES[lock.role][lang];
  if (lock) return lang === 'he' ? s(lock.dev.nameHe || doorShortOf(lock.dev)) : doorShortOf(lock.dev);
  if (cfg) return '';
  const old = point.configId ? ctx.configs?.get(point.configId) : null;
  const words = ` ${old && !old.deleted ? s(old.name) : ''} ${s(point.typeId)} ${s(type?.name)} `;
  const role = /[\s·]ЭМ[\s·]/.test(words) ? 'em' : /[\s·]МХ[\s·]/.test(words) ? 'mh' : '';
  return role ? LOCK_NAMES[role][lang] : '';
}

// Values of one cell
function cellOf(col, point, info, ctx, project, lang, nameOf) {
  const type = ctx.types.get(point.typeId);
  switch (col.id) {
    case 'label': return point.label;
    case 'planName': return s(point.planName);
    case 'cabinet': return s(point.cabinet);
    case 'floor': return s(point.floor);
    case 'type': return lang === 'he' ? (type?.nameHe || point.typeId) : point.typeId;
    case 'cable': {
      const list = info.cableList || cableListOf(point, ctx);
      const name = (id) => (lang === 'he' ? (ctx.cables.get(id)?.nameHe || s(id)) : s(id));
      return list.length > 1 ? list.map((c) => `${name(c.cable)}×${c.count}`).join(' + ') : name(list[0]?.cable);
    }
    case 'cables': return cablesCountOf(point, ctx);
    case 'length': return info.metrage || '';
    case 'port': return s(point.port);
    case 'panel': return panelText(point, project);
    case 'serial': return s(point.serial);
    case 'mac': return s(point.mac);
    case 'config': { const cfg = usesConfig(ctx.types.get(point.typeId)) ? doorCfgOf(point, ctx) : null; return cfg ? s(cfg.name) : ''; }
    case 'lockType': return lockTypeOf(point, ctx, lang);
    case 'delay': { const r = ctx.delayReasons.get(point.delayReasonId); return r ? (lang === 'he' ? (r.he || r.id) : r.id) : s(point.delayReasonId); }
    case 'note': return s(point.note);
    case 'status': {
      if (lang === 'ru') return info.status;
      if (info.status.startsWith('Протянуто ')) return info.statusHe;
      return info.status.startsWith('Установлено ') ? info.installHe : (STATUS_HE[info.status] || info.status);
    }
    case 'checkResult': return info.checked ? (info.checkResult === 'Не работает' ? T.bad[lang] : T.ok[lang]) : '';
    case 'lastBy': {
      const rows = (ctx.journalByPoint.get(point.id) || []).filter((r) => r.by);
      if (!rows.length) return '';
      const last = rows.reduce((a, b) => ((b.date || '') > (a.date || '') || ((b.date || '') === (a.date || '') && b.order > a.order) ? b : a));
      return nameOf ? nameOf(last.by) : '';
    }
    default: {
      // stages: «—» if the type has no such stage, empty if not done yet, otherwise the date
      const stages = info.composed ? info.stages : stagesOf(type);
      if (stages && !stages.includes(col.stage)) return '—';
      if (col.id === 'installed') {
        if (!info.install) return '';
        if (info.install === 'Установлено') {
          const d = (ctx.journalByPoint.get(point.id) || []).filter((r) => r.action === 'Установка').reduce((m, r) => (r.date > m ? r.date : m), '');
          return sheetSerial(d) || (lang === 'he' ? 'הותקן' : 'да');
        }
        return lang === 'he' ? info.installHe : `${T.partial.ru} ${info.install.replace('Установлено ', '')}`;
      }
      if (col.id === 'pulled' && !info.pulled && info.pullDone) return `${T.partialPull[lang]} ${info.pullDone}/${info.pullTotal}`;
      return sheetSerial(info[col.id]);
    }
  }
}

// Highlight rules (no formulas in cells): column → condition → color
function rulesFor(cols, lang) {
  const rules = [];
  cols.forEach((c, i) => {
    if (c.kind === 'stage') {
      rules.push({ col: i, kind: 'number', color: COLORS.green }, { col: i, kind: 'eq', text: '—', color: COLORS.grey, textColor: '#8C8C8C' });
      if (c.id === 'installed') rules.push({ col: i, kind: 'starts', text: T.partial[lang], color: COLORS.orange });
      if (c.id === 'pulled') rules.push({ col: i, kind: 'starts', text: T.partialPull[lang], color: COLORS.orange });
    } else if (c.id === 'status') {
      const t = (k) => (lang === 'he' ? STATUS_HE[k] : k);
      rules.push({ col: i, kind: 'eq', text: t('Проверена'), color: COLORS.green }, { col: i, kind: 'eq', text: t('Установлена'), color: COLORS.green },
        { col: i, kind: 'starts', text: lang === 'he' ? T.partial.he : 'Установлено ', color: COLORS.orange },
        { col: i, kind: 'eq', text: t('Неисправна'), color: COLORS.red }, { col: i, kind: 'eq', text: t('Захивучена'), color: COLORS.yellow },
        { col: i, kind: 'eq', text: t('Протянута'), color: COLORS.yellow },
        { col: i, kind: 'starts', text: lang === 'he' ? 'נמשך חלקית' : 'Протянуто ', color: COLORS.orange });
    } else if (c.id === 'checkResult') {
      rules.push({ col: i, kind: 'eq', text: T.ok[lang], color: COLORS.green }, { col: i, kind: 'eq', text: T.bad[lang], color: COLORS.red });
    }
  });
  return rules;
}

// Color of the row's «informational» columns by the point's overall status (the status column is colored by its own rules)
const ROW_COLOR = { 'Неисправна': COLORS.red, 'Проверена': COLORS.green, 'Установлена': COLORS.green, 'Частично установлена': COLORS.orange,
  'Захивучена': COLORS.yellow, 'Протянута': COLORS.yellow, 'Частично протянута': COLORS.orange };
function pointsFor(project, ctx, table, nameOf) {
  const cabs = new Set(table.cabinets || []); const types = new Set(table.types || []); const sts = new Set(table.statuses || []);
  return [...ctx.points.values()].filter((p) => p.projectId === project.id).sort(comparePoints)
    .map((point) => ({ point, info: pointInfo(point, ctx) }))
    .filter(({ point, info }) => (!cabs.size || cabs.has(point.cabinet || NO_CABINET)) && (!types.size || types.has(point.typeId))
      && (!sts.size || sts.has(statusKeyOf(info))));
}

// Order of the point types for sections: the ids of `table.typeOrder` that still exist, then the other types by name (deleted ones are skipped, not removed)
export function typeOrderOf(table, ctx) {
  const known = ctx.types;
  const listed = [...new Set(table.typeOrder || [])].filter((id) => known.has(id));
  const rest = [...known.keys()].filter((id) => !listed.includes(id)).sort((a, b) => String(a).localeCompare(String(b), 'ru', { numeric: true }));
  return [...listed, ...rest];
}

// «N точек» in the sheet's language: Hebrew «נקודה אחת» / «N נקודות»; Russian by the usual plural rule
export function pointsCountText(n, lang) {
  if (lang === 'he') return n === 1 ? 'נקודה אחת' : `${n} נקודות`;
  const m10 = n % 10; const m100 = n % 100;
  return `${n} ${m10 === 1 && m100 !== 11 ? 'точка' : (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) ? 'точки' : 'точек'}`;
}

// Points of one sheet grouped by type: [{ name, items }] in the profile's type order, «Без типа» (no type or a deleted type) last; empty groups are left out
function groupsByType(items, table, ctx, lang) {
  const byType = new Map();
  const noType = [];
  items.forEach((it) => {
    if (it.point.typeId && ctx.types.has(it.point.typeId)) { if (!byType.has(it.point.typeId)) byType.set(it.point.typeId, []); byType.get(it.point.typeId).push(it); } else noType.push(it);
  });
  const groups = typeOrderOf(table, ctx).filter((id) => byType.has(id))
    .map((id) => ({ name: lang === 'he' ? (ctx.types.get(id)?.nameHe || id) : id, items: byType.get(id) }));
  if (noType.length) groups.push({ name: T.noType[lang], items: noType });
  return groups;
}

function sheetOf(title, items, project, ctx, table, cols, nameOf, now) {
  const lang = table.lang === 'ru' ? 'ru' : 'he';
  const rows = [[T.title[lang]], [displayName(project, lang)]];
  if (table.summary) {
    const n = (f) => items.filter(f).length;
    const keys = ['total', 'pulled', 'hived', 'installed', 'partial', 'checked', 'faulty'];
    const vals = [items.length, n((x) => x.info.pulled), n((x) => x.info.hived), n((x) => x.info.install === 'Установлено'),
      n((x) => x.info.install.startsWith('Установлено ')), n((x) => x.info.checked), n((x) => x.info.status === 'Неисправна')];
    rows.push(keys.map((k) => T.sum[k][lang]), vals);
  }
  const legendRow = rows.length;
  rows.push(LEGEND.map((l) => l[lang]), []);
  const headerRow = rows.length;
  rows.push(cols.map((c) => c[lang]));
  const first = rows.length;
  const sectionRows = []; const pointRuns = []; const rowColors = [];
  const pushPoint = ({ point, info }) => { rows.push(cols.map((c) => cellOf(c, point, info, ctx, project, lang, nameOf))); rowColors.push(ROW_COLOR[statusKeyOf(info)] || ''); };
  if (table.sections !== false) {
    // a section row (the name and the count in column A), its points, two empty rows before the next section; section and empty rows get no color
    groupsByType(items, table, ctx, lang).forEach((g, i) => {
      if (i) { rows.push([], []); rowColors.push('', ''); }
      sectionRows.push(rows.length); rows.push([`${g.name} — ${pointsCountText(g.items.length, lang)}`]); rowColors.push('');
      const r0 = rows.length; g.items.forEach(pushPoint); pointRuns.push([r0, rows.length]);
    });
  } else {
    items.forEach(pushPoint);
    if (items.length) pointRuns.push([first, rows.length]);
  }
  // the stamp (E2) is not in `rows`, so it is not in the hash; rebuildSheets and the date-only write put it into the cell
  return { title, rtl: lang === 'he', rows, headerRow, summaryRows: table.summary ? [2, 3] : [],
    cols: cols.map((c) => ({ id: c.id, kind: c.kind || 'text', width: c.w })), rules: rulesFor(cols, lang), count: items.length,
    stamp: { row: 1, col: 4, text: stampText(now, lang) }, frozenRows: headerRow + 1, frozenCols: 0,
    legendRow, legend: LEGEND.map((l) => ({ color: l.color, textColor: l.textColor })), sectionRows,
    pointRuns, rowColors };
}

// The four stages of the rack sheet (the same as the totals row; shilut is not in it): done = the point has finished it
const RACK_STAGES = [
  { id: 'pulled', stage: 'Протяжка', done: (i) => !!i.pulled },
  { id: 'hived', stage: 'Хивут', done: (i) => !!i.hived },
  { id: 'installed', stage: 'Установка', done: (i) => i.install === 'Установлено' },
  { id: 'checked', stage: 'Проверка', done: (i) => !!i.checked },
];
const RACK_T = {
  title: { ru: 'Итоги по шкафам', he: 'התקדמות לפי ארון' }, rack: { ru: 'Шкаф', he: 'ארון' }, count: { ru: 'Кол-во', he: 'כמות' },
  total: { ru: 'Итого', he: 'סה״כ' },
};
const rackSheetName = (lang) => RACK_T.title[lang];

// Counts of one group of points: the total, per stage the base (points whose type has the stage) and the done points inside it, partly installed, faults
function rackTally(list, ctx) {
  const t = { total: list.length, base: RACK_STAGES.map(() => 0), done: RACK_STAGES.map(() => 0), partial: 0, faulty: 0 };
  list.forEach(({ point, info }) => {
    const stages = info.composed ? info.stages : stagesOf(ctx.types.get(point.typeId)); // an unknown type has every stage
    RACK_STAGES.forEach((st, k) => {
      if (stages && !stages.includes(st.stage)) return;
      t.base[k] += 1; if (st.done(info)) t.done[k] += 1;
    });
    if (info.install.startsWith('Установлено ')) t.partial += 1;
    if (info.status === 'Неисправна') t.faulty += 1;
  });
  return t;
}

// Progress by rack: one row per rack (natural order, «Без шкафа» last) and a total row; percents are rounded down, so 100% means every point is done
function rackSheetOf(title, items, project, ctx, table, now) {
  const lang = table.lang === 'ru' ? 'ru' : 'he';
  const byRack = new Map();
  items.forEach((it) => { const k = it.point.cabinet || NO_CABINET; if (!byRack.has(k)) byRack.set(k, []); byRack.get(k).push(it); });
  const keys = [...byRack.keys()].sort((x, y) => (x === NO_CABINET) - (y === NO_CABINET) || (x === NO_CABINET ? 0 : String(x).localeCompare(String(y), 'ru', { numeric: true }))); // a fixed locale: the phone and the night job sort alike, so the hash matches
  const tallies = keys.map((k) => [k === NO_CABINET ? T.noCabinet[lang] : k, rackTally(byRack.get(k), ctx)]);
  const sum = { total: 0, base: RACK_STAGES.map(() => 0), done: RACK_STAGES.map(() => 0), partial: 0, faulty: 0 };
  tallies.forEach(([, t]) => { sum.total += t.total; sum.partial += t.partial; sum.faulty += t.faulty; RACK_STAGES.forEach((_, k) => { sum.base[k] += t.base[k]; sum.done[k] += t.done[k]; }); });
  tallies.push([RACK_T.total[lang], sum]);
  const rowOf = ([name, t]) => [name, t.total, ...RACK_STAGES.flatMap((_, k) => (t.base[k] ? [t.done[k], Math.floor((t.done[k] * 100) / t.base[k]) / 100] : ['—', '—'])), t.partial, t.faulty];
  const rows = [[title], [displayName(project, lang)], [],
    [RACK_T.rack[lang], T.sum.total[lang], ...['pulled', 'hived', 'installed', 'checked'].flatMap((k) => [T.sum[k][lang], '']), T.sum.partial[lang], T.sum.faulty[lang]],
    ['', '', ...RACK_STAGES.flatMap(() => [RACK_T.count[lang], '%']), '', '']];
  const first = rows.length;
  tallies.forEach((tl) => rows.push(rowOf(tl)));
  const widths = [110, 95, ...RACK_STAGES.flatMap(() => [70, 60]), 110, 85];
  return { kind: 'racks', title, rtl: lang === 'he', rows, headerRow: 3, headerRows: [3, 5], rackRows: [first, rows.length - 1], totalRow: rows.length - 1, stageCols: [2, 4, 6, 8],
    cols: widths.map((w, i) => ({ id: `rack${i}`, kind: i === 0 ? 'text' : 'num', width: w })), rules: [], summaryRows: [], rowColors: [], count: items.length,
    stamp: { row: 1, col: 4, text: stampText(now, lang) }, frozenRows: 5, frozenCols: 1 };
}

// Returns { title, sheets, hash, pointCount, colCount } for writing to a Google Sheet; `now` is the moment of the refresh (the update stamp)
export function buildReport(project, ctx, table, { nameOf, now = new Date() } = {}) {
  const lang = table.lang === 'ru' ? 'ru' : 'he';
  const cols = (table.columns || []).map((id) => colById.get(id)).filter(Boolean);
  if (!cols.length) throw new Error('В таблице не выбран ни один столбец');
  const items = pointsFor(project, ctx, table, nameOf);
  const withRacks = table.rackSheet !== false;
  let sheets;
  if (table.layout === 'perCabinet' && items.length) {
    const groups = new Map();
    items.forEach((it) => { const k = it.point.cabinet || NO_CABINET; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); });
    const used = new Set(withRacks ? [rackSheetName(lang).toLowerCase()] : []); // the rack sheet keeps its name, a rack sheet of the same name gets « (2)»
    sheets = [...groups.entries()].sort(([x], [y]) => (x === NO_CABINET) - (y === NO_CABINET)).map(([k, list]) => {
      let name = safeSheet(k === NO_CABINET ? T.noCabinet[lang] : k); let i = 2; const base = name;
      while (used.has(name.toLowerCase())) { name = `${base} (${i})`; i += 1; }
      used.add(name.toLowerCase());
      return sheetOf(name, list, project, ctx, table, cols, nameOf, now);
    });
  } else sheets = [sheetOf(lang === 'he' ? 'סטטוס' : 'Статус', items, project, ctx, table, cols, nameOf, now)];
  if (withRacks) sheets.push(rackSheetOf(rackSheetName(lang), items, project, ctx, table, now)); // the last sheet; being in `sheets` it is in the hash
  const title = fileTitle(project, table);
  return { title, sheets, pointCount: items.length, colCount: cols.length, hash: hashOf([STYLE_V, title, lang, sheets.map((x) => [x.title, x.rtl, x.rows, x.cols.map((c) => c.id), x.rowColors])]) };
}
