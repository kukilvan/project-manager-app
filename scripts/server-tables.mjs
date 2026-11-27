// Nightly server run that refreshes the management sheets, the rack table and the «PDF с номерами» drawings of every active project.
// GitHub Actions runs it on Firestore, the NAS job runner on PocketBase (PM_SOURCE=pocketbase, spec 4 § 5.2). Talks to Google Drive and Sheets (REST with a service account)
// and MuPDF; the source comes from job-source.mjs, the run is runTables of server-tables-lib.mjs.
// The shared lists the sheets need (pool_delayReasons, pool_problems) are read once per run and passed to every project.
// Run: FIREBASE_SERVICE_ACCOUNT='{...}' node scripts/server-tables.mjs   (FULL=1 — update every project, changed or not)
import { GoogleAuth } from 'google-auth-library';
import { openSource, googleCredentials, SetupError } from './job-source.mjs';
import { runTables } from './server-tables-lib.mjs';

const note = (m, e) => console.log(`::error::${m}: ${String(e?.stack || e).replace(/\n/g, ' | ').slice(0, 900)}`);
process.on('uncaughtException', (e) => { note('Необработанная ошибка', e); process.exit(1); });
process.on('unhandledRejection', (e) => { note('Необработанный отказ', e); process.exit(1); });
let source; let cred;
try { cred = googleCredentials(); source = await openSource(); } catch (e) { if (e instanceof SetupError) { console.error(e.message); process.exit(1); } throw e; }
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

const failed = await runTables(source, api, { now: new Date(), full: process.env.FULL === '1', serverEmail: cred.client_email, loadMupdf: () => import('mupdf') });
if (failed) console.log(`Проектов с ошибками: ${failed} (смотрите сообщения выше; в приложении тоже видно)`);

if (failed) process.exit(1);
