// Server backup logic: the backup run and the cleanup run over a job source, reading projects from Firestore, writing the backup folders and planning a restore.
// Kept free of network setup so tests can cover it; the callers are server-backup.mjs, server-cleanup.mjs, server-restore.mjs, scripts/fs-source.mjs and tests/.
// Uses buildBackup from src/app/backup.js and the retention rules of src/domain/sync.js.
import { buildBackup } from '../src/app/backup.js';
import { isExpiredDeleted, historyCutoff, RETENTION_DAYS } from '../src/domain/sync.js';
import fs from 'node:fs';
import path from 'node:path';

const safe = (s) => String(s || 'проект').replace(/[\\/:*?"<>|]/g, '_').trim() || 'проект';

// Reads a whole project: the document and all its subcollections (the subcollection list comes from the database, so none is missed)
export async function readProject(projectRef, only) {
  const snap = await projectRef.get();
  const project = { id: projectRef.id, ...snap.data() };
  const data = {};
  const cols = await projectRef.listCollections();
  for (const col of cols) {
    if (only && !only.includes(col.id)) continue;
    const docs = await col.get();
    data[col.id] = docs.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  return { project, data };
}

// The economical variant: take the previous full copy and read from the database only what changed after it (the app sets updatedAtServer
// on every write). Once a week a full read is done instead (for records deleted for good).
export async function readProjectDelta(projectRef, prev, since, Timestamp) {
  const snap = await projectRef.get();
  const project = { id: projectRef.id, ...snap.data() };
  const data = {}; let reads = 1;
  const cols = await projectRef.listCollections();
  for (const col of cols) {
    const old = prev.data?.[col.id];
    if (!old) { const docs = await col.get(); reads += docs.size; data[col.id] = docs.docs.map((d) => ({ id: d.id, ...d.data() })); continue; }
    const map = new Map(old.map((d) => [d.id, d]));
    const docs = await col.where('updatedAtServer', '>', Timestamp.fromMillis(since)).get(); reads += docs.size;
    docs.docs.forEach((d) => map.set(d.id, { id: d.id, ...d.data() }));
    data[col.id] = [...map.values()];
  }
  return { project, data, reads };
}

// The previous full copy of each project (by id) from the newest backup folder
export function previousBackups(root) {
  if (!fs.existsSync(root)) return new Map();
  const dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}_\d{4}$/.test(d.name)).map((d) => d.name).sort();
  const out = new Map();
  for (const name of dirs.reverse()) {
    const dir = path.join(root, name);
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('(полная).json'))) {
      try { const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); if (j.project?.id && !out.has(j.project.id)) out.set(j.project.id, j); } catch { /* broken file: skip it */}
    }
    if (out.size) break;
  }
  return out;
}

// Projects deleted in the app (soft deletion) do not go into the backup
export const isDeleted = (project) => project?.deleted === true;

// Backup folder name by time: 2026-10-10_0000 (UTC), sorts as a date
export const stamp = (now) => now.toISOString().slice(0, 16).replace('T', '_').replace(':', '');

// Writes two copies of a project: «для импорта» (like the «Резервная копия» button) and a full one (everything, including history and members)
// shared: the pool's shared lists for the «для импорта» copy ({ delayReasons, culprits, problems }, see sharedOf);
// mark: extra keys of the full copy (the PocketBase source adds {source: 'pocketbase'}), none for Firestore
export function writeProjectBackup(dir, { project, data, fullAt }, now, shared = {}, mark = null) {
  const base = safe(project.name);
  const importable = buildBackup(project, data, now, shared);
  const counts = {};
  Object.entries(data).forEach(([k, v]) => { counts[k] = v.length; });
  fs.writeFileSync(path.join(dir, `${base} (импорт).json`), JSON.stringify(importable));
  fs.writeFileSync(path.join(dir, `${base} (полная).json`), JSON.stringify({ format: 'polevoy-full-1', createdAt: now.toISOString(), fullAt: fullAt || now.toISOString(), project, data, ...(mark || {}) }));
  return { id: project.id, name: project.name, counts };
}

