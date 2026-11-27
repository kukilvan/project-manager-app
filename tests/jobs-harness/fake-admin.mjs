// firebase-admin for the job-script harness: a fake Firestore loaded from the flat JSON in FAKE_DB_IN, written back to FAKE_DB_OUT when the script exits.
import fs from 'node:fs';
import { createFakeFirestore, fakeAdmin, treeOf } from '../fake-firestore.js';
const db = createFakeFirestore(treeOf(JSON.parse(fs.readFileSync(process.env.FAKE_DB_IN, 'utf8'))));
process.on('exit', () => fs.writeFileSync(process.env.FAKE_DB_OUT, JSON.stringify(db.dump(), null, 1)));
export default fakeAdmin(db);
