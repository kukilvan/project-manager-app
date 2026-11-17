// Starter set for the open edition: a copy of the shared pool (types, devices, cables, works, door configurations, shared lists) without service fields.
// Reads the pool from Firestore through firebase-admin; meant to be run by hand, and the result is committed to src/data/starter-pool.json (the weekly workflow uses starter-from-backup.mjs instead).
import fs from 'node:fs';
import admin from 'firebase-admin';
process.on('uncaughtException', (e) => { console.log(`::error::${String(e?.stack || e).replace(/\n/g, ' | ').slice(0, 900)}`); process.exit(1); });
process.on('unhandledRejection', (e) => { console.log(`::error::${String(e?.stack || e).replace(/\n/g, ' | ').slice(0, 900)}`); process.exit(1); });

const key = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!key) { console.error('Нет FIREBASE_SERVICE_ACCOUNT'); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(key)) });
const db = admin.firestore();
const DROP = /^(createdBy|createdByName|createdAt|updatedBy|updatedByName|updatedAt|updatedAtServer|owner|addedBy|addedByName|projectId)$/;
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !DROP.test(k)));
const out = { format: 'polevoy-starter-pool-1', createdAt: new Date().toISOString(), pool: {} };
for (const kind of ['types', 'devices', 'cables', 'catalog', 'doorcfg', 'delayReasons', 'culprits', 'problems']) {
  const snap = await db.collection(`pool_${kind}`).get();
  out.pool[kind] = snap.docs.map((d) => ({ id: d.id, ...clean(d.data()) })).filter((x) => !x.deleted).sort((a, b) => String(a.id).localeCompare(String(b.id)));
}
const text = JSON.stringify(out, null, 1);
if (/@gmail\.com|@[a-z0-9-]+\.[a-z]{2,}/i.test(text)) console.log('::warning::В наборе встречается почта — проверьте файл');
fs.writeFileSync(process.argv[2] || 'src/data/starter-pool.json', text);
console.log(`::notice::Стартовый набор: ${Object.entries(out.pool).map(([k, v]) => `${k} ${v.length}`).join(', ')}`);