// Keeps only the last `keep` backup folders (names sort by time)
export function pruneOld(root, keep) {
  const dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}_\d{4}$/.test(d.name)).map((d) => d.name).sort();
  const drop = dirs.slice(0, Math.max(0, dirs.length - keep));
  drop.forEach((n) => fs.rmSync(path.join(root, n), { recursive: true, force: true }));
  return drop;
}

// ---------- common data (not projects): the shared pool, the allowed e-mails, users' personal settings ----------
// The shared lists of the pool from the common data (ADR 0016) → { delayReasons, culprits, problems }
export const sharedOf = (common) => Object.fromEntries(['delayReasons', 'culprits', 'problems'].map((k) => [k, common?.collections?.[`pool_${k}`] || []]));

// Reads every root collection except projects, and the documents users/{uid}/prefs/{id}
export async function readCommon(db) {
  const out = { format: 'polevoy-common-1', collections: {}, prefs: [] };
  for (const col of await db.listCollections()) {
    if (col.id === 'projects' || col.id === 'users') continue;
    const docs = await col.get();
    out.collections[col.id] = docs.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  const prefs = await db.collectionGroup('prefs').get();
  out.prefs = prefs.docs.filter((d) => d.ref.parent.parent?.parent?.id === 'users').map((d) => ({ uid: d.ref.parent.parent.id, id: d.id, data: d.data() }));
  return out;
}

// ---------- the backup run and the cleanup run over a job source (scripts/fs-source.mjs or scripts/pb-source.mjs) ----------
export const KEEP_BACKUPS = 15;
const WEEK = 7 * 864e5;

// The whole backup into a new folder of `root`: every project not deleted (two copies each), the common file, the summary file, the last 15 folders kept,
// `serverBackupAt` written into each project. A delta source reads only what changed since the previous copy (a full read once a week or with full);
// other sources read everything. Lines go to `log` (GitHub annotations). No project at all → an error with code 'no-projects', nothing written but the folder.
export async function runServerBackup(source, root, { now = new Date(), full = false, log = console.log } = {}) {
  const dir = path.join(root, stamp(now));
  fs.mkdirSync(dir, { recursive: true });
  const ids = await source.projectIds();
  if (!ids.length) { const e = new Error('В базе нет проектов: копия не создана'); e.code = 'no-projects'; throw e; }
  const done = []; let reads = 0;
  // the shared pool, the allowed e-mails and personal settings (the dictionary, what was learned from drawings): a new database cannot be restored without them.
  // Read first: the «для импорта» copies take the shared lists (delay reasons, culprits, problems) from it
  const common = await source.readCommon();
  const shared = sharedOf(common);
  const prevs = source.delta ? previousBackups(root) : new Map();
  for (const id of ids) {
    const prev = prevs.get(id);
    const prevAt = prev ? Date.parse(prev.createdAt) : 0; const fullAt = prev ? Date.parse(prev.fullAt || prev.createdAt) : 0;
    let p;
    if (!full && prev && now - fullAt < WEEK) { p = await source.readProjectDelta(id, prev, prevAt - 30 * 60e3); p.fullAt = new Date(fullAt).toISOString(); }
    else { p = await source.readProject(id); p.reads = Object.values(p.data).reduce((n, v) => n + v.length, 1); }
    reads += p.reads;
    if (isDeleted(p.project)) { log(`Пропущен удалённый проект: ${p.project.name}`); continue; }
    done.push(writeProjectBackup(dir, p, now, shared, source.exportMark));
    // a mark in the project so the app can show the date of the last auto-backup
    await source.setProject(id, { serverBackupAt: now.toISOString() });
  }
  const commonCount = Object.values(common.collections).reduce((n, v) => n + v.length, 0) + common.prefs.length;
  reads += commonCount;
  fs.writeFileSync(path.join(dir, COMMON_FILE), JSON.stringify({ ...common, createdAt: now.toISOString() }));
  log(`::notice::Общее: ${Object.entries(common.collections).map(([k, v]) => `${k} ${v.length}`).join(', ')}, настройки ${common.prefs.length}`);
  fs.writeFileSync(path.join(dir, 'ИТОГ.json'), JSON.stringify({ at: now.toISOString(), projects: done }, null, 2));
  const dropped = pruneOld(root, KEEP_BACKUPS);
  log(`::notice::Скопировано проектов: ${done.length}. Прочитано документов из базы: ${reads}. Удалено старых копий: ${dropped.length}.`);
  done.forEach((d) => log(`::notice::${d.name}: ${Object.entries(d.counts).map(([k, v]) => `${k} ${v}`).join(', ')}`));
  return { dir, done, reads, dropped };
}

// Permanent deletion of what was marked deleted over a year ago (whole projects, records) and of history older than a year (src/domain/sync.js rules).
// At most `max` per collection per run (Firestore: each project's subcollection; PocketBase: `records` and `history` in the whole run). dry: only reports.
export async function runCleanup(source, { now = Date.now(), dry = false, max = 5000, log = console.log } = {}) {
  const total = { projects: 0, records: 0, history: 0 };
  const cutoff = historyCutoff(now); const budget = {}; const tag = dry ? '[проба] ' : '';
  for (const id of await source.projectIds()) {
    const project = await source.head(id);
    // a project deleted over a year ago goes entirely, with all its data
    if (project && isExpiredDeleted(project, now)) {
      log(`${tag}Проект «${project.name}» удалён навсегда (удалён ${new Date(project.deletedAt).toISOString().slice(0, 10)})`);
      if (!dry) await source.deleteProject(id);
      total.projects += 1;
      continue;
    }
    for (const g of await source.cleanupCandidates(id, project, { cutoff, max, budget })) {
      const refs = (g.kind === 'history' ? g.items : g.items.filter((x) => isExpiredDeleted(x.data, now))).map((x) => x.ref);
      total[g.kind] += refs.length;
      if (refs.length) log(`${tag}${project?.name || id}: ${g.coll} — ${refs.length}`);
      if (!dry && refs.length) await source.removeAll(refs);
    }
  }
  log(`${tag}Очистка (срок хранения ${RETENTION_DAYS} дн.): проектов ${total.projects}, записей ${total.records}, записей истории ${total.history}.`);
  return total;
}

// ---------- restore into an empty database (a new Firebase project) ----------
// In the backup JSON, Firestore timestamps are stored as { _seconds, _nanoseconds }; turn them back into Timestamp
export function revive(v, Timestamp) {
  if (Array.isArray(v)) return v.map((x) => revive(x, Timestamp));
  if (v && typeof v === 'object') {
    const k = Object.keys(v);
    if (k.length === 2 && '_seconds' in v && '_nanoseconds' in v) return new Timestamp(v._seconds, v._nanoseconds);
    return Object.fromEntries(Object.entries(v).map(([a, b]) => [a, revive(b, Timestamp)]));
  }
  return v;
}

// The list of writes to restore from a backup folder: [{ path: 'projects/ID/points/X', data }]
export function restorePlan(dir) {
  const writes = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('(полная).json'))) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (j.format !== 'polevoy-full-1' || !j.project?.id) continue;
    const { id, ...project } = j.project;
    writes.push({ path: `projects/${id}`, data: project });
    for (const [coll, docs] of Object.entries(j.data || {})) {
      for (const d of docs) { const { id: did, ...rest } = d; writes.push({ path: `projects/${id}/${coll}/${did}`, data: rest }); }
    }
  }
  const common = path.join(dir, COMMON_FILE);
  if (fs.existsSync(common)) {
    const c = JSON.parse(fs.readFileSync(common, 'utf8'));
    for (const [coll, docs] of Object.entries(c.collections || {})) for (const d of docs) { const { id, ...rest } = d; writes.push({ path: `${coll}/${id}`, data: rest }); }
    for (const p of c.prefs || []) writes.push({ path: `users/${p.uid}/prefs/${p.id}`, data: p.data });
  }
  return writes;
}
export const COMMON_FILE = 'ОБЩЕЕ (пул, разрешённые почты, настройки).json';
