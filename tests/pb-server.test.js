// Checks the NAS copy's server against a real PocketBase 0.42.3 (spec 4 § 2, § 11; ticket 4.2): migration 1 and its rules, the write route
// with every rule row of § 2.4, rollback and the refused op's index, resend, 409/426/413, invites, realtime reach, the first administrator,
// speed and size limits, the hooks without their files, the keep-alive event. Also, without a server: PM_SCHEMA equals PB_SCHEMA,
// the hook calls require() only inside handlers, and the migration gives no app collection a write rule (coding-standards rule 14).
// The server part needs `node tools/pb-dev.mjs fetch`; it is skipped with a message without the binary, and fails then in CI (PB_TESTS_REQUIRED=1).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { PB_SCHEMA } from '../src/domain/pbwrite.js';
import { missingBinary, REQUIRED, startServer, realtime, api } from './pb-helper.js';

const HOOK = fs.readFileSync(new URL('../pb/pb_hooks/pm.pb.js', import.meta.url), 'utf8');
const MIGRATION = fs.readFileSync(new URL('../pb/pb_migrations/1764000001_pm_schema_1.js', import.meta.url), 'utf8');
const APP_COLLECTIONS = ['projects', 'records', 'history', 'pool', 'inbox', 'allowed', 'admin', 'prefs', 'invites'];

// ---------- without a server ----------

test('PM_SCHEMA of the hook equals PB_SCHEMA of src/domain/pbwrite.js', () => {
  const m = HOOK.match(/^const PM_SCHEMA = (\d+);$/m);
  assert.ok(m, 'pm.pb.js declares `const PM_SCHEMA = <n>;`');
  assert.equal(Number(m[1]), PB_SCHEMA);
});

test('the hook calls require() only inside handlers (top-level names are not visible there)', () => {
  const ast = acorn.parse(HOOK, { ecmaVersion: 'latest', sourceType: 'script' });
  let n = 0;
  walk.ancestor(ast, {
    CallExpression(node, _state, ancestors) {
      if (node.callee.type !== 'Identifier' || node.callee.name !== 'require') return;
      n++;
      const inFn = ancestors.some((a) => a !== node && /Function/.test(a.type));
      assert.ok(inFn, `require() at offset ${node.start} is outside a handler`);
    },
  });
  assert.ok(n >= 3, 'the routes load their modules');
});

test('migration 1 gives no app collection a create, update or delete rule (rule 14)', () => {
  const assigned = [...MIGRATION.matchAll(/(create|update|delete)Rule\s*[:=]\s*([^,;\n]+)/g)].map((m) => `${m[1]}=${m[2].trim()}`);
  const notNull = assigned.filter((a) => !a.endsWith('=null'));
  assert.deepEqual(notNull, ['create=\'@request.context = "oauth2"\''], 'only users.createRule (OAuth2 sign-in) is not null');
});

// ---------- against a real PocketBase ----------

const missing = missingBinary();
if (missing && REQUIRED) {
  test('PocketBase binary is present (PB_TESTS_REQUIRED=1)', () => assert.fail(missing));
}
if (missing && !REQUIRED) console.log(`# ${missing}`);

