// The PocketBase job source: the server jobs' reads and writes on the NAS over HTTP as the `jobs` superuser.
// No SDK and no npm install; the same interface as scripts/fs-source.mjs (listed in its header; spec 4 § 5.2, § 5.3). Records become the backup format through the export part of
// src/domain/pbread.js; project fields are written through the write route POST /api/pm/save (superuser: no rules, nothing stamped), the night sheets'
// list patches as `itemPatches` (src/domain/pbwrite.js), so the read-then-write transaction of Firestore is one request. Every read is a full read
// (no read quota on PocketBase). Cleanup deletes through the record API: a project with its records, history and invitations (cascade), single records.
// Used by scripts/job-source.mjs when PM_SOURCE=pocketbase; its HTTP client and superuser sign-in also by the restore tool scripts/pb-restore.mjs.
// Checked against a real PocketBase by tests/pb-jobs.test.js and tests/pb-restore-live.test.js.
import { PAGE_SIZE, pageFilter, nextAfter, quote, pbTime, exportProject, exportCommon, EXPORT_SOURCE } from '../src/domain/pbread.js';
import { PB_SCHEMA } from '../src/domain/pbwrite.js';
import { applyPatches } from './server-tables-lib.mjs';

const anyOf = (field, values) => `(${values.map((v) => `${field} = ${quote(v)}`).join(' || ')})`;

