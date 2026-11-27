// Checks the shared lists (ADR 0016): the lookup view, the pickers' list, the merge plan, the memory backend's pool,
// the backup and import of shared items, startShared with a refused pool (KI-8), the Firestore rules and the nightly job with the `shared` argument.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sharedView, choiceList, mergePlan, applyMerge, sharedImportOps, buildContext, defaultTables, POINT_TYPES, CATALOG } from '../src/domain/index.js';
import { buildBackup } from '../src/app/backup.js';

// repo.js, import.js and their imports touch window, localStorage and location when loaded
globalThis.window ??= { addEventListener() {} };
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.location ??= { search: '' };

const ids = (list) => list.map((x) => x.id);

test('sharedView: the pool lays over the old project list, deleted pool items stay for lookups', () => {
  const v = sharedView(
    [{ id: 'Нет трубы', he: 'אין צינור' }, { id: 'Старая', he: 'ישנה' }, { id: 'Удалена в проекте', he: 'x', deleted: true }],
    [{ id: 'Нет трубы', he: 'אין צינור!' }, { id: 'Общая', he: 'משותפת' }, { id: 'Старая', he: '', deleted: true }],
  );
  assert.equal(v.get('Нет трубы').he, 'אין צינור!'); assert.equal(v.get('Нет трубы').legacy, false);
  assert.equal(v.get('Общая').legacy, false);
  assert.equal(v.get('Старая').deleted, true); assert.equal(v.get('Старая').he, 'ישנה', 'the Hebrew of the old list fills an empty pool one');
  assert.equal(v.has('Удалена в проекте'), false);
  const legacyOnly = sharedView([{ id: 'Своя', he: 'שלי' }], []);
  assert.equal(legacyOnly.get('Своя').legacy, true);
});

test('choiceList: old items before the merge, never an id the administrator deleted', () => {
  const before = sharedView([{ id: 'Б', he: 'b' }, { id: 'А', he: 'a' }], []);
  assert.deepEqual(ids(choiceList(before)), ['А', 'Б']);
  const after = sharedView([{ id: 'А', he: 'a' }, { id: 'Б', he: 'b' }, { id: 'В', he: 'c' }], [{ id: 'А', he: 'a' }, { id: 'Б', he: 'b', deleted: true }]);
  assert.deepEqual(ids(choiceList(after)), ['А', 'В'], 'Б is deleted in the pool: not offered from the old list');
  assert.deepEqual(ids(choiceList(after, ['Б'])), ['А', 'Б', 'В'], 'a record that already has it keeps it in its form');
  assert.deepEqual(ids(choiceList(after, ['Нет такого', undefined, ''])), ['А', 'В', 'Нет такого']);
});

test('mergePlan: added, empty Hebrew filled, conflict listed, deleted skipped, deleted project items ignored', () => {
  const pool = [{ id: 'Есть', he: 'יש' }, { id: 'Пустой', he: '' }, { id: 'Удалён', he: 'x', deleted: true }];
  const items = [
    { id: 'Новый', he: 'חדש' }, { id: 'Пустой', he: 'מלא' }, { id: 'Есть', he: 'אחר' }, { id: 'Есть', he: 'יש' },
    { id: 'Удалён', he: 'y' }, { id: 'Стёрт', he: 'z', deleted: true }, { id: 'Без иврита' },
  ];
  const { ops, conflicts } = mergePlan(pool, items, 'Проект А');
  assert.deepEqual(ops, [
    { id: 'Новый', data: { he: 'חדש', deleted: false }, added: true },
    { id: 'Пустой', data: { he: 'מלא' }, added: false },
    { id: 'Без иврита', data: { he: '', deleted: false }, added: true },
  ]);
  assert.deepEqual(conflicts, [{ id: 'Есть', kept: 'יש', other: 'אחר', project: 'Проект А' }]);
});

test('mergePlan: the second project of a run sees the first one\'s ops', () => {
  let pool = new Map();
  const a = mergePlan(pool, [{ id: 'Общая', he: 'מ-א' }], 'А');
  pool = applyMerge(pool, a.ops);
  const b = mergePlan(pool, [{ id: 'Общая', he: 'מ-ב' }, { id: 'Своя Б', he: 'ב' }], 'Б');
  assert.deepEqual(b.ops.map((o) => o.id), ['Своя Б']);
  assert.deepEqual(b.conflicts, [{ id: 'Общая', kept: 'מ-א', other: 'מ-ב', project: 'Б' }]);
  assert.equal(pool.get('Общая').id, 'Общая');
});

