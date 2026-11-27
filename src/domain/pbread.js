// Reading rules of the NAS copy: record → document, read marks, delta and page filters, the rollback check, full-read replacement, event-apply, and the export to the backup format.
// Pure: no browser, no network; src/app/pb/reader.js calls it (spec 4 § 3.5, ADR 0021), the job source scripts/pb-source.mjs its export part (§ 5.2). Keys and the replay of queued ops come from src/domain/pbqueue.js,
// the delta margin and the Saturday decision from src/domain/sync.js. Checked by tests/pbread.test.js.
//
// Contents:
// - constants — PAGE_SIZE, READ_PARTS, local id prefixes of each scope
// - server time — pbTime, pbMs, newestOf
// - record → document — recordToDoc, projectKeyMap
// - filters — quote, pageFilter, deltaSince, nextAfter
// - decisions — readMode, rolledBack, shouldApply, serverVersion, fullReadRemovals, dropsEveryProject, queuedIds, orphanRecords
// - invitations and history — invitationsOf, mergeHistory
// - export to the backup format — EXPORT_SOURCE, serverStamp, exportDoc, exportProject, exportCommon
import { docId, opTarget, replayOps } from './pbqueue.js';
import { DELTA_MARGIN, decideMode } from './sync.js';

// ---------- constants ----------

export const PAGE_SIZE = 1000;   // records per list request (spec 4 § 1: perPage=1000 returns 1,000)
// The parts behind «⬇» (spec 4 § 3.6), in the order of the reads; `inbox` only for the administrator
export const READ_PARTS = ['projects', 'records', 'pool', 'invites', 'prefs', 'inbox'];
// Local id prefixes (src/domain/pbqueue.js docId) that hold each server collection's documents
export const PREFIX = { projects: 'p||', pool: 'pool||', inbox: 'inbox||', prefs: 'prefs||', invites: 'inv||' };
export const recordsPrefix = (pid) => `r|${pid}|`;

// ---------- server time ----------

// PocketBase dates are UTC text «2026-11-27 10:20:30.123Z»; text order is time order, so marks are compared as text
export const pbTime = (ms) => new Date(ms).toISOString().replace('T', ' ');
export const pbMs = (s) => (s ? Date.parse(String(s).replace(' ', 'T')) : 0);
// The newest of a mark and the `updated` of records (empty text when there is none)
export function newestOf(mark, recs) {
  let m = mark || '';
  (recs || []).forEach((r) => { const u = r && r.updated; if (u && u > m) m = u; });
  return m;
}

// ---------- record → document ----------

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// A record of a server collection → [local id, document] (spec 4 § 2.2), or null when it cannot be placed
// (a record of a project the phone does not know yet). The document carries `_pb: {id, updated}`; an invite also its project and e-mail.
// pidOf(pocketBaseProjectId) → the app's project id or '' (from projectKeyMap).
export function recordToDoc(coll, rec, pidOf = () => '') {
  if (!rec || !rec.id) return null;
  const data = isObj(rec.data) ? rec.data : {};
  const pb = { id: rec.id, updated: rec.updated || '' };
  const doc = (extra) => Object.assign({}, data, extra || {}, { _pb: pb });
  if (coll === 'projects') return rec.key ? [docId('p', '', '', rec.key), doc()] : null;
  if (coll === 'records') {
    const pid = pidOf(rec.project);
    return pid && rec.coll && rec.key ? [docId('r', pid, rec.coll, rec.key), doc()] : null;
  }
  if (coll === 'pool') return rec.kind && rec.key ? [docId('pool', '', rec.kind, rec.key), doc()] : null;
  if (coll === 'inbox') return rec.key ? [docId('inbox', '', '', rec.key), doc({ key: rec.key })] : null;
  if (coll === 'prefs') return [docId('prefs', '', '', 'main'), doc()];
  if (coll === 'invites') {
    pb.project = rec.project || ''; pb.email = rec.email || '';
    return [docId('inv', '', '', rec.id), doc()];
  }
  return null;
}

// PocketBase project id → the app's project id, from the project documents of the local copy ([[id, doc]])
export function projectKeyMap(projectRows) {
  const m = new Map();
  (projectRows || []).forEach(([id, d]) => { if (d && d._pb && d._pb.id) m.set(d._pb.id, id.slice(PREFIX.projects.length + 1)); });
  return m;
}

// ---------- filters ----------

// A value inside a PocketBase filter, quoted as the SDK's pb.filter() does
export const quote = (v) => JSON.stringify(String(v));

