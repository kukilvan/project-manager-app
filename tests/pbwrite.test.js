// Checks the write semantics of the NAS copy (src/domain/pbwrite.js, spec 4 § 2.3–2.4): repo writes → ops, the Firestore-like merges,
// every rule row with an allowed and a refused case, runSave over a map store, the freshness of the generated hook copy and the syntax guard.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import * as pb from '../src/domain/pbwrite.js';
import { build, isFresh, SRC, OUT } from '../scripts/pb-hooks-build.mjs';

const { toOps, mergeDeep, mergeFields, applyArrayOps, applyItemPatches, mergeDoc, checkOp, validateOp, changedKeys, invitesOf, membersOf, runSave } = pb;

// repo.js and its imports touch window, localStorage and location when loaded; pm.mode = local makes this device the pool administrator
const ls = new Map([['pm.mode', 'local']]);
globalThis.window ??= { addEventListener() {} };
globalThis.localStorage ??= { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) };
globalThis.location ??= { search: '' };
const { createRepo } = await import('../src/app/repo.js');

// ---------- a map store and envs ----------

function mapStore(initial = {}) {
  let data = new Map(Object.entries(initial));
  let saved = null;
  const s = {
    finds: 0, invites: new Map(), derived: new Map(),
    id: (t) => JSON.stringify(t),
    find(t) { s.finds++; const d = data.get(s.id(t)); return d === undefined ? null : structuredClone(d); },
    put(t, d, derived) {
      if (s.failOn && s.failOn(t, d)) throw new Error('The maximum allowed JSON size is 2097152 bytes');
      data.set(s.id(t), structuredClone(d)); s.derived.set(s.id(t), derived);
    },
    setInvites(pid, list) { s.invites.set(pid, list); },
    begin() { saved = { data: new Map(data), invites: new Map(s.invites) }; },
    commit() { saved = null; },
    rollback() { data = saved.data; s.invites = saved.invites; saved = null; },
    get: (t) => data.get(s.id(t)),
    size: () => data.size,
    dump: () => Object.fromEntries(data),
  };
  return s;
}
const P = (key) => JSON.stringify({ c: 'projects', key });
const R = (pid, coll, key) => JSON.stringify({ c: 'records', pid, coll, key });

const ADMIN = 'boss@x.com';
const allowedSet = new Set(['ann@x.com', 'bob@x.com', 'cat@x.com']);
const envOf = (id, email, extra = {}) => ({ user: { id, email }, isSuper: false, adminEmail: ADMIN, isAllowed: (e) => allowedSet.has(e), project: () => null, ...extra });
const ann = envOf('uAnn', 'Ann@X.com');     // creator of the project below (e-mail with capitals: compared in lower case)
const bob = envOf('uBob', 'bob@x.com');     // a member, not the creator
const cat = envOf('uCat', 'cat@x.com');     // invited
const dan = envOf('uDan', 'dan@x.com');     // stranger, not allowed
const boss = envOf('uBoss', ADMIN);         // administrator
const sup = { user: null, isSuper: true, adminEmail: ADMIN, isAllowed: () => false, project: () => null };

const project = () => ({
  id: 'P1', name: 'Школа', object: 'Корпус Б', createdBy: 'uAnn', memberUids: ['uAnn', 'uBob'], memberEmails: ['ann@x.com', 'bob@x.com'],
  invitedEmails: ['cat@x.com'], memberNames: { ann_x_com: 'Аня' }, managers: { a: 1 },
});

// ---------- repo writes → ops ----------

function recorder() {
  const calls = [];
  const backend = {
    kind: 'test',
    commit: (pid, writes) => { calls.push({ kind: 'commit', pid, writes: structuredClone(writes) }); return backend.fail ? Promise.reject(Object.assign(new Error('denied'), { code: 'permission-denied' })) : Promise.resolve(); },
    commitPool: (writes) => { calls.push({ kind: 'commitPool', writes: structuredClone(writes) }); return Promise.resolve(); },
    setInbox: (list) => { calls.push({ kind: 'setInbox', writes: structuredClone(list) }); return Promise.resolve(); },
    allowEmails: (list) => { calls.push({ kind: 'allowEmails', writes: structuredClone(list) }); return Promise.resolve(); },
    saveUserPrefs: (_uid, patch, replace = false) => { calls.push({ kind: 'saveUserPrefs', writes: [{ data: structuredClone(patch), replace }] }); return Promise.resolve(); },
    listenColl: () => () => {},
  };
  return { backend, calls, ops: () => calls.flatMap((c) => toOps(c.kind, c.pid, c.writes)) };
}
const userAnn = { uid: 'uAnn', email: 'ann@x.com', displayName: 'Аня' };

