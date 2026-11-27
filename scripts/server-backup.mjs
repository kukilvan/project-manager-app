// Server backup: copies all projects into a new folder that the caller then commits to the private backup repo.
// GitHub Actions runs it every 2 days on Firestore, the NAS job runner on PocketBase (PM_SOURCE=pocketbase, spec 4 § 5.2). The source comes from job-source.mjs, the run from server-backup-lib.mjs.
// Run: FIREBASE_SERVICE_ACCOUNT='{...}' node scripts/server-backup.mjs <backup-folder>   (FULL=1 — read everything, not only the changes)
import { openSource, SetupError } from './job-source.mjs';
import { runServerBackup } from './server-backup-lib.mjs';

const root = process.argv[2];
if (!root) { console.error('Укажите папку для копий'); process.exit(1); }

// errors and the summary go out as GitHub annotations (visible in the run summary without downloading the log)
const fail = (e) => { console.log(`::error::Копия не сделана: ${String(e?.stack || e).replace(/\n/g, ' | ').slice(0, 900)}`); process.exit(1); };
let source;
try { source = await openSource(); } catch (e) { if (e instanceof SetupError) { console.error(e.message); process.exit(1); } fail(e); }
try {
  await runServerBackup(source, root, { now: new Date(), full: process.env.FULL === '1' });
} catch (e) {
  if (e.code === 'no-projects') { console.error(e.message); process.exit(1); }
  fail(e);
}
