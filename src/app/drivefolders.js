// The app's folders on Google Drive: «Менеджер проектов» → the project folder → «Чертежи», «Резервные копии»; sheets go into the project folder.
// Folders are found by hidden marks (appProperties), so renaming a project creates no new folders — the folder is just renamed.
// `req(method, url, body?)` → JSON is any way of calling Drive with a token (google.js supplies it); used by drawings.js, backup.js and the sheets code.
const D = 'https://www.googleapis.com/drive/v3/files';
const FOLDER = 'application/vnd.google-apps.folder';
export const ROOT_NAME = 'Менеджер проектов';
export const KIND_NAMES = { drawings: 'Чертежи', backups: 'Резервные копии', numbered: 'Чертежи с номерами', managers: 'Для руководства', racks: 'Шкафы', manuals: 'Инструкции' };
const safe = (s) => String(s || 'Проект').replace(/[\\/:*?"<>|]/g, '_').trim() || 'Проект';
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function ensureFolder(req, { name, props, parent }) {
  const q = [`mimeType='${FOLDER}'`, 'trashed=false', ...Object.entries(props).map(([k, v]) => `appProperties has { key='${k}' and value='${esc(v)}' }`)].join(' and ');
  const f = (await req('GET', `${D}?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`)).files?.[0];
  if (f) { if (name && f.name !== name) { try { await req('PATCH', `${D}/${f.id}?fields=id`, { name }); } catch { /* harmless */ } } return f.id; }
  return (await req('POST', `${D}?fields=id`, { name, mimeType: FOLDER, appProperties: props, ...(parent ? { parents: [parent] } : {}) })).id;
}
const cache = new Map();
// Root folders are looked up / created strictly one at a time (while a lookup or creation is running): otherwise two parallel requests would each create their own «Менеджер проектов»
const rootLock = new Map();
const rootOnce = (req, key, mk) => {
  if (!rootLock.has(key)) { const p = mk(); rootLock.set(key, p); p.then(() => rootLock.delete(key), () => rootLock.delete(key)); }
  return rootLock.get(key);
};
export async function projectFolder(req, project, kind = '') {
  const key = `${project.id}|${kind}|${project.name}`;
  if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    const root = await rootOnce(req, 'root', () => ensureFolder(req, { name: ROOT_NAME, props: { pzRoot: '1' } }));
    const pf = await ensureFolder(req, { name: safe(project.name), props: { pzProject: project.id, pzKind: 'project' }, parent: root });
    return kind ? ensureFolder(req, { name: KIND_NAMES[kind] || kind, props: { pzProject: project.id, pzKind: kind }, parent: pf }) : pf;
  })();
  cache.set(key, p); p.catch(() => cache.delete(key));
  return p;
}
// Move a file into a folder (nothing if it is already there); Drive will not move someone else's file (created by another member) — then false
export async function moveInto(req, fileId, parent) {
  try {
    const f = await req('GET', `${D}/${fileId}?fields=parents,ownedByMe`);
    if ((f.parents || []).includes(parent)) return false;
    await req('PATCH', `${D}/${fileId}?addParents=${parent}&removeParents=${(f.parents || []).join(',')}&fields=id`, {});
    return true;
  } catch { return false; }
}
// Find files by name in the old folder (backups from before project folders existed)
export async function filesIn(req, folderName, nameStart) {
  const fq = `name='${esc(folderName)}' and mimeType='${FOLDER}' and trashed=false`;
  const folder = (await req('GET', `${D}?q=${encodeURIComponent(fq)}&fields=files(id)`)).files?.[0]; if (!folder) return [];
  const q = `'${folder.id}' in parents and trashed=false and name contains '${esc(nameStart)}'`;
  return (await req('GET', `${D}?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1000`)).files || [];
}

// The shared instructions folder «Менеджер проектов → Инструкции» (not tied to a project)
let manualsP = null;
export function manualsFolder(req) {
  if (!manualsP) {
    manualsP = (async () => {
      const root = await rootOnce(req, 'root', () => ensureFolder(req, { name: ROOT_NAME, props: { pzRoot: '1' } }));
      return ensureFolder(req, { name: KIND_NAMES.manuals, props: { pzKind: 'manuals' }, parent: root });
    })();
    manualsP.catch(() => { manualsP = null; });
  }
  return manualsP;
}
