// Restore rules of the NAS copy: a full server backup (Firebase or a PocketBase export) → the users, records and checks of a restore into PocketBase.
// Pure: no files, no network. scripts/pb-restore.mjs reads the backup folder, creates what the plan says through the batch API and compares the read-back;
// scripts/server-backup-lib.mjs uses the id mapping for the way back to Firestore (spec 4 § 6, § 10 cases 20 and 21). Limits and the invitation index
// come from src/domain/pbwrite.js. Checked by tests/pb-restore.test.js (plan, no server) and tests/pb-restore-live.test.js (a real PocketBase).
//
// Contents:
// - id mapping — emailKey, mapIds, mapInboxKey, invert, UID_FIELDS
// - users — usersOf (e-mail ↔ old uid from member pairs and removed members, names)
// - the plan — planRestore (counts, per project counts, warnings, conflicts), materialize (the plan with new ids, ready to write)
// - the compare — diffRestore (a read-back in the backup format against the backup)
import { POOL_KINDS, MAX_PROJECT_KEY, MAX_KEY, COLL_RE, invitesOf, membersOf, deepEqual } from './pbwrite.js';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const lower = (s) => String(s == null ? '' : s).trim().toLowerCase();
const without = (doc, keys) => { const out = {}; Object.keys(isObj(doc) ? doc : {}).forEach((k) => { if (!keys.includes(k)) out[k] = doc[k]; }); return out; };

// ---------- id mapping ----------

// The key of `memberNames` for an e-mail (src/app/repo.js renameMember: lower case, dots replaced)
export const emailKey = (email) => lower(email).replace(/\./g, '_');

// Every string value and object key exactly equal to a mapped id replaced (spec 4 § 6, step 2); other values as they are. map: Map(old → new)
export function mapIds(v, map) {
  if (typeof v === 'string') return map.has(v) ? map.get(v) : v;
  if (Array.isArray(v)) return v.map((x) => mapIds(x, map));
  if (isObj(v)) {
    const out = {};
    Object.keys(v).forEach((k) => { out[map.has(k) ? map.get(k) : k] = mapIds(v[k], map); });
    return out;
  }
  return v;
}

// An inbox key `<uid>_<kind>_<item>` (src/app/pool.js) with its uid prefix mapped; a key equal to a mapped id is mapped whole
export function mapInboxKey(key, map) {
  const k = String(key);
  if (map.has(k)) return map.get(k);
  for (const [from, to] of map) if (from && k.startsWith(`${from}_`)) return to + k.slice(from.length);
  return k;
}

// The way back of a mapping (new → old); null when two old ids share a new one (the compare could not tell them apart)
export function invert(map) {
  const out = new Map();
  for (const [a, b] of map) { if (out.has(b)) return null; out.set(b, a); }
  return out;
}

// Fields that hold a user id in the app's documents: their values not covered by the mapping are reported as unmapped uids
export const UID_FIELDS = ['memberUids', 'createdBy', 'updatedBy', 'deletedBy', 'by', 'uid'];

function collectUids(v, out, where) {
  if (Array.isArray(v)) { v.forEach((x) => collectUids(x, out, where)); return; }
  if (!isObj(v)) return;
  Object.keys(v).forEach((k) => {
    const x = v[k];
    if (UID_FIELDS.includes(k)) (Array.isArray(x) ? x : [x]).forEach((u) => { if (typeof u === 'string' && u) add(out, u, where); });
    if (k === 'removedMembers' && isObj(x)) Object.keys(x).forEach((u) => add(out, u, where));
    collectUids(x, out, where);
  });
}
function add(out, uid, where) {
  const e = out.get(uid) || { uid, n: 0, where: [] };
  e.n += 1;
  if (!e.where.includes(where)) e.where.push(where);
  out.set(uid, e);
}

// ---------- users ----------

