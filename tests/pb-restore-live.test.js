// Checks the restore tool (scripts/pb-restore.mjs, spec 4 § 6, § 10 case 20, § 11) against a real PocketBase 0.42.3: plan → write → count check → --verify
// on the synthetic backup of tests/fixtures/restore-backup/; a second write refused without --resume and harmless with it; a run killed in the middle
// finished by --resume without duplicates; Google-style sign-in through a fake OIDC provider returns the restored user (same id, isNew false); the
// export of ticket 4.11 restored into another server equals the input, and that export goes back to the fake Firestore with Firebase uids.
// Needs `node tools/pb-dev.mjs fetch`; skipped with a message without the binary, fails then in CI (PB_TESTS_REQUIRED=1), as tests/pb-server.test.js.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { missingBinary, REQUIRED, startServer, api } from './pb-helper.js';
import { SUPERUSER, freePort } from '../tools/pb-dev.mjs';
import { runRestore, readBackupFolder } from '../scripts/pb-restore.mjs';
import { openPocketBase } from '../scripts/pb-source.mjs';
import { runServerBackup, runFirestoreRestore, stamp, COMMON_FILE } from '../scripts/server-backup-lib.mjs';
import { planRestore, mapIds, mapInboxKey } from '../src/domain/pbrestore.js';
import { createFakeFirestore, Timestamp } from './fake-firestore.js';

const missing = missingBinary();
if (missing && REQUIRED) test('PocketBase binary is present (PB_TESTS_REQUIRED=1)', () => assert.fail(missing));
if (missing && !REQUIRED) console.log(`# ${missing}`);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'restore-backup');
const U2 = 'FbBravoUid0000000000000002bb'; const UX = 'FbOldHelperUid000000000009xx';
const A = 'tester.a@example.test'; const B = 'tester.b@example.test'; const C = 'tester.c@example.test';
const PLAN = planRestore(readBackupFolder(FIXTURE));

const restore = (srv, dir, flags = {}) => {
  const lines = [];
  return runRestore({ dir, url: srv.url, email: SUPERUSER.email, password: SUPERUSER.password, log: (l) => lines.push(l), ...flags }).then((r) => ({ ...r, lines }));
};
const usersByEmail = async (srv) => new Map((await srv.all('users')).map((u) => [u.email, u]));
const counts = async (srv) => Object.fromEntries(await Promise.all(['projects', 'records', 'history', 'invites', 'pool', 'inbox', 'allowed', 'admin', 'prefs'].map(async (c) => [c, (await srv.all(c)).length])));
const planned = () => { const { users, ...rest } = PLAN.counts; return rest; };

