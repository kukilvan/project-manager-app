// Nightly server run (GitHub Actions) that refreshes the management sheets, the rack table and the «PDF с номерами» drawings of every active project.
// Talks to Firestore (firebase-admin), Google Drive and Sheets (REST with a service account) and MuPDF; the logic is in server-tables-lib.mjs.
// Run: FIREBASE_SERVICE_ACCOUNT='{...}' node scripts/server-tables.mjs
import admin from 'firebase-admin';
import { GoogleAuth } from 'google-auth-library';
import { readProject, isDeleted } from './server-backup-lib.mjs';
import { updateProjectTables, applyPatches, autoTables, updateProjectNumbered, applyDrawingPatches, applyManagerPatches, updateProjectRackTable } from './server-tables-lib.mjs';

const note = (m, e) => console.log(`::error::${m}: ${String(e?.stack || e).replace(/\n/g, ' | ').slice(0, 900)}`);
process.on('uncaughtException', (e) => { note('Необработанная ошибка', e); process.exit(1); });
process.on('unhandledRejection', (e) => { note('Необработанный отказ', e); process.exit(1); });
const key = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!key) { console.error('Нет секрета FIREBASE_SERVICE_ACCOUNT'); process.exit(1); }
const cred = JSON.parse(key);
admin.initializeApp({ credential: admin.credential.cert(cred) });
const db = admin.firestore();
const auth = new GoogleAuth({ credentials: cred, scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'] });

const D = 'https://www.googleapis.com/drive/v3/files';
const S = 'https://sheets.googleapis.com/v4/spreadsheets';
async function call(method, url, body) {
  const token = (await auth.getAccessToken());
  const r = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!r.ok) { const e = new Error(json?.error?.message || `HTTP ${r.status}`); e.status = r.status; throw e; }
  return json;
}
const api = {
  async fileInfo(id) { try { const f = await call('GET', `${D}/${id}?fields=id,name,trashed`); return f.trashed ? null : f; } catch (e) { if (e.status === 404 || e.status === 403) return null; throw e; } },
  rename: (id, name) => call('PATCH', `${D}/${id}?fields=id`, { name }),
  sheetsOf: async (id) => (await call('GET', `${S}/${id}?fields=sheets.properties(sheetId,title,gridProperties)`)).sheets.map((x) => x.properties),
  batch: (id, requests) => call('POST', `${S}/${id}:batchUpdate`, { requests }),
  write: (id, data) => call('POST', `${S}/${id}/values:batchUpdate`, { valueInputOption: 'RAW', data }),
  // for «PDF с номерами»
  async download(id) { const token = await auth.getAccessToken(); const r = await fetch(`${D}/${id}?alt=media`, { headers: { Authorization: `Bearer ${token}` } }); if (!r.ok) throw new Error(`Чертёж не скачать: HTTP ${r.status} (откройте его серверу кнопкой «☁️ … на Диск» в плане)`); return new Uint8Array(await r.arrayBuffer()); },
  async upload(id, bytes) { const token = await auth.getAccessToken(); const r = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media&fields=id`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf' }, body: bytes }); if (!r.ok) throw new Error(`Не записать на Диск: HTTP ${r.status}`); },
};
let mupdf = null;

// building the tables does not need the change history (history), to-dos or notes: they are not read, to save the read quota
const NEED = ['points', 'days', 'entries', 'journal', 'catalog', 'types', 'cables', 'devices', 'configs', 'units', 'culprits', 'delayReasons', 'cabinetSettings'];
const now = new Date();
let failed = 0;
// errors are printed as GitHub annotations (visible in the run summary and through the API)
const fail = (m, e) => { console.log(`::error::${m}: ${String(e?.stack || e).replace(/\n/g, ' | ')}`); failed += 1; };
try {
// Whether to read the project at all: if nothing changed since the last successful update and there are no errors, skip it
// (one «anything changed» query per collection instead of reading every document). Every 3 days a full update runs, for reliability.
async function changedSince(ref, p) {
  const since = p.serverTablesAt ? Date.parse(p.serverTablesAt) : 0;
  if (process.env.FULL === '1' || !since || now - since > 3 * 864e5) return true;
  if (Number(p.updatedAt) > since - 60e3) return true;
  if ((p.tables || []).some((t) => t.serverError) || p.rackTable?.serverError || (p.drawings || []).some((d) => d.numberedError)) return true;
  if (Object.values(p.managers?.drawings || {}).some((m) => m?.error)) return true;
  const ts = admin.firestore.Timestamp.fromMillis(since - 30 * 60e3);
  for (const col of NEED) { if (!(await ref.collection(col).where('updatedAtServer', '>', ts).limit(1).get()).empty) return true; }
  return false;
}
for (const ref of await db.collection('projects').listDocuments()) {
  const head = (await ref.get()).data() || {};
  if (isDeleted(head) || head.archived) continue;
  if (!(await changedSince(ref, head))) { console.log(`  - ${head.name}: без изменений с прошлого раза — пропущен`); continue; }
  const { project, data } = await readProject(ref, NEED);
  if (isDeleted(project) || project.archived) continue; // archived projects are not updated
  // the server's address goes into the project: the app will share the table files with it
  await ref.set({ serverEmail: cred.client_email }, { merge: true });
  // «PDF с номерами» on Drive
  if ((project.drawings || []).some((d) => (d.numberedFileId || project.managers?.drawings?.[d.id]?.fileId) && !d.deleted)) {
    mupdf ??= await import('mupdf');
    const { patches, mgrPatches, report } = await updateProjectNumbered(api, mupdf, project, data, now);
    if (Object.keys(patches).length || Object.keys(mgrPatches).length) await db.runTransaction(async (tx) => { const fresh = { id: ref.id, ...(await tx.get(ref)).data() }; tx.set(ref, { drawings: applyDrawingPatches(fresh, patches), managers: applyManagerPatches(fresh, mgrPatches) }, { merge: true }); });
    report.forEach((l) => console.log(l.includes('ОШИБКА') ? `::warning::${project.name}: ${l}` : `  - ${l}`));
  }
  // the racks and labels table for management
  {
    const { patch, report } = await updateProjectRackTable(api, project, data, now);
    if (patch) await db.runTransaction(async (tx) => { const fresh = { id: ref.id, ...(await tx.get(ref)).data() }; tx.set(ref, { rackTable: { ...(fresh.rackTable || {}), ...patch } }, { merge: true }); });
    report.forEach((l) => console.log(l.includes('ОШИБКА') ? `::warning::${project.name}: ${l}` : `  - ${l}`));
  }
  if (!autoTables(project).length) { await ref.set({ serverTablesAt: now.toISOString() }, { merge: true }); console.log(`${project.name}: нет таблиц для автообновления`); continue; }
  const { patches, report } = await updateProjectTables(api, project, data, now);
  await db.runTransaction(async (tx) => {
    const fresh = { id: ref.id, ...(await tx.get(ref)).data() };
    tx.set(ref, { tables: applyPatches(fresh, patches) }, { merge: true });
  });
  await ref.set({ serverTablesAt: now.toISOString() }, { merge: true });
  console.log(`${project.name}:`);
  report.forEach((l) => console.log(l.includes('ОШИБКА') ? `::warning::${project.name}: ${l}` : `  - ${l}`));
}
} catch (e) { fail('Общий сбой', e); }
if (failed) console.log(`Проектов с ошибками: ${failed} (смотрите сообщения выше; в приложении тоже видно)`);

if (failed) process.exit(1);
