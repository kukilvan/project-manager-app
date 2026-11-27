#!/usr/bin/env node
// The restore tool: loads a full server backup folder (from Firebase or a PocketBase export) into an empty PocketBase with the same ids, then checks counts and contents.
// Plan, write, resume, count check and --verify of spec 4 § 6; the rules (users by e-mail, the uid mapping, conflicts, the compare) live in src/domain/pbrestore.js.
// Talks to PocketBase over HTTP as a superuser (scripts/pb-source.mjs client; writes as superuser batches through /api/batch, which the NAS switches on, R-PB-5),
// reads back through the PocketBase job source, so --verify compares the export of ticket 11 with the backup. No npm install.
// Run (the password only in a file, never on the command line; it is never printed):
//   node scripts/pb-restore.mjs <backup folder>                         — only the plan (no server needed)
//   PB_URL=http://127.0.0.1:8090 PB_SUPERUSER_EMAIL=<e-mail> PB_SUPERUSER_PASSWORD_FILE=<file> node scripts/pb-restore.mjs <folder> --write [--verify]
//   … --write --resume   — continues an interrupted run (skips every record that exists);  … --verify — only the count check and the compare
//   --admin <e-mail>     — the administrator when the backup has none (meta/admin)
// Test knobs (tests/pb-restore-live.test.js cuts a run in the middle): PM_RESTORE_BATCH (requests per batch, default 500), PM_RESTORE_PAUSE_MS (pause after each batch).
//
// Contents:
// - readBackupFolder(dir) — the «(полная).json» files and the common file of a backup folder
// - printPlan(plan, log) — counts, users, warnings, conflicts
// - writeRestore(plan, client, opts) — users, administrator, allowed, projects, records, history, invitations, pool, inbox, prefs
// - countCheck(plan, client, log), verifyRestore(plan, backup, client, map, log)
// - runRestore(opts) — the whole run as the command line does it; returns the exit code
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { planRestore, materialize, diffRestore, invert } from '../src/domain/pbrestore.js';
import { quote } from '../src/domain/pbread.js';
import { createPocketBaseClient, createPocketBaseSource, superuserToken } from './pb-source.mjs';
import { COMMON_FILE } from './server-backup-lib.mjs';

export const BATCH = 500;

// ---------- the folder ----------

// { projects: [{project, data}], common, source, files } of a backup folder (a polevoy-backups folder or the unpacked Drive zip);
// source = 'pocketbase' when the full copies carry that mark, else 'firebase'
export function readBackupFolder(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error(`Папка копии не найдена: ${dir}`);
  const projects = []; const files = []; let source = 'firebase';
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('(полная).json')).sort()) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (j.format !== 'polevoy-full-1' || !j.project || !j.project.id) continue;
    if (j.source) source = j.source;
    projects.push({ project: j.project, data: j.data || {} });
    files.push(f);
  }
  const cf = path.join(dir, COMMON_FILE);
  const common = fs.existsSync(cf) ? JSON.parse(fs.readFileSync(cf, 'utf8')) : null;
  if (!projects.length && !common) throw new Error(`В папке нет файлов копии («… (полная).json» и «${COMMON_FILE}»): ${dir}`);
  return { projects, common, source, files };
}

// ---------- printing ----------

const COLLS = ['users', 'projects', 'records', 'history', 'invites', 'pool', 'inbox', 'allowed', 'admin', 'prefs'];
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const secs = (t0) => `${((Date.now() - t0) / 1000).toFixed(1)} с`;