test('toOps: save — points by fields, other records deep, a history entry each, updatedAtServer dropped', () => {
  const r = recorder(); const repo = createRepo(r.backend, userAnn);
  repo.save('P1', [{ coll: 'points', id: 'p1', data: { label: 'FC/B05', pos: { x: 1, y: 2 } } }, { coll: 'days', id: 'd1', data: { date: '2026-11-25', off: { reason: 'x' } } }]);
  const ops = r.ops();
  assert.deepEqual(ops.map((o) => [o.t, o.coll || '', o.mode || '']), [['rec', 'points', 'fields'], ['history', '', ''], ['rec', 'days', 'deep'], ['history', '', '']]);
  assert.equal(ops[0].key, 'p1'); assert.equal(ops[0].pid, 'P1');
  assert.equal(ops[0].data.label, 'FC/B05'); assert.equal(ops[0].data.updatedBy, 'uAnn'); assert.equal(ops[0].data.projectId, 'P1');
  assert.equal(ops[1].data.coll, 'points'); assert.equal(ops[1].data.docId, 'p1'); assert.equal(ops[1].key, ops[1].data.id);
  assert.ok(ops.every((o) => validateOp(o).ok));
  assert.deepEqual(toOps('commit', 'P1', [{ coll: 'days', id: 'd', data: { a: 1, updatedAtServer: { x: 1 } } }])[0].data, { a: 1 });
});

test('toOps: remove and restore are soft writes with history; an id with «/» stays the key', () => {
  const r = recorder(); const repo = createRepo(r.backend, userAnn);
  repo.remove('P1', 'catalog', 'Поставка / склад'); repo.restore('P1', 'catalog', 'Поставка / склад');
  const ops = r.ops();
  assert.deepEqual(ops.map((o) => o.t), ['rec', 'history', 'rec', 'history']);
  assert.equal(ops[0].key, 'Поставка / склад'); assert.equal(ops[0].mode, 'deep');
  assert.equal(ops[0].data.deleted, true); assert.equal(ops[2].data.deleted, false); assert.equal(ops[2].data.deletedAt, null);
  assert.equal(ops[1].data.action, 'delete'); assert.equal(ops[3].data.action, 'restore');
});

test('toOps: createProject — the project deep, then its seed records', () => {
  const r = recorder(); const repo = createRepo(r.backend, userAnn);
  const pid = repo.createProject({ name: 'Новый' }, { types: [{ id: 'T1' }], catalog: [{ id: 'W/1', name: 'W' }] });
  const ops = r.ops();
  assert.equal(ops[0].t, 'project'); assert.equal(ops[0].key, pid); assert.equal(ops[0].mode, 'deep');
  assert.deepEqual(ops[0].data.memberUids, ['uAnn']);
  assert.deepEqual(ops.slice(1).map((o) => [o.t, o.coll, o.key]), [['rec', 'catalog', 'W/1'], ['rec', 'types', 'T1'], ...ops.slice(3).map((o) => ['rec', 'units', o.key])]);
  assert.ok(ops.slice(1).every((o) => o.pid === pid && o.mode === 'deep'));
});

test('toOps: saveProject plain, replace, and every member and invitation call', () => {
  const r = recorder(); const repo = createRepo(r.backend, userAnn);
  const p = project();
  repo.saveProject('P1', { name: 'X' });
  repo.saveProject('P1', { managers: { b: 2 } }, { replace: true });
  repo.invite(p, 'New@X.com');
  repo.renameMember(p, 'bob@x.com', 'Боб');
  repo.removeMember(p, 'bob@x.com');
  repo.cancelInvite(p, 'cat@x.com');
  const ops = r.ops().filter((o) => o.t === 'project');
  assert.deepEqual(ops.map((o) => o.mode), ['deep', 'fields', 'deep', 'deep', 'deep', 'deep']);
  assert.deepEqual(ops[2].arrayOps, { invitedEmails: { union: ['new@x.com'] } });
  assert.deepEqual(ops[3].data.memberNames, { 'bob@x_com': 'Боб' });
  assert.deepEqual(ops[4].arrayOps, { memberUids: { remove: ['uBob'] }, memberEmails: { remove: ['bob@x.com'] } });
  assert.deepEqual(ops[4].data.removedMembers, { uBob: 'bob@x.com' });
  assert.ok(!('memberUids' in ops[4].data), 'the value of an array-op field is never written');
  assert.deepEqual(ops[5].arrayOps, { invitedEmails: { remove: ['cat@x.com'] } });
  assert.deepEqual(r.calls.filter((c) => c.kind === 'allowEmails').flatMap((c) => toOps(c.kind, null, c.writes)), [{ t: 'allowed', email: 'new@x.com' }]);
  const rc = recorder(); const repoCat = createRepo(rc.backend, { uid: 'uCat', email: 'cat@x.com' });
  repoCat.acceptInvite(p); repoCat.declineInvite(p);
  const [acc, dec] = rc.ops();
  assert.deepEqual(acc.arrayOps, { memberUids: { union: ['uCat'] }, memberEmails: { union: ['cat@x.com'] }, invitedEmails: { remove: ['cat@x.com'] } });
  assert.deepEqual(dec.arrayOps, { invitedEmails: { remove: ['cat@x.com'] } });
});