// The filter of one list page: `base` (already built), changes after `since` (delta), and the keyset after the last record of the previous page
// (`after`: {updated, id}), so a record changed during the read cannot shift a page and be skipped. Sort: `updated,id`.
export function pageFilter(base = '', since = '', after = null) {
  const parts = [];
  if (base) parts.push(`(${base})`);
  if (since) parts.push(`updated > ${quote(since)}`);
  if (after) parts.push(`(updated > ${quote(after.updated)} || (updated = ${quote(after.updated)} && id > ${quote(after.id)}))`);
  return parts.join(' && ');
}
// The keyset of the next page, or null when this page was the last
export function nextAfter(items, pageSize = PAGE_SIZE) {
  if (!items || items.length < pageSize) return null;
  const last = items[items.length - 1];
  return { updated: last.updated, id: last.id };
}
// A delta read starts DELTA_MARGIN before the mark (a record committed late is not lost); '' = no mark
export const deltaSince = (mark) => (mark ? pbTime(pbMs(mark) - DELTA_MARGIN) : '');

// ---------- decisions ----------

// 'full' or 'delta' for a scope (spec 4 § 3.5 step 5): full without a mark, after the Saturday boundary, or when the copy holds fewer documents
// than the last full read left. full: { at, n } of the last full read (phone time — only the week matters), cached: documents of the scope now.
export function readMode({ mark, full, cached, now = Date.now() }) {
  if (!mark) return 'full';
  return decideMode({ last: pbMs(mark), full: full && full.at, n: full && full.n }, cached, now);
}

// The rollback check (spec 4 § 3.5 step 2): the newest record the server shows is older than the newest the phone has seen → the server was restored
// from an older copy, every scope is read in full. No record seen yet → nothing to compare.
export const rolledBack = (serverNewest, seenNewest) => !!seenNewest && (!serverNewest || serverNewest < seenNewest);

// The event-apply rule (spec 4 § 3.5): a server version is applied when its `updated` is not older than the phone's `_pb.updated`
export function shouldApply(local, updated) {
  if (!local || !local._pb || !local._pb.updated) return true;
  return !!updated && updated >= local._pb.updated;
}

// What the screen shows for a server version (null = removed on the server): the queued ops that touch it replayed on top, so the screen never jumps back
export const serverVersion = (doc, items, id) => replayOps(doc, items, id);

// Local doc ids that a queued item of this user touches
export function queuedIds(items) {
  const s = new Set();
  (items || []).forEach((it) => (it.ops || []).forEach((op) => { const t = opTarget(op); if (t && t.store === 'docs') s.add(t.id); }));
  return s;
}

// A full read replaces its scope (spec 4 § 3.5 step 6): local documents the server did not return are removed — unless a queued item touches them,
// or they came from the server after the read's newest record (an event that arrived while the read ran). rows: [[id, doc]] of the scope.
export function fullReadRemovals(rows, serverIds, queued, readMark = '') {
  const out = [];
  (rows || []).forEach(([id, d]) => {
    if (serverIds.has(id) || (queued && queued.has(id))) return;
    if (d && d._pb && d._pb.updated && readMark && d._pb.updated > readMark) return;
    out.push(id);
  });
  return out;
}

// The guard of spec 4 § 3.2: a full read of `projects` that would leave no project of those the phone had
export const dropsEveryProject = (localCount, removedCount) => localCount > 0 && removedCount >= localCount;

// Records of projects the copy no longer holds (left behind when a project was dropped while a queued change touched them): removed once no queued item
// touches them. recordIds: local ids `r|<pid>|…`; projectKeys: the app's ids of the projects in the copy.
export function orphanRecords(recordIds, projectKeys, queued) {
  return (recordIds || []).filter((id) => {
    const pid = String(id).split('|')[1] || '';
    return !projectKeys.has(pid) && !(queued && queued.has(id));
  });
}

// ---------- invitations and history ----------

const lower = (s) => String(s || '').trim().toLowerCase();

// The invitation banner's projects (spec 4 § 3.7) from the `invites` documents of the copy, shaped as the Firestore listener gives them:
// { id: <project key>, name, object, memberEmails: [from], invitedEmails: [e-mail], memberUids: [] }. Filtered as that listener is: an invitation whose project
// the copy already holds with the user among `memberUids` (accepted, also while the answer is queued) or without the user's e-mail among `invitedEmails`
// (declined) is not shown. An invitation without a key (written by a server older than schema 2) cannot be accepted and is left out.
// projectOf(key) → the project document of the copy or null.
export function invitationsOf(invites, projectOf, email, uid) {
  const out = []; const seen = new Set();
  (invites || []).forEach((d) => {
    const key = d && typeof d.key === 'string' ? d.key : '';
    if (!key || seen.has(key)) return;
    const em = lower((d._pb && d._pb.email) || email);
    const p = projectOf(key);
    if (p && ((p.memberUids || []).includes(uid) || (Array.isArray(p.invitedEmails) && !p.invitedEmails.map(lower).includes(em)))) return;
    seen.add(key);
    out.push({ id: key, name: String(d.name || ''), object: String(d.object || ''), memberEmails: d.from ? [d.from] : [], invitedEmails: [em], memberUids: [] });
  });
  return out;
}