// A small HTTP client of PocketBase as a superuser (`token`): JSON calls, every record of a collection page by page, a record count.
// Shared by the source below and the restore tool scripts/pb-restore.mjs.
export function createPocketBaseClient({ url, token }) {
  const base = String(url).replace(/\/+$/, '');
  async function call(path, { method = 'GET', body } = {}) {
    const res = await fetch(base + path, { method, headers: { Authorization: token, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    if (!res.ok) { const e = new Error(`PocketBase ${method} ${path.split('?')[0]}: HTTP ${res.status} ${(json && (json.message || json.code)) || text.slice(0, 200)}`); e.status = res.status; e.json = json; throw e; }
    return json;
  }
  // every record of a collection matching `filter`, page by page in `updated,id` order with a keyset (a record changed during the read cannot shift a page)
  async function listAll(coll, filter = '', { max = Infinity, fields = '' } = {}) {
    const out = []; let after = null;
    for (;;) {
      const per = Math.min(PAGE_SIZE, max - out.length);
      if (per <= 0) return out;
      const q = new URLSearchParams({ page: '1', perPage: String(per), sort: 'updated,id', skipTotal: '1' });
      const f = pageFilter(filter, '', after);
      if (f) q.set('filter', f);
      if (fields) q.set('fields', fields);
      const r = await call(`/api/collections/${coll}/records?${q}`);
      out.push(...r.items);
      after = nextAfter(r.items, per);
      if (!after) return out;
    }
  }
  // the number of records of a collection matching `filter`
  async function count(coll, filter = '') {
    const q = new URLSearchParams({ page: '1', perPage: '1', fields: 'id' });
    if (filter) q.set('filter', filter);
    return (await call(`/api/collections/${coll}/records?${q}`)).totalItems;
  }
  return { url: base, token, call, listAll, count };
}

// The source over a PocketBase at `url` with a superuser `token`
export function createPocketBaseSource({ url, token }) {
  const { call, listAll } = createPocketBaseClient({ url, token });
  const projectRec = async (id) => (await listAll('projects', `key = ${quote(id)}`, { max: 1 }))[0] || null;
  const save = (ops) => call('/api/pm/save', { method: 'POST', body: { schema: PB_SCHEMA, ops } });
  const isEmpty = (o) => !o || !Object.keys(o).length;

  return {
    kind: 'pocketbase',
    delta: false,
    exportMark: { source: EXPORT_SOURCE },
    async projectIds() { return (await listAll('projects', '', { fields: 'id,key,updated' })).map((r) => r.key).filter(Boolean).sort(); },
    async head(id) { const r = await projectRec(id); return r ? (r.data || {}) : null; },
    async readProject(id, only) {
      const rec = await projectRec(id);
      if (!rec) throw new Error(`PocketBase: no project ${id}`);
      const colls = only ? only.filter((c) => c !== 'history') : null;
      const records = colls && !colls.length ? [] : await listAll('records', `project = ${quote(rec.id)}${colls ? ` && ${anyOf('coll', colls)}` : ''}`);
      const history = !only || only.includes('history') ? await listAll('history', `project = ${quote(rec.id)}`) : [];
      return { ...exportProject(rec, records, history), reads: 1 + records.length + history.length };
    },
    async readCommon() {
      const [pool, inbox, allowed, admin, prefs] = await Promise.all(['pool', 'inbox', 'allowed', 'admin', 'prefs'].map((c) => listAll(c)));
      return exportCommon({ pool, inbox, allowed, admin, prefs });
    },
    async readPool(kind) { return (await listAll('pool', `kind = ${quote(kind)}`)).map((r) => r.data || {}); },
    async changedSince(id, colls, kinds, since) {
      const at = quote(pbTime(since));
      const rec = await projectRec(id);
      if (rec && colls.length && (await listAll('records', `project = ${quote(rec.id)} && updated > ${at} && ${anyOf('coll', colls)}`, { max: 1, fields: 'id' })).length) return true;
      return !!kinds.length && (await listAll('pool', `updated > ${at} && ${anyOf('kind', kinds)}`, { max: 1, fields: 'id' })).length > 0;
    },
    setProject: (id, fields) => save([{ t: 'project', key: id, data: fields, mode: 'deep' }]),
    // one request: drawings and tables patched item by item on the server's current lists; a project without a `tables` list yet gets the whole list,
    // as the Firestore job writes it; managers and rackTable merge (their patch values are plain fields)
    async patchProject(id, patch) {
      const data = {}; const itemPatches = {};
      if (!isEmpty(patch.drawings)) itemPatches.drawings = patch.drawings;
      if (patch.tables) {
        const head = await this.head(id);
        if (Array.isArray(head && head.tables) && head.tables.length) { if (!isEmpty(patch.tables)) itemPatches.tables = patch.tables; }
        else data.tables = applyPatches(head || {}, patch.tables);
      }
      if (!isEmpty(patch.managers)) data.managers = { drawings: patch.managers };
      if (!isEmpty(patch.rackTable)) data.rackTable = patch.rackTable;
      if (isEmpty(data) && isEmpty(itemPatches)) return null;
      const op = { t: 'project', key: id, data, mode: 'deep' };
      if (!isEmpty(itemPatches)) op.itemPatches = itemPatches;
      return save([op]);
    },
    async deleteProject(id) {
      const rec = await projectRec(id);
      if (rec) await call(`/api/collections/projects/records/${rec.id}`, { method: 'DELETE' });
    },
    // at most `max` per server collection (records, history) in the whole run: `budget` keeps what is left. Records: marked deleted with `deletedAt`
    // at or before the cutoff (the caller checks the rule again); history: `at` before the cutoff. Records are grouped by the app's collection.
    async cleanupCandidates(id, _project, { cutoff, max, budget }) {
      const rec = await projectRec(id);
      if (!rec) return [];
      const left = (c) => (budget[c] === undefined ? (budget[c] = max) : budget[c]);
      const take = async (c, filter) => { const items = await listAll(c, filter, { max: left(c) }); budget[c] -= items.length; return items; };
      const recs = await take('records', `project = ${quote(rec.id)} && data.deleted = true && data.deletedAt > 0 && data.deletedAt <= ${Number(cutoff)}`);
      const hist = await take('history', `project = ${quote(rec.id)} && at < ${Number(cutoff)}`);
      const groups = new Map();
      recs.forEach((r) => { if (!groups.has(r.coll)) groups.set(r.coll, []); groups.get(r.coll).push({ ref: { coll: 'records', id: r.id }, data: r.data || {} }); });
      const out = [...groups.keys()].sort().map((c) => ({ coll: c, kind: 'records', items: groups.get(c) }));
      if (hist.length) out.push({ coll: 'history', kind: 'history', items: hist.map((h) => ({ ref: { coll: 'history', id: h.id }, data: h.data || {} })) });
      return out;
    },
    async removeAll(refs) {
      for (const r of refs) {
        try { await call(`/api/collections/${r.coll}/records/${r.id}`, { method: 'DELETE' }); } catch (e) { if (e.status !== 404) throw e; }
      }
    },
  };
}

// Signs in as a superuser and returns the token; the password never leaves this function. what = whose sign-in, for the error text
export async function superuserToken({ url, email, password }, what = 'Вход заданий в PocketBase') {
  const base = String(url).replace(/\/+$/, '');
  const res = await fetch(`${base}/api/collections/_superusers/auth-with-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity: email, password }) });
  if (!res.ok) throw new Error(`${what} не удался: HTTP ${res.status}`);
  return (await res.json()).token;
}

// Signs in as the jobs superuser and returns the source
export async function openPocketBase({ url, email, password }) {
  if (!email || !password) throw new Error('Нет входа для заданий PocketBase (PB_JOBS_EMAIL и пароль pb_jobs_password)');
  const token = await superuserToken({ url, email, password });
  return createPocketBaseSource({ url: String(url).replace(/\/+$/, ''), token });
}
