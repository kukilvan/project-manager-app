// Project drawings (PDF plans) for the plan in the app: a file on Google Drive plus a copy on the device, so the plan opens offline.
// The Drive file sits in the project's «Чертежи» folder (read access for project members), the copy in IndexedDB `pz-drawings`. The project keeps the list project.drawings:
// [{ id, name, floor, pages:[{w,h}], fileId?, size, addedAt, addedBy }]. A point is bound to a drawing by pos.sheet === name.
// Drive calls go through google.js tokens and drivefolders.js folders; manuals.js reuses the Drive helpers and the device cache.
import { getRepo, currentProject, state } from './store.js';
import { getToken, clearToken, useRedirect, storedTokenValid } from './google.js';
import { newId } from './repo.js';
import { isLocal } from '../edition.js';
import { projectFolder, moveInto } from './drivefolders.js';
import { warn } from '../log.js';

export const DRAWINGS_FOLDER = // the old folder (before project folders), used only to find earlier files
  'Полевой журнал — чертежи';
const mem = () => new URLSearchParams(location.search).get('mem');

// ---- copy on the device ----
const DB = 'pz-drawings'; const STORE = 'files';
function idb() {
  return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function tx(mode, fn) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction(STORE, mode); const req = fn(t.objectStore(STORE)); t.oncomplete = () => res(req?.result); t.onerror = () => rej(t.error); }); }
export const cacheGet = (id) => tx('readonly', (s) => s.get(id)).catch(() => null);
export const cachePut = (id, buf) => tx('readwrite', (s) => s.put(buf, id)).catch(() => null);

// the order is the `order` field (set in «✏️ Названия и порядок»); without it — in the order of adding
export const drawingsOf = (p = currentProject()) => (p?.drawings || []).filter((d) => !d.deleted).map((d, i) => [d, i]).sort((a, b) => (a[0].order ?? 1e6 + a[1]) - (b[0].order ?? 1e6 + b[1])).map(([d]) => d);
// the name for a person: its own (title) or the file name; the file name (name) stays for linking points and finding duplicates
export const drawingTitle = (d) => (d?.title || d?.name || '');
export const drawingFor = (point, p = currentProject()) => (point?.pos?.sheet ? drawingsOf(p).find((d) => d.name === point.pos.sheet || (d.aliases || []).includes(point.pos.sheet)) : null);

// ---- Google Drive ----
async function drive(method, url, { body, headers = {}, raw = false } = {}, retried = false) {
  const token = await getToken('drawing');
  const r = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, ...headers }, body });
  if (r.status === 401 && !retried) { clearToken(); return drive(method, url, { body, headers, raw }, true); }
  if (!r.ok) { let m = `HTTP ${r.status}`; try { m = (await r.json()).error?.message || m; } catch { /* ok */ } const e = new Error(m); e.status = r.status; throw e; }
  return raw ? r : r.json();
}
const D = 'https://www.googleapis.com/drive/v3/files';
// Uploading a big file in parts is not needed: a resumable upload in one piece (up to hundreds of MB)
const dreq = (method, url, body) => drive(method, url, body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {});
export { drive as driveCall, dreq };
const qEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
async function uploadPdf(name, buf, p = currentProject()) {
  const parent = await projectFolder(dreq, p, 'drawings');
  // such a file is already in the project folder — replace its content instead of creating a copy
  const old = (await drive('GET', `${D}?q=${encodeURIComponent(`name='${qEsc(name)}' and '${parent}' in parents and trashed=false`)}&fields=files(id)`)).files?.[0];
  const init = await drive(old ? 'PATCH' : 'POST', `https://www.googleapis.com/upload/drive/v3/files${old ? `/${old.id}` : ''}?uploadType=resumable&fields=id`, {
    body: JSON.stringify(old ? {} : { name, parents: [parent], mimeType: 'application/pdf' }), headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'application/pdf' }, raw: true });
  const loc = init.headers.get('Location'); if (!loc) throw new Error('Диск не дал адрес для загрузки');
  const r = await fetch(loc, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: buf });
  if (!r.ok) throw new Error(`Загрузка на Диск: HTTP ${r.status}`);
  return (await r.json()).id;
}
/** «PDF с номерами» to Drive: the project folder «Чертежи с номерами», one file per drawing — replaced with a fresh one each time */
export async function putNumbered(name, bytes, p = currentProject(), fileId = '', kind = 'numbered') {
  if (mem()) return null;
  if (useRedirect() && !storedTokenValid()) return null;  // iPhone without Google's permission — do not take the user off the page
  const parent = await projectFolder(dreq, p, kind);
  let old = null;
  if (fileId) { try { const f = await drive('GET', `${D}/${fileId}?fields=id,trashed`); if (!f.trashed) old = f; } catch { /* deleted — we will create a new one */ } }
  if (!old) {
    const q = encodeURIComponent(`name='${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' and '${parent}' in parents and trashed=false`);
    old = (await drive('GET', `${D}?q=${q}&fields=files(id)`)).files?.[0];
  }
  const init = await drive(old ? 'PATCH' : 'POST', `https://www.googleapis.com/upload/drive/v3/files${old ? `/${old.id}` : ''}?uploadType=resumable&fields=id`, {
    body: JSON.stringify(old ? {} : { name, parents: [parent], mimeType: 'application/pdf' }), headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'application/pdf' }, raw: true });
  const loc = init.headers.get('Location'); if (!loc) throw new Error('Диск не дал адрес для загрузки');
  const r = await fetch(loc, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: bytes });
  if (!r.ok) throw new Error(`Загрузка на Диск: HTTP ${r.status}`);
  const id = (await r.json()).id;
  if (!old) await shareDrawing(id, p);
  return id;
}
// Access for the server (the night update of «PDF с номерами»): role — reader for the source drawing, writer for the numbered file
export async function shareWithServer(fileId, email, role) {
  if (!fileId || !email || mem()) return;
  await drive('POST', `${D}/${fileId}/permissions?sendNotificationEmail=false&fields=id`, { body: JSON.stringify({ role, type: 'user', emailAddress: email }), headers: { 'Content-Type': 'application/json' } });
}
// «Reader» access for project members (no emails)
export async function shareDrawing(fileId, p = currentProject()) {
  const me = getRepo().user?.email?.toLowerCase();
  for (const email of (p.memberEmails || []).filter((e) => e && e.toLowerCase() !== me)) {
    try { await drive('POST', `${D}/${fileId}/permissions?sendNotificationEmail=false&fields=id`, { body: JSON.stringify({ role: 'reader', type: 'user', emailAddress: email }), headers: { 'Content-Type': 'application/json' } }); } catch { /* a member without a Google account — skip */ }
  }
}

