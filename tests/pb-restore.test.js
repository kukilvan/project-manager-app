// Checks the restore tool's plan without a server (spec 4 § 6, § 10 cases 20 and 21, § 11): src/domain/pbrestore.js on the synthetic backup of
// tests/fixtures/restore-backup/ (two projects, three users, a removed member, an invitation, shared lists, an inbox entry, Hebrew texts, a history author
// in no member list; no real names or e-mails) — counts, the user map, uid replacement in values, keys and inbox prefixes, conflicts, the administrator
// rule, the compare — and the way back of scripts/server-restore.mjs (runFirestoreRestore) from a PocketBase export into the fake Firestore.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planRestore, materialize, mapIds, mapInboxKey, invert, usersOf, diffRestore, emailKey } from '../src/domain/pbrestore.js';
import { exportProject, exportCommon, pbTime } from '../src/domain/pbread.js';
import { readBackupFolder, runRestore } from '../scripts/pb-restore.mjs';
import { runFirestoreRestore, restorePlan, writeProjectBackup, COMMON_FILE } from '../scripts/server-backup-lib.mjs';
import { createFakeFirestore, Timestamp } from './fake-firestore.js';

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'restore-backup');
const U1 = 'FbAlphaUid0000000000000001aa'; const U2 = 'FbBravoUid0000000000000002bb'; const U3 = 'FbCharlieUid00000000000003cc'; const UX = 'FbOldHelperUid000000000009xx';
const A = 'tester.a@example.test'; const B = 'tester.b@example.test'; const C = 'tester.c@example.test';
const PB = { [U1]: 'pbusera00000001', [U2]: 'pbuserb00000002', [U3]: 'pbuserc00000003' };
const MAP = new Map(Object.entries(PB));
const backup = () => readBackupFolder(FIXTURE);
const clone = (v) => JSON.parse(JSON.stringify(v));

test('the folder: both full copies and the common file are read; a Firebase backup has no source mark', () => {
  const b = backup();
  assert.equal(b.source, 'firebase');
  assert.deepEqual(b.projects.map((p) => p.project.id), ['p1', 'p2']);
  assert.ok(b.common && b.common.collections.pool_inbox.length === 1);
  assert.throws(() => readBackupFolder(path.join(FIXTURE, 'nope')), /не найдена/);
});

test('the plan: counts per collection and per project', () => {
  const plan = planRestore(backup());
  assert.deepEqual(plan.conflicts, []);
  assert.deepEqual(plan.counts, { users: 3, projects: 2, records: 5, history: 4, invites: 1, pool: 4, inbox: 1, allowed: 1, admin: 1, prefs: 2 });
  assert.deepEqual(plan.perProject, { p1: { records: 4, history: 3, invites: 1 }, p2: { records: 1, history: 1, invites: 0 } });
  // updatedAtServer is not stored in data on PocketBase (`updated` plays its part); the app's own `id` stays
  assert.equal(plan.projects[0].data.updatedAtServer, undefined);
  assert.ok(plan.projects[0].records.every((r) => !('updatedAtServer' in r.data) && r.data.id === r.key));
  assert.deepEqual(plan.projects[0].records.map((r) => `${r.coll}/${r.key}`), ['catalog/К/2', 'days/2026-11-16', 'points/a', 'points/b']);
  assert.deepEqual(plan.projects[0].history.map((h) => [h.key, h.at]), [['h1', 1794900000000], ['h2', 1700000000000], ['h3', 1794800000000]]);
  // the invitation index as the write route keeps it: e-mail in lower case, the project key, `from` = the first member
  assert.deepEqual(plan.projects[0].invites, [{ email: 'helper.d@example.test', data: { key: 'p1', name: 'Alpha / Тест', object: 'מגדל אלפא', from: A } }]);
  assert.deepEqual(plan.pool.map((x) => `${x.kind}/${x.key}`), ['catalog/К/1', 'delayReasons/r1', 'problems/q1', 'types/Камера']);
  assert.equal(plan.inbox[0].data.id, undefined, 'the inbox data carries no id (the key is the record key)');
  assert.deepEqual(plan.allowed, [B]);
  assert.equal(plan.admin, A);
  assert.deepEqual(plan.prefs.map((p) => p.uid), [U1, U2]);
  // Hebrew stays as it is
  assert.equal(plan.projects[0].records[1].data.note, 'גשם, עבודה הופסקה');
});

