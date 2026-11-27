// An in-memory Firestore fake with the firebase-admin calls the server jobs use: collections, documents, subcollections, where/limit queries,
// set with merge, write batches, transactions, bulk writer, recursive delete, the prefs collection group and Timestamp.
// Shared by tests/server-jobs.test.js (the Firestore source), tests/pb-restore.test.js (the way back) and the golden run that recorded tests/fixtures/jobs-golden/; not a test itself.
// Data comes in as a tree: { '<root coll>': { '<doc id>': { data: {...}, subs: { '<coll>': { '<id>': { data, subs } } } } } };
// values shaped {_seconds, _nanoseconds} become Timestamp instances (as server-backup-lib.mjs revive() does).

export class Timestamp {
  constructor(seconds, nanoseconds) { this._seconds = seconds; this._nanoseconds = nanoseconds; }
  static fromMillis(ms) { return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6); }
  static now() { return Timestamp.fromMillis(Date.now()); }
  toMillis() { return this._seconds * 1000 + Math.floor(this._nanoseconds / 1e6); }
}

const isPlain = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Timestamp);
const clone = (v) => {
  if (v instanceof Timestamp) return new Timestamp(v._seconds, v._nanoseconds);
  if (Array.isArray(v)) return v.map(clone);
  if (isPlain(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)]));
  return v;
};
function revive(v) {
  if (Array.isArray(v)) return v.map(revive);
  if (v && typeof v === 'object') {
    const k = Object.keys(v);
    if (k.length === 2 && '_seconds' in v && '_nanoseconds' in v) return new Timestamp(v._seconds, v._nanoseconds);
    return Object.fromEntries(Object.entries(v).map(([a, b]) => [a, revive(b)]));
  }
  return v;
}
// Firestore's merge: plain objects merge recursively (an empty object is a leaf), everything else replaces
function mergeDeep(old, data) {
  const out = isPlain(old) ? clone(old) : {};
  for (const [k, v] of Object.entries(data)) out[k] = isPlain(v) && Object.keys(v).length ? mergeDeep(out[k], v) : clone(v);
  return out;
}
const cmp = (a, b) => (a instanceof Timestamp ? a.toMillis() : a) - (b instanceof Timestamp ? b.toMillis() : b);