/**
 * The only way to change the project's list of drawings. The freshest list is taken (including one just changed
 * on this phone) and the result is put into memory at once. Before, the «sent to Drive» write a few seconds after
 * adding a drawing took the list as it was BEFORE the addition, and the new drawing disappeared from the project.
 */
export function patchDrawings(pid, fn) {
  const p = state.projects.find((x) => x.id === pid); if (!p) return null;
  const list = fn([...(p.drawings || [])]);
  getRepo().saveProject(pid, { drawings: list });
  p.drawings = list;   // the next reads see the change at once, without waiting for the database's answer
  return list;
}

/** Save a drawing into the project: a copy on the device and the project entry at once, then to Drive (if that fails, it can be retried) */
export async function addDrawing(buf, { name, floor = '', pages = [], push = true, fileId = null }) {
  const p = currentProject(); const repo = getRepo();
  const old = drawingsOf(p).find((d) => d.name === name);
  const id = old?.id || `DR_${newId(6)}`;
  await cachePut(id, buf);
  // fileId — the drawing was taken from Google Drive: we do not upload a new copy
  const entry = { ...(old || {}), id, name, floor: floor || old?.floor || '', pages, size: buf.byteLength, addedAt: new Date().toISOString(), addedBy: repo.user?.email || '', fileId: fileId || old?.fileId || null };
  if (fileId && !mem()) shareDrawing(fileId, p).catch(() => {});
  patchDrawings(p.id, (list) => [...list.filter((d) => d.id !== id), entry]);
  // on iPhone the Google sign-in takes the user off the page — we will send it to Drive later (the «⬆ На Диск» button in the plan) if there is no access yet
  // on the device (no database) the drawing is kept in the phone, and goes to Drive only by the «⬆ На Диск» button
  if (!entry.fileId && push && !isLocal() && (!useRedirect() || storedTokenValid())) return pushDrawing(entry, buf);
  return entry;
}
/**
 * A new version of a drawing: the new drawing entry is placed in the list before the old one, the old one stays (titled «… (старая версия)»).
 * All in one write to the project (several writes in a row could overwrite each other).
 */