test('the users: e-mail ↔ old uid from member pairs and removed members; names from memberNames, the creator, then history', () => {
  const plan = planRestore(backup());
  assert.deepEqual(plan.users, [
    { email: A, name: 'Tester A', uids: [U1] },
    { email: B, name: 'Тестер Б', uids: [U2] },
    { email: C, name: 'Tester C', uids: [U3] },
  ]);
  assert.equal(emailKey('Tester.B@Example.test'), 'tester_b@example_test');
  // edge case 21: the author of h2 is in no member or removed list — kept as it is, reported
  assert.deepEqual(plan.unmapped, [{ uid: UX, n: 1, where: ['history'] }]);
});

test('uid replacement: exact string values and object keys, inbox key prefixes; nothing else', () => {
  const v = { by: U1, list: [U2, `${U1}x`, `x${U1}`], removedMembers: { [U3]: C }, nested: { deep: [{ uid: U2 }] }, n: 5, nil: null, text: `автор ${U1}` };
  assert.deepEqual(mapIds(v, MAP), { by: PB[U1], list: [PB[U2], `${U1}x`, `x${U1}`], removedMembers: { [PB[U3]]: C }, nested: { deep: [{ uid: PB[U2] }] }, n: 5, nil: null, text: `автор ${U1}` });
  assert.equal(mapInboxKey(`${U2}_types_Камера`, MAP), `${PB[U2]}_types_Камера`);
  assert.equal(mapInboxKey(`${UX}_types_Камера`, MAP), `${UX}_types_Камера`);
  assert.equal(mapInboxKey(U1, MAP), PB[U1]);
  assert.equal(mapInboxKey(`${U1}types`, MAP), `${U1}types`);
  assert.deepEqual([...invert(MAP)], Object.entries(PB).map(([a, b]) => [b, a]));
  assert.equal(invert(new Map([['x', 'n'], ['y', 'n']])), null);
});

test('materialize: the plan with PocketBase ids — members, creator, removed members, history authors, inbox, prefs', () => {
  const plan = planRestore(backup());
  const m = materialize(plan, MAP, new Set(Object.values(PB)));
  const p1 = m.projects[0];
  assert.deepEqual(p1.data.memberUids, [PB[U1], PB[U2]]);
  assert.deepEqual(p1.members, [PB[U1], PB[U2]]);
  assert.equal(p1.data.createdBy, PB[U1]);
  assert.equal(p1.data.updatedBy, PB[U2]);
  assert.deepEqual(p1.data.removedMembers, { [PB[U3]]: C });
  assert.deepEqual(p1.data.memberNames, { 'tester_a@example_test': 'Tester A', 'tester_b@example_test': 'Тестер Б' });
  const h = Object.fromEntries(p1.history.map((x) => [x.key, x.data]));
  assert.equal(h.h1.by, PB[U1]);
  assert.deepEqual(h.h1.before, { label: '1A-00', updatedBy: PB[U2] });
  assert.equal(h.h2.by, UX, 'an author with no e-mail keeps the old uid; byName shows the name');
  assert.equal(h.h3.by, PB[U3], 'a removed member keeps their history');
  assert.equal(p1.records.find((r) => r.key === 'b').data.deletedBy, PB[U2]);
  assert.equal(p1.records.find((r) => r.key === '2026-11-16').data.updatedBy, PB[U3]);
  assert.equal(m.inbox[0].key, `${PB[U2]}_types_Камера`);
  assert.equal(m.inbox[0].data.owner.uid, PB[U2]);
  assert.deepEqual(m.prefs, [{ user: PB[U1], data: { dictWords: ['кабель'] } }, { user: PB[U2], data: { lang: 'he', seenBy: PB[U2] } }]);
  // a relation to a user that is not on the server would refuse the whole batch: such ids are left out of `members`
  assert.deepEqual(materialize(plan, MAP, new Set([PB[U1]])).projects[0].members, [PB[U1]]);
  // the plan itself is not changed
  assert.deepEqual(plan.projects[0].data.memberUids, [U1, U2]);
});