export function createFakeFirestore(tree = {}) {
  // node = { data: object|null, subs: Map<coll, Map<id, node>> }
  const mk = () => ({ data: null, subs: new Map() });
  const root = mk();
  const load = (node, colls) => {
    for (const [c, docs] of Object.entries(colls || {})) {
      const m = new Map();
      for (const [id, d] of Object.entries(docs)) { const n = mk(); n.data = d.data ? revive(d.data) : null; load(n, d.subs); m.set(id, n); }
      node.subs.set(c, m);
    }
  };
  load(root, tree);
  const log = { sets: [], deletes: [], transactions: 0 };

  const nodeAt = (parts, create) => {
    let n = root;
    for (let i = 0; i < parts.length; i += 2) {
      let col = n.subs.get(parts[i]);
      if (!col) { if (!create) return null; col = new Map(); n.subs.set(parts[i], col); }
      let d = col.get(parts[i + 1]);
      if (!d) { if (!create) return null; d = mk(); col.set(parts[i + 1], d); }
      n = d;
    }
    return n;
  };
  const snapOf = (ref) => { const n = nodeAt(ref.parts); const data = n && n.data ? clone(n.data) : undefined; return { id: ref.id, ref, exists: !!data, data: () => data }; };
  const docRef = (parts) => ({
    id: parts[parts.length - 1], parts, path: parts.join('/'),
    get parent() { return colRef(parts.slice(0, -1)); },
    get: async () => snapOf(docRef(parts)),
    collection: (name) => colRef([...parts, name]),
    listCollections: async () => { const n = nodeAt(parts); return n ? [...n.subs.keys()].filter((c) => n.subs.get(c).size).sort().map((c) => colRef([...parts, c])) : []; },
    set: async (data, opts) => { setDoc(parts, data, opts); },
  });
  const setDoc = (parts, data, opts) => {
    const n = nodeAt(parts, true);
    log.sets.push({ path: parts.join('/'), data: clone(data), opts });
    n.data = opts && opts.merge ? mergeDeep(n.data, data) : clone(data);
  };
  const query = (parts, filters, max) => ({
    where: (f, op, v) => query(parts, [...filters, [f, op, v]], max),
    limit: (k) => query(parts, filters, k),
    get: async () => {
      const n = nodeAt(parts.slice(0, -1));
      const col = n ? n.subs.get(parts[parts.length - 1]) : null;
      let docs = col ? [...col.keys()].sort().filter((id) => col.get(id).data).map((id) => snapOf(docRef([...parts, id]))) : [];
      docs = docs.filter((s) => filters.every(([f, op, v]) => {
        const x = s.data()[f];
        if (x === undefined) return false;
        if (op === '==') return x === v;
        if (op === '>') return cmp(x, v) > 0;
        if (op === '<') return cmp(x, v) < 0;
        throw new Error(`fake: op ${op}`);
      }));
      if (max) docs = docs.slice(0, max);
      return { docs, size: docs.length, empty: !docs.length };
    },
  });
  const colRef = (parts) => ({
    id: parts[parts.length - 1], parts,
    parent: parts.length > 1 ? docRef(parts.slice(0, -1)) : null,
    ...query(parts, [], 0),
    doc: (id) => docRef([...parts, id]),
    // as firebase-admin: every document id that holds data or subcollections
    listDocuments: async () => {
      const n = nodeAt(parts.slice(0, -1));
      const col = n ? n.subs.get(parts[parts.length - 1]) : null;
      return col ? [...col.keys()].sort().map((id) => docRef([...parts, id])) : [];
    },
  });
  const removeNode = (parts) => {
    const n = nodeAt(parts.slice(0, -2));
    const col = n && n.subs.get(parts[parts.length - 2]);
    if (col) col.delete(parts[parts.length - 1]);
  };

  const db = {
    log,
    collection: (name) => colRef(name.split('/')),
    doc: (path) => docRef(path.split('/')),
    listCollections: async () => [...root.subs.keys()].filter((c) => root.subs.get(c).size).sort().map((c) => colRef([c])),
    collectionGroup: (name) => ({
      get: async () => {
        const docs = [];
        const walk = (n, parts) => {
          for (const [c, col] of n.subs) {
            for (const [id, d] of col) {
              if (c === name && d.data) docs.push(snapOf(docRef([...parts, c, id])));
              walk(d, [...parts, c, id]);
            }
          }
        };
        walk(root, []);
        return { docs, size: docs.length };
      },
    }),
    // a write batch: the sets are applied on commit, in order
    batch: () => { const ops = []; return { set: (ref, data, opts) => { ops.push([ref, data, opts]); }, commit: async () => { ops.forEach(([r, d, o]) => setDoc(r.parts, d, o)); } }; },
    runTransaction: async (fn) => {
      log.transactions += 1;
      return fn({ get: async (ref) => snapOf(ref), set: (ref, data, opts) => setDoc(ref.parts, data, opts) });
    },
    bulkWriter: () => { const refs = []; return { delete: (r) => refs.push(r), close: async () => { refs.forEach((r) => { log.deletes.push(r.path); removeNode(r.parts); }); } }; },
    recursiveDelete: async (ref) => { log.deletes.push(`${ref.path}/**`); removeNode(ref.parts); },
    // a plain-JSON picture of every document (Timestamps as {_seconds, _nanoseconds}) for comparisons
    dump: () => {
      const out = {};
      const walk = (n, parts) => {
        for (const [c, col] of n.subs) for (const [id, d] of col) { if (d.data) out[[...parts, c, id].join('/')] = JSON.parse(JSON.stringify(d.data)); walk(d, [...parts, c, id]); }
      };
      walk(root, []);
      return out;
    },
  };
  return db;
}

// A flat picture { 'a/b/c/d': data } (as dump() gives) → the tree createFakeFirestore takes
export function treeOf(flat) {
  const tree = {};
  for (const [path, data] of Object.entries(flat)) {
    const parts = path.split('/');
    let colls = tree;
    for (let i = 0; i < parts.length; i += 2) {
      colls[parts[i]] ??= {};
      const d = (colls[parts[i]][parts[i + 1]] ??= {});
      if (i + 2 === parts.length) d.data = data;
      else colls = (d.subs ??= {});
    }
  }
  return tree;
}

// The firebase-admin default export over a fake database (for code that calls admin.firestore())
export const fakeAdmin = (db) => ({
  initializeApp() {}, credential: { cert: () => ({}) },
  firestore: Object.assign(() => db, { Timestamp }),
});