test('buildContext: Hebrew of a pool-only reason and of an old-list reason; deleted pool item still named', () => {
  const ctx = buildContext({
    projects: [{ id: 'p' }], points: [], delayReasons: [{ id: 'Старая', he: 'ישנה' }], culprits: [],
    shared: { delayReasons: [{ id: 'Общая', he: 'משותפת' }, { id: 'Удалена', he: 'נמחקה', deleted: true }], culprits: [{ id: 'Заказчик', he: 'המזמין' }], problems: [{ id: 'pr_x', name: 'X' }] },
  });
  assert.equal(ctx.delayReasons.get('Общая').he, 'משותפת');
  assert.equal(ctx.delayReasons.get('Старая').he, 'ישנה');
  assert.equal(ctx.delayReasons.get('Удалена').he, 'נמחקה');
  assert.equal(ctx.culprits.get('Заказчик').he, 'המזמין');
  assert.equal(ctx.problems.get('pr_x').name, 'X');
  assert.deepEqual(ids(choiceList(ctx.delayReasons)), ['Общая', 'Старая']);
});

test('memory backend: pool remove marks deleted, listenPool passes it, readColl and readPool', async () => {
  const { createMemoryBackend, createRepo } = await import('../src/app/repo.js');
  const backend = createMemoryBackend();
  const repo = createRepo(backend, { uid: 'u', displayName: 'U', email: 'u@x.y' });
  await repo.savePool([{ coll: 'delayReasons', id: 'Нет трубы', data: { he: 'אין צינור', deleted: false } }]);
  await repo.savePool([{ coll: 'delayReasons', id: 'Нет трубы', remove: true }]);
  let seen = [];
  repo.listenPool('delayReasons', (docs) => { seen = docs; }, { withDeleted: true });
  assert.equal(seen.length, 1); assert.equal(seen[0].deleted, true); assert.equal(seen[0].he, 'אין צינור');
  assert.deepEqual((await repo.readPool('delayReasons')).map((x) => [x.id, x.deleted]), [['Нет трубы', true]]);
  // adding the name again brings it back
  await repo.savePool([{ coll: 'delayReasons', id: 'Нет трубы', data: { he: 'אין צינור', deleted: false } }]);
  assert.equal(seen[0].deleted, false);
  // a new project gets no copies of the two lists and is marked merged; readColl reads a project collection
  const pid = repo.createProject({ name: 'Новый' });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(await repo.readColl(pid, 'delayReasons'), []);
  assert.deepEqual(await repo.readColl(pid, 'culprits'), []);
  assert.ok((await repo.readColl(pid, 'units')).length > 0);
  assert.equal(backend.dump().projects.find((p) => p.id === pid).sharedLists, 1);
});

// startShared in Node: a fresh copy of shared.js per case (it starts once per run of the app), a stub page that collects the toasts and mocked timers.
// The store holds one old project with its own delay reason, so a start that is not stopped merges it and seeds the empty lists.
async function startedShared(t, tag, makeBackend) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
  const toasts = [];
  globalThis.Node ??= class {};
  const element = () => ({ kids: [], classList: { add() {}, remove() {} }, appendChild(k) { this.kids.push(k); }, remove() { this.gone = true; } });
  globalThis.document = { createElement: element, createTextNode: (s) => s, body: { appendChild: (el) => toasts.push(el) } };
  const { createMemoryBackend, createRepo } = await import('../src/app/repo.js');
  const { backend, base } = await makeBackend(createMemoryBackend);
  await base.commit(null, [{ coll: 'projects', id: 'old', data: { id: 'old', name: 'Old', memberUids: ['u'] } }]);
  await base.commit('old', [{ coll: 'delayReasons', id: 'Старая', data: { id: 'Старая', he: 'ישנה' } }]);
  const writes = [];
  const watched = { ...backend, commitPool: (w) => { writes.push(...w); return backend.commitPool(w); } };
  const store = await import('../src/app/store.js');
  const repo = createRepo(watched, { uid: 'u', displayName: 'U', email: 'u@x.y' });
  store.start(repo);
  t.after(() => store.stop());
  const { startShared } = await import(`../src/app/shared.js?case=${tag}`);
  startShared();
  const settle = async () => { for (let i = 0; i < 10; i++) { t.mock.timers.tick(1); await new Promise((r) => setImmediate(r)); } };
  await settle();
  const mark = () => base.dump().projects.find((p) => p.id === 'old').sharedLists;
  return { toasts, writes, repo, settle, mark };
}
const NOT_READ = /^Общие списки не читаются: правила базы устарели/;
const refusal = (code) => Object.assign(new Error('refused'), { code });
// a backend whose pool listeners end with `code`; with `answers` the lists arrive as well (from the phone's cache)
const failingPool = (code, { answers = false } = {}) => (createMemoryBackend) => {
  const base = createMemoryBackend();
  return { base, backend: { ...base, listenPool(kind, cb, { onError } = {}) { onError?.(refusal(code)); if (answers) cb([]); return () => {}; } } };
};