test('the administrator: meta/admin, else --admin (required then); meta wins over a different --admin', () => {
  const b = backup();
  const noMeta = clone(b); noMeta.common.collections.meta = [];
  assert.deepEqual(planRestore(noMeta).conflicts, [{ code: 'no-admin' }]);
  const withArg = planRestore(noMeta, { admin: ' Boss@Example.test ' });
  assert.equal(withArg.admin, 'boss@example.test');
  assert.deepEqual(withArg.conflicts, []);
  const both = planRestore(b, { admin: 'other@example.test' });
  assert.equal(both.admin, A);
  assert.deepEqual(both.warnings, [{ code: 'admin-arg-ignored', admin: A, arg: 'other@example.test' }]);
  const noCommon = { projects: b.projects, common: null };
  assert.deepEqual(planRestore(noCommon).conflicts, [{ code: 'no-admin' }]);
});

test('conflicts: duplicate keys, too long keys, bad collection names, documents without id, ids the compare could not map back', () => {
  const b = clone(backup());
  b.projects[0].data.points.push({ id: 'a', label: 'dup' });
  b.projects[1].data.history.push({ id: 'h1', at: 1 });                 // history keys are unique across projects
  b.projects[0].data['bad-name'] = [{ id: 'x' }];
  b.projects[0].data.days.push({ label: 'no id' });
  b.common.collections.pool_types.push({ id: 'Т'.repeat(401) });
  b.projects.push({ project: { id: 'k'.repeat(65), memberUids: [], memberEmails: [] }, data: {} });
  const plan = planRestore(b);
  assert.deepEqual(plan.conflicts.map((c) => c.code).sort(), ['bad-coll', 'duplicate', 'duplicate', 'no-id', 'too-long', 'too-long']);
  assert.ok(plan.conflicts.some((c) => c.code === 'duplicate' && c.coll === 'points' && c.project === 'p1' && c.key === 'a'));
  assert.ok(plan.conflicts.some((c) => c.code === 'duplicate' && c.coll === 'history' && c.key === 'h1'));

  const users = usersOf([
    { project: { id: 'x', memberUids: ['u1', 'u2'], memberEmails: ['one@example.test', 'One@Example.test'] } },
    { project: { id: 'y', memberUids: ['u3'], memberEmails: ['three@example.test'], removedMembers: { u3: 'other@example.test' } } },
    { project: { id: 'z', memberUids: ['u4', 'u5'], memberEmails: ['four@example.test'] } },
  ]);
  assert.deepEqual(users.conflicts.map((c) => c.code).sort(), ['email-two-uids', 'uid-two-emails']);
  assert.deepEqual(users.warnings, [{ code: 'pair-length', project: 'z', uids: 2, emails: 1 }]);
});

test('warnings: prefs of a uid with no e-mail, unknown pool kinds and common collections; allowed e-mails deduplicated in lower case', () => {
  const b = clone(backup());
  b.common.prefs.push({ uid: UX, id: 'main', data: { a: 1 } }, { uid: U1, id: 'other', data: {} });
  b.common.collections.pool_widgets = [{ id: 'w1' }];
  b.common.collections.stuff = [{ id: 's' }];
  b.common.collections.allowed.push({ id: 'Tester.B@example.test', email: 'Tester.B@example.test' });
  const plan = planRestore(b);
  assert.deepEqual(plan.conflicts, []);
  assert.deepEqual(plan.warnings.map((w) => w.code).sort(), ['prefs-not-main', 'prefs-skipped', 'unknown-collection', 'unknown-kind']);
  assert.equal(plan.counts.prefs, 2);
  assert.equal(plan.counts.pool, 5);
  assert.deepEqual(plan.allowed, [B]);
});

test('a plan with a conflict writes nothing: runRestore stops before any server call', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-c-'));
  for (const f of fs.readdirSync(FIXTURE)) fs.copyFileSync(path.join(FIXTURE, f), path.join(dir, f));
  const cf = path.join(dir, COMMON_FILE); const c = JSON.parse(fs.readFileSync(cf, 'utf8')); c.collections.meta = []; fs.writeFileSync(cf, JSON.stringify(c));
  const lines = [];
  const r = await runRestore({ dir, write: true, url: 'http://127.0.0.1:1', email: 'x', password: 'y', log: (l) => lines.push(l) });
  assert.equal(r.code, 1);
  assert.ok(lines.some((l) => l.includes('укажите --admin')));
  assert.ok(lines.some((l) => l.startsWith('Конфликтов: 1')));
  const ok = await runRestore({ dir: FIXTURE, log: () => {} });
  assert.equal(ok.code, 0, 'the plan alone needs no server');
});

