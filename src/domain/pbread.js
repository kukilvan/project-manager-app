// Reading rules of the NAS copy: a PocketBase record → the app's document in the local copy, read marks, the delta and page filters, the rollback check, full-read replacement and the event-apply rule.
// Pure: no browser, no network; src/app/pb/reader.js calls it (spec 4 § 3.5, ADR 0021). Keys and the replay of queued ops come from src/domain/pbqueue.js,
// the delta margin and the Saturday decision from src/domain/sync.js. Checked by tests/pbread.test.js.
//
// Contents:
// - constants — PAGE_SIZE, READ_PARTS, local id prefixes of each scope
// - server time — pbTime, pbMs, newestOf
// - record → document — recordToDoc, projectKeyMap
// - filters — quote, pageFilter, deltaSince, nextAfter
// - decisions — readMode, rolledBack, shouldApply, serverVersion, fullReadRemovals, dropsEveryProject, queuedIds
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