test('toOps: savePool, setInbox, saveUserPrefs and retryRejected', async () => {
  const r = recorder(); const repo = createRepo(r.backend, userAnn);
  repo.savePool([{ coll: 'problems', id: 'Нет трубы', data: { name: 'Нет трубы', deleted: false } }, { coll: 'doorcfg', id: 'D1', remove: true }]);
  repo.setInbox([{ key: 'types:T1', data: { item: { id: 'T1' }, hash: 'h' } }]);
  repo.saveUserPrefs({ bind: { a: 1 } }); repo.saveUserPrefs({ bind: {} }, true);
  const ops = r.ops();
  assert.deepEqual(ops[0], { t: 'pool', kind: 'problems', key: 'Нет трубы', data: { ...ops[0].data } });
  assert.equal(ops[0].data.updatedBy, 'uAnn');
  assert.deepEqual(ops[1], { t: 'pool', kind: 'doorcfg', key: 'D1', remove: true });
  assert.deepEqual(ops[2], { t: 'inbox', key: 'types:T1', data: { item: { id: 'T1' }, hash: 'h' } });
  assert.deepEqual(ops.slice(3), [{ t: 'prefs', data: { bind: { a: 1 } }, mode: 'deep' }, { t: 'prefs', data: { bind: {} }, mode: 'fields' }]);
  // a rejected save is resent with the same writes, so the same ops
  const rf = recorder(); rf.backend.fail = true; const repoF = createRepo(rf.backend, userAnn);
  repoF.save('P1', [{ coll: 'notes', id: 'n1', data: { text: 'a' } }]);
  await new Promise((res) => setTimeout(res, 0));
  rf.backend.fail = false;
  assert.ok(repoF.retryRejected() >= 1);
  const [first, again] = rf.calls.filter((c) => c.writes.some((w) => w.id === 'n1'));
  assert.deepEqual(toOps('commit', again.pid, again.writes), toOps('commit', first.pid, first.writes));
  assert.throws(() => toOps('nope', null, []), /unknown kind/);
});

// ---------- merges ----------

test('mergeDeep: objects merge, arrays/scalars/null replace, an empty object replaces, other keys stay', () => {
  const old = { a: { x: 1, y: { z: 1, w: 2 } }, arr: [1, 2], s: 'old', n: 1, keep: true, m: { k: 1 } };
  const got = mergeDeep(old, { a: { y: { z: 9 } }, arr: [3], s: null, n: 2, m: {}, fresh: { q: {} } });
  assert.deepEqual(got, { a: { x: 1, y: { z: 9, w: 2 } }, arr: [3], s: null, n: 2, keep: true, m: {}, fresh: { q: {} } });
  assert.deepEqual(old.a.y, { z: 1, w: 2 }, 'the stored document is not changed');
  assert.deepEqual(mergeDeep({ a: 5 }, { a: { b: 1 } }), { a: { b: 1 } }, 'an object over a scalar');
  assert.deepEqual(mergeDeep(null, { managers: {} }), { managers: {} }, 'edge case 23 on a new document');
});

test('mergeFields: each top-level key replaced whole, others stay (points: pos loses its old icon)', () => {
  assert.deepEqual(mergeFields({ pos: { x: 1, icon: 'cam' }, label: 'A', len: 5 }, { pos: { x: 2 }, label: 'B' }), { pos: { x: 2 }, label: 'B', len: 5 });
});

test('applyArrayOps: union appends missing in order, remove drops every equal value, a non-array becomes one', () => {
  assert.deepEqual(applyArrayOps({ l: ['a', 'b'] }, { l: { union: ['b', 'c', 'c', 'd'] } }).l, ['a', 'b', 'c', 'd']);
  assert.deepEqual(applyArrayOps({ l: ['a', 'b', 'a'] }, { l: { remove: ['a', 'z'] } }).l, ['b']);
  assert.deepEqual(applyArrayOps({ l: 'x' }, { l: { union: ['a'] } }).l, ['a']);
  assert.deepEqual(applyArrayOps({}, { l: { remove: ['a'] } }).l, []);
});

test('applyItemPatches: fields merge into the item with that id, unknown ids ignored, a missing list untouched', () => {
  const doc = { drawings: [{ id: 'd1', name: 'A', v: 1 }, { id: 'd2', name: 'B' }], tables: [{ id: 't1', file: 'f' }] };
  const got = applyItemPatches(doc, { drawings: { d1: { v: 2, fileId: 'F' }, nope: { v: 9 } }, tables: { t1: { at: 5 } }, missing: { x: {} } });
  assert.deepEqual(got, { drawings: [{ id: 'd1', name: 'A', v: 2, fileId: 'F' }, { id: 'd2', name: 'B' }], tables: [{ id: 't1', file: 'f', at: 5 }] });
});

test('mergeDoc: the result of set(merge) / mergeFields for every op kind', () => {
  // ADR 0018: an older build writes a catalog work without planColour — the stored false survives
  const work = { id: 'W', name: 'Терминация', planColour: false };
  assert.equal(mergeDoc(work, { t: 'rec', pid: 'P', coll: 'catalog', key: 'W', data: { name: 'Терминация', updatedAt: 2 }, mode: 'deep' }).planColour, false);
  // a missing target is created from the write, after arrayOps on empty arrays
  assert.deepEqual(mergeDoc(null, { t: 'project', key: 'P', data: { id: 'P' }, mode: 'deep', arrayOps: { invitedEmails: { union: ['a@x'] } } }), { id: 'P', invitedEmails: ['a@x'] });
  assert.deepEqual(mergeDoc({ a: 1, b: { c: 1 } }, { t: 'project', key: 'P', data: { b: { d: 1 } }, mode: 'fields' }), { a: 1, b: { d: 1 } });
  assert.deepEqual(mergeDoc({ name: 'X', he: 'x' }, { t: 'pool', kind: 'problems', key: 'X', remove: true }), { name: 'X', he: 'x', deleted: true });
  assert.deepEqual(mergeDoc({ id: 'h', at: 1 }, { t: 'history', pid: 'P', key: 'h', data: { id: 'h', at: 2 } }), { id: 'h', at: 1 }, 'history is create only');
  assert.deepEqual(mergeDoc(null, { t: 'allowed', email: 'A@x.com' }), { email: 'a@x.com' });
  assert.deepEqual(mergeDoc({ status: 'new', item: { a: 1 } }, { t: 'inbox', key: 'k', data: { item: { b: 2 } } }), { status: 'new', item: { a: 1, b: 2 } });
  assert.deepEqual(mergeDoc({ bind: { a: 1 }, x: 1 }, { t: 'prefs', data: { bind: {} }, mode: 'fields' }), { bind: {}, x: 1 });
});