describe('restore tool against PocketBase', { skip: missing ? missing : false }, () => {
  let srv;
  before(async () => { srv = await startServer({ users: false }); });
  after(async () => { await srv?.stop(); });

  test('plan → write → count check → --verify pass on the synthetic backup', async () => {
    const r = await restore(srv, FIXTURE, { write: true, verify: true });
    assert.equal(r.code, 0, r.lines.join('\n'));
    assert.ok(r.lines.some((l) => l.startsWith('Проверка количества:')));
    assert.ok(!r.lines.some((l) => l.includes('✗')), r.lines.join('\n'));
    assert.ok(r.lines.includes('Сверка: все документы совпадают с копией ✓'));
    assert.ok(r.lines.some((l) => /^Запись: \d+\.\d с$/.test(l)) && r.lines.some((l) => /^Сверка: \d+\.\d с$/.test(l)), 'each step prints its time');
    assert.deepEqual(await counts(srv), planned());

    const users = await usersByEmail(srv);
    assert.deepEqual([...users.keys()].sort(), [A, B, C]);
    for (const u of users.values()) { assert.equal(u.verified, true); assert.equal(u.emailVisibility, false); }
    assert.equal(users.get(B).name, 'Тестер Б');
    // nobody knows the password: a password sign-in with anything fails
    assert.equal((await api(srv.url, '/api/collections/users/auth-with-password', { method: 'POST', body: { identity: A, password: 'pm-local-test' } })).status, 400);

    const [p1] = await srv.all('projects', 'key = "p1"');
    assert.deepEqual(p1.members, [users.get(A).id, users.get(B).id]);
    assert.deepEqual(p1.data.memberUids, p1.members);
    assert.deepEqual(p1.data.removedMembers, { [users.get(C).id]: C });
    assert.equal(p1.data.updatedAtServer, undefined);
    const hist = await srv.all('history', `project = "${p1.id}"`);
    assert.equal(hist.find((h) => h.key === 'h1').at, 1794900000000);
    assert.equal(hist.find((h) => h.key === 'h2').data.by, UX, 'edge case 21: an author with no e-mail keeps the old uid');
    assert.equal(hist.find((h) => h.key === 'h3').data.by, users.get(C).id, 'a removed member keeps their history');
    const [inv] = await srv.all('invites');
    assert.equal(inv.project, p1.id);
    assert.equal(inv.email, 'helper.d@example.test');
    assert.deepEqual(inv.data, { key: 'p1', name: 'Alpha / Тест', object: 'מגדל אלפא', from: A });
    const [inbox] = await srv.all('inbox');
    assert.equal(inbox.key, `${users.get(B).id}_types_Камера`);
    assert.equal(inbox.data.owner.uid, users.get(B).id);
    const prefs = await srv.all('prefs');
    assert.deepEqual(prefs.map((p) => p.user).sort(), [users.get(A).id, users.get(B).id].sort());
    assert.equal((await srv.all('admin'))[0].email, A);
    assert.equal((await srv.all('records', 'key = "К/2"'))[0].coll, 'catalog');
  });

  test('a second write is refused without --resume; with --resume it adds nothing', async () => {
    const before = await counts(srv);
    const r = await restore(srv, FIXTURE, { write: true });
    assert.equal(r.code, 1);
    assert.ok(r.lines.some((l) => l.includes('уже есть проекты')));
    const again = await restore(srv, FIXTURE, { write: true, resume: true, verify: true });
    assert.equal(again.code, 0, again.lines.join('\n'));
    assert.deepEqual(await counts(srv), before);
    assert.equal((await srv.all('users')).length, 3);
  });

  test('--verify finds a document changed on the server, and the count check a missing one', async () => {
    const [rec] = await srv.all('records', 'key = "a"');
    await srv.su(`/api/collections/records/records/${rec.id}`, { method: 'PATCH', body: { data: { ...rec.data, label: 'changed' } } });
    const r = await restore(srv, FIXTURE, { verify: true });
    assert.equal(r.code, 1);
    assert.ok(r.lines.some((l) => l.includes('отличается: p1/points «a»')), r.lines.join('\n'));
    await srv.su(`/api/collections/records/records/${rec.id}`, { method: 'PATCH', body: { data: rec.data } });
    const [h] = await srv.all('history', 'key = "h4"');
    await srv.su(`/api/collections/history/records/${h.id}`, { method: 'DELETE' });
    const c = await restore(srv, FIXTURE, { verify: true });
    assert.equal(c.code, 1);
    assert.ok(c.lines.some((l) => l.startsWith('  ✗ history')), c.lines.join('\n'));
    assert.ok(c.lines.some((l) => l.includes('нет на сервере: p2/history «h4»')));
    assert.equal((await restore(srv, FIXTURE, { write: true, resume: true, verify: true })).code, 0, 'resume puts the missing entry back');
  });

  test('Google-style sign-in (a fake OIDC provider) with a restored e-mail returns that user: same id, isNew false', async () => {
    const migrations = fs.readdirSync(path.join(ROOT, 'pb', 'pb_migrations')).sort();
    const port = await freePort();
    const tokens = { 'code-b': B, 'code-new': 'newcomer@example.test' };
    const idp = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d) => { body += d; });
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        if (req.url.startsWith('/token')) {
          const code = new URLSearchParams(body).get('code');
          if (!tokens[code]) { res.statusCode = 400; res.end('{"error":"invalid_grant"}'); return; }
          res.end(JSON.stringify({ access_token: `at-${code}`, token_type: 'Bearer', expires_in: 3600 }));
        } else if (req.url.startsWith('/userinfo')) {
          const code = String(req.headers.authorization || '').replace(/^Bearer at-/, '');
          const email = tokens[code];
          res.end(JSON.stringify({ sub: `sub-${code}`, email, email_verified: true, name: 'From Google' }));
        } else { res.statusCode = 404; res.end('{}'); }
      });
    });
    await new Promise((r) => idp.listen(port, '127.0.0.1', r));
    try {
      const base = `http://127.0.0.1:${port}`;
      const set = await srv.su('/api/collections/users', { method: 'PATCH', body: { oauth2: { enabled: true, providers: [{ name: 'oidc', clientId: 'test-client', clientSecret: 'test-secret', authURL: `${base}/auth`, tokenURL: `${base}/token`, userInfoURL: `${base}/userinfo`, displayName: 'Fake', pkce: true }] } } });
      assert.equal(set.status, 200, set.text);
      const signIn = (code) => api(srv.url, '/api/collections/users/auth-with-oauth2', { method: 'POST', body: { provider: 'oidc', code, codeVerifier: 'v'.repeat(43), redirectURL: 'http://localhost/callback' } });
      const users = await usersByEmail(srv);
      const r = await signIn('code-b');
      assert.equal(r.status, 200, r.text);
      assert.equal(r.json.record.id, users.get(B).id);
      assert.equal(r.json.meta.isNew, false);
      // the restored user sees their project
      const list = await api(srv.url, '/api/collections/projects/records', { token: r.json.token });
      assert.deepEqual(list.json.items.map((p) => p.key), ['p1']);
      const n = await signIn('code-new');
      assert.equal(n.status, 200, n.text);
      assert.equal(n.json.meta.isNew, true, 'control: an unknown e-mail becomes a new user');
      await srv.su(`/api/collections/users/records/${n.json.record.id}`, { method: 'DELETE' });
    } finally { idp.close(); }
    assert.deepEqual(fs.readdirSync(path.join(ROOT, 'pb', 'pb_migrations')).sort(), migrations, 'the OAuth2 setup wrote no migration file (pb-dev runs with --automigrate=false)');
  });

  test('export → restore round trip equals the input; the export goes back to Firestore with Firebase uids', async () => {
    const now = new Date('2026-11-27T01:30:00Z');
    const exportTo = async (s) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-'));
      await runServerBackup(await openPocketBase({ url: s.url, email: SUPERUSER.email, password: SUPERUSER.password }), root, { now, log: () => {} });
      return path.join(root, stamp(now));
    };
    const x = await exportTo(srv);
    assert.equal(readBackupFolder(x).source, 'pocketbase');
    const other = await startServer({ users: false });
    try {
      const r = await restore(other, x, { write: true, verify: true });
      assert.equal(r.code, 0, r.lines.join('\n'));
      const y = await exportTo(other);
      // the second server's user ids → the first server's, by e-mail
      const one = await usersByEmail(srv); const two = await usersByEmail(other);
      const back = new Map([...two].map(([email, u]) => [u.id, one.get(email).id]));
      const norm = (j) => {
        const strip = (d) => { const { updatedAtServer, ...rest } = d; return rest; };
        if (j.project) return { ...j, project: strip(j.project), data: Object.fromEntries(Object.entries(j.data).map(([c, docs]) => [c, docs.map(strip)])) };
        const cols = Object.fromEntries(Object.entries(j.collections).map(([c, docs]) => [c, docs.map((d) => { const s = strip(d); if (c === 'allowed' || c === 'meta') delete s.at; return s; })]));
        // prefs come in the server's list order (by record time), which is not part of the data
        return { ...j, collections: cols, prefs: j.prefs.slice().sort((p, q) => (p.uid < q.uid ? -1 : 1)) };
      };
      const mapFile = (j) => {
        const m = mapIds(j, back);
        if (m.collections && m.collections.pool_inbox) m.collections.pool_inbox = m.collections.pool_inbox.map((d) => ({ ...d, id: mapInboxKey(d.id, back) }));
        return m;
      };
      const files = fs.readdirSync(x).filter((f) => f.endsWith('(полная).json') || f === COMMON_FILE).sort();
      assert.equal(files.length, 3);
      for (const f of files) {
        const a = norm(JSON.parse(fs.readFileSync(path.join(x, f), 'utf8')));
        const b = norm(mapFile(JSON.parse(fs.readFileSync(path.join(y, f), 'utf8'))));
        assert.deepEqual(b, a, f);
      }

      // the way back of that export: Firebase knows A and B
      const fb = { [A]: 'FirebaseUidOfTesterA00000001', [B]: 'FirebaseUidOfTesterB00000002' };
      const auth = { async getUserByEmail(e) { if (fb[e]) return { uid: fb[e] }; throw Object.assign(new Error('none'), { code: 'auth/user-not-found' }); } };
      const db = createFakeFirestore();
      assert.equal(await runFirestoreRestore({ db, auth, Timestamp, serverTimestamp: () => Timestamp.fromMillis(Date.parse('2026-12-01T00:00:00Z')) }, x, { write: true, log: () => {} }), 0);
      const d = db.dump();
      assert.deepEqual(d['projects/p1'].memberUids, [fb[A], fb[B]]);
      assert.equal(d[`pool_inbox/${fb[B]}_types_Камера`].owner.uid, fb[B]);
      assert.equal(d['projects/p1/history/h2'].by, UX);
      assert.equal(d['projects/p1/catalog/К_2'].id, 'К/2');
    } finally { await other.stop(); }
  });

  test('a run killed in the middle is finished by --resume without duplicates', async () => {
    const s = await startServer({ users: false });
    const pwFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pw-')), 'password');
    fs.writeFileSync(pwFile, `${SUPERUSER.password}\n`);
    try {
      const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'pb-restore.mjs'), FIXTURE, '--write'], {
        cwd: ROOT, env: { ...process.env, PB_URL: s.url, PB_SUPERUSER_EMAIL: SUPERUSER.email, PB_SUPERUSER_PASSWORD_FILE: pwFile, PM_RESTORE_BATCH: '2', PM_RESTORE_PAUSE_MS: '500' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let out = '';
      const cut = await new Promise((resolve) => {
        child.stdout.on('data', (d) => { out += d; if (/ {2}записи: 2 из 5/.test(out)) { child.kill(); resolve(true); } });
        child.on('exit', () => resolve(false));
      });
      assert.ok(cut, `the run was not cut: ${out}`);
      assert.ok(!out.includes(SUPERUSER.password), 'the password is never printed');
      const mid = await counts(s);
      assert.ok(mid.records >= 2 && mid.records < 5 && mid.history === 0, JSON.stringify(mid));
      const r = await restore(s, FIXTURE, { write: true, resume: true, verify: true });
      assert.equal(r.code, 0, r.lines.join('\n'));
      assert.deepEqual(await counts(s), planned());
      assert.equal((await s.all('users')).length, 3);
    } finally { await s.stop(); }
  });
});

test('the inbox entry of the fixture belongs to a member (its uid prefix is mapped)', () => {
  assert.ok(PLAN.inbox[0].key.startsWith(`${U2}_`));
});
