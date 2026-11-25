// The PocketBase store of the write route: finds and saves the app's documents in the collections of spec 4 § 2.1 for runSave of pbwrite.js.
// Loaded by pb/pb_hooks/pm.pb.js with require() inside a handler; every call goes through the transaction's app (txApp), so a later
// op sees what an earlier op of the same request saved. Hand-written (unlike pbwrite.js beside it); CommonJS in the syntax
// PocketBase's JS engine runs. Checked by tests/pb-server.test.js against a real PocketBase.
//
// Contents:
// - createStore(app) — find(target), put(target, data, derived), setInvites(pid, list) of runSave's store contract
// - envOf(app, e) — the signed-in user, superuser flag, administrator e-mail and the allowed check for the rules
// - adminEmail(app) — the administrator's e-mail or ''

function lower(s) { return String(s == null ? '' : s).toLowerCase(); }

// A lookup that answers null instead of throwing when nothing matches
function maybe(fn) {
  try { return fn() || null; } catch (e) { return null; }
}

function projectRecord(app, pid) {
  return maybe(function () { return app.findFirstRecordByData('projects', 'key', pid); });
}

// The record behind a target of runSave (see targetOf in pbwrite.js), or null
function findRecord(app, t) {
  if (t.c === 'projects') return projectRecord(app, t.key);
  if (t.c === 'records') {
    const p = projectRecord(app, t.pid);
    if (!p) return null;
    return maybe(function () { return app.findFirstRecordByFilter('records', 'project = {:p} && coll = {:c} && key = {:k}', { p: p.id, c: t.coll, k: t.key }); });
  }
  if (t.c === 'history') return maybe(function () { return app.findFirstRecordByData('history', 'key', t.key); });
  if (t.c === 'pool') return maybe(function () { return app.findFirstRecordByFilter('pool', 'kind = {:a} && key = {:k}', { a: t.kind, k: t.key }); });
  if (t.c === 'inbox') return maybe(function () { return app.findFirstRecordByData('inbox', 'key', t.key); });
  if (t.c === 'allowed') return maybe(function () { return app.findFirstRecordByData('allowed', 'email', t.email); });
  if (t.c === 'prefs') return maybe(function () { return app.findFirstRecordByData('prefs', 'user', t.user); });
  throw new Error('unknown target ' + t.c);
}

function dataOf(rec, t) {
  if (t.c === 'allowed') return { email: rec.getString('email') };
  const text = rec.getString('data');
  const v = text ? JSON.parse(text) : null;
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function createStore(app) {
  const records = {}; // target id → its record once found or saved in this request
  function key(t) { return JSON.stringify(t); }

  return {
    find: function (t) {
      const rec = findRecord(app, t);
      if (rec) records[key(t)] = rec;
      return rec ? dataOf(rec, t) : null;
    },
    put: function (t, data, derived) {
      let rec = records[key(t)] || findRecord(app, t);
      if (!rec) {
        rec = new Record(app.findCollectionByNameOrId(t.c));
        if (t.c === 'projects') rec.set('key', t.key);
        if (t.c === 'records' || t.c === 'history') {
          const p = projectRecord(app, t.pid);
          if (!p) throw new Error('project not found');
          rec.set('project', p.id);
          rec.set('key', t.key);
          if (t.c === 'records') rec.set('coll', t.coll);
        }
        if (t.c === 'pool') { rec.set('kind', t.kind); rec.set('key', t.key); }
        if (t.c === 'inbox') rec.set('key', t.key);
        if (t.c === 'allowed') rec.set('email', t.email);
        if (t.c === 'prefs') rec.set('user', t.user);
      }
      if (t.c !== 'allowed') rec.set('data', data);
      if (t.c === 'projects') rec.set('members', (derived && derived.members) || []);
      if (t.c === 'history') rec.set('at', (derived && derived.at) || 0);
      app.save(rec);
      records[key(t)] = rec;
    },
    // invites of one project = list (one per e-mail): creates the missing, updates changed data, deletes the rest
    setInvites: function (pid, list) {
      const p = projectRecord(app, pid);
      if (!p) throw new Error('project not found');
      const want = {};
      list.forEach(function (i) { want[i.email] = { name: i.name, object: i.object, from: i.from }; });
      const have = app.findRecordsByFilter('invites', 'project = {:p}', '', 0, 0, { p: p.id });
      have.forEach(function (r) {
        const em = r.getString('email');
        if (!Object.prototype.hasOwnProperty.call(want, em)) { app.delete(r); return; }
        if (JSON.stringify(dataOf(r, {})) !== JSON.stringify(want[em])) { r.set('data', want[em]); app.save(r); }
        delete want[em];
      });
      const col = app.findCollectionByNameOrId('invites');
      Object.keys(want).forEach(function (em) {
        const r = new Record(col);
        r.set('project', p.id);
        r.set('email', em);
        r.set('data', want[em]);
        app.save(r);
      });
    },
  };
}

function adminEmail(app) {
  const rec = maybe(function () { return app.findFirstRecordByData('admin', 'slot', 'admin'); });
  return rec ? lower(rec.getString('email')) : '';
}

// env of checkOp/runSave for the request's auth record (users or superusers)
function envOf(app, e) {
  const a = e.auth;
  return {
    user: a ? { id: a.id, email: lower(a.email()) } : null,
    isSuper: !!e.hasSuperuserAuth(),
    adminEmail: adminEmail(app),
    isAllowed: function (email) {
      return !!maybe(function () { return app.findFirstRecordByData('allowed', 'email', lower(email)); });
    },
  };
}

module.exports = { createStore: createStore, envOf: envOf, adminEmail: adminEmail };