test('changedKeys: top-level keys that differ, deep compare regardless of key order', () => {
  assert.deepEqual(changedKeys({ a: { x: 1, y: 2 }, b: [1], c: 1 }, { a: { y: 2, x: 1 }, b: [1, 2], c: 1, d: null }), ['b', 'd']);
  assert.deepEqual(changedKeys(null, { a: 1 }), ['a']);
});

// ---------- rules (spec § 2.4) ----------

const projOp = (data, extra = {}) => ({ t: 'project', key: 'P1', data, mode: 'deep', ...extra });
const ruleOf = (env, op, old) => checkOp(env, op, old, mergeDoc(old, op));

test('rules: project, new — allowed and in memberUids', () => {
  const mk = (uids) => projOp({ id: 'P1', memberUids: uids, createdBy: 'uAnn' });
  assert.equal(ruleOf(ann, mk(['uAnn']), null).ok, true);
  assert.equal(ruleOf(boss, { ...mk(['uBoss']) }, null).ok, true, 'the administrator is allowed');
  assert.equal(ruleOf(ann, mk(['uBob']), null).code, 'forbidden', 'not in its own memberUids');
  assert.equal(ruleOf(dan, mk(['uDan']), null).code, 'forbidden', 'not allowed');
});

test('rules: project, existing — the creator, a non-creator member, a non-member', () => {
  const p = project();
  assert.equal(ruleOf(ann, projOp({}, { arrayOps: { memberUids: { remove: ['uBob'] } } }), p).ok, true, 'the creator removes a member');
  assert.equal(ruleOf(bob, projOp({ name: 'Новое', memberNames: { bob_x_com: 'Боб' } }), p).ok, true, 'a member edits the project');
  for (const [k, op] of [
    ['memberUids', projOp({}, { arrayOps: { memberUids: { remove: ['uAnn'] } } })],
    ['memberEmails', projOp({}, { arrayOps: { memberEmails: { union: ['z@x'] } } })],
    ['invitedEmails', projOp({}, { arrayOps: { invitedEmails: { union: ['z@x'] } } })],
    ['removedMembers', projOp({ removedMembers: { uAnn: 'ann@x.com' } })],
    ['createdBy', projOp({ createdBy: 'uBob' })],
    ['archived', projOp({ archived: true })],
    ['deleted', projOp({ deleted: true })],
  ]) assert.equal(ruleOf(bob, op, p).code, 'forbidden', `a non-creator member changes ${k}`);
  assert.equal(ruleOf(bob, projOp({ archived: undefined, invitedEmails: ['cat@x.com'] }), p).ok, true, 'writing an unchanged value is no change');
  const noCreator = { ...project() }; delete noCreator.createdBy;
  assert.equal(ruleOf(bob, projOp({ archived: true }), noCreator).ok, true, 'no createdBy: every member counts as the creator');
  assert.equal(ruleOf(dan, projOp({ name: 'x' }), p).code, 'forbidden');
});

test('rules: project, invitee — accept, decline, cheats', () => {
  const p = project();
  const accept = projOp({ id: 'P1', updatedAt: 5, updatedBy: 'uCat', updatedByName: 'Кот' }, { arrayOps: { memberUids: { union: ['uCat'] }, memberEmails: { union: ['cat@x.com'] }, invitedEmails: { remove: ['cat@x.com'] } } });
  const decline = projOp({ id: 'P1', updatedAt: 5 }, { arrayOps: { invitedEmails: { remove: ['cat@x.com'] } } });
  assert.equal(ruleOf(cat, accept, p).ok, true);
  assert.equal(ruleOf(cat, decline, p).ok, true);
  assert.equal(ruleOf(envOf('uCat', 'CAT@x.com'), accept, { ...p, invitedEmails: ['Cat@X.com'] }).ok, true, 'e-mails compared in lower case');
  assert.equal(ruleOf(cat, projOp({ name: 'Моё' }, { arrayOps: accept.arrayOps }), p).code, 'forbidden', 'changes another key');
  assert.equal(ruleOf(cat, projOp({}, { arrayOps: { memberUids: { union: ['uCat', 'uDan'] } } }), p).code, 'forbidden', 'adds someone else too');
  assert.equal(ruleOf(cat, projOp({}, { arrayOps: { memberUids: { union: ['uDan'] } } }), p).code, 'forbidden', 'adds someone else instead');
  assert.equal(ruleOf(cat, projOp({}, { arrayOps: { memberUids: { remove: ['uBob'] } } }), p).code, 'forbidden', 'removes a member');
  assert.equal(ruleOf(cat, projOp({ memberUids: ['uCat', 'uBob', 'uAnn'] }), p).ok, true, 'a list with the members in another order plus the invitee is an accept (Firestore hasAll)');
  assert.equal(ruleOf(cat, projOp({ memberUids: ['uCat', 'uBob'] }), p).code, 'forbidden', 'replaces the list: a member gone');
});