test('startShared, memory backend with a denied pool (?memPoolDenied=1): one long toast, no merge, no seeding (KI-8)', async (t) => {
  const s = await startedShared(t, 'memory', (createMemoryBackend) => { const base = createMemoryBackend({ poolDenied: true }); return { base, backend: base }; });
  assert.equal(s.toasts.length, 1, 'three lists refused, one toast');
  assert.match(s.toasts[0].kids[0], NOT_READ);
  // a new project: empty shared lists, still nothing written
  const pid = s.repo.createProject({ name: 'Новый' });
  await s.settle();
  assert.deepEqual(await s.repo.readColl(pid, 'delayReasons'), []);
  assert.deepEqual(s.writes.filter((w) => ['delayReasons', 'culprits', 'problems'].includes(w.coll)), []);
  assert.equal(s.mark(), undefined, 'the old project is not marked merged');
  assert.equal(s.toasts.length, 1);
  t.mock.timers.tick(3000);
  assert.ok(!s.toasts[0].gone, 'long enough to read');
  t.mock.timers.tick(10000);
  t.mock.timers.tick(300);   // the fade-out
  assert.ok(s.toasts[0].gone);
});

test('startShared: after a refusal the lists that still arrive are not merged or seeded', async (t) => {
  const s = await startedShared(t, 'cached', failingPool('permission-denied', { answers: true }));
  assert.equal(s.toasts.length, 1);
  assert.deepEqual(s.writes, []);
  assert.equal(s.mark(), undefined);
});

test('startShared: another listener error shows no toast', async (t) => {
  const s = await startedShared(t, 'other', failingPool('resource-exhausted'));
  assert.equal(s.toasts.length, 0);
  assert.deepEqual(s.writes, []);
});

test('startShared: without an error the old project is merged and the empty lists are seeded', async (t) => {
  const s = await startedShared(t, 'ok', (createMemoryBackend) => { const base = createMemoryBackend(); return { base, backend: base }; });
  assert.equal(s.toasts.length, 0);
  assert.equal(s.mark(), 1);
  assert.ok(s.writes.some((w) => w.coll === 'delayReasons' && w.id === 'Старая'));
  assert.ok(s.writes.some((w) => w.coll === 'problems'));
});

test('startShared with the PocketBase backend\'s onError: the reader\'s refusal of the pool shows the toast once', async (t) => {
  const { openLocalCopy } = await import('../src/app/pb/localcopy.js');
  const { createPocketBaseBackend } = await import('../src/app/pb/backend.js');
  const { copy } = await openLocalCopy({ uid: 'u', idb: null, win: null, doc: null });
  let pb;
  const s = await startedShared(t, 'pb', (createMemoryBackend) => {
    pb = createPocketBaseBackend({ copy, user: { uid: 'u', email: 'u@x.y' }, isAdmin: () => false });
    const base = createMemoryBackend();   // projects and the old list; the pool listeners are PocketBase's
    return { base, backend: { ...base, listenPool: pb.listenPool.bind(pb) } };
  });
  assert.equal(s.toasts.length, 0, 'no refusal yet');
  pb.poolRefused({ status: 403, message: 'Forbidden' });
  pb.poolRefused({ status: 403 });
  assert.equal(s.toasts.length, 1);
  assert.match(s.toasts[0].kids[0], NOT_READ);
});

test('savePool strict: a rejected write rejects the promise; without strict it does not', async () => {
  const { createMemoryBackend, createRepo } = await import('../src/app/repo.js');
  const backend = { ...createMemoryBackend(), commitPool: async () => { throw Object.assign(new Error('denied'), { code: 'permission-denied' }); } };
  const repo = createRepo(backend, { uid: 'u', displayName: 'U' });
  await assert.rejects(repo.savePool([{ coll: 'culprits', id: 'X', data: { he: 'x' } }], { strict: true }), /denied/);
  await repo.savePool([{ coll: 'culprits', id: 'X', data: { he: 'x' } }]);
});