function describe(w) {
  switch (w.code) {
    case 'pair-length': return `проект ${w.project}: memberUids (${w.uids}) и memberEmails (${w.emails}) разной длины — участники этого проекта не сопоставлены`;
    case 'uid-two-emails': return `uid ${w.uid} встречается с двумя почтами: ${w.emails.join(', ')}`;
    case 'email-two-uids': return `почта ${w.email} встречается с несколькими uid: ${w.uids.join(', ')}`;
    case 'unknown-kind': return `неизвестный общий список pool_${w.kind} (${w.n}) — восстановится как есть, приложение его не читает`;
    case 'unknown-meta': return `документ meta/${w.id} не восстанавливается (известен только meta/admin)`;
    case 'unknown-collection': return `общая коллекция ${w.name} (${w.n}) не восстанавливается`;
    case 'prefs-not-main': return `личные настройки ${w.uid}/${w.id} не восстанавливаются (известны только main)`;
    case 'prefs-skipped': return `личные настройки uid ${w.uid} не восстанавливаются: у него нет почты ни в одном проекте`;
    case 'admin-arg-ignored': return `--admin ${w.arg} не используется: в копии администратор ${w.admin}`;
    case 'duplicate': return `ключ повторяется: ${w.coll}${w.project ? ` (проект ${w.project})` : ''} «${w.key}»`;
    case 'too-long': return `ключ длиннее допустимого (${w.length}): ${w.coll}${w.project ? ` (проект ${w.project})` : ''} «${w.key}…»`;
    case 'no-id': return `документ без id: ${w.coll}${w.project ? ` (проект ${w.project})` : ''}`;
    case 'bad-coll': return `имя коллекции не подходит PocketBase: ${w.coll} (проект ${w.project}, документов ${w.n})`;
    case 'no-admin': return 'в копии нет администратора (meta/admin): укажите --admin <почта>';
    default: return JSON.stringify(w);
  }
}

export function printPlan(plan, log = console.log) {
  log('План восстановления:');
  COLLS.forEach((c) => log(`  ${pad(c, 10)} ${lpad(plan.counts[c], 7)}`));
  plan.projects.forEach((p) => { const n = plan.perProject[p.key]; log(`  проект «${p.name}» (${p.key}): записей ${n.records}, истории ${n.history}, приглашений ${n.invites}`); });
  log(`Пользователи (по почте; создаются с этой почтой, вход через Google найдёт их по ней): ${plan.users.length}`);
  plan.users.forEach((u) => log(`  ${u.email}${u.name ? ` — ${u.name}` : ''} ← ${u.uids.join(', ')}`));
  log(`Администратор: ${plan.admin || '—'}`);
  if (plan.unmapped.length) {
    log(`Предупреждение: uid без почты остаются как есть (${plan.unmapped.length}; в истории видно сохранённое имя автора):`);
    plan.unmapped.forEach((x) => log(`  ${x.uid} — ${x.n} раз (${x.where.slice(0, 5).join(', ')}${x.where.length > 5 ? ', …' : ''})`));
  }
  plan.warnings.forEach((w) => log(`Предупреждение: ${describe(w)}`));
  plan.conflicts.forEach((w) => log(`Конфликт: ${describe(w)}`));
}

// ---------- writing ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randomPassword = () => crypto.randomBytes(24).toString('base64url').slice(0, 32);

// Sends `items` ([{coll, body, label}]) as superuser batches of `size`, one after another; a 429 waits 2 s and is sent again. A refused batch saves
// nothing (PocketBase runs a batch in one transaction) and throws, naming the record. Returns the created records (the batch answers' bodies).
async function sendBatches(client, what, items, { size = BATCH, pauseMs = 0, log = console.log } = {}) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    const part = items.slice(i, i + size);
    const requests = part.map((x) => ({ method: 'POST', url: `/api/collections/${x.coll}/records`, body: x.body }));
    for (let tries = 0; ; tries++) {
      try {
        const r = await client.call('/api/batch', { method: 'POST', body: { requests } });
        (r || []).forEach((x) => out.push(x && x.body));
        break;
      } catch (e) {
        if (e.status === 429 && tries < 30) { await sleep(2000); continue; }
        const reqs = e.json && e.json.data && e.json.data.requests;
        const k = reqs && Object.keys(reqs).map(Number).find((n) => Number.isInteger(n));
        const bad = k !== undefined ? part[k] : null;
        const why = bad && reqs[k] ? JSON.stringify(reqs[k]).slice(0, 300) : '';
        throw new Error(`${what}: пакет не записан (${e.message})${bad ? `; запись ${bad.label}: ${why}` : ''}`);
      }
    }
    log(`  ${what}: ${Math.min(i + size, items.length)} из ${items.length}`);
    if (pauseMs) await sleep(pauseMs);
  }
  return out;
}