test('rules: rec and history — the project exists and the user is a member at that point', () => {
  const p = project();
  const rec = { t: 'rec', pid: 'P1', coll: 'points', key: 'p1', data: { label: 'A' }, mode: 'fields' };
  const hist = { t: 'history', pid: 'P1', key: 'h1', data: { id: 'h1', at: 1 } };
  const withP = (env) => ({ ...env, project: (pid) => (pid === 'P1' ? p : null) });
  assert.equal(ruleOf(withP(bob), rec, null).ok, true);
  assert.equal(ruleOf(withP(bob), hist, null).ok, true);
  assert.equal(ruleOf(withP(cat), rec, null).code, 'forbidden', 'an invitee is not a member yet');
  assert.equal(ruleOf(withP(dan), hist, null).code, 'forbidden');
  assert.equal(ruleOf(withP(bob), { ...rec, pid: 'P2' }, null).code, 'not-found');
});

test('rules: pool — administrator kinds, manuals, shared lists with deleted', () => {
  const item = (kind, data) => ({ t: 'pool', kind, key: 'k', data });
  for (const kind of ['types', 'devices', 'cables', 'catalog']) {
    assert.equal(ruleOf(boss, item(kind, { name: 'x' }), null).ok, true, `admin writes ${kind}`);
    assert.equal(ruleOf(ann, item(kind, { name: 'x' }), null).code, 'forbidden', `edge case 26: allowed user writes ${kind}`);
  }
  assert.equal(ruleOf(ann, item('manuals', { name: 'm' }), null).ok, true);
  assert.equal(ruleOf(dan, item('manuals', { name: 'm' }), null).code, 'forbidden');
  for (const kind of ['doorcfg', 'delayReasons', 'culprits', 'problems']) {
    assert.equal(ruleOf(ann, item(kind, { name: 'x', deleted: false }), null).ok, true, `allowed user adds to ${kind}`);
    assert.equal(ruleOf(ann, item(kind, { name: 'x' }), { name: 'y' }).ok, true, `allowed user edits ${kind}`);
    assert.equal(ruleOf(ann, { t: 'pool', kind, key: 'k', remove: true }, { name: 'x' }).code, 'forbidden', `allowed user deletes from ${kind}`);
    assert.equal(ruleOf(ann, item(kind, { he: 'x' }), { name: 'x', deleted: true }).code, 'forbidden', 'an edit of a deleted item keeps it deleted');
    assert.equal(ruleOf(boss, { t: 'pool', kind, key: 'k', remove: true }, { name: 'x' }).ok, true, `admin deletes from ${kind}`);
    assert.equal(ruleOf(dan, item(kind, { name: 'x' }), null).code, 'forbidden');
  }
  assert.equal(ruleOf(boss, item('inbox', { a: 1 }), null).code, 'invalid', 'unknown pool kind');
});

test('rules: inbox — new by allowed, the decision fields only by the administrator', () => {
  const op = (data) => ({ t: 'inbox', key: 'types:T1', data });
  assert.equal(ruleOf(ann, op({ item: { a: 1 } }), null).ok, true);
  assert.equal(ruleOf(dan, op({ item: { a: 1 } }), null).code, 'forbidden');
  const old = { item: { a: 1 }, status: 'new', seenHash: 'h' };
  assert.equal(ruleOf(ann, op({ item: { a: 2 }, hash: 'h2' }), old).ok, true);
  for (const k of ['status', 'seenHash', 'seenItem', 'seenAt']) assert.equal(ruleOf(ann, op({ [k]: 'z' }), old).code, 'forbidden', `allowed user changes ${k}`);
  assert.equal(ruleOf(ann, op({ status: 'new' }), old).ok, true, 'the same value is no change');
  assert.equal(ruleOf(boss, op({ status: 'ok', seenHash: 'h2', seenItem: {}, seenAt: 1 }), old).ok, true);
  assert.equal(ruleOf(dan, op({ item: { a: 3 } }), old).code, 'forbidden');
});

test('rules: allowed, prefs, superuser, signed out, itemPatches', () => {
  assert.equal(ruleOf(boss, { t: 'allowed', email: 'new@x.com' }, null).ok, true);
  assert.equal(ruleOf(ann, { t: 'allowed', email: 'new@x.com' }, null).code, 'forbidden');
  assert.equal(ruleOf(dan, { t: 'prefs', data: { a: 1 }, mode: 'deep' }, null).ok, true, 'prefs: always the user\'s own');
  assert.equal(ruleOf(sup, projOp({ id: 'P1', memberUids: [] }), null).ok, true, 'a superuser always');
  assert.equal(ruleOf(sup, { t: 'pool', kind: 'catalog', key: 'k', remove: true }, null).ok, true);
  assert.equal(ruleOf({ ...ann, user: null }, { t: 'prefs', data: {}, mode: 'deep' }, null).code, 'forbidden', 'not signed in');
  const patch = projOp({}, { itemPatches: { drawings: { d1: { v: 2 } } } });
  assert.equal(ruleOf(ann, patch, project()).code, 'forbidden', 'itemPatches are for jobs');
  assert.equal(ruleOf(sup, patch, project()).ok, true);
});