// History for the screens: the server's entries and the phone's own (written here and not sent yet, or kept from earlier reads), each entry once by id
// (the server's version wins), newest first, at most `max`
export function mergeHistory(server, local, max = Infinity) {
  const by = new Map(); let n = 0;
  const put = (e) => { if (e && typeof e === 'object') by.set(e.id != null ? `id:${e.id}` : `n:${n++}`, e); };
  (local || []).forEach(put);
  (server || []).forEach(put);
  return [...by.values()].sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0)).slice(0, max);
}

// ---------- export to the backup format (the jobs, spec 4 § 5.2) ----------

// The marker of a PocketBase export in a project's full copy file; a Firestore export has no `source`
export const EXPORT_SOURCE = 'pocketbase';
// Firestore's document id for an app id (`docKey` of src/app/repo.js): the order of a Firestore read, which the export keeps
const fsKey = (key) => String(key).replace(/\//g, '_');
const byFsKey = (a, b) => { const x = fsKey(a.key); const y = fsKey(b.key); return x < y ? -1 : x > y ? 1 : 0; };

// `updated` of a record → Firestore's timestamp as a backup stores it ({_seconds, _nanoseconds}); null without a time
export function serverStamp(updated) {
  const ms = pbMs(updated);
  if (!ms) return null;
  return { _seconds: Math.floor(ms / 1000), _nanoseconds: (ms % 1000) * 1e6 };
}
// One exported document: `{id: key, ...data}` as a Firestore read gives `{id: d.id, ...d.data()}` (an `id` inside the data wins), with
// `updatedAtServer` from `updated` as the last key
export function exportDoc(key, data, updated) {
  const out = Object.assign({ id: key }, isObj(data) ? data : {});
  delete out.updatedAtServer;
  const ts = serverStamp(updated);
  if (ts) out.updatedAtServer = ts;
  return out;
}
// A project of the export: { project, data } from its `projects` record, its `records` and `history` records (each as the server lists them).
// `data[coll]` is ordered as a Firestore read orders documents; collections by name; history is the collection `history`.
export function exportProject(projectRec, records, history) {
  const project = exportDoc(projectRec.key, projectRec.data, projectRec.updated);
  const groups = {};
  (records || []).forEach((r) => { if (r && r.coll && r.key) (groups[r.coll] = groups[r.coll] || []).push(r); });
  if ((history || []).length) groups.history = history.filter((h) => h && h.key);
  const data = {};
  Object.keys(groups).sort().forEach((c) => { data[c] = groups[c].slice().sort(byFsKey).map((r) => exportDoc(r.key, r.data, r.updated)); });
  return { project, data };
}
// The common file of the export (`polevoy-common-1`) from the server's common collections, as server-backup-lib.mjs readCommon() gives it from Firestore:
// `pool_<kind>` and `pool_inbox` documents with `updatedAtServer`, `allowed` as {id: email, email, at}, `meta` with `admin` ({id: 'admin', email, at}),
// prefs as {uid, id: 'main', data}. Empty collections are left out (Firestore lists only collections that hold documents); keys sorted by name.
// c = { pool: [records], inbox: [records], allowed: [records], admin: [records], prefs: [records] }
export function exportCommon(c) {
  const colls = {};
  const put = (name, doc) => { (colls[name] = colls[name] || []).push(doc); };
  (c.pool || []).slice().sort(byFsKey).forEach((r) => { if (r.kind && r.key) put(`pool_${r.kind}`, exportDoc(r.key, r.data, r.updated)); });
  (c.inbox || []).slice().sort(byFsKey).forEach((r) => { if (r.key) put('pool_inbox', exportDoc(r.key, r.data, r.updated)); });
  (c.allowed || []).slice().sort((a, b) => (a.email < b.email ? -1 : a.email > b.email ? 1 : 0))
    .forEach((r) => { if (r.email) put('allowed', { id: r.email, email: r.email, at: pbMs(r.created) }); });
  (c.admin || []).forEach((r) => { if (r.email) put('meta', { id: 'admin', email: r.email, at: pbMs(r.created) }); });
  const collections = {};
  Object.keys(colls).sort().forEach((k) => { collections[k] = colls[k]; });
  const prefs = (c.prefs || []).filter((r) => r && r.user).map((r) => ({ uid: r.user, id: 'main', data: isObj(r.data) ? r.data : {} }));
  return { format: 'polevoy-common-1', collections, prefs };
}