// e-mail (lower case) → PocketBase user id of every user on the server
async function serverUsers(client) {
  const m = new Map();
  (await client.listAll('users', '', { fields: 'id,email,updated' })).forEach((u) => { if (u.email) m.set(String(u.email).toLowerCase(), u.id); });
  return m;
}
// old uid → PocketBase user id, by the users' e-mails
function uidMap(plan, users) {
  const map = new Map();
  plan.users.forEach((u) => { const id = users.get(u.email); if (id) u.uids.forEach((x) => map.set(x, id)); });
  return map;
}

// The write step (spec 4 § 6, step 2). Refuses a server that has projects unless resume; with resume every record that exists is skipped.
// Returns the uid map. opts: { resume, size, pauseMs, log }
export async function writeRestore(plan, client, opts = {}) {
  const log = opts.log || console.log;
  const send = (what, items) => sendBatches(client, what, items, { size: opts.size, pauseMs: opts.pauseMs, log });
  const existing = await client.count('projects');
  if (existing && !opts.resume) throw Object.assign(new Error(`На сервере уже есть проекты (${existing}). Восстановление пишется только в пустой PocketBase; чтобы продолжить прерванный запуск, добавьте --resume`), { code: 'not-empty' });

  // users: one per e-mail, a random password nobody knows; Google sign-in links to the user by e-mail
  let users = await serverUsers(client);
  const newUsers = plan.users.filter((u) => !users.has(u.email));
  await send('пользователи', newUsers.map((u) => {
    const password = randomPassword();
    return { coll: 'users', label: u.email, body: { email: u.email, name: u.name, password, passwordConfirm: password, verified: true, emailVisibility: false } };
  }));
  if (newUsers.length) users = await serverUsers(client);
  const map = uidMap(plan, users);
  const m = materialize(plan, map, new Set(users.values()));

  // the administrator: the backup's, also over one made by an earlier first sign-in
  const adm = (await client.listAll('admin', 'slot = "admin"'))[0];
  if (!adm) await send('администратор', [{ coll: 'admin', label: m.admin, body: { slot: 'admin', email: m.admin } }]);
  else if (String(adm.email || '').toLowerCase() !== m.admin) {
    await client.call(`/api/collections/admin/records/${adm.id}`, { method: 'PATCH', body: { email: m.admin } });
    log(`  администратор: ${adm.email || '—'} заменён на ${m.admin}`);
  }

  const haveAllowed = new Set((await client.listAll('allowed', '', { fields: 'id,email,updated' })).map((r) => r.email));
  await send('разрешённые почты', m.allowed.filter((e) => !haveAllowed.has(e)).map((e) => ({ coll: 'allowed', label: e, body: { email: e } })));

  const projectIds = async () => new Map((await client.listAll('projects', '', { fields: 'id,key,updated' })).map((r) => [r.key, r.id]));
  let pids = await projectIds();
  await send('проекты', m.projects.filter((p) => !pids.has(p.key)).map((p) => ({ coll: 'projects', label: p.key, body: { key: p.key, members: p.members, data: p.data } })));
  pids = await projectIds();

  const records = []; const history = []; const invites = [];
  const haveHistory = new Set((await client.listAll('history', '', { fields: 'id,key,updated' })).map((r) => r.key));
  for (const p of m.projects) {
    const pid = pids.get(p.key);
    const have = opts.resume ? new Set((await client.listAll('records', `project = ${quote(pid)}`, { fields: 'id,coll,key,updated' })).map((r) => `${r.coll}|${r.key}`)) : new Set();
    p.records.forEach((r) => { if (!have.has(`${r.coll}|${r.key}`)) records.push({ coll: 'records', label: `${p.key}/${r.coll}/${r.key}`, body: { project: pid, coll: r.coll, key: r.key, data: r.data } }); });
    p.history.forEach((h) => { if (!haveHistory.has(h.key)) history.push({ coll: 'history', label: `${p.key}/history/${h.key}`, body: { project: pid, key: h.key, at: h.at, data: h.data } }); });
    const haveInv = new Set((await client.listAll('invites', `project = ${quote(pid)}`, { fields: 'id,email,updated' })).map((r) => r.email));
    p.invites.forEach((i) => { if (!haveInv.has(i.email)) invites.push({ coll: 'invites', label: `${p.key}/${i.email}`, body: { project: pid, email: i.email, data: i.data } }); });
  }
  await send('записи', records);
  await send('история', history);
  await send('приглашения', invites);

  const havePool = new Set((await client.listAll('pool', '', { fields: 'id,kind,key,updated' })).map((r) => `${r.kind}|${r.key}`));
  await send('общие списки', m.pool.filter((x) => !havePool.has(`${x.kind}|${x.key}`)).map((x) => ({ coll: 'pool', label: `${x.kind}/${x.key}`, body: { kind: x.kind, key: x.key, data: x.data } })));
  const haveInbox = new Set((await client.listAll('inbox', '', { fields: 'id,key,updated' })).map((r) => r.key));
  await send('входящие пула', m.inbox.filter((x) => !haveInbox.has(x.key)).map((x) => ({ coll: 'inbox', label: x.key, body: { key: x.key, data: x.data } })));
  const havePrefs = new Set((await client.listAll('prefs', '', { fields: 'id,user,updated' })).map((r) => r.user));
  await send('личные настройки', m.prefs.filter((x) => !havePrefs.has(x.user)).map((x) => ({ coll: 'prefs', label: x.user, body: { user: x.user, data: x.data } })));
  return map;
}