describe('PocketBase server', { skip: missing ? missing : false }, () => {
  let srv; let A; let B; let C; let boss; let D; let ping; let pingFrom;
  const big = (bytes) => ({ blob: 'x'.repeat(bytes) });

  before(async () => {
    srv = await startServer();
    [A, B, C] = srv.users;
    boss = await srv.user('boss@pm.test', 'Boss');
    D = await srv.user('d@pm.test', 'Tester D');
    pingFrom = Date.now();
    ping = await realtime(srv.url, A.token, ['pm_ping']);
  });
  after(async () => {
    if (ping) ping.close();
    if (srv) await srv.stop();
  });

  test('migration: app collections read by the spec rules, never written through the record API', async () => {
    const r = await srv.su('/api/collections?perPage=200');
    const by = Object.fromEntries(r.json.items.map((c) => [c.name, c]));
    for (const name of APP_COLLECTIONS) {
      assert.ok(by[name], `collection ${name} exists`);
      assert.equal(by[name].createRule, null, `${name}.createRule`);
      assert.equal(by[name].updateRule, null, `${name}.updateRule`);
      assert.equal(by[name].deleteRule, null, `${name}.deleteRule`);
      const names = by[name].fields.map((f) => f.name);
      assert.ok(names.includes('created') && names.includes('updated'), `${name} has created and updated`);
    }
    assert.equal(by.records.listRule, 'project.members.id ?= @request.auth.id');
    assert.equal(by.projects.listRule, 'members.id ?= @request.auth.id');
    assert.equal(by.invites.listRule, 'email = @request.auth.email:lower');
    assert.equal(by.users.listRule, 'id = @request.auth.id');
    assert.equal(by.users.createRule, '@request.context = "oauth2"');
    assert.equal(by.users.updateRule, null);
    assert.equal(by.users.deleteRule, null);
    assert.equal(by.records.fields.find((f) => f.name === 'data').maxSize, 2097152);
  });

  test('a guest cannot create a user; a user cannot write a collection through the record API', async () => {
    const before = (await srv.all('users')).length;
    const g = await srv.call('/api/collections/users/records', { method: 'POST', body: { email: 'guest@pm.test', password: 'guest-pass-1', passwordConfirm: 'guest-pass-1' } });
    assert.equal(g.status, 400);
    assert.equal((await srv.all('users')).length, before);
    const w = await srv.call('/api/collections/projects/records', { method: 'POST', token: A.token, body: { key: 'direct', data: {} } });
    assert.ok(w.status === 403 || w.status === 400, `direct create refused (${w.status})`);
  });

  test('two first POST /api/pm/admin calls at once get the same e-mail (edge case 17)', async () => {
    const [x, y] = await Promise.all([
      srv.call('/api/pm/admin', { method: 'POST', token: boss.token }),
      srv.call('/api/pm/admin', { method: 'POST', token: D.token }),
    ]);
    assert.equal(x.status, 200); assert.equal(y.status, 200);
    assert.equal(x.json.admin, y.json.admin);
    assert.ok(['boss@pm.test', 'd@pm.test'].includes(x.json.admin));
    assert.equal((await srv.all('admin')).length, 1);
    // make the outcome fixed for the tests below
    const rec = (await srv.all('admin'))[0];
    await srv.su(`/api/collections/admin/records/${rec.id}`, { method: 'PATCH', body: { email: 'boss@pm.test' } });
    const info = await srv.call('/api/pm/info', { token: A.token });
    assert.deepEqual(info.json, { app: 'pm', schema: PB_SCHEMA, admin: 'boss@pm.test' });
    const pub = await srv.call('/api/pm/info');
    assert.deepEqual(pub.json, { app: 'pm', schema: PB_SCHEMA }, 'public info: the generated pbwrite.js loads in the real engine');
  });

  test('allowed: the administrator adds (lower case), others are refused', async () => {
    const ok = await srv.save(boss.token, [{ t: 'allowed', email: 'a@pm.test' }, { t: 'allowed', email: 'B@PM.test' }]);
    assert.equal(ok.status, 200, ok.text);
    assert.deepEqual((await srv.all('allowed')).map((r) => r.email).sort(), ['a@pm.test', 'b@pm.test']);
    const no = await srv.save(A.token, [{ t: 'allowed', email: 'c@pm.test' }]);
    assert.equal(no.status, 422);
    assert.equal(no.json.code, 'forbidden');
    const again = await srv.save(boss.token, [{ t: 'allowed', email: 'a@pm.test' }]);
    assert.equal(again.status, 200, 'an e-mail already there is a resend');
    const seen = await srv.call('/api/collections/allowed/records', { token: A.token });
    assert.deepEqual(seen.json.items.map((r) => r.email), ['a@pm.test'], 'a user sees only their own allowed record');
  });

  const p1 = () => ({ id: 'p1', name: 'Obj', object: 'Site', memberUids: [A.id], memberEmails: ['a@pm.test'], invitedEmails: ['B@pm.test'], createdBy: A.id });

  test('project, new: allowed and in memberUids; refused for a user not allowed or not in memberUids', async () => {
    const ok = await srv.save(A.token, [{ t: 'project', key: 'p1', data: p1(), mode: 'deep' }]);
    assert.equal(ok.status, 200, ok.text);
    assert.deepEqual(ok.json, { status: 200, ok: true, n: 1 });
    const [rec] = await srv.all('projects', 'key = "p1"');
    assert.deepEqual(rec.members, [A.id], 'members follow memberUids');
    const c = await srv.save(C.token, [{ t: 'project', key: 'pc', data: { memberUids: [C.id] }, mode: 'deep' }]);
    assert.equal(c.status, 422); assert.equal(c.json.code, 'forbidden'); assert.equal(c.json.index, 0);
    const notIn = await srv.save(A.token, [{ t: 'project', key: 'px', data: { memberUids: [B.id] }, mode: 'deep' }]);
    assert.equal(notIn.json.code, 'forbidden');
    assert.equal((await srv.all('projects', 'key = "px" || key = "pc"')).length, 0);
  });

  test('invites follow invitedEmails in lower case; the invitee alone sees theirs (edge case 18)', async () => {
    let inv = await srv.all('invites');
    assert.deepEqual(inv.map((r) => [r.email, r.data]), [['b@pm.test', { name: 'Obj', object: 'Site', from: 'a@pm.test' }]]);
    const r1 = await srv.save(A.token, [{ t: 'project', key: 'p1', data: { invitedEmails: ['B@pm.test', 'X@pm.test'] }, mode: 'deep' }]);
    assert.equal(r1.status, 200, r1.text);
    inv = await srv.all('invites');
    assert.deepEqual(inv.map((r) => r.email).sort(), ['b@pm.test', 'x@pm.test']);
    assert.equal((await srv.call('/api/collections/invites/records', { token: B.token })).json.items.length, 1);
    assert.equal((await srv.call('/api/collections/invites/records', { token: C.token })).json.items.length, 0);
    const r2 = await srv.save(A.token, [{ t: 'project', key: 'p1', data: { invitedEmails: ['B@pm.test'] }, mode: 'deep' }]);
    assert.equal(r2.status, 200);
    assert.deepEqual((await srv.all('invites')).map((r) => r.email), ['b@pm.test']);
  });

  test('project, invitee: cheating refused, accepting with capital letters in the invitation allowed', async () => {
    const cheat1 = await srv.save(B.token, [{ t: 'project', key: 'p1', data: { memberUids: [A.id, B.id, C.id], memberEmails: ['a@pm.test', 'b@pm.test'], invitedEmails: [] }, mode: 'deep' }]);
    assert.equal(cheat1.json.code, 'forbidden');
    const cheat2 = await srv.save(B.token, [{ t: 'project', key: 'p1', data: { name: 'Mine', memberUids: [A.id, B.id] }, mode: 'deep' }]);
    assert.equal(cheat2.json.code, 'forbidden');
    const ok = await srv.save(B.token, [{ t: 'project', key: 'p1', data: { memberUids: [A.id, B.id], memberEmails: ['a@pm.test', 'b@pm.test'], invitedEmails: [], updatedAt: 1, updatedBy: B.id }, mode: 'deep' }]);
    assert.equal(ok.status, 200, ok.text);
    const [rec] = await srv.all('projects', 'key = "p1"');
    assert.deepEqual(rec.members, [A.id, B.id]);
    assert.equal((await srv.all('invites')).length, 0, 'the accepted invitation is gone');
    assert.equal((await srv.call('/api/collections/projects/records', { token: B.token })).json.items.length, 1, 'B now reads the project');
  });

  test('project, invitee declines; a non-creator member edits but cannot change members', async () => {
    await srv.save(A.token, [{ t: 'project', key: 'p2', data: { id: 'p2', memberUids: [A.id], memberEmails: ['a@pm.test'], invitedEmails: ['c@pm.test'], createdBy: A.id }, mode: 'deep' }]);
    const decline = await srv.save(C.token, [{ t: 'project', key: 'p2', data: { invitedEmails: [] }, mode: 'deep' }]);
    assert.equal(decline.status, 200, decline.text);
    assert.equal((await srv.all('invites')).length, 0);
    const edit = await srv.save(B.token, [{ t: 'project', key: 'p1', data: { name: 'Obj 2' }, mode: 'deep' }]);
    assert.equal(edit.status, 200, edit.text);
    const members = await srv.save(B.token, [{ t: 'project', key: 'p1', data: { invitedEmails: ['d@pm.test'] }, mode: 'deep' }]);
    assert.equal(members.json.code, 'forbidden');
    const archive = await srv.save(B.token, [{ t: 'project', key: 'p1', data: { archived: true }, mode: 'deep' }]);
    assert.equal(archive.json.code, 'forbidden');
  });

  test('records and history: members write; a non-member is refused; a missing project is not-found; history is create-only', async () => {
    const ok = await srv.save(B.token, [
      { t: 'rec', pid: 'p1', coll: 'points', key: 'FA/C-01', data: { label: 'FA/C-01', pos: { x: 1, icon: 'a' } }, mode: 'fields' },
      { t: 'history', pid: 'p1', key: 'h1', data: { at: 10, by: B.id, coll: 'points' } },
    ]);
    assert.equal(ok.status, 200, ok.text);
    const no = await srv.save(C.token, [{ t: 'rec', pid: 'p1', coll: 'points', key: 'FA/C-01', data: { label: 'evil' }, mode: 'deep' }]);
    assert.equal(no.json.code, 'forbidden');
    const nf = await srv.save(A.token, [{ t: 'rec', pid: 'nope', coll: 'points', key: 'k', data: {}, mode: 'deep' }]);
    assert.equal(nf.status, 422); assert.equal(nf.json.code, 'not-found');
    const h2 = await srv.save(A.token, [{ t: 'history', pid: 'p1', key: 'h1', data: { at: 99, by: A.id } }]);
    assert.equal(h2.status, 200, 'resend of a history entry is success');
    const [h] = await srv.all('history', 'key = "h1"');
    assert.equal(h.data.at, 10, 'the stored entry is unchanged');
    assert.equal(h.at, 10);
    const hc = await srv.save(C.token, [{ t: 'history', pid: 'p1', key: 'h-c', data: { at: 1 } }]);
    assert.equal(hc.json.code, 'forbidden');
    // points are written by whole top-level fields: pos loses its icon
    await srv.save(A.token, [{ t: 'rec', pid: 'p1', coll: 'points', key: 'FA/C-01', data: { pos: { x: 2 } }, mode: 'fields' }]);
    const [pt] = await srv.all('records', 'key = "FA/C-01"');
    assert.deepEqual(pt.data, { label: 'FA/C-01', pos: { x: 2 } });
    assert.equal((await srv.call('/api/collections/records/records', { token: C.token })).json.items.length, 0, 'a non-member lists nothing');
  });

  test('pool: administrator kinds, manuals for the allowed, shared kinds deleted only by the administrator', async () => {
    assert.equal((await srv.save(boss.token, [{ t: 'pool', kind: 'types', key: 'Detector', data: { name: 'Detector' } }])).status, 200);
    assert.equal((await srv.save(A.token, [{ t: 'pool', kind: 'types', key: 'X', data: {} }])).json.code, 'forbidden');
    assert.equal((await srv.save(A.token, [{ t: 'pool', kind: 'manuals', key: 'm1', data: { name: 'M' } }])).status, 200);
    assert.equal((await srv.save(C.token, [{ t: 'pool', kind: 'manuals', key: 'm2', data: {} }])).json.code, 'forbidden');
    assert.equal((await srv.save(A.token, [{ t: 'pool', kind: 'doorcfg', key: 'd1', data: { name: 'ЭМ' } }])).status, 200);
    assert.equal((await srv.save(A.token, [{ t: 'pool', kind: 'doorcfg', key: 'd1', remove: true }])).json.code, 'forbidden');
    assert.equal((await srv.save(boss.token, [{ t: 'pool', kind: 'doorcfg', key: 'd1', remove: true }])).status, 200);
    const [d1] = await srv.all('pool', 'key = "d1"');
    assert.deepEqual(d1.data, { name: 'ЭМ', deleted: true });
    assert.equal((await srv.save(boss.token, [{ t: 'pool', kind: 'unknown', key: 'z', data: {} }])).json.code, 'invalid');
    assert.equal((await srv.call('/api/collections/pool/records', { token: C.token })).json.items.length, 3, 'any signed-in user reads the pool');
  });

  test('inbox: the allowed add, only the administrator decides; prefs are the user\'s own', async () => {
    assert.equal((await srv.save(A.token, [{ t: 'inbox', key: 'types:A', data: { text: 'x' } }])).status, 200);
    assert.equal((await srv.save(C.token, [{ t: 'inbox', key: 'types:C', data: { text: 'x' } }])).json.code, 'forbidden');
    assert.equal((await srv.save(A.token, [{ t: 'inbox', key: 'types:A', data: { status: 'ok' } }])).json.code, 'forbidden');
    assert.equal((await srv.save(A.token, [{ t: 'inbox', key: 'types:A', data: { text: 'y' } }])).status, 200);
    assert.equal((await srv.save(boss.token, [{ t: 'inbox', key: 'types:A', data: { status: 'ok' } }])).status, 200);
    assert.equal((await srv.call('/api/collections/inbox/records', { token: A.token })).json.items.length, 0, 'only the administrator reads the inbox');
    assert.equal((await srv.call('/api/collections/inbox/records', { token: boss.token })).json.items.length, 1);
    assert.equal((await srv.save(C.token, [{ t: 'prefs', data: { glossary: { a: 1 } }, mode: 'deep' }])).status, 200);
    assert.equal((await srv.save(C.token, [{ t: 'prefs', data: { glossary: { b: 2 } }, mode: 'deep' }])).status, 200);
    const mine = await srv.call('/api/collections/prefs/records', { token: C.token });
    assert.deepEqual(mine.json.items.map((r) => [r.user, r.data]), [[C.id, { glossary: { a: 1, b: 2 } }]]);
    assert.equal((await srv.call('/api/collections/prefs/records', { token: A.token })).json.items.length, 0);
  });

  test('a superuser writes anything, item patches included; users cannot send item patches', async () => {
    await srv.save(A.token, [{ t: 'project', key: 'p1', data: { drawings: [{ id: 'd1', name: 'Plan' }] }, mode: 'deep' }]);
    const su = await srv.save(srv.superToken, [
      { t: 'project', key: 'p1', data: {}, mode: 'deep', itemPatches: { drawings: { d1: { numberedFileId: 'f1' } } } },
      { t: 'project', key: 'p-su', data: { id: 'p-su', memberUids: [C.id] }, mode: 'deep' },
      { t: 'pool', kind: 'catalog', key: 'a/b c', data: { name: 'a/b c' } },
    ]);
    assert.equal(su.status, 200, su.text);
    const [rec] = await srv.all('projects', 'key = "p1"');
    assert.deepEqual(rec.data.drawings, [{ id: 'd1', name: 'Plan', numberedFileId: 'f1' }]);
    const u = await srv.save(A.token, [{ t: 'project', key: 'p1', data: {}, mode: 'deep', itemPatches: { drawings: { d1: { x: 1 } } } }]);
    assert.equal(u.json.code, 'forbidden');
    const ghost = await srv.save(srv.superToken, [{ t: 'project', key: 'p-ghost', data: { memberUids: ['nosuchuser0000'] }, mode: 'deep' }]);
    assert.equal(ghost.status, 422, 'a user id that does not exist in memberUids is PocketBase\'s own validation');
    assert.equal(ghost.json.code, 'invalid');
    const junk = await srv.call('/api/pm/save', { method: 'POST', token: A.token, raw: 'not json' });
    assert.equal(junk.status, 422); assert.equal(junk.json.code, 'invalid');
  });

  test('a refused op rolls back the whole request and answers its index', async () => {
    const r = await srv.save(A.token, [
      { t: 'project', key: 'p-rb', data: { id: 'p-rb', memberUids: [A.id] }, mode: 'deep' },
      { t: 'rec', pid: 'p1', coll: 'points', key: 'rb-1', data: { a: 1 }, mode: 'fields' },
      { t: 'pool', kind: 'types', key: 'rb', data: {} },
    ]);
    assert.equal(r.status, 422);
    assert.equal(r.json.code, 'forbidden');
    assert.equal(r.json.index, 2);
    assert.equal((await srv.all('projects', 'key = "p-rb"')).length, 0);
    assert.equal((await srv.all('records', 'key = "rb-1"')).length, 0);
  });

  test('a 2.2 MB JSON value answers invalid with its index and rolls back; 1.9 MB is saved', async () => {
    const r = await srv.save(A.token, [
      { t: 'rec', pid: 'p1', coll: 'notes', key: 'small', data: { a: 1 }, mode: 'deep' },
      { t: 'rec', pid: 'p1', coll: 'notes', key: 'big', data: big(2.2e6), mode: 'deep' },
    ]);
    assert.equal(r.status, 422, r.text.slice(0, 300));
    assert.equal(r.json.code, 'invalid');
    assert.equal(r.json.index, 1);
    assert.equal((await srv.all('records', 'coll = "notes"')).length, 0, 'the first op was rolled back');
    const ok = await srv.save(A.token, [{ t: 'rec', pid: 'p1', coll: 'notes', key: 'big', data: big(1.9e6), mode: 'deep' }]);
    assert.equal(ok.status, 200, ok.text.slice(0, 300));
  });

  test('the same request sent twice is harmless (edge case 2)', async () => {
    const ops = [
      { t: 'project', key: 'p1', data: { note: 'n' }, mode: 'deep' },
      { t: 'rec', pid: 'p1', coll: 'cables', key: 'c1', data: { len: 5 }, mode: 'deep' },
      { t: 'history', pid: 'p1', key: 'h-resend', data: { at: 20, by: A.id } },
    ];
    const one = await srv.save(A.token, ops);
    const two = await srv.save(A.token, ops);
    assert.equal(one.status, 200); assert.equal(two.status, 200);
    assert.equal((await srv.all('records', 'coll = "cables"')).length, 1);
    assert.equal((await srv.all('history', 'key = "h-resend"')).length, 1);
  });

  test('409 for a newer app, 426 for an older one, 401 without a token, 413 over 4 MB (edge case 29)', async () => {
    const newer = await srv.save(A.token, [], PB_SCHEMA + 1);
    assert.equal(newer.status, 409);
    assert.deepEqual({ code: newer.json.code, schema: newer.json.schema }, { code: 'schema_old', schema: PB_SCHEMA });
    const older = await srv.save(A.token, [], 0);
    assert.equal(older.status, 426); assert.equal(older.json.code, 'app_old');
    const guest = await srv.call('/api/pm/save', { method: 'POST', body: { schema: 1, ops: [] } });
    assert.equal(guest.status, 401);
    const huge = await srv.call('/api/pm/save', { method: 'POST', token: A.token, raw: JSON.stringify({ schema: 1, ops: [{ t: 'rec', pid: 'p1', coll: 'notes', key: 'h', data: big(4.3e6), mode: 'deep' }] }) });
    assert.equal(huge.status, 413);
    const many = await srv.save(A.token, Array.from({ length: 501 }, (_, i) => ({ t: 'history', pid: 'p1', key: `m${i}`, data: { at: i } })));
    assert.equal(many.status, 422); assert.equal(many.json.index, -1);
  });

  test('a realtime event after a save reaches members and no one else', async () => {
    const topics = ['records/*'];
    const [ra, rb, rc] = await Promise.all([realtime(srv.url, A.token, topics), realtime(srv.url, B.token, topics), realtime(srv.url, C.token, topics)]);
    try {
      const r = await srv.save(A.token, [{ t: 'rec', pid: 'p1', coll: 'points', key: 'rt-1', data: { label: 'RT' }, mode: 'fields' }]);
      assert.equal(r.status, 200);
      const is = (ev) => ev.data && ev.data.record && ev.data.record.key === 'rt-1';
      assert.ok(await ra.waitFor(is, 5000), 'the author gets the event');
      assert.ok(await rb.waitFor(is, 5000), 'another member gets the event');
      assert.equal(await rc.waitFor(is, 1500), null, 'a non-member gets nothing');
    } finally { ra.close(); rb.close(); rc.close(); }
  });

  test('a 400-op request runs in about a second', async () => {
    const pad = 'y'.repeat(1800);
    const ops = Array.from({ length: 400 }, (_, i) => ({ t: 'rec', pid: 'p1', coll: 'journal', key: `j${i}`, data: { i, pad }, mode: 'deep' }));
    const t0 = Date.now();
    const r = await srv.save(A.token, ops);
    const ms = Date.now() - t0;
    assert.equal(r.status, 200, r.text.slice(0, 300));
    console.log(`# 400 ops: ${ms} ms`);
    assert.ok(ms < 4000, `400 ops took ${ms} ms`);
    assert.equal((await srv.all('records', 'coll = "journal"')).length, 400);
  });

  test('without the hook files /api/pm/info answers 404 (edge case 9)', async () => {
    const bare = await startServer({ hooks: false, users: false });
    try {
      const r = await api(bare.url, '/api/pm/info');
      assert.equal(r.status, 404);
    } finally { await bare.stop(); }
  });

  test('the keep-alive event pm_ping arrives within 70 s', { timeout: 80000 }, async () => {
    const left = Math.max(1000, 70000 - (Date.now() - pingFrom));
    const ev = await ping.waitFor((e) => e.event === 'pm_ping', left);
    assert.ok(ev, 'no pm_ping within 70 s of subscribing');
    assert.equal(typeof ev.data.t, 'number');
    console.log(`# pm_ping after ${Math.round((ev.at - pingFrom) / 1000)} s`);
  });
});
