// The Firestore job source: today's reads and writes of the server jobs (backup, cleanup, night sheets) behind the source interface that
// scripts/pb-source.mjs also implements (spec 4 § 5.2). The only module of the jobs that imports firebase-admin, and only in openFirestore(),
// so the NAS jobs (PM_SOURCE=pocketbase, scripts/job-source.mjs) never need it. createFirestoreSource() takes a database object, so tests run it
// on tests/fake-firestore.js. The reads and the delta read of the backup come from server-backup-lib.mjs; the list patches of the night sheets from server-tables-lib.mjs.
//
// The source interface (both sources):
// - kind, delta (true: the backup may read only what changed since the previous copy), exportMark (extra keys of a project's full copy file, or null)
// - projectIds() → ids; head(id) → the project document or null
// - readProject(id, only?) → {project, data}; readProjectDelta(id, prev, sinceMs) → {project, data, reads} (delta sources only)
// - readCommon() → the common file's content; readPool(kind) → the documents of one pool list
// - changedSince(id, colls, kinds, sinceMs) → whether a record of those collections or a pool item of those kinds changed after sinceMs
// - setProject(id, fields) — a merge write of project fields; patchProject(id, {drawings, managers, tables, rackTable}) — the night sheets' list patches
// - cleanup: deleteProject(id) with all its data; cleanupCandidates(id, project, {cutoff, max, budget}) → [{coll, kind: 'history'|'records', items: [{ref, data}]}];
//   removeAll(refs)
import { readProject, readProjectDelta, readCommon } from './server-backup-lib.mjs';
import { applyDrawingPatches, applyManagerPatches, applyPatches } from './server-tables-lib.mjs';

// The source over a firebase-admin Firestore database; Timestamp is admin.firestore.Timestamp (or the fake's)
export function createFirestoreSource({ db, Timestamp }) {
  const ref = (id) => db.collection('projects').doc(id);
  return {
    kind: 'firestore',
    delta: true,
    exportMark: null,
    async projectIds() { return (await db.collection('projects').listDocuments()).map((r) => r.id); },
    async head(id) { const s = await ref(id).get(); return s.exists === false ? null : (s.data() || null); },
    readProject: (id, only) => readProject(ref(id), only),
    readProjectDelta: (id, prev, since) => readProjectDelta(ref(id), prev, since, Timestamp),
    readCommon: () => readCommon(db),
    async readPool(kind) { return (await db.collection(`pool_${kind}`).get()).docs.map((d) => d.data()); },
    // one «anything changed» query per collection (a quota-friendly limit(1)) instead of reading every document
    async changedSince(id, colls, kinds, since) {
      const ts = Timestamp.fromMillis(since);
      for (const col of colls) { if (!(await ref(id).collection(col).where('updatedAtServer', '>', ts).limit(1).get()).empty) return true; }
      for (const kind of kinds) { if (!(await db.collection(`pool_${kind}`).where('updatedAtServer', '>', ts).limit(1).get()).empty) return true; }
      return false;
    },
    setProject: (id, fields) => ref(id).set(fields, { merge: true }),
    // a transaction over the fresh project: the app may have changed the lists while the job ran
    patchProject(id, patch) {
      return db.runTransaction(async (tx) => {
        const fresh = { id, ...(await tx.get(ref(id))).data() };
        const out = {};
        if (patch.drawings) out.drawings = applyDrawingPatches(fresh, patch.drawings);
        if (patch.managers) out.managers = applyManagerPatches(fresh, patch.managers);
        if (patch.tables) out.tables = applyPatches(fresh, patch.tables);
        if (patch.rackTable) out.rackTable = { ...(fresh.rackTable || {}), ...patch.rackTable };
        tx.set(ref(id), out, { merge: true });
      });
    },
    deleteProject: (id) => db.recursiveDelete(ref(id)),
    // per subcollection of the project, at most `max` each: history older than the cutoff; records marked deleted (the query is an equality only,
    // no composite index needed — the age is checked by the caller)
    async cleanupCandidates(id, _project, { cutoff, max }) {
      const out = [];
      for (const col of await ref(id).listCollections()) {
        const history = col.id === 'history';
        const q = history ? await col.where('at', '<', cutoff).limit(max).get() : await col.where('deleted', '==', true).limit(max).get();
        out.push({ coll: col.id, kind: history ? 'history' : 'records', items: q.docs.map((d) => ({ ref: d.ref, data: d.data() })) });
      }
      return out;
    },
    async removeAll(refs) {
      if (!refs.length) return;
      const bw = db.bulkWriter();
      refs.forEach((r) => bw.delete(r));
      await bw.close();
    },
  };
}

// The source of the GitHub Actions jobs: the service account JSON (FIREBASE_SERVICE_ACCOUNT) → firebase-admin, loaded only here
export async function openFirestore(serviceAccountJson) {
  const { default: admin } = await import('firebase-admin');
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccountJson)) });
  return createFirestoreSource({ db: admin.firestore(), Timestamp: admin.firestore.Timestamp });
}