test('validateOp: bad ops, collection names, keys, modes and array ops', () => {
  const bad = [
    null, [], { t: 'nope' }, { t: 'project', key: '', data: {}, mode: 'deep' }, { t: 'project', key: 'x'.repeat(65), data: {}, mode: 'deep' },
    { t: 'project', key: 'P', data: [], mode: 'deep' }, { t: 'project', key: 'P', data: {}, mode: 'merge' },
    { t: 'rec', pid: 'P', coll: 'bad-name', key: 'k', data: {}, mode: 'deep' }, { t: 'rec', pid: 'P', coll: 'a'.repeat(41), key: 'k', data: {}, mode: 'deep' },
    { t: 'rec', pid: 'P', coll: 'history', key: 'k', data: {}, mode: 'deep' }, { t: 'rec', pid: 'P', coll: 'points', key: 'k'.repeat(401), data: {}, mode: 'fields' },
    { t: 'history', pid: 'P', key: 'h' }, { t: 'pool', kind: 'meta', key: 'k', data: {} }, { t: 'pool', kind: 'types', key: 'k' },
    { t: 'inbox', key: '', data: {} }, { t: 'allowed', email: 'nobody' }, { t: 'prefs', data: {}, mode: 'x' },
    { t: 'project', key: 'P', data: {}, mode: 'deep', arrayOps: { l: { union: 'a' } } },
    { t: 'project', key: 'P', data: {}, mode: 'deep', arrayOps: { l: { union: ['a'], remove: ['b'] } } },
    { t: 'rec', pid: 'P', coll: 'points', key: 'k', data: {}, mode: 'fields', itemPatches: { drawings: {} } },
  ];
  bad.forEach((op, i) => assert.equal(validateOp(op).code, 'invalid', `bad op ${i}: ${JSON.stringify(op)}`));
  assert.equal(validateOp({ t: 'rec', pid: 'P', coll: 'problemMarks', key: 'Поставка / склад', data: {}, mode: 'deep' }).ok, true);
  assert.equal(validateOp({ t: 'pool', kind: 'doorcfg', key: 'k', remove: true }).ok, true);
});

test('invitesOf and membersOf: lower case, once each, from = the first member e-mail', () => {
  assert.deepEqual(invitesOf({ name: 'Школа', object: 'Б', memberEmails: ['Ann@X.com', 'b@x'], invitedEmails: ['Cat@X.com', 'cat@x.com', '', 'd@x'] }, 'p1'), [
    { email: 'cat@x.com', key: 'p1', name: 'Школа', object: 'Б', from: 'ann@x.com' },
    { email: 'd@x', key: 'p1', name: 'Школа', object: 'Б', from: 'ann@x.com' },
  ]);
  assert.equal(invitesOf({ id: 'p2', invitedEmails: ['a@x'] })[0].key, 'p2', 'without the op key: the document id');
  assert.deepEqual(invitesOf({}), []);
  assert.deepEqual(membersOf({ memberUids: ['a', 'b', 'a', null, ''] }), ['a', 'b']);
});

// ---------- runSave ----------

const req = (ops, schema = pb.PB_SCHEMA) => ({ schema, ops });
const newProject = (pid = 'P9', uid = 'uAnn', extra = {}) => ({ t: 'project', key: pid, data: { id: pid, name: 'Новый', memberUids: [uid], memberEmails: ['ann@x.com'], createdBy: uid, ...extra }, mode: 'deep' });
const rec = (pid, key, data = { label: key }) => ({ t: 'rec', pid, coll: 'points', key, data, mode: 'fields' });

test('runSave: a new project and its records in one request; members and invites derived', () => {
  const s = mapStore();
  const res = runSave(s, ann, req([newProject('P9', 'uAnn', { invitedEmails: ['Cat@X.com'] }), rec('P9', 'p1'), { t: 'history', pid: 'P9', key: 'h1', data: { id: 'h1', at: 7 } }]));
  assert.deepEqual(res, { status: 200, ok: true, n: 3 });
  assert.equal(s.get({ c: 'records', pid: 'P9', coll: 'points', key: 'p1' }).label, 'p1');
  assert.deepEqual(s.derived.get(P('P9')), { members: ['uAnn'] });
  assert.deepEqual(s.derived.get(JSON.stringify({ c: 'history', pid: 'P9', key: 'h1' })), { at: 7 });
  assert.deepEqual(s.invites.get('P9'), [{ email: 'cat@x.com', key: 'P9', name: 'Новый', object: '', from: 'ann@x.com' }]);
});

test('runSave: a refused second op leaves the first not saved, with the right code and index', () => {
  const s = mapStore();
  assert.deepEqual(runSave(s, ann, req([newProject(), rec('P8', 'p1')])), { status: 422, code: 'not-found', index: 1, message: 'project not found' });
  assert.equal(s.size(), 0); assert.equal(s.invites.size, 0);
  const s2 = mapStore({ [P('P1')]: project() });
  const r2 = runSave(s2, bob, req([rec('P1', 'p1'), { t: 'project', key: 'P1', data: { archived: true }, mode: 'deep' }]));
  assert.equal(r2.status, 422); assert.equal(r2.code, 'forbidden'); assert.equal(r2.index, 1);
  assert.equal(s2.size(), 1, 'the record of op 0 is not kept');
  const r3 = runSave(mapStore(), ann, req([newProject(), { t: 'pool', kind: 'nope', key: 'k', data: {} }]));
  assert.deepEqual([r3.code, r3.index], ['invalid', 1]);
});