// The users of a backup from each project's `memberUids`/`memberEmails` pairs and `removedMembers` ({uid: e-mail}); names from `memberNames`
// (by emailKey), else `createdByName` of the creator, else the newest `byName` of their history entries. Returns { users: [{email, name, uids}], uidEmail: Map(uid → e-mail), warnings, conflicts }.
// A uid with two e-mails or an e-mail with two uids is a conflict: the compare could not map such ids back.
export function usersOf(projects) {
  const uidEmail = new Map(); const users = new Map(); const warnings = []; const conflicts = [];
  const names = new Map();
  const pair = (uid, email, pid) => {
    const em = lower(email);
    if (typeof uid !== 'string' || !uid || !em) return;
    const had = uidEmail.get(uid);
    if (had && had !== em) { if (!conflicts.some((c) => c.code === 'uid-two-emails' && c.uid === uid)) conflicts.push({ code: 'uid-two-emails', uid, emails: [had, em], project: pid }); return; }
    uidEmail.set(uid, em);
    const u = users.get(em) || { email: em, name: '', uids: [] };
    if (!u.uids.includes(uid)) u.uids.push(uid);
    users.set(em, u);
  };
  const authors = new Map(); // uid → { at, name } of the newest history entry
  (projects || []).forEach(({ project: p, data }) => {
    if (!isObj(p)) return;
    ((isObj(data) && Array.isArray(data.history)) ? data.history : []).forEach((h) => {
      if (!isObj(h) || typeof h.by !== 'string' || !h.byName) return;
      const old = authors.get(h.by);
      if (!old || (Number(h.at) || 0) > old.at) authors.set(h.by, { at: Number(h.at) || 0, name: String(h.byName).trim() });
    });
    const uids = Array.isArray(p.memberUids) ? p.memberUids : []; const emails = Array.isArray(p.memberEmails) ? p.memberEmails : [];
    if (uids.length !== emails.length) warnings.push({ code: 'pair-length', project: p.id, uids: uids.length, emails: emails.length });
    else uids.forEach((u, i) => pair(u, emails[i], p.id));
    if (isObj(p.removedMembers)) Object.keys(p.removedMembers).forEach((u) => pair(u, p.removedMembers[u], p.id));
    if (isObj(p.memberNames)) Object.keys(p.memberNames).forEach((k) => { const n = String(p.memberNames[k] || '').trim(); if (n && !names.has(k)) names.set(k, n); });
    if (typeof p.createdBy === 'string' && p.createdByName) names.set(`uid:${p.createdBy}`, String(p.createdByName).trim());
  });
  users.forEach((u) => {
    if (u.uids.length > 1) conflicts.push({ code: 'email-two-uids', email: u.email, uids: u.uids.slice() });
    u.name = names.get(emailKey(u.email)) || u.uids.map((x) => names.get(`uid:${x}`)).find(Boolean)
      || u.uids.map((x) => authors.get(x) && authors.get(x).name).find(Boolean) || '';
  });
  return { users: [...users.values()].sort((a, b) => (a.email < b.email ? -1 : a.email > b.email ? 1 : 0)), uidEmail, warnings, conflicts };
}

// ---------- the plan ----------

const KNOWN_COMMON = ['allowed', 'meta', 'pool_inbox'];

