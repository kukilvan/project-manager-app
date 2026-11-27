// Backup copy outside GitHub: zips the newest auto-backup folder and uploads it to the owner's Google Drive.
// The GitHub Actions step after the Firestore backup; the upload itself is drive-backup-lib.mjs (shared with the NAS job runner, which zips without the command).
// Run: FIREBASE_SERVICE_ACCOUNT='{...}' node scripts/server-drive-backup.mjs <folder with backups>
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { GoogleAuth } from 'google-auth-library';
import { DRIVE_FILE_NAME, newestBackup, uploadDriveBackup } from './drive-backup-lib.mjs';

const root = process.argv[2];
const key = process.env.FIREBASE_SERVICE_ACCOUNT;
const fail = (m) => { console.log(`::error::Копия на Диск не сделана: ${m}`); process.exit(1); };
if (!root || !key) fail('нет папки копий или ключа FIREBASE_SERVICE_ACCOUNT');

const last = newestBackup(root); if (!last) fail('нет ни одной папки копии');
const zip = path.join(process.env.RUNNER_TEMP || '/tmp', `backup-${last}.zip`);
execFileSync('zip', ['-qr', zip, last], { cwd: root });
const bytes = fs.readFileSync(zip);

const auth = new GoogleAuth({ credentials: JSON.parse(key), scopes: ['https://www.googleapis.com/auth/drive'] });
const token = await auth.getAccessToken();
try { await uploadDriveBackup({ token, bytes, folder: last }); } catch (e) { fail(e.message); }
console.log(`::notice::Копия ${last} (${Math.round(bytes.length / 1024)} КБ) сохранена на Google Диск: «${DRIVE_FILE_NAME}»`);