test('buildBackup: the shared lists come from the pool (live items), not from the project', () => {
  const data = { points: [], delayReasons: [{ id: 'Старая', he: 'ישנה' }], culprits: [{ id: 'Старый' }], units: [{ id: 'шт' }] };
  const shared = { delayReasons: [{ id: 'Общая', he: 'משותפת' }, { id: 'Удалена', deleted: true }], culprits: [{ id: 'Заказчик' }], problems: [{ id: 'pr_lock', name: 'Замок' }] };
  const b = buildBackup({ id: 'P', name: 'X' }, data, new Date(), shared);
  assert.deepEqual(ids(b.reference.delayReasons), ['Общая']);
  assert.deepEqual(ids(b.reference.culprits), ['Заказчик']);
  assert.deepEqual(ids(b.reference.problems), ['pr_lock']);
  assert.deepEqual(ids(b.reference.units), ['шт']);
  assert.deepEqual(buildBackup({ id: 'P', name: 'X' }, data).reference.delayReasons, []);
});

test('sharedImportOps and runImport: missing shared items go to the pool only, deleted ones are not revived', async () => {
  const reference = {
    delayReasons: [{ id: 'Новая', he: 'חדשה', projectId: 'old', updatedAtServer: { _seconds: 1 } }, { id: 'Есть', he: 'x' }, { id: 'Удалена', he: 'y' }],
    culprits: [{ id: 'Заказчик', he: 'המזמין' }], units: [{ id: 'шт', he: 'יח' }],
  };
  const pools = { delayReasons: [{ id: 'Есть', he: 'יש' }, { id: 'Удалена', deleted: true }], culprits: [] };
  assert.deepEqual(sharedImportOps(reference, pools), [
    { coll: 'delayReasons', id: 'Новая', data: { he: 'חדשה', deleted: false } },
    { coll: 'culprits', id: 'Заказчик', data: { he: 'המזמין', deleted: false } },
  ]);
  const { runImport } = await import('../src/app/views/import.js');
  const saved = []; const pooled = [];
  const repo = { by: { uid: 'u', name: 'U' }, save: (pid, ops) => saved.push(...ops), savePool: (ops) => pooled.push(...ops), saveProject() {} };
  const file = { format: 'polevoy-import-1', points: [], journal: [], days: [], entries: [], cabinetSettings: [], todos: [], notes: [], pulls: [], reference };
  runImport(repo, 'P', file, { replace: false }, { data: { units: [] }, shared: pools });
  assert.deepEqual(saved.map((o) => [o.coll, o.id]), [['units', 'шт']], 'no shared item goes into the project');
  assert.deepEqual(pooled.map((o) => [o.coll, o.id]), [['delayReasons', 'Новая'], ['culprits', 'Заказчик']]);
});

test('firestore.rules: the three shared-list blocks with the door-configuration condition', () => {
  const rules = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  for (const kind of ['delayReasons', 'culprits', 'problems']) {
    const line = rules.split('\n').find((l) => l.includes(`match /pool_${kind}/{id}`));
    assert.ok(line, `pool_${kind} has no rule`);
    assert.match(line, /allow read: if signedIn\(\);/);
    assert.match(line, /allow create, update: if poolAdmin\(\) \|\| \(allowed\(\) && request\.resource\.data\.get\('deleted', false\) == false\);/);
    assert.match(line, /allow delete: if poolAdmin\(\);/);
  }
});

test('nightly job: the shared argument gives the Hebrew of a pool-only delay reason in the sheet', async () => {
  const { updateProjectTables } = await import('../scripts/server-tables-lib.mjs');
  const project = { id: 'p1', name: 'P', tables: [{ ...defaultTables()[1], lang: 'he', auto: true, fileId: 'F1' }] };
  const data = { points: [{ id: 'a', projectId: 'p1', label: 'C01', typeId: 'Камера', cabinet: '1A', delayReasonId: 'Нет доступа' }], types: POINT_TYPES, catalog: CATALOG, cables: [], delayReasons: [] };
  const run = async (shared) => {
    const written = [];
    const api = { fileInfo: async (id) => ({ id, name: 'x' }), rename: async () => {}, sheetsOf: async () => [{ sheetId: 0, title: 'S' }], batch: async () => {}, write: async (id, d) => { written.push(JSON.stringify(d)); } };
    await updateProjectTables(api, project, data, new Date('2026-11-17T00:00:00Z'), shared);
    return written.join('');
  };
  assert.match(await run({ delayReasons: [{ id: 'Нет доступа', he: 'אין גישה' }] }), /אין גישה/);
  assert.doesNotMatch(await run(), /אין גישה/);
});
