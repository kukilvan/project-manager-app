// One-off import of a project's data from a polevoy-import-1 file (prepared from the AppSheet table) and its screen (opened by shell.js).
// Writes through repo.save and repo.saveProject; replaced records go to «deleted», so they can be restored from the history.
// Shared lists of the file (delay reasons, culprits, problems) go to the pool through repo.savePool, only what the pool lacks (sharedImportOps of src/domain).
import { h, confirmDialog, toast } from '../ui.js';
import { state, getRepo, currentProject } from '../store.js';
import { sharedImportOps } from '../../domain/index.js';

const COLLS = ['points', 'journal', 'days', 'entries', 'cabinetSettings', 'todos', 'notes', 'pulls', 'problemMarks'];
const REFS = ['catalog', 'types', 'cables', 'devices', 'configs', 'units'];

export function parseImport(text) {
  const data = JSON.parse(text);
  if (data.format !== 'polevoy-import-1') throw new Error('Это не файл импорта этого приложения');
  COLLS.forEach((c) => { if (!Array.isArray(data[c])) data[c] = []; });
  data.points.forEach((p) => { if (!p.id || !p.label || !p.typeId) throw new Error(`Некорректная точка: ${JSON.stringify(p).slice(0, 80)}`); });
  return data;
}

// replace: all current project data is marked deleted (it can be restored through the history), then the file's content is written
// cur: the project's current collections and the pool's shared lists (the store's by default)
export function runImport(repo, pid, data, { replace }, cur = { data: state.data, shared: state.shared }) {
  const now = Date.now();
  const incoming = new Set(COLLS.flatMap((c) => (data[c] || []).map((d) => `${c}/${d.id}`)));
  const ops = [];
  let removed = 0;
  if (replace) {
    COLLS.forEach((c) => (cur.data[c] || []).filter((d) => !d.deleted && !incoming.has(`${c}/${d.id}`)).forEach((d) => {
      ops.push({ coll: c, id: d.id, action: 'delete', data: { deleted: true, deletedAt: now, deletedBy: repo.by.uid, deletedByName: repo.by.name } });
      removed += 1;
    }));
  }
  COLLS.forEach((c) => (data[c] || []).forEach((d) => ops.push({ coll: c, id: d.id, action: 'import', data: { ...d, deleted: false } })));
  // reference lists: only add the missing ones (nothing is overwritten or removed)
  REFS.forEach((c) => (data.reference?.[c] || []).forEach((d) => { if (d?.id && !(cur.data[c] || []).some((x) => x.id === d.id && !x.deleted)) ops.push({ coll: c, id: d.id, action: 'import', data: { ...d, deleted: false } }); }));
  repo.save(pid, ops);
  // shared lists: into the pool, only the items it does not have (deleted ones are not revived)
  const poolOps = sharedImportOps(data.reference, cur.shared);
  if (poolOps.length) repo.savePool(poolOps);
  if (data.project || data.projectData) {
    const pd = { ...(data.projectData || {}) };
    // links to Drive files are restored only into the same project the backup was made from
    if (data.backupOf !== pid) ['sheetLinks', 'tables', 'managers', 'rackTable', 'drawings'].forEach((k) => delete pd[k]);
    repo.saveProject(pid, { ...(data.project || {}), ...pd });
  }
  return { removed, added: ops.length - removed };
}

export function importView() {
  const p = currentProject();
  const out = h('div', { class: 'mut', style: { marginTop: '10px', whiteSpace: 'pre-wrap' } });
  const input = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
  input.addEventListener('change', async () => {
    const file = input.files?.[0]; if (!file) return;
    let data;
    try { data = parseImport(await file.text()); } catch (e) { out.textContent = `Не удалось прочитать файл: ${e.message}`; return; }
    const live = COLLS.reduce((n, c) => n + (state.data[c] || []).filter((d) => !d.deleted).length, 0);
    out.textContent = `В файле: проект «${data.project?.name || '—'}», точек ${data.points.length}, строк журнала ${data.journal.length}.\nСейчас в проекте «${p.name}» записей: ${live}.`;
    const go = h('button', { class: 'danger', onclick: async () => {
      if (!(await confirmDialog(`Заменить данные проекта «${p.name}»? Текущие точки, дни, записи и журнал будут убраны (их можно вернуть через «История и откат»), и загрузится содержимое файла.`, { yes: 'Заменить', danger: true }))) return;
      go.disabled = true; out.textContent = 'Загружаю…';
      const r = runImport(getRepo(), p.id, data, { replace: true });
      out.textContent = `Готово. Убрано старых записей: ${r.removed}, загружено: ${r.added}.\nДанные отправятся на сервер, как только будет интернет.`;
      toast('Импорт выполнен');
    } }, `Заменить данные проекта «${p.name}»`);
    out.append(h('div', { class: 'btns' }, go));
  });
  return h('div', {},
    h('div', { class: 'card' },
      h('b', {}, 'Импорт данных'),
      h('div', { class: 'mut', style: { margin: '6px 0' } }, 'Загрузка проекта из файла импорта. Выберите файл .json (он сохранён у вас в «Файлах»). Справочники не меняются.'),
      h('div', { class: 'btns' }, h('button', { onclick: () => input.click() }, '📥 Выбрать файл'), input),
      out));
}