// ---------- checks ----------

// The count check (spec 4 § 6, step 3): the server's counts per collection and per project against the plan, as a ✓/✗ table. Returns true when all match.
export async function countCheck(plan, client, log = console.log) {
  const users = await serverUsers(client);
  const adm = (await client.listAll('admin', 'slot = "admin"'))[0];
  const got = {
    users: plan.users.filter((u) => users.has(u.email)).length,
    projects: await client.count('projects'),
    records: await client.count('records'),
    history: await client.count('history'),
    invites: await client.count('invites'),
    pool: await client.count('pool'),
    inbox: await client.count('inbox'),
    allowed: await client.count('allowed'),
    admin: adm && String(adm.email || '').toLowerCase() === plan.admin ? 1 : 0,
    prefs: await client.count('prefs'),
  };
  let ok = true;
  log('Проверка количества:');
  log(`    ${pad('', 22)} ${lpad('план', 7)} ${lpad('сервер', 7)}`);
  const row = (name, want, have) => { const good = want === have; ok = ok && good; log(`  ${good ? '✓' : '✗'} ${pad(name, 22)} ${lpad(want, 7)} ${lpad(have, 7)}`); };
  COLLS.forEach((c) => row(c, plan.counts[c], got[c]));
  const pids = new Map((await client.listAll('projects', '', { fields: 'id,key,updated' })).map((r) => [r.key, r.id]));
  for (const p of plan.projects) {
    const pid = pids.get(p.key); const n = plan.perProject[p.key];
    const f = pid ? `project = ${quote(pid)}` : '';
    for (const c of ['records', 'history', 'invites']) row(`${p.key.slice(0, 12)}/${c}`, n[c], pid ? await client.count(c, f) : 0);
  }
  return ok;
}

// --verify (spec 4 § 6, step 4): reads everything back as the export does, maps the ids back and compares every document with the backup.
// Returns the differences ([] = equal).
export async function verifyRestore(plan, backup, client, map, log = console.log) {
  const inverse = invert(map);
  if (!inverse) throw new Error('Сверка невозможна: два старых uid стали одним пользователем');
  const src = createPocketBaseSource({ url: client.url, token: client.token });
  const keys = new Set(await src.projectIds());
  const projects = [];
  for (const p of plan.projects) if (keys.has(p.key)) { const r = await src.readProject(p.key); projects.push({ project: r.project, data: r.data }); }
  const back = { projects, common: await src.readCommon() };
  const diffs = diffRestore(plan, backup, back, inverse);
  if (!diffs.length) log('Сверка: все документы совпадают с копией ✓');
  else {
    log(`Сверка: различий ${diffs.length} ✗`);
    diffs.slice(0, 50).forEach((d) => log(`  ${d.what === 'missing' ? 'нет на сервере' : d.what === 'extra' ? 'лишний на сервере' : 'отличается'}: ${d.where} «${d.key}»`));
    if (diffs.length > 50) log(`  … и ещё ${diffs.length - 50}`);
  }
  return diffs;
}

