// The «תכנון ארונות ושילוט» management sheet (rack plans + labels): the part shared by the app and the night server job.
// The file lives in the project's «Для руководства» Drive folder. Settings are kept in project.rackTable:
// { mode, mergeColors, cabs, auto, prefs: { models, colors } (copy of the author's personal settings — the server needs it), fileId, link, by, hash, at, placedKind, sharedWith, serverAt, serverError }
// Builds the sheets with src/domain/shilutsheet.js and writes them through racksheet.js.
import { buildRackSheets } from '../domain/shilutsheet.js';
import { hashOf } from '../domain/managers.js';
import { rebuildRackSheets } from './racksheet.js';

export const RACK_TITLE = 'תכנון ארונות ושילוט';
const RACK_V = 2;  // sheet layout version: when it changes, every sheet is rebuilt

export const rackAuto = (project) => !!project?.rackTable?.fileId && project.rackTable.auto !== false;

// Updates the rack sheet file. → { patch, changed, res }; patch — fields for project.rackTable
export async function syncRackTable(api, project, ctx, { force = false, uid = '', noCreate = false, shareWith = '', nameOf } = {}) {
  const rt = project.rackTable || {}; const prefs = rt.prefs || {};
  const res = buildRackSheets(project, ctx, [...ctx.points.values()], { mode: rt.mode || 'fill', mergeColors: !!rt.mergeColors, cabs: rt.cabs?.length ? rt.cabs : null, colors: prefs.colors || [], models: prefs.models || [] });
  if (!res.count) throw new Error('Нет шкафов с планом: сначала постройте план в «🗄 Шкафы и шильют»');
  const patch = {};
  let file = rt.fileId ? await api.fileInfo(rt.fileId) : null;
  if (!file && noCreate) throw new Error('Сервер не видит файл таблицы шкафов: откройте её для сервера кнопкой «Обновить таблицу» в приложении');
  if (!file && rt.fileId && rt.by && uid && rt.by !== uid) { const who = nameOf?.(rt.by); throw new Error(`Таблицу шкафов создал${who ? ` ${who}` : ' другой участник проекта'}, у вас нет к ней доступа. Обновить её может только он.`); }
  if (!file) { file = await api.create(RACK_TITLE); if (uid) patch.by = uid; }
  patch.fileId = file.id; patch.link = `https://docs.google.com/spreadsheets/d/${file.id}/edit`;
  // the file goes into the «Для руководства» folder (once)
  if (api.placeIn && (rt.placedKind !== 'managers' || patch.by)) { try { await api.placeIn(file.id, project, 'managers'); patch.placedKind = 'managers'; } catch (e) { console.warn('placeIn', e); } }
  // share the file with the server (night auto-update)
  if (shareWith && api.share && rt.sharedWith !== shareWith) { try { await api.share(file.id, shareWith); patch.sharedWith = shareWith; } catch (e) { console.warn('share', e); } }
  const hash = hashOf([RACK_V, res.sheets.map((s) => [s.title, s.rtl, s.rows, s.fills, s.widths])]);
  let changed = false;
  try {
    if (force || hash !== rt.hash) { await rebuildRackSheets(api, file.id, res.sheets); patch.hash = hash; changed = true; }
    if (file.name !== RACK_TITLE) await api.rename(file.id, RACK_TITLE);
  } catch (e) { e.patch = patch; throw e; }   // the file is already created: remember it so the next attempt does not create more
  if (changed || !rt.at) patch.at = new Date().toISOString();
  return { patch, changed, res };
}