// ---------- a PocketBase server simulated in memory: the restore's records → the export of src/domain/pbread.js ----------

let seq = 0;
const at = () => pbTime(Date.parse('2026-11-27T10:00:00Z') + (seq++) * 1000);
function serverOf(plan, map) {
  const m = materialize(plan, map);
  const s = { projects: [], recs: new Map(), pool: [], inbox: [], allowed: [], admin: [], prefs: [] };
  m.projects.forEach((p, i) => {
    const rec = { id: `pbproject00000${i}`, key: p.key, data: clone(p.data), members: p.members, updated: at() };
    s.projects.push(rec);
    s.recs.set(rec.id, {
      records: p.records.map((r) => ({ project: rec.id, coll: r.coll, key: r.key, data: clone(r.data), updated: at() })),
      history: p.history.map((h) => ({ project: rec.id, key: h.key, at: h.at, data: clone(h.data), updated: at() })),
    });
  });
  s.pool = m.pool.map((x) => ({ ...clone(x), updated: at() }));
  s.inbox = m.inbox.map((x) => ({ ...clone(x), updated: at() }));
  s.allowed = m.allowed.map((email) => ({ email, created: at() }));
  s.admin = [{ email: m.admin, created: at() }];
  s.prefs = m.prefs.map((x) => ({ user: x.user, data: clone(x.data) }));
  return s;
}
const exportOf = (s) => ({
  projects: s.projects.map((p) => exportProject(p, s.recs.get(p.id).records, s.recs.get(p.id).history)),
  common: exportCommon({ pool: s.pool, inbox: s.inbox, allowed: s.allowed, admin: s.admin, prefs: s.prefs }),
});

test('the compare: a faithful read-back equals the backup; a changed, missing or extra document is reported', () => {
  const b = backup(); const plan = planRestore(b);
  const s = serverOf(plan, MAP);
  assert.deepEqual(diffRestore(plan, b, exportOf(s), invert(MAP)), []);

  const s2 = serverOf(plan, MAP);
  s2.recs.get('pbproject000000').records.find((r) => r.key === 'a').data.label = 'changed';
  s2.recs.get('pbproject000000').history.pop();
  s2.pool.push({ kind: 'types', key: 'Extra', data: { id: 'Extra' }, updated: at() });
  s2.inbox[0].data.hash = 'other';
  s2.prefs[1].data.lang = 'ru';
  s2.admin[0].email = 'someone@example.test';
  s2.allowed = [];
  const diffs = diffRestore(plan, b, exportOf(s2), invert(MAP));
  assert.deepEqual(diffs.map((d) => `${d.what} ${d.where} ${d.key}`).sort(), [
    `changed meta admin`, `changed p1/points a`, `changed pool_inbox ${U2}_types_Камера`, `changed prefs ${U2}`,
    'extra pool_types Extra', 'missing allowed tester.b@example.test', 'missing p1/history h3',
  ].sort());
  // a wrong uid mapping shows too: the read-back maps back to other uids
  const wrong = new Map([[U1, PB[U2]], [U2, PB[U1]], [U3, PB[U3]]]);
  assert.ok(diffRestore(plan, b, exportOf(serverOf(plan, wrong)), invert(MAP)).length > 0);
});

// ---------- the way back: scripts/server-restore.mjs from a PocketBase export ----------

// A PocketBase export folder of the fixture, as the NAS backup job writes it (the full copies carry "source": "pocketbase")
function pocketBaseExport() {
  const plan = planRestore(backup());
  const ex = exportOf(serverOf(plan, MAP));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-export-'));
  const now = new Date('2026-11-27T01:30:00Z');
  ex.projects.forEach((p) => writeProjectBackup(dir, p, now, {}, { source: 'pocketbase' }));
  fs.writeFileSync(path.join(dir, COMMON_FILE), JSON.stringify({ ...ex.common, createdAt: now.toISOString() }));
  return dir;
}
const SERVER_TIME = Timestamp.fromMillis(Date.parse('2026-12-01T12:00:00Z'));
const FB = { [A]: 'FirebaseUidOfTesterA00000001', [B]: 'FirebaseUidOfTesterB00000002' };
const fakeAuth = () => ({
  calls: [],
  async getUserByEmail(email) { this.calls.push(email); if (FB[email]) return { uid: FB[email], email }; throw Object.assign(new Error('no user'), { code: 'auth/user-not-found' }); },
});

