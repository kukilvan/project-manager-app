// Nightly server run that refreshes the management sheets, the rack table and the «PDF с номерами» drawings of every active project.
// GitHub Actions runs it on Firestore; the NAS job runner (nas-jobs.mjs, `tables`) makes the same run in its own process. Signs in to Google as the service
// account (Drive and Sheets: google-api.mjs) and loads MuPDF; the source comes from job-source.mjs, the run is runTables of server-tables-lib.mjs.
// The shared lists the sheets need (pool_delayReasons, pool_problems) are read once per run and passed to every project.
// Run: FIREBASE_SERVICE_ACCOUNT='{...}' node scripts/server-tables.mjs   (FULL=1 — update every project, changed or not)
import { GoogleAuth } from 'google-auth-library';
import { openSource, googleCredentials, SetupError } from './job-source.mjs';
import { createTablesApi, TABLES_SCOPES } from './google-api.mjs';
import { runTables } from './server-tables-lib.mjs';

const note = (m, e) => console.log(`::error::${m}: ${String(e?.stack || e).replace(/\n/g, ' | ').slice(0, 900)}`);
process.on('uncaughtException', (e) => { note('Необработанная ошибка', e); process.exit(1); });
process.on('unhandledRejection', (e) => { note('Необработанный отказ', e); process.exit(1); });
let source; let cred;
try { cred = googleCredentials(); source = await openSource(); } catch (e) { if (e instanceof SetupError) { console.error(e.message); process.exit(1); } throw e; }
const api = createTablesApi(new GoogleAuth({ credentials: cred, scopes: TABLES_SCOPES }));

const failed = await runTables(source, api, { now: new Date(), full: process.env.FULL === '1', serverEmail: cred.client_email, loadMupdf: () => import('mupdf') });
if (failed) console.log(`Проектов с ошибками: ${failed} (смотрите сообщения выше; в приложении тоже видно)`);

if (failed) process.exit(1);