test('runSave: a later op sees an earlier one (removing yourself, then writing)', () => {
  const s = mapStore({ [P('P1')]: project() });
  const leave = { t: 'project', key: 'P1', data: {}, mode: 'deep', arrayOps: { memberUids: { remove: ['uAnn'] } } };
  const r = runSave(s, ann, req([leave, rec('P1', 'p1')]));
  assert.deepEqual([r.status, r.code, r.index], [422, 'forbidden', 1]);
  assert.deepEqual(s.get({ c: 'projects', key: 'P1' }).memberUids, ['uAnn', 'uBob'], 'rolled back');
  // accept an invitation and write in the same request
  const accept = { t: 'project', key: 'P1', data: { updatedAt: 1 }, mode: 'deep', arrayOps: { memberUids: { union: ['uCat'] }, memberEmails: { union: ['cat@x.com'] }, invitedEmails: { remove: ['cat@x.com'] } } };
  assert.equal(runSave(s, cat, req([accept, rec('P1', 'p2')])).status, 200);
  assert.deepEqual(s.derived.get(P('P1')).members, ['uAnn', 'uBob', 'uCat']);
  assert.deepEqual(s.invites.get('P1'), [], 'the accepted invitation leaves the invites index');
});

test('runSave: the same request twice is harmless; an existing history entry is a resend', () => {
  const s = mapStore();
  const r = req([newProject('P9', 'uAnn', { invitedEmails: ['b@x'] }), rec('P9', 'p1'), { t: 'history', pid: 'P9', key: 'h1', data: { id: 'h1', at: 1 } },
    { t: 'project', key: 'P9', data: {}, mode: 'deep', arrayOps: { invitedEmails: { union: ['c@x'] } } }]);
  assert.equal(runSave(s, ann, r).status, 200);
  const first = JSON.stringify(s.dump());
  assert.deepEqual(runSave(s, ann, structuredClone(r)), { status: 200, ok: true, n: 4 });
  assert.equal(JSON.stringify(s.dump()), first);
  assert.deepEqual(s.get({ c: 'projects', key: 'P9' }).invitedEmails, ['b@x', 'c@x']);
  const changed = { t: 'history', pid: 'P9', key: 'h1', data: { id: 'h1', at: 99 } };
  assert.equal(runSave(s, ann, req([changed])).status, 200);
  assert.equal(s.get({ c: 'history', pid: 'P9', key: 'h1' }).at, 1, 'history is never overwritten');
  assert.equal(runSave(s, dan, req([changed])).code, 'forbidden', 'a resend still needs membership');
  assert.equal(runSave(s, boss, req([{ t: 'allowed', email: 'x@y.z' }, { t: 'allowed', email: 'x@y.z' }])).status, 200);
  assert.equal(runSave(s, ann, req([{ t: 'allowed', email: 'x@y.z' }])).code, 'forbidden');
});

test('runSave: 409 and 426 answer before anything is read or written', () => {
  const s = mapStore();
  assert.deepEqual(runSave(s, ann, req([newProject()], pb.PB_SCHEMA + 1)), { status: 409, code: 'schema_old', schema: pb.PB_SCHEMA });
  assert.deepEqual(runSave(s, ann, req([newProject()], pb.MIN_CLIENT_SCHEMA - 1)), { status: 426, code: 'app_old' });
  assert.deepEqual(runSave(s, ann, { ops: [newProject()] }), { status: 426, code: 'app_old' }, 'no schema = 0');
  assert.equal(s.finds, 0); assert.equal(s.size(), 0);
  assert.deepEqual(runSave(s, ann, { schema: 1 }), { status: 422, code: 'invalid', index: -1, message: 'ops is not a list' });
  assert.equal(runSave(s, ann, req(Array.from({ length: 501 }, (_, i) => rec('P1', `p${i}`)))).index, -1);
});

test('runSave: a store error (JSON over 2 MB) rolls back and answers invalid with the op index', () => {
  const s = mapStore();
  s.failOn = (t) => t.c === 'records' && t.key === 'big';
  const r = runSave(s, ann, req([newProject(), rec('P9', 'p1'), rec('P9', 'big')]));
  assert.deepEqual([r.status, r.code, r.index], [422, 'invalid', 2]);
  assert.match(r.message, /2097152/);
  assert.equal(s.size(), 0); assert.equal(s.invites.size, 0);
});