// The plan of a restore (spec 4 § 6, step 1). backup = { projects: [{project, data}] (the «(полная).json» files), common: the common file or null };
// opts.admin = the e-mail of --admin. Documents stay with their old uids here; materialize() maps them once the users exist.
// Returns { users, admin, projects: [{key, name, data, records: [{coll, key, data}], history: [{key, at, data}], invites: [{email, data}]}],
// pool: [{kind, key, data}], inbox: [{key, data}], allowed: [e-mail], prefs: [{uid, data}], counts, perProject: {key: {records, history, invites}},
// unmapped: [{uid, n, where}], warnings, conflicts }. Any conflict stops a write; warnings are reported only.
export function planRestore(backup, opts = {}) {
  const projects = (backup && backup.projects) || [];
  const common = (backup && backup.common) || null;
  const u = usersOf(projects);
  const warnings = u.warnings.slice(); const conflicts = u.conflicts.slice();
  const seen = new Set();
  const unique = (coll, key, extra) => {
    const id = `${coll}|${extra || ''}|${key}`;
    if (seen.has(id)) { conflicts.push({ code: 'duplicate', coll, key, ...(extra ? { project: extra } : {}) }); return false; }
    seen.add(id); return true;
  };
  const fits = (coll, key, max, extra) => {
    if (typeof key !== 'string' || !key) { conflicts.push({ code: 'no-id', coll, ...(extra ? { project: extra } : {}) }); return false; }
    if (key.length > max) { conflicts.push({ code: 'too-long', coll, key: key.slice(0, 60), length: key.length, ...(extra ? { project: extra } : {}) }); return false; }
    return true;
  };
  const uids = new Map();

  const out = [];
  projects.forEach(({ project: p, data }) => {
    if (!isObj(p)) return;
    const key = typeof p.id === 'string' ? p.id : '';
    if (!fits('projects', key, MAX_PROJECT_KEY) || !unique('projects', key)) return;
    const pdata = without(p, ['updatedAtServer']);
    collectUids(pdata, uids, `projects/${key}`);
    const records = []; const history = [];
    Object.keys(isObj(data) ? data : {}).sort().forEach((coll) => {
      const docs = Array.isArray(data[coll]) ? data[coll] : [];
      if (coll === 'history') {
        docs.forEach((d) => {
          if (!fits('history', d && d.id, MAX_KEY, key) || !unique('history', d.id)) return;
          const hd = without(d, ['updatedAtServer']);
          collectUids(hd, uids, 'history');
          history.push({ key: d.id, at: Number(d.at) || 0, data: hd });
        });
        return;
      }
      if (!COLL_RE.test(coll)) { conflicts.push({ code: 'bad-coll', coll, project: key, n: docs.length }); return; }
      docs.forEach((d) => {
        if (!fits(coll, d && d.id, MAX_KEY, key) || !unique(coll, d.id, key)) return;
        const rd = without(d, ['updatedAtServer']);
        collectUids(rd, uids, coll);
        records.push({ coll, key: d.id, data: rd });
      });
    });
    const invites = invitesOf(pdata, key).map((i) => ({ email: i.email, data: { key: i.key, name: i.name, object: i.object, from: i.from } }));
    out.push({ key, name: String(p.name || ''), data: pdata, records, history, invites });
  });

  const pool = []; const inbox = []; const allowed = []; const prefs = [];
  let admin = '';
  if (common) {
    const colls = isObj(common.collections) ? common.collections : {};
    Object.keys(colls).sort().forEach((name) => {
      const docs = Array.isArray(colls[name]) ? colls[name] : [];
      if (name === 'pool_inbox') {
        docs.forEach((d) => {
          if (!fits('inbox', d && d.id, MAX_KEY) || !unique('inbox', d.id)) return;
          const id = d.id;
          const prefix = id.indexOf('_') > 0 ? id.slice(0, id.indexOf('_')) : '';
          if (prefix) add(uids, prefix, 'inbox');
          const data = without(d, ['updatedAtServer', 'id']);
          collectUids(data, uids, 'inbox');
          inbox.push({ key: id, data });
        });
      } else if (name.startsWith('pool_')) {
        const kind = name.slice(5);
        if (!POOL_KINDS.includes(kind)) warnings.push({ code: 'unknown-kind', kind, n: docs.length });
        if (kind.length > 40) { conflicts.push({ code: 'too-long', coll: 'pool', key: kind.slice(0, 60), length: kind.length }); return; }
        docs.forEach((d) => {
          if (!fits(`pool_${kind}`, d && d.id, MAX_KEY) || !unique(`pool_${kind}`, d.id)) return;
          const data = without(d, ['updatedAtServer']);
          collectUids(data, uids, `pool_${kind}`);
          pool.push({ kind, key: d.id, data });
        });
      } else if (name === 'allowed') {
        docs.forEach((d) => { const em = lower((d && (d.email || d.id)) || ''); if (em && !allowed.includes(em)) allowed.push(em); });
      } else if (name === 'meta') {
        docs.forEach((d) => {
          if (d && d.id === 'admin') admin = lower(d.email);
          else warnings.push({ code: 'unknown-meta', id: d && d.id });
        });
      } else if (!KNOWN_COMMON.includes(name)) warnings.push({ code: 'unknown-collection', name, n: docs.length });
    });
    (Array.isArray(common.prefs) ? common.prefs : []).forEach((p) => {
      if (!p || !p.uid) return;
      if (p.id && p.id !== 'main') { warnings.push({ code: 'prefs-not-main', uid: p.uid, id: p.id }); return; }
      if (!u.uidEmail.has(p.uid)) { warnings.push({ code: 'prefs-skipped', uid: p.uid }); return; }
      const data = isObj(p.data) ? p.data : {};
      collectUids(data, uids, 'prefs');
      prefs.push({ uid: p.uid, data });
    });
  }
  const argAdmin = lower(opts.admin || '');
  if (admin && argAdmin && argAdmin !== admin) warnings.push({ code: 'admin-arg-ignored', admin, arg: argAdmin });
  if (!admin) admin = argAdmin;
  if (!admin) conflicts.push({ code: 'no-admin' });
  allowed.sort();

  const unmapped = [...uids.values()].filter((x) => !u.uidEmail.has(x.uid)).sort((a, b) => (a.uid < b.uid ? -1 : 1));
  const perProject = {};
  out.forEach((p) => { perProject[p.key] = { records: p.records.length, history: p.history.length, invites: p.invites.length }; });
  const sum = (f) => out.reduce((n, p) => n + p[f].length, 0);
  const counts = {
    users: u.users.length, projects: out.length, records: sum('records'), history: sum('history'), invites: sum('invites'),
    pool: pool.length, inbox: inbox.length, allowed: allowed.length, admin: admin ? 1 : 0, prefs: prefs.length,
  };
  return { users: u.users, uidEmail: u.uidEmail, admin, projects: out, pool, inbox, allowed, prefs, counts, perProject, unmapped, warnings, conflicts };
}

