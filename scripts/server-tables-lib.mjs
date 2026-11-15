// Server-side logic of the nightly auto-update of the management sheets, the rack table and the «PDF с номерами» drawings (GitHub Actions).
// It makes no network calls itself: Drive and Sheets go through the `api` object, so tests can check it. Called by server-tables.mjs; uses src/domain, src/app/managers.js, src/app/racktablecore.js and src/tohnit/numbered.js.
import { buildContext, tablesOf, numberedInput, numberedHash } from '../src/domain/index.js';
import { numberedPdf } from '../src/tohnit/numbered.js';
import { syncTable } from '../src/app/managers.js';
import { syncRackTable, rackAuto } from '../src/app/racktablecore.js';
import { isDeleted } from './server-backup-lib.mjs';

const memberKey = (email) => String(email).toLowerCase().replace(/\./g, '_');
// The author's name by uid (as in the app): the member's name or their e-mail
export function nameByUid(p, uid) {
  if (!uid) return '';
  const i = (p.memberUids || []).indexOf(uid);
  const email = i >= 0 ? (p.memberEmails || [])[i] : (p.removedMembers || {})[uid];
  return email ? (p.memberNames?.[memberKey(email)] || email) : '';
}

// Which tables to update at night: those with a file and the checkbox on (the main one is on by default)
export const autoTables = (project) => tablesOf(project).filter((t) => t.fileId && (t.auto === undefined ? !!t.main : t.auto));

// Updates the tables of one project. Returns { patches: {tableId: fields}, report: [lines] }
export async function updateProjectTables(api, project, data, now = new Date()) {
  const ctx = buildContext({ ...data, projects: [project] });
  const patches = {}; const report = [];
  for (const table of autoTables(project)) {
    try {
      const r = await syncTable(api, project, ctx, table, { uid: '__server', nameOf: (u) => nameByUid(project, u), noCreate: true });
      const { by, ...rest } = r.patch; void by;
      patches[table.id] = { ...rest, serverAt: now.toISOString(), serverError: '' };
      report.push(`${table.name}: ${r.changed ? `обновлена (точек ${r.rep.pointCount})` : 'без изменений'}`);
    } catch (e) {
      patches[table.id] = { serverAt: now.toISOString(), serverError: String(e.message || e).slice(0, 300) };
      report.push(`${table.name}: ОШИБКА ${e.message}`);
    }
  }
  return { patches, report };
}

// The racks and labels table for management: updated when something changed. → { patch|null, report }
export async function updateProjectRackTable(api, project, data, now = new Date()) {
  if (!rackAuto(project)) return { patch: null, report: [] };
  const ctx = buildContext({ ...data, projects: [project] });
  try {
    const r = await syncRackTable(api, project, ctx, { uid: '__server', noCreate: true });
    const { by, ...rest } = r.patch; void by;
    return { patch: { ...rest, serverAt: now.toISOString(), serverError: '' }, report: [`шкафы и шильют: ${r.changed ? 'обновлена' : 'без изменений'}`] };
  } catch (e) {
    return { patch: { serverAt: now.toISOString(), serverError: String(e.message || e).slice(0, 300) }, report: [`шкафы и шильют: ОШИБКА ${e.message}`] };
  }
}

// «PDF с номерами» on Drive: the drawings the app has already uploaded (numberedFileId) and shared with the server.
// Rebuilt only when something changed (a fingerprint). api: download(fileId) → bytes, upload(fileId, bytes)
export async function updateProjectNumbered(api, mupdf, project, data, now = new Date()) {
  const ctx = buildContext({ ...data, projects: [project] });
  const icons = project.typeIcons || {}; const patches = {}; const mgrPatches = {}; const report = [];
  const typeNames = Object.fromEntries([...ctx.types.values()].map((t) => [t.id, t.nameHe || t.id]));
  const updated = now.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' });
  const srcCache = new Map(); const src = async (id) => { if (!srcCache.has(id)) srcCache.set(id, await api.download(id)); return srcCache.get(id); };
  // your «Чертежи с номерами» and the copies in the folder «Для руководства» (own title, legend language)
  const jobs = [];
  for (const d of (project.drawings || []).filter((x) => !x.deleted && x.fileId)) {
    if (d.numberedFileId) jobs.push({ d, fileId: d.numberedFileId, old: d.numberedHash, title: d.title || d.name, lang: 'ru', what: 'PDF с номерами', put: (pt) => { patches[d.id] = pt.ok ? { numberedHash: pt.hash, numberedAt: pt.at, numberedError: '' } : { numberedError: pt.error, numberedTried: pt.at }; } });
    const md = project.managers?.drawings?.[d.id];
    if (md?.on && md.fileId) jobs.push({ d, fileId: md.fileId, old: md.hash, title: (md.name || '').trim() || (d.title || d.name).replace(/\.pdf$/i, ''), lang: md.lang || 'ru', what: 'для руководства', put: (pt) => { mgrPatches[d.id] = pt.ok ? { hash: pt.hash, at: pt.at, error: '' } : { error: pt.error }; } });
  }
  for (const j of jobs) {
    try {
      const input = numberedInput(ctx.points.values(), ctx, j.d);
      const hash = numberedHash(input, { ...j.d, title: j.title }, icons, j.lang);  // the same as in the app
      if (hash === j.old) { report.push(`${j.title} (${j.what}): без изменений`); continue; }
      const out = numberedPdf(mupdf, await src(j.d.fileId), input, { title: j.title, icons, hidden: j.d.hidden || [], lang: j.lang, typeNames, updated });
      await api.upload(j.fileId, out);
      j.put({ ok: true, hash, at: now.toISOString() });
      report.push(`${j.title} (${j.what}): обновлён (точек ${input.length})`);
    } catch (e) {
      j.put({ ok: false, error: String(e.message || e).slice(0, 300), at: now.toISOString() });
      report.push(`${j.title} (${j.what}): ОШИБКА — ${e.message}`);
    }
  }
  return { patches, mgrPatches, report };
}
export const applyManagerPatches = (project, patches) => { const m = project.managers || {}; const ds = { ...(m.drawings || {}) }; Object.entries(patches).forEach(([id, pt]) => { ds[id] = { ...(ds[id] || {}), ...pt }; }); return { ...m, drawings: ds }; };
export const applyDrawingPatches = (project, patches) => (project.drawings || []).map((d) => (patches[d.id] ? { ...d, ...patches[d.id] } : d));

// Applies the patches to the fresh version of the table list (the app may have changed it while the job ran)
export const applyPatches = (project, patches) => tablesOf(project).map((t) => (patches[t.id] ? { ...t, ...patches[t.id] } : t));

export { isDeleted };
