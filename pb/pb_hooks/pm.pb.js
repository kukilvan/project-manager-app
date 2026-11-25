/// <reference path="../pb_data/types.d.ts" />
// The app's server routes on the NAS copy: the write route POST /api/pm/save, GET /api/pm/info, POST /api/pm/admin and the keep-alive cron.
// Spec 4 § 2.4–2.6, ADR 0020. The route runs runSave of the generated pm/pbwrite.js (src/domain/pbwrite.js, coding-standards rule 15)
// over the PocketBase store of pm/pbstore.js in one transaction, and answers with its own JSON (200, 409, 422, 426).
// Top-level names of a hook file are not visible inside handlers, so every handler loads its modules with require() itself;
// PM_SCHEMA below states the version this file serves and a test keeps it equal to PB_SCHEMA, which the handlers read from pbwrite.js.
// Checked by tests/pb-server.test.js against a real PocketBase.

// The server's schema version (CONTEXT.md «Schema version»); equals PB_SCHEMA of src/domain/pbwrite.js
const PM_SCHEMA = 1;

// Users write only here (coding-standards rule 14). Body { schema, ops }: at most 500 ops (runSave) and 4 MB (413 above).
// A refused op rolls back the whole request: runSave's answer is kept, the transaction is aborted by a throw, the answer is sent.
routerAdd('POST', '/api/pm/save', (e) => {
  const W = require(`${__hooks}/pm/pbwrite.js`);
  const S = require(`${__hooks}/pm/pbstore.js`);
  let body = null;
  try { body = JSON.parse(JSON.stringify(e.requestInfo().body)); } catch (err) { body = null; }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return e.json(422, { status: 422, code: 'invalid', index: -1, message: 'the body is not a JSON object' });
  }
  let res = null;
  try {
    $app.runInTransaction((tx) => {
      res = W.runSave(S.createStore(tx), S.envOf(tx, e), body);
      if (res.status !== 200) throw new Error('pm: request refused, rolled back');
    });
  } catch (err) {
    // runSave's own refusal keeps its answer; anything else (the commit failed) is the server's fault and may be retried
    if (!res || res.status === 200) res = { status: 500, code: 'server', index: -1, message: String(err) };
  }
  return e.json(res.status, res);
}, $apis.requireAuth(), $apis.bodyLimit(4 * 1024 * 1024));

// Public: what server this is and its schema; with a token also the administrator's e-mail ('' when none yet)
routerAdd('GET', '/api/pm/info', (e) => {
  const W = require(`${__hooks}/pm/pbwrite.js`);
  const S = require(`${__hooks}/pm/pbstore.js`);
  const out = { app: 'pm', schema: W.PB_SCHEMA };
  if (e.auth) out.admin = S.adminEmail($app);
  return e.json(200, out);
});

// The administrator's e-mail; on a server without one the caller becomes the administrator (the first caller wins, both get its e-mail)
routerAdd('POST', '/api/pm/admin', (e) => {
  const S = require(`${__hooks}/pm/pbstore.js`);
  const mine = String(e.auth.email() || '').toLowerCase();
  let email = '';
  try {
    $app.runInTransaction((tx) => {
      email = S.adminEmail(tx);
      if (email) return;
      const rec = new Record(tx.findCollectionByNameOrId('admin'));
      rec.set('slot', 'admin');
      rec.set('email', mine);
      tx.save(rec);
      email = mine;
    });
  } catch (err) {
    // a parallel first call saved it first (unique `slot`): answer with that one
    email = S.adminEmail($app);
    if (!email) throw err;
  }
  return e.json(200, { admin: email });
}, $apis.requireAuth('users'));

// Keep-alive (spec 4 § 2.6): every minute an event `pm_ping` {"t": <ms>} to the realtime clients subscribed to it,
// so the tunnel's ≈ 125 s idle cut does not end the stream
cronAdd('pm_ping', '* * * * *', () => {
  const msg = new SubscriptionMessage({ name: 'pm_ping', data: JSON.stringify({ t: Date.now() }) });
  const clients = $app.subscriptionsBroker().clients();
  for (const id in clients) {
    if (clients[id].hasSubscription('pm_ping')) clients[id].send(msg);
  }
});
