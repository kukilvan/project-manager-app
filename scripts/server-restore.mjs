// Restores a database from a server backup (a folder like 2026-10-23_0830 from the polevoy-backups repo) into an EMPTY Firebase project.
// Needed if the old Firebase project is lost, and as the way back from the NAS: a PocketBase export («"source": "pocketbase"») gets Firebase uids by e-mail and
// the server time in `updatedAtServer` (spec 4 § 6, R-MOVE-2). Rolling back one project is done in the app («Импорт данных»). Talks to Firestore and
// Firebase Authentication through firebase-admin; the logic is runFirestoreRestore of server-backup-lib.mjs (checked by tests/pb-restore.test.js).
// Run:
//   npm i --no-save firebase-admin@13
//   FIREBASE_SERVICE_ACCOUNT="$(cat key.json)" node scripts/server-restore.mjs <backup folder>          — only show what would be written
//   FIREBASE_SERVICE_ACCOUNT="$(cat key.json)" node scripts/server-restore.mjs <backup folder> --write  — write it (--force: also into a database with projects)
import admin from 'firebase-admin';
import { runFirestoreRestore } from './server-backup-lib.mjs';

const dir = process.argv[2]; const write = process.argv.includes('--write'); const force = process.argv.includes('--force');
if (!dir) { console.error('Укажите папку копии'); process.exit(1); }
const key = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!key) { console.error('Нет FIREBASE_SERVICE_ACCOUNT (содержимое JSON-ключа сервисного аккаунта)'); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(key)) });

process.exitCode = await runFirestoreRestore({
  db: admin.firestore(), auth: admin.auth(), Timestamp: admin.firestore.Timestamp,
  serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),
}, dir, { write, force });