// ---------- the run ----------

// The whole run (the command line calls it). opts: { dir, url, email, password, write, resume, verify, admin, size, pauseMs, log }.
// Returns { code, plan, map }: code 0 = done (or only the plan), 1 = a conflict, a refusal, a count difference or a compare difference.
export async function runRestore(opts) {
  const log = opts.log || console.log;
  let t = Date.now(); const t0 = t;
  const backup = readBackupFolder(opts.dir);
  const plan = planRestore(backup, { admin: opts.admin });
  log(`Копия: ${opts.dir} (${backup.source === 'pocketbase' ? 'выгрузка PocketBase' : 'Firebase'}), проектов ${backup.projects.length}${backup.common ? '' : ', общего файла нет'}`);
  printPlan(plan, log);
  log(`План: ${secs(t)}`);
  if (plan.conflicts.length) { log(`Конфликтов: ${plan.conflicts.length}. Ничего не записано: исправьте копию или сообщите разработчику.`); return { code: 1, plan }; }
  if (!opts.write && !opts.verify) { log('Это проверка. Чтобы записать, добавьте --write (и PB_URL, PB_SUPERUSER_EMAIL, PB_SUPERUSER_PASSWORD_FILE)'); return { code: 0, plan }; }
  if (!opts.url || !opts.email || !opts.password) { log('Нет PB_URL, PB_SUPERUSER_EMAIL или пароля в файле PB_SUPERUSER_PASSWORD_FILE'); return { code: 1, plan }; }
  const token = await superuserToken({ url: opts.url, email: opts.email, password: opts.password }, 'Вход в PocketBase');
  const client = createPocketBaseClient({ url: opts.url, token });
  let map;
  if (opts.write) {
    t = Date.now();
    log(`Запись${opts.resume ? ' (продолжение: существующее пропускается)' : ''}:`);
    try { map = await writeRestore(plan, client, { resume: opts.resume, size: opts.size, pauseMs: opts.pauseMs, log }); } catch (e) { log(e.message); return { code: 1, plan }; }
    log(`Запись: ${secs(t)}`);
  } else map = uidMap(plan, await serverUsers(client));
  t = Date.now();
  const counted = await countCheck(plan, client, log);
  log(`Проверка количества: ${secs(t)}`);
  let same = true;
  if (opts.verify) {
    t = Date.now();
    same = !(await verifyRestore(plan, backup, client, map, log)).length;
    log(`Сверка: ${secs(t)}`);
  }
  const code = counted && same ? 0 : 1;
  log(code ? `Есть различия (всего ${secs(t0)}).` : `Готово (всего ${secs(t0)}).`);
  return { code, plan, map };
}

function argValue(argv, name) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; }

export async function main(argv = process.argv.slice(2), env = process.env) {
  const dir = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--admin');
  if (!dir) { console.error('Укажите папку копии: node scripts/pb-restore.mjs <папка> [--write] [--resume] [--admin <почта>] [--verify]'); return 1; }
  let password = '';
  if (env.PB_SUPERUSER_PASSWORD_FILE) {
    try { password = fs.readFileSync(env.PB_SUPERUSER_PASSWORD_FILE, 'utf8').replace(/\r?\n$/, ''); } catch { console.error(`Не читается файл пароля PB_SUPERUSER_PASSWORD_FILE: ${env.PB_SUPERUSER_PASSWORD_FILE}`); return 1; }
  }
  const { code } = await runRestore({
    dir, url: env.PB_URL, email: env.PB_SUPERUSER_EMAIL, password,
    write: argv.includes('--write'), resume: argv.includes('--resume'), verify: argv.includes('--verify'), admin: argValue(argv, '--admin'),
    size: Number(env.PM_RESTORE_BATCH) || BATCH, pauseMs: Number(env.PM_RESTORE_PAUSE_MS) || 0,
  });
  return code;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }, (e) => { console.error(e.message); process.exitCode = 1; });
}
