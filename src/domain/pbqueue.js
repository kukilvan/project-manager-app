// Write-queue rules of the NAS copy: where an op lands in the local copy, replaying queued ops, the chunking of queue items into requests and what each answer of the write route means.
// Pure: no browser, no network; src/app/pb/localcopy.js and src/app/pb/sender.js call it (spec 4 § 3.3, § 3.4, ADR 0021). Merges come from src/domain/pbwrite.js.
// Checked by tests/pbqueue.test.js.
//
// Contents:
// - limits — ops and bytes per request, back-off steps, timeouts
// - local copy keys — docId, scopeOf, opTarget
// - replay — applyOp, replayOps, queueCount
// - chunking — planRequest, jsonBytes
// - answers — classify, settle, backoffDelay
import { mergeDoc } from './pbwrite.js';

// ---------- limits ----------

export const MAX_REQ_OPS = 300;                    // ops per request (the server takes 500)
export const MAX_REQ_BYTES = 1.5 * 1024 * 1024;    // JSON bytes per request (the server takes 4 MB)
export const BACKOFF_MS = [2000, 5000, 10000, 30000, 60000];   // after the last step it stays at 60 s
export const REQUEST_TIMEOUT_MS = 60000;           // no answer in 60 s counts as a network error
export const SEND_DELAY_MS = 300;                  // the sender runs this long after a write
export const OTHER_400_TRIES = 3;                  // an unknown 400 is backed off this many times, then the first item goes to «⚠»
export const HISTORY_KEEP_MS = 60 * 24 * 3600 * 1000;   // the local history store keeps 60 days

// ---------- local copy keys ----------

// A document of the local copy: `<scope>|<pid>|<coll>|<key>` (spec 4 § 3.3). Scopes: p (projects), r (records), pool, inbox, prefs, inv, adm.
export const docId = (scope, pid, coll, key) => `${scope}|${pid || ''}|${coll || ''}|${key}`;
// The listener scope of a document: everything before the key (the key may itself hold «|»)
export function scopeOf(id) {
  let i = -1;
  for (let n = 0; n < 3; n++) { i = id.indexOf('|', i + 1); if (i < 0) return id; }
  return id.slice(0, i);
}
export const PROJECTS_SCOPE = 'p||';
export const recordsScope = (pid, coll) => `r|${pid}|${coll}`;
export const poolScope = (kind) => `pool||${kind}`;
export const INBOX_SCOPE = 'inbox||';
export const PREFS_SCOPE = 'prefs||';
export const INVITES_SCOPE = 'inv||';

// Where an op lands on the phone: { store: 'docs', id } for a document, { store: 'history', id } for a history entry, null for nothing kept (`allowed`)
export function opTarget(op) {
  if (op.t === 'project') return { store: 'docs', id: docId('p', '', '', op.key) };
  if (op.t === 'rec') return { store: 'docs', id: docId('r', op.pid, op.coll, op.key) };
  if (op.t === 'pool') return { store: 'docs', id: docId('pool', '', op.kind, op.key) };
  if (op.t === 'inbox') return { store: 'docs', id: docId('inbox', '', '', op.key) };
  if (op.t === 'prefs') return { store: 'docs', id: docId('prefs', '', '', 'main') };
  if (op.t === 'history') return { store: 'history', id: `${op.pid}|${op.key}` };
  return null;
}

// ---------- replay ----------

// Keys the phone adds to a document of the copy; they never take part in a merge
const LOCAL_KEYS = ['_pb', '_pending'];
function bare(doc) {
  if (!doc) return null;
  const out = {};
  Object.keys(doc).forEach((k) => { if (!LOCAL_KEYS.includes(k)) out[k] = doc[k]; });
  return out;
}

// One op over the document as the phone shows it (null = missing): the merged document, with `_pb` kept.
// An inbox entry keeps its `key` (the app reads `{...data, key}`).
export function applyOp(doc, op) {
  const merged = mergeDoc(bare(doc), op);
  if (op.t === 'inbox') merged.key = op.key;
  if (doc && doc._pb) merged._pb = doc._pb;
  return merged;
}

// Every queued op that lands on `id`, in queue order, over `doc` (a server version or the stored one): what the screen shows (spec 4 § 3.4).
// Every op is idempotent, so replaying an op the document already holds changes nothing.
export function replayOps(doc, items, id) {
  let out = doc;
  let touched = false;
  (items || []).forEach((it) => (it.ops || []).forEach((op) => {
    const t = opTarget(op);
    if (!t || t.store !== 'docs' || t.id !== id) return;
    out = applyOp(out, op);
    touched = true;
  }));
  if (touched && out) out._pending = true;
  return out;
}

// «⬆ N»: the non-history writes in the queue of this user (spec 4 § 3.6); ops of a chunked item the server already holds (`done`) are not counted,
// so «⬆» counts down during a large save
export function queueCount(items, uid) {
  let n = 0;
  (items || []).forEach((it) => { if (it.uid === uid) (it.ops || []).slice(it.done || 0).forEach((op) => { if (op.t !== 'history') n++; }); });
  return n;
}

// ---------- chunking ----------

