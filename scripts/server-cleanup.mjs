// Server cleanup: permanently deletes what has been marked deleted for over a year (records, whole projects) and change-history entries older than a year.
// Runs AFTER a successful backup — in the same GitHub Actions job on Firestore, in the NAS job runner on PocketBase (PM_SOURCE=pocketbase, spec 4 § 5.3).
// The source comes from job-source.mjs, the rules and the run from server-backup-lib.mjs (src/domain/sync.js). DRY_RUN=1 only shows what would be deleted.
import { openSource, SetupError } from './job-source.mjs';
import { runCleanup } from './server-backup-lib.mjs';

const MAX_PER_COLLECTION = 5000; // safety limit: at most this many documents of one collection per run
let source;
try { source = await openSource(); } catch (e) { if (e instanceof SetupError) { console.error(e.message); process.exit(1); } throw e; }
await runCleanup(source, { now: Date.now(), dry: process.env.DRY_RUN === '1', max: MAX_PER_COLLECTION });