// The plan with new ids (spec 4 § 6, step 2): map = Map(old uid → PocketBase user id). Project data, records, history, pool, inbox and prefs data
// mapped by mapIds; record and history keys too (a key equal to a uid); inbox keys by their uid prefix; `members` from the mapped `memberUids`,
// keeping only ids of `userIds` (a Set of the server's users; a relation to a missing user would refuse the whole batch); prefs to the mapped user.
export function materialize(plan, map, userIds) {
  const known = (id) => !userIds || userIds.has(id);
  return {
    admin: plan.admin,
    allowed: plan.allowed.slice(),
    projects: plan.projects.map((p) => {
      const data = mapIds(p.data, map);
      return {
        key: p.key, name: p.name, data,
        members: membersOf(data).filter(known),
        records: p.records.map((r) => ({ coll: r.coll, key: mapIds(r.key, map), data: mapIds(r.data, map) })),
        history: p.history.map((h) => ({ key: mapIds(h.key, map), at: h.at, data: mapIds(h.data, map) })),
        invites: p.invites.map((i) => ({ email: i.email, data: { ...i.data } })),
      };
    }),
    pool: plan.pool.map((x) => ({ kind: x.kind, key: mapIds(x.key, map), data: mapIds(x.data, map) })),
    inbox: plan.inbox.map((x) => ({ key: mapInboxKey(x.key, map), data: mapIds(x.data, map) })),
    prefs: plan.prefs.filter((x) => map.has(x.uid) && known(map.get(x.uid))).map((x) => ({ user: map.get(x.uid), data: mapIds(x.data, map) })),
  };
}

// ---------- the compare ----------