// UTF-8 bytes of a JSON value (the request body is sent as UTF-8)
export function jsonBytes(value) {
  const s = JSON.stringify(value);
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; }   // a surrogate pair is one 4-byte character
    else n += 3;
  }
  return n;
}
const BODY_OVERHEAD = 32;   // `{"schema":N,"ops":[]}`

// The next request (spec 4 § 3.4): queue items in order while the request stays within the limits; an item larger than that
// is sent as consecutive chunks of its own. items: [{seq, ops, done?}] — `done`: ops of a chunked item the server already holds.
// maxItems: 1 after a 413 of a request of several items. Returns { ops, parts: [{seq, from, to, last}] } or null for an empty queue.
export function planRequest(items, { maxOps = MAX_REQ_OPS, maxBytes = MAX_REQ_BYTES, maxItems = Infinity } = {}) {
  const list = (items || []).filter((it) => it && (it.ops || []).length > (it.done || 0));
  if (!list.length) return null;
  const ops = []; const parts = [];
  let bytes = BODY_OVERHEAD;
  const sizes = (it) => it.ops.map((op) => jsonBytes(op) + 1);
  for (const it of list) {
    if (parts.length >= maxItems) break;
    const from = it.done || 0;
    const sz = sizes(it).slice(from);
    const total = sz.reduce((a, b) => a + b, 0);
    if (ops.length + sz.length <= maxOps && bytes + total <= maxBytes) {
      ops.push(...it.ops.slice(from)); parts.push({ seq: it.seq, from, to: it.ops.length, last: true });
      bytes += total;
      continue;
    }
    if (parts.length) break;   // does not fit beside the items already taken: it goes first in the next request
    // larger than one request: a chunk of its own, at least one op
    let to = from;
    while (to < it.ops.length && (to === from || (to - from < maxOps && bytes + sz[to - from] <= maxBytes))) { bytes += sz[to - from]; to++; }
    ops.push(...it.ops.slice(from, to)); parts.push({ seq: it.seq, from, to, last: to === it.ops.length });
    break;
  }
  return { ops, parts };
}

// ---------- answers ----------

const REJECT_CODES = ['forbidden', 'not-found', 'invalid'];

// What an answer of `POST /api/pm/save` means (spec 4 § 3.4). res: { status, body } or { network: true } (also a timeout).
// Kinds: ok, reject {index, code}, expired, server-older, app-older, too-large, retry, bad-request.
export function classify(res) {
  if (!res || res.network || !res.status) return { kind: 'retry' };
  const s = res.status; const b = res.body && typeof res.body === 'object' ? res.body : {};
  if (s >= 200 && s < 300) return { kind: 'ok' };
  if (s === 422 && typeof b.index === 'number' && b.index >= 0) return { kind: 'reject', index: b.index, code: REJECT_CODES.includes(b.code) ? b.code : 'invalid' };
  if (s === 401) return { kind: 'expired' };
  if ((s === 404 && !b.code) || (s === 409 && b.code === 'schema_old')) return { kind: 'server-older' };
  if (s === 426) return { kind: 'app-older' };
  if (s === 413) return { kind: 'too-large' };
  if (s === 429 || s >= 500) return { kind: 'retry' };
  return { kind: 'bad-request' };
}

// The back-off before the next try after `failures` failures in a row (1 → 2 s … 5 and more → 60 s)
export function backoffDelay(failures) {
  if (!(failures > 0)) return 0;
  return BACKOFF_MS[Math.min(failures, BACKOFF_MS.length) - 1];
}

// What the sender does with an answer to a planned request. state: { badTries } (unknown 400s in a row).
// Returns { done: [seq], progress: [{seq, done}], rejected: [{seq, code}], single: [seq] (send one item per request),
//   hold: 'expired' | 'server-older' | 'app-older' | null, now: resend at once, backoff: true, badTries }.
export function settle(plan, answer, state = {}) {
  const out = { done: [], progress: [], rejected: [], single: [], hold: null, now: false, backoff: false, badTries: state.badTries || 0 };
  const parts = plan.parts;
  const first = parts[0];
  switch (answer.kind) {
    case 'ok':
      parts.forEach((p) => { if (p.last) out.done.push(p.seq); else out.progress.push({ seq: p.seq, done: p.to }); });
      out.badTries = 0;
      return out;
    case 'reject': {
      // the item holding that op is refused (a refused chunk refuses the whole item); the rest was rolled back and goes again at once
      let at = 0; let hit = parts[parts.length - 1];
      for (const p of parts) { const n = p.to - p.from; if (answer.index < at + n) { hit = p; break; } at += n; }
      out.rejected.push({ seq: hit.seq, code: answer.code });
      out.now = true; out.badTries = 0;
      return out;
    }
    case 'too-large':
      // several items: one item per request from now on; a single item (or its chunk) is refused as a whole
      if (parts.length > 1) out.single = parts.map((p) => p.seq);
      else out.rejected.push({ seq: first.seq, code: 'invalid' });
      out.now = true;
      return out;
    case 'expired': case 'server-older': case 'app-older':
      out.hold = answer.kind;
      return out;
    case 'bad-request':
      out.badTries += 1;
      if (out.badTries >= OTHER_400_TRIES) { out.rejected.push({ seq: first.seq, code: 'invalid' }); out.badTries = 0; out.now = true; }
      else out.backoff = true;
      return out;
    default:
      out.backoff = true;
      return out;
  }
}