test('the way back: a PocketBase export gets Firebase uids by e-mail and the server time; a non-empty database only with --force', async () => {
  const dir = pocketBaseExport();
  assert.equal(readBackupFolder(dir).source, 'pocketbase');
  const db = createFakeFirestore(); const auth = fakeAuth(); const lines = []; const errors = [];
  const env = { db, auth, Timestamp, serverTimestamp: () => SERVER_TIME };
  const code = await runFirestoreRestore(env, dir, { write: true, log: (l) => lines.push(l), error: (l) => errors.push(l) });
  assert.equal(code, 0);
  assert.deepEqual(auth.calls.sort(), [A, B, C]);
  assert.ok(lines.some((l) => l.includes(`нет пользователя Firebase с почтой ${C}`)), 'a user Firebase does not know is named');
  const d = db.dump();
  const p1 = d['projects/p1'];
  assert.deepEqual(p1.memberUids, [FB[A], FB[B]]);
  assert.equal(p1.createdBy, FB[A]);
  assert.deepEqual(p1.removedMembers, { [PB[U3]]: C }, 'no Firebase user: the PocketBase id stays');
  assert.deepEqual(p1.updatedAtServer, { _seconds: SERVER_TIME._seconds, _nanoseconds: 0 });
  assert.equal(d['projects/p1/history/h1'].by, FB[A]);
  assert.equal(d['projects/p1/history/h2'].by, UX);
  assert.deepEqual(d['projects/p1/points/a'].updatedAtServer, p1.updatedAtServer);
  // a catalog id with `/` goes to the Firestore id the app uses, its own id kept in the data
  assert.equal(d['projects/p1/catalog/К_2'].id, 'К/2');
  assert.equal(d['pool_catalog/К_1'].id, 'К/1');
  assert.deepEqual(d['pool_types/Камера'].updatedAtServer, p1.updatedAtServer);
  const inbox = d[`pool_inbox/${FB[B]}_types_Камера`];
  assert.equal(inbox.owner.uid, FB[B]);
  assert.deepEqual(d[`users/${FB[A]}/prefs/main`], { dictWords: ['кабель'] });
  assert.deepEqual(d[`users/${FB[B]}/prefs/main`], { lang: 'he', seenBy: FB[B] });
  assert.equal(d['meta/admin'].email, A);
  assert.equal(d[`allowed/${B}`].email, B);
  assert.equal('updatedAtServer' in d[`allowed/${B}`], false);
  assert.equal(JSON.stringify(d).includes(PB[U1]) || JSON.stringify(d).includes(PB[U2]), false, 'no PocketBase id of a known user is left');

  const again = await runFirestoreRestore(env, dir, { write: true, log: () => {}, error: (l) => errors.push(l) });
  assert.equal(again, 1);
  assert.match(errors.pop(), /уже есть проекты/);
  assert.equal(await runFirestoreRestore(env, dir, { write: true, force: true, log: () => {}, error: () => {} }), 0);
});

test('the way back keeps a Firebase backup as it was: same uids, revived timestamps, the same lines', async () => {
  const db = createFakeFirestore(); const auth = fakeAuth(); const lines = [];
  const code = await runFirestoreRestore({ db, auth, Timestamp, serverTimestamp: () => SERVER_TIME }, FIXTURE, { write: true, log: (l) => lines.push(l) });
  assert.equal(code, 0);
  assert.deepEqual(auth.calls, [], 'no Authentication lookup for a Firebase backup');
  const d = db.dump();
  assert.deepEqual(d['projects/p1'].memberUids, [U1, U2]);
  assert.deepEqual(d['projects/p1'].updatedAtServer, { _seconds: 1795000000, _nanoseconds: 0 });
  assert.equal(d['projects/p1/points/a'].id, undefined, 'an id without `/` is the document id, as before');
  assert.equal(d[`pool_inbox/${U2}_types_Камера`].owner.uid, U2);
  assert.equal(lines[0], `Записей к восстановлению: ${restorePlan(FIXTURE).length}`);
  assert.deepEqual(lines.slice(1, 4), ['  projects: 2', '  projects/…/catalog: 1', '  projects/…/days: 1']);
  assert.equal(lines.at(-1), 'Готово. Залейте правила firestore.rules и войдите в приложение.');
});
