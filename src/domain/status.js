// Point statuses, installation and completeness (sections 3.1–3.3, Appendix A): pointInfo and the cable helpers around it.
// Built on points.js and compose.js; used by the report, plan, rack and remaining modules.
import { cableOf, cablesCountOf, metrageOf, cableListOf } from './points.js';
import { compositionOf, composedInfo, composedCables as composedCablesOf, doneByPorts, workFits, STAGES } from './compose.js';

// Door types (they pick a door configuration): the «Дверь» type and every type of the «Дверь» group
export const usesConfig = (type) => !!type && (type.id === 'Дверь' || type.group === 'Дверь');

// The point's cables as a whole [{ cable, count }]: its own (cableOverride) or by type/devices/rack setting
export function effectiveCablesOf(point, ctx) {
  return compositionOf(point, ctx) ? composedCablesOf(point, ctx) : cableListOf(point, ctx);
}
// Default cables for a type (what a new point of this type in this rack would get)
export const typeCablesOf = (ctx, typeId, cabinet = '', projectId) => effectiveCablesOf({ typeId, cabinet, projectId }, ctx);
// What to write into the point: null — as the type has it, otherwise its own list
export function cableOverrideFor(list, ctx, typeId, cabinet, projectId) {
  const norm = (l) => JSON.stringify((l || []).filter((c) => c.cable && c.count > 0).map((c) => [c.cable, Number(c.count)]));
  return norm(list) === norm(typeCablesOf(ctx, typeId, cabinet, projectId)) ? null : (list || []).filter((c) => c.cable && c.count > 0).map((c) => ({ cable: c.cable, count: Number(c.count) }));
}

const maxDate = (rows) => rows.reduce((m, r) => (r.date && (!m || r.date > m) ? r.date : m), '');

export function pointInfo(point, ctx) {
  const comp = compositionOf(point, ctx);
  if (comp) return composedInfo(point, ctx, comp); // a point made of devices
  const rows = ctx.journalByPoint.get(point.id) || [];
  const dateOf = (action) => maxDate(rows.filter((r) => r.action === action));
  // Pull by cable kind: a point is pulled when each of its cable kinds is pulled.
  // An entry without a cable (old data) counts for all kinds; a cable not in the point's list counts for the main one.
  const cableList = cableListOf(point, ctx); const kinds = cableList.map((c) => c.cable);
  const pullRows = rows.filter((r) => r.action === 'Протяжка');
  let pulled = ''; let pullDone = 0; const pullTotal = kinds.length; const pulledKinds = [];
  if (!kinds.length) pulled = maxDate(pullRows);
  else {
    const dates = kinds.map((k, i) => maxDate(pullRows.filter((r) => !r.cableId || r.cableId === k || (i === 0 && !kinds.includes(r.cableId)))));
    dates.forEach((d, i) => { if (d) { pullDone += 1; pulledKinds.push(kinds[i]); } });
    if (pullDone === pullTotal) pulled = dates.reduce((m, d) => (d > m ? d : m), '');
  }
  const hived = dateOf('Хивут');
  const checked = dateOf('Проверка');
  const shRows = rows.filter((r) => r.action === 'Шилют');
  const shilut = shRows.length && doneByPorts({ stage: 'Шилют' }, shRows, cableList) ? maxDate(shRows) : '';

  // Result of the latest check (on equal dates, the later row)
  const checks = rows.filter((r) => r.action === 'Проверка')
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.order - a.order));
  const checkResult = checks.length ? checks[0].result : undefined;

  const installedIds = [...new Set(rows.filter((r) => r.action === 'Установка').map((r) => r.workId))];
  const type = ctx.types.get(point.typeId);

  // Installation (old points): any «Установка» row in the journal
  const install = installedIds.length > 0 ? 'Установлено' : ''; const installDone = installedIds.length; const installTotal = installedIds.length;

  // Status: the first rule that fires, top to bottom
  let status;
  if (checkResult === 'Не работает') status = 'Неисправна';
  else if (checked) status = 'Проверена';
  else if (install === 'Установлено') status = 'Установлена';
  else if (install) status = install;
  else if (hived) status = 'Захивучена';
  else if (pulled) status = 'Протянута';
  else if (pullDone) status = `Протянуто ${pullDone}/${pullTotal}`;
  else if (point.length !== undefined && point.length !== null && point.length !== '') status = 'Посчитана';
  else status = 'Новая';

  // Hebrew status and «installed» for the managers' sheet (section 5.1)
  const statusHe = checkResult === 'Не работает' ? 'תקלה' : checked ? 'נבדק' : install === 'Установлено' ? 'הותקן'
    : hived ? 'חווט' : pulled ? 'נמשך' : pullDone ? `נמשך חלקית ${pullDone}/${pullTotal}` : 'טרם נמשך';
  const installHe = install === 'Установлено' ? 'הותקן' : install ? `הותקן חלקית ${installDone}/${installTotal}` : '';

  return {
    pulled, pullDone, pullTotal, pulledKinds, cableList, hived, checked, shilut, checkResult, installedIds, install, installHe, status, statusHe,
    cable: cableOf(point, ctx), cables: cablesCountOf(point, ctx), metrage: metrageOf(point, ctx),
  };
}

/**
 * Whether the point is waiting for this work: it fits the point by composition/type AND is not done yet.
 * Re-pulling and moving are always allowed; «Проверка» again if the point is «Не работает»; «Время», «Доп. работа» — no tasks.
 * infoFn — the point status function (in the app, the cached infoOf).
 */
export function workApplicable(point, ctx, work, infoFn = pointInfo) {
  if (!work || work.active === false || !workFits(point, ctx, work)) return false;
  if (['Перетяжка', 'Перенос'].includes(work.workType)) return true;
  const info = infoFn(point, ctx);
  if (info.composed) {
    if (!STAGES.includes(work.workType)) return true;   // free work (extra work etc.) — the point has no tasks
    const mine = info.tasks.filter((t) => (work.workType === 'Протяжка' ? t.stage === 'Протяжка' : t.workId === work.id));
    if (!mine.length) return false;                      // the point's composition has no such work
    if (work.workType === 'Проверка' && info.checkResult === 'Не работает') return true;
    return mine.some((t) => !t.done);
  }
  switch (work.workType) {
    case 'Протяжка': return !info.pulled;
    case 'Хивут': return work.id === 'HIV_DEV' || !info.hived;
    case 'Установка': return !info.installedIds.includes(work.id);
    case 'Проверка': return !info.checked || info.checkResult === 'Не работает';
    case 'Шилют': return !info.shilut;
    default: return true;
  }
}
