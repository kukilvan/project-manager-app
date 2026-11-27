// The shared lists inside the app (ADR 0016): listens to pool_delayReasons, pool_culprits and pool_problems, merges the projects' old lists into the pool once and seeds empty lists with their defaults.
// Reads and writes through the repo (`listenPool` with deleted documents, `readColl`, `readPool`, `savePool`, `saveProject`), hands the documents to store.js (`setShared`);
// the merge plan comes from src/domain/shared.js. Started by shell.js next to the shared pool; a database that refuses the read gets one «rules out of date» toast.
import { state, getRepo, subscribe, liveProjects, setShared, demo } from './store.js';
import { SHARED_KINDS, LEGACY_KINDS, mergePlan, applyMerge, DELAY_REASONS, CULPRITS, EXAMPLE_PROBLEMS } from '../domain/index.js';
import { toast } from './ui.js';
import { info, error } from '../log.js';

// Written into a pool collection that has no document at all (not even a deleted one)
export const SHARED_DEFAULTS = { delayReasons: DELAY_REASONS, culprits: CULPRITS, problems: EXAMPLE_PROBLEMS };

export const sharedPool = Object.fromEntries(SHARED_KINDS.map((k) => [k, new Map()]));
const loaded = new Set();
let repo = null;          // the real repo, taken at start (the tour's demo swaps the store's repo)
let running = false;      // a merge run is going on
let halted = false;       // a read or a write failed: no more tries until the next start
let seeded = false;       // the empty-list check has been done in this start
let warned = false;       // a «rules out of date» toast (read or write) is shown once per start
const merged = new Set(); // projects merged in this start (their `sharedLists` mark may not have come back yet)

export function startShared() {
  if (repo || !getRepo()) return;
  repo = getRepo();
  SHARED_KINDS.forEach((k) => repo.listenPool(k, (docs) => {
    sharedPool[k] = new Map(docs.filter((x) => x?.id != null).map((x) => [x.id, x]));
    loaded.add(k); setShared(k, docs); kick();
  }, { withDeleted: true, onError: unreadable }));
  subscribe(kick);
  window.addEventListener('online', kick);
}

// Projects whose old lists are not merged yet, newest work first (a project not yet on the server waits)
const unmerged = () => liveProjects().filter((p) => !(Number(p.sharedLists) >= 1) && !merged.has(p.id) && !p._pending)
  .sort((a, b) => (b.lastWorkDate || 0) - (a.lastWorkDate || 0));

// Called on every store change: cheap checks, then one run at a time
function kick() {
  if (running || halted || demo.on || !repo || !state.projectsLoaded || !navigator.onLine || loaded.size < SHARED_KINDS.length) return;
  const todo = unmerged();
  if (!todo.length && seeded) return;
  running = true;
  run(todo).catch((e) => halt('сбой', e)).finally(() => { running = false; });
}

function halt(what, e) { halted = true; error('Общие списки', `${what}: ${e?.code || ''} ${e?.message || e}`); }
function warnRules(message) { if (!warned) { warned = true; toast(message, 12000); } }
function rejected(e) {
  halt('запись отклонена', e);
  warnRules('Общий список не записался: правила базы устарели — их нужно обновить в Firebase.');
}
// A shared list's listener ended with an error. Refused (rules older than the shared lists, KI-8): no merge and no seeding in this start.
// Other errors show on the «⬇» badge only; the repo has logged them.
function unreadable(e) {
  if (e?.code !== 'permission-denied') return;
  if (!halted) info(`Общие списки: нет прав на чтение (${e.code}) — правила базы устарели`);
  halted = true;
  warnRules('Общие списки не читаются: правила базы устарели — вставьте свежие правила в Firebase («🔌 Подключение к базе» → «📋 Скопировать правила»).');
}
const byId = (docs) => new Map(docs.filter((x) => x?.id != null).map((x) => [x.id, x]));
// pool writes, waited for; a rejection throws
async function write(ops) { for (let i = 0; i < ops.length; i += 400) await repo.savePool(ops.slice(i, i + 400), { strict: true }); }

async function run(todo) {
  if (todo.length) {
    // 1. the pool and each project's old lists, read from the server (offline or an error → stop, retry at the next start)
    let pools;
    try { pools = Object.fromEntries(await Promise.all(LEGACY_KINDS.map(async (k) => [k, byId(await repo.readPool(k))]))); } catch (e) { halt('чтение общего списка', e); return; }
    for (const p of todo) {
      if (demo.on) return;
      let items;
      try { items = Object.fromEntries(await Promise.all(LEGACY_KINDS.map(async (k) => [k, await repo.readColl(p.id, k)]))); } catch (e) { halt(`чтение списков проекта «${p.name}»`, e); return; }
      // 2. the plan; 3. the pool write first, the project's mark only after it succeeded
      const plans = Object.fromEntries(LEGACY_KINDS.map((k) => [k, mergePlan(pools[k], items[k], p.name || '')]));
      const ops = LEGACY_KINDS.flatMap((k) => plans[k].ops.map((o) => ({ coll: k, id: o.id, data: o.data })));
      if (ops.length) { try { await write(ops); } catch (e) { rejected(e); return; } }
      LEGACY_KINDS.forEach((k) => { pools[k] = applyMerge(pools[k], plans[k].ops); });   // the next project sees them
      merged.add(p.id);
      repo.saveProject(p.id, { sharedLists: 1 });
      // 4. the event log
      const added = (k) => plans[k].ops.filter((o) => o.added).length;
      info(`Общие списки: проект «${p.name || p.id}» — причин +${added('delayReasons')}, виновников +${added('culprits')}`);
      LEGACY_KINDS.flatMap((k) => plans[k].conflicts).forEach((c) => info(`Общие списки: «${c.id}» — иврит «${c.kept}» оставлен, «${c.other}» из проекта «${c.project}» не взят`));
    }
  }
  if (!seeded) await seed();
}

// An empty list on the listener is confirmed by the server (a new device's cache may be empty); a collection with no document at all gets its defaults
async function seed() {
  for (const [k, defaults] of Object.entries(SHARED_DEFAULTS)) {
    if (sharedPool[k].size) continue;
    let docs;
    try { docs = await repo.readPool(k); } catch (e) { halt(`чтение общего списка ${k}`, e); return; }
    if (docs.length) continue;
    try { await write(defaults.map(({ id, ...data }) => ({ coll: k, id, data: { ...data, deleted: false } }))); } catch (e) { rejected(e); return; }
    info(`Общие списки: ${k} — записан начальный список (${defaults.length})`);
  }
  seeded = true;
}

// test mode (?mem=1): look at the lists and start a run by hand
if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('mem')) window.__pzShared = { sharedPool, kick, merged };