export async function addDrawingVersion(buf, oldD, fields) {
  const p = currentProject(); const repo = getRepo();
  const id = `DR_${newId(6)}`; await cachePut(id, buf);
  const entry = { id, size: buf.byteLength, addedAt: new Date().toISOString(), addedBy: repo.user?.email || '', fileId: null, ...fields };
  if (entry.fileId && !mem()) shareDrawing(entry.fileId, p).catch(() => {});
  const sorted = drawingsOf(currentProject()); const at = Math.max(0, sorted.findIndex((d) => d.id === oldD.id));
  const order = [...sorted.slice(0, at), entry, ...sorted.slice(at)];
  const oldTitle = /\(старая версия\)$/.test(drawingTitle(oldD)) ? oldD.title : `${drawingTitle(oldD).replace(/\.pdf$/i, '')} (старая версия)`;
  const pos = new Map(order.map((d, i) => [d.id, i]));
  patchDrawings(p.id, (list) => [...list.map((d) => (pos.has(d.id) ? { ...d, order: pos.get(d.id), ...(d.id === oldD.id ? { title: oldTitle } : {}) } : d)), { ...entry, order: pos.get(id) }]);
  if (!entry.fileId && !isLocal() && (!useRedirect() || storedTokenValid())) pushDrawing({ ...entry, order: pos.get(id) }, buf).catch((e) => warn('Новая версия чертежа: на Диск не отправилась', e.message));
  return { ...entry, order: pos.get(id) };
}

/** Send to Drive a drawing that is so far only on this device */
export async function pushDrawing(entry, buf = null, proj = currentProject()) {
  if (mem()) return entry;
  const data = buf || await cacheGet(entry.id); if (!data) throw new Error('Файла чертежа нет на этом устройстве');
  const fileId = await uploadPdf(entry.name, data, proj);
  await shareDrawing(fileId, proj);
  // the list as of the end of the upload (in those seconds a drawing could have been added to the project or others changed)
  patchDrawings(proj.id, (list) => list.map((d) => (d.id === entry.id ? { ...d, fileId } : d)));
  return { ...entry, fileId };
}
/** The drawing's PDF: from the device, otherwise from Drive (and save it on the device) */
export async function loadDrawing(entry) {
  const local = await cacheGet(entry.id); if (local) { loadDrawing.from = 'устройства'; return local; }
  loadDrawing.from = 'Диска';
  if (!entry.fileId) throw new Error('Чертёж загружен с другого устройства и ещё не отправлен на Диск — откройте его там и нажмите «⬆ На Диск»');
  const r = await drive('GET', `${D}/${entry.fileId}?alt=media`, { raw: true });
  const buf = await r.arrayBuffer();
  // the copy on the device: if it was not written the first time (the phone may refuse), try once more — otherwise the drawing would be downloaded from Drive on every opening
  if ((await cachePut(entry.id, buf)) === null && (await cachePut(entry.id, buf)) === null) warn('Чертёж не записался на устройство', entry.name);
  return buf;
}
export function removeDrawing(entry) {
  patchDrawings(currentProject().id, (list) => list.filter((d) => d.id !== entry.id));
}

/** Change a drawing's entry in the project (patch — an object or a function of the old entry) */
export function updateDrawing(id, patch) {
  patchDrawings(currentProject().id, (list) => list.map((d) => (d.id === id ? { ...d, ...(typeof patch === 'function' ? patch(d) : patch) } : d)));
}
// Labels on a drawing that are not linked to the project's points («Не размеченые») and hidden by a person — are stored in the drawing's entry
export const posKey = (pos) => `${pos.page || 0}|${Math.round(pos.x)}|${Math.round(pos.y)}`;

/** Move the project's drawing files into the project folder on Drive (own files; Drive will not move others') */
export async function placeDrawings(p = currentProject()) {
  const list = drawingsOf(p).filter((d) => d.fileId); if (!list.length) return 0;
  const parent = await projectFolder(dreq, p, 'drawings'); let n = 0;
  for (const d of list) if (await moveInto(dreq, d.fileId, parent)) n++;
  return n;
}

/** PDF drawings already on Google Drive in the «Чертежи» folders of the app's projects: [{ id, name, project }] */
export async function listDrivePdfs() {
  if (mem()) return [];
  const fq = `mimeType='application/vnd.google-apps.folder' and trashed=false and appProperties has { key='pzKind' and value='drawings' }`;
  const folders = (await drive('GET', `${D}?q=${encodeURIComponent(fq)}&fields=files(id,parents)&pageSize=100`)).files || [];
  const out = [];
  for (const f of folders) {
    let project = '';
    try { const par = f.parents?.[0]; if (par) project = (await drive('GET', `${D}/${par}?fields=name`)).name || ''; } catch { /* ok */ }
    const q = `'${f.id}' in parents and trashed=false and mimeType='application/pdf'`;
    ((await drive('GET', `${D}?q=${encodeURIComponent(q)}&fields=files(id,name,size,modifiedTime)&pageSize=200`)).files || []).forEach((x) => out.push({ ...x, project }));
  }
  return out.sort((a, b) => a.project.localeCompare(b.project, 'ru') || a.name.localeCompare(b.name, 'ru', { numeric: true }));
}
/** Download a file from Drive */
export async function downloadDriveFile(id) { const r = await drive('GET', `${D}/${id}?alt=media`, { raw: true }); return r.arrayBuffer(); }