const strip = (doc) => without(doc, ['updatedAtServer']);
const byId = (docs) => { const m = new Map(); (docs || []).forEach((d) => { if (d && d.id != null) m.set(String(d.id), d); }); return m; };

// Differences between a backup and a read-back of the restored server in the backup format (the export of src/domain/pbread.js), spec 4 § 6, step 4.
// back = { projects: [{project, data}], common } with the server's ids; inverse = Map(new id → old uid) (invert of the restore's map).
// `updatedAtServer` is ignored; `allowed` and the administrator compare by e-mail (PocketBase keeps no `at` of its own); what the plan left out on
// purpose (prefs it could not map, unknown common collections) is not expected. Returns [{where, key, what: 'missing'|'extra'|'changed'}].
export function diffRestore(plan, backup, back, inverse) {
  const diffs = [];
  const cmp = (where, want, got) => {
    want.forEach((d, k) => {
      if (!got.has(k)) diffs.push({ where, key: k, what: 'missing' });
      else if (!deepEqual(strip(d), strip(got.get(k)))) diffs.push({ where, key: k, what: 'changed' });
    });
    got.forEach((_d, k) => { if (!want.has(k)) diffs.push({ where, key: k, what: 'extra' }); });
  };
  const planned = new Set(plan.projects.map((p) => p.key));
  const backProjects = new Map();
  ((back && back.projects) || []).forEach((x) => { const m = mapIds(x, inverse); if (m.project && m.project.id) backProjects.set(m.project.id, m); });
  ((backup && backup.projects) || []).forEach(({ project, data }) => {
    if (!project || !planned.has(project.id)) return;
    const got = backProjects.get(project.id);
    if (!got) { diffs.push({ where: 'projects', key: project.id, what: 'missing' }); return; }
    backProjects.delete(project.id);
    if (!deepEqual(strip(project), strip(got.project))) diffs.push({ where: 'projects', key: project.id, what: 'changed' });
    const colls = new Set([...Object.keys(data || {}), ...Object.keys(got.data || {})]);
    [...colls].sort().forEach((c) => cmp(`${project.id}/${c}`, byId((data || {})[c]), byId((got.data || {})[c])));
  });
  backProjects.forEach((_x, k) => diffs.push({ where: 'projects', key: k, what: 'extra' }));

  const wantC = (backup && backup.common && backup.common.collections) || {};
  const gotC = (back && back.common && back.common.collections) || {};
  const kinds = new Set([...Object.keys(wantC), ...Object.keys(gotC)].filter((n) => n.startsWith('pool_') && n !== 'pool_inbox'));
  [...kinds].sort().forEach((n) => cmp(n, byId(wantC[n]), byId(mapIds(gotC[n] || [], inverse))));
  const inboxGot = new Map();
  (gotC.pool_inbox || []).forEach((d) => { const k = mapInboxKey(String(d.id), inverse); inboxGot.set(k, { ...mapIds(d, inverse), id: k }); });
  const inboxWant = new Map();
  (wantC.pool_inbox || []).forEach((d) => inboxWant.set(String(d.id), d));
  cmp('pool_inbox', inboxWant, inboxGot);
  const emails = (docs) => new Map((docs || []).map((d) => [lower(d.email || d.id), {}]));
  cmp('allowed', new Map(plan.allowed.map((e) => [e, {}])), emails(gotC.allowed));
  const gotAdmin = (gotC.meta || []).find((d) => d.id === 'admin');
  if (lower(gotAdmin && gotAdmin.email) !== plan.admin) diffs.push({ where: 'meta', key: 'admin', what: gotAdmin ? 'changed' : 'missing' });
  const prefsWant = new Map(plan.prefs.map((p) => [p.uid, p.data]));
  const prefsGot = new Map(((back && back.common && back.common.prefs) || []).map((p) => [inverse.has(p.uid) ? inverse.get(p.uid) : p.uid, mapIds(p.data, inverse)]));
  cmp('prefs', prefsWant, prefsGot);
  return diffs;
}
