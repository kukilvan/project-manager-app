// Server backup run by GitHub Actions every 2 days: copies all projects from Firestore into a folder that the workflow then commits to the private backup repo.
// Talks to Firestore through firebase-admin and uses server-backup-lib.mjs.
// Run: FIREBASE_SERVICE_ACCOUNT='{...}' node scripts/server-backup.mjs <backup-folder>
import fs from 'node:fs';
import path from 'node:path';
import admin from 'firebase-admin';
import { isDeleted, readProject, readProjectDelta, previousBackups, writeProjectBackup, pruneOld, stamp, readCommon, sharedOf, COMMON_FILE } from './server-backup-lib.mjs';

const KEEP = 15;
const root = process.argv[2];
if (!root) { console.error('Укажите папку для копий'); process.exit(1); }
const key = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!key) { console.error('Нет секрета FIREBASE_SERVICE_ACCOUNT'); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(key)) });
const db = admin.firestore();
const now = new Date();
const dir = path.join(root, stamp(now));
fs.mkdirSync(dir, { recursive: true });

// errors and the summary go out as GitHub annotations (visible in the run summary without downloading the log)
const fail = (e) => { console.log(`::error::Копия не сделана: ${String(e?.stack || e).replace(/\n/g, ' | ').slice(0, 900)}`); process.exit(1); };
try {
  const refs = await db.collection('projects').listDocuments();
  if (!refs.length) { console.error('В базе нет проектов: копия не создана'); process.exit(1); }
  const done = []; let reads = 0;
  // the shared pool, the allowed e-mails and personal settings (the dictionary, what was learned from drawings): a new database cannot be restored without them.
  // Read first: the «для импорта» copies take the shared lists (delay reasons, culprits, problems) from it
  const common = await readCommon(db);
  const shared = sharedOf(common);
  const prevs = previousBackups(root);
  const WEEK = 7 * 864e5; const full = process.env.FULL === '1';
  for (const ref of refs) {
    const prev = prevs.get(ref.id);
    const prevAt = prev ? Date.parse(prev.createdAt) : 0; const fullAt = prev ? Date.parse(prev.fullAt || prev.createdAt) : 0;
    let p;
    if (!full && prev && now - fullAt < WEEK) { p = await readProjectDelta(ref, prev, prevAt - 30 * 60e3, admin.firestore.Timestamp); p.fullAt = new Date(fullAt).toISOString(); }
    else { p = await readProject(ref); p.reads = Object.values(p.data).reduce((n, v) => n + v.length, 1); }
    reads += p.reads;
    if (isDeleted(p.project)) { console.log(`Пропущен удалённый проект: ${p.project.name}`); continue; }
    done.push(writeProjectBackup(dir, p, now, shared));
    // a mark in the project so the app can show the date of the last auto-backup
    await ref.set({ serverBackupAt: now.toISOString() }, { merge: true });
  }
  const commonCount = Object.values(common.collections).reduce((n, v) => n + v.length, 0) + common.prefs.length;
  reads += commonCount;
  fs.writeFileSync(path.join(dir, COMMON_FILE), JSON.stringify({ ...common, createdAt: now.toISOString() }));
  console.log(`::notice::Общее: ${Object.entries(common.collections).map(([k, v]) => `${k} ${v.length}`).join(', ')}, настройки ${common.prefs.length}`);
  fs.writeFileSync(path.join(dir, 'ИТОГ.json'), JSON.stringify({ at: now.toISOString(), projects: done }, null, 2));
  const dropped = pruneOld(root, KEEP);
  console.log(`::notice::Скопировано проектов: ${done.length}. Прочитано документов из базы: ${reads}. Удалено старых копий: ${dropped.length}.`);
  done.forEach((d) => console.log(`::notice::${d.name}: ${Object.entries(d.counts).map(([k, v]) => `${k} ${v}`).join(', ')}`));
} catch (e) { fail(e); }
