// Backs a project up to Google Drive: one JSON file per project and day, in the format the «Импорт данных» screen reads (`polevoy-import-1`).
// Builds the file from the project and its collections and writes it through the Drive api object (drivefolders.js folders).
export const BACKUP_FOLDER = 'Полевой журнал — резервные копии';
const LIVE = (arr) => (arr || []).filter((d) => !d.deleted);
const IMPORTABLE = ['points', 'journal', 'days', 'entries', 'cabinetSettings', 'todos', 'notes', 'pulls'];
// Settings of the project itself (not collections): racks, labels, door pins, icons, the list of drawings
const PROJECT_KEYS = ['racks', 'shilut', 'doorPins', 'typeIcons', 'drawings', 'sheetLinks', 'tables', 'managers', 'rackTable'];
const REFERENCE = ['catalog', 'types', 'cables', 'devices', 'configs', 'units', 'culprits', 'delayReasons'];

export const backupCount = (data) => IMPORTABLE.reduce((n, c) => n + LIVE(data[c]).length, 0);

export function buildBackup(project, data, now = new Date()) {
  const out = {
    format: 'polevoy-import-1', backupOf: project.id, createdAt: now.toISOString(),
    project: { name: project.name, contractor: project.contractor, object: project.object, helper: project.helper, nameHe: project.nameHe,
      objectHe: project.objectHe, helperHe: project.helperHe, defaultConfigId: project.defaultConfigId, oneOff: !!project.oneOff, active: project.active !== false, note: project.note },
    reference: {}, projectData: {},
  };
  PROJECT_KEYS.forEach((k) => { if (project[k] !== undefined) out.projectData[k] = project[k]; });
  IMPORTABLE.forEach((c) => { out[c] = LIVE(data[c]); });
  REFERENCE.forEach((c) => { out.reference[c] = LIVE(data[c]); });
  return out;
}

export const backupName = (project, now = new Date()) =>
  `${String(project.name || 'проект').replace(/[\\/:*?"<>|]/g, '_')} ${now.toISOString().slice(0, 10)}.json`;

export async function runBackup(api, project, data, now = new Date()) {
  const folderId = api.projectFolder ? await api.projectFolder(project, 'backups') : await api.folder(BACKUP_FOLDER);
  const body = buildBackup(project, data, now);
  await api.putJson(folderId, backupName(project, now), JSON.stringify(body));
  const count = IMPORTABLE.reduce((n, c) => n + body[c].length, 0);
  return { patch: { backupAt: now.toISOString(), backupCount: count }, message: `Копия сохранена на Диск: ${backupName(project, now)} (записей: ${count})` };
}