test('runSave: prefs go to the signed-in user; pool, inbox and a superuser job with itemPatches', () => {
  const s = mapStore({ [P('P1')]: { ...project(), drawings: [{ id: 'd1', v: 1 }] } });
  assert.equal(runSave(s, bob, req([{ t: 'prefs', data: { bind: { a: 1 } }, mode: 'deep', user: 'uAnn' }])).status, 200);
  assert.deepEqual(s.get({ c: 'prefs', user: 'uBob' }), { bind: { a: 1 } }, 'a user cannot name another user');
  assert.equal(runSave(s, sup, req([{ t: 'prefs', data: { x: 1 }, mode: 'deep' }])).code, 'invalid', 'a superuser must name the user');
  assert.equal(runSave(s, sup, req([{ t: 'prefs', data: { x: 1 }, mode: 'deep', user: 'uAnn' }])).status, 200);
  assert.equal(runSave(s, ann, req([{ t: 'pool', kind: 'problems', key: 'Нет трубы', data: { name: 'Нет трубы', deleted: false } }, { t: 'inbox', key: 'k', data: { item: 1 } }])).status, 200);
  assert.equal(runSave(s, sup, req([{ t: 'project', key: 'P1', data: {}, mode: 'deep', itemPatches: { drawings: { d1: { v: 2 } } } }])).status, 200);
  assert.deepEqual(s.get({ c: 'projects', key: 'P1' }).drawings, [{ id: 'd1', v: 2 }]);
});

test('runSave: repo writes of a whole session applied in order give the Firestore result', () => {
  const r = recorder(); const repo = createRepo(r.backend, userAnn);
  const pid = repo.createProject({ name: 'Объект', managers: { a: 1 } }, { types: [], catalog: [{ id: 'W', name: 'Терм', planColour: false }] });
  repo.save(pid, [{ coll: 'points', id: 'p1', data: { label: 'A', pos: { x: 1, icon: 'cam' } } }]);
  repo.save(pid, [{ coll: 'points', id: 'p1', data: { pos: { x: 2 } } }]);
  repo.saveProject(pid, { managers: {} });
  repo.saveProject(pid, { tables: { t: 1 } }, { replace: true });
  repo.invite({ id: pid, createdBy: 'uAnn' }, 'cat@x.com');
  r.backend.commit(pid, [{ coll: 'catalog', id: 'W', data: { name: 'Терм 2' } }]); // an older build without planColour
  const s = mapStore();
  const commits = r.calls.filter((c) => c.kind === 'commit');
  commits.forEach((c) => assert.equal(runSave(s, ann, req(toOps('commit', c.pid, c.writes))).status, 200));
  const p = s.get({ c: 'projects', key: pid });
  assert.deepEqual(p.managers, {}); assert.deepEqual(p.tables, { t: 1 }); assert.deepEqual(p.invitedEmails, ['cat@x.com']);
  const pt = s.get({ c: 'records', pid, coll: 'points', key: 'p1' });
  assert.deepEqual(pt.pos, { x: 2 }); assert.equal(pt.label, 'A');
  const work = s.get({ c: 'records', pid, coll: 'catalog', key: 'W' });
  assert.deepEqual([work.name, work.planColour], ['Терм 2', false], 'ADR 0018: the older build keeps planColour');
  assert.deepEqual(s.invites.get(pid).map((x) => x.email), ['cat@x.com']);
});

// ---------- the generated hook copy and the syntax guard ----------

test('the generated hook module is fresh (rule 15) and exports what the source exports', () => {
  assert.ok(isFresh(), `${OUT} is stale: run npm run pb:hooks`);
  // LF first: a Windows checkout (core.autocrlf) has the source in CRLF, which the CRLF case below would double
  const src = fs.readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
  assert.notEqual(build(`${src}\nexport const EXTRA = 1;\n`), fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n'), 'a changed source makes the copy stale');
  assert.equal(build(src.replace(/\n/g, '\r\n')), build(src), 'a CRLF checkout builds the same copy');
  // load it as PocketBase's require() does: a CommonJS module (the repo's package.json says ESM, so not through node's require)
  const mod = { exports: {} };
  new Function('module', 'exports', fs.readFileSync(OUT, 'utf8'))(mod, mod.exports);
  const cjs = mod.exports;
  assert.deepEqual(Object.keys(cjs).sort(), Object.keys(pb).sort());
  assert.equal(cjs.PB_SCHEMA, pb.PB_SCHEMA);
  assert.deepEqual(cjs.runSave(mapStore(), ann, req([newProject()])), { status: 200, ok: true, n: 1 });
  assert.match(fs.readFileSync(OUT, 'utf8'), /^\/\/ GENERATED by scripts\/pb-hooks-build\.mjs — do not edit/);
});

test('syntax guard: ES2019 without imports or object spread, so PocketBase\'s engine runs it', () => {
  assert.throws(() => acorn.parse('a?.b', { ecmaVersion: 2019 }), 'ES2019 refuses optional chaining');
  assert.throws(() => acorn.parse('a ?? b', { ecmaVersion: 2019 }), 'ES2019 refuses ??');
  const ast = acorn.parse(fs.readFileSync(SRC, 'utf8'), { ecmaVersion: 2019, sourceType: 'module' });
  const found = [];
  walk.full(ast, (n) => {
    if (n.type === 'ImportDeclaration' || n.type === 'ImportExpression') found.push('import');
    if (n.type === 'ObjectExpression' && n.properties.some((p) => p.type === 'SpreadElement')) found.push(`object spread at ${n.start}`);
    if (n.type === 'ExportDefaultDeclaration' || n.type === 'ExportAllDeclaration' || (n.type === 'ExportNamedDeclaration' && !n.declaration)) found.push('export form the generator does not turn');
  });
  assert.deepEqual(found, []);
  acorn.parse(fs.readFileSync(OUT, 'utf8'), { ecmaVersion: 2019, sourceType: 'script' });
});
