// Tests of the Google Drive and Sheets sign-in: client, scopes, authorization and return addresses and the return's recognition (src/domain/googleauth.js),
// its separation from the NAS copy's sign-in return (src/domain/pbauth.js), and the NAS copy's Client ID kept on the device (src/app/pb/drive.js; spec 4 § 3.8, ticket 4.9).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FULL_SCOPES, NARROW_SCOPES, REDIRECT_STATE, POPUP_STATE, googleSetup, googleAuthUrl, returnAddress, driveReturn, clientIdFromMethods,
} from '../src/domain/googleauth.js';
import { startDecision } from '../src/domain/pbauth.js';

// src/log.js (imported by drive.js) listens on window: a minimal stand-in for Node
globalThis.window ??= { addEventListener() {} };
const { createNasGoogle } = await import('../src/app/pb/drive.js');

const SHARED = 'shared.apps.googleusercontent.com';
const OWN = '111-own.apps.googleusercontent.com';
// the shape PocketBase 0.42 returns (spec 4 § 1)
const METHODS = { oauth2: { providers: [{ name: 'google', state: 's', authURL: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${OWN}&code_challenge=Y&response_type=code&state=s&redirect_uri=` }] } };
const NO_GOOGLE = { password: { enabled: true }, oauth2: { providers: [] } };
const params = (url) => Object.fromEntries(new URL(url).searchParams);

test('NAS copy: the owner\'s client with Drive and Sheets, back to the root of the host, the user\'s e-mail as the hint', () => {
  const url = googleAuthUrl({
    ...googleSetup(OWN, SHARED), redirect: returnAddress({ origin: 'https://pm.example.com', pathname: '/index.html' }, true),
    state: REDIRECT_STATE, email: 'a@pm.test',
  });
  assert.equal(url.startsWith('https://accounts.google.com/o/oauth2/v2/auth?'), true);
  assert.deepEqual(params(url), {
    client_id: OWN, redirect_uri: 'https://pm.example.com/', response_type: 'token',
    scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets',
    include_granted_scopes: 'true', state: 'pz_gsync', login_hint: 'a@pm.test',
  });
});

test('Firebase copy: the database\'s own client with the full scopes, back to the GitHub Pages path', () => {
  const url = googleAuthUrl({
    ...googleSetup(OWN, SHARED), redirect: returnAddress({ origin: 'https://user.github.io', pathname: '/project-manager-app/' }, false),
    state: POPUP_STATE, email: '',
  });
  const p = params(url);
  assert.equal(p.client_id, OWN);
  assert.equal(p.redirect_uri, 'https://user.github.io/project-manager-app/');
  assert.equal(p.scope, FULL_SCOPES.join(' '));
  assert.equal(p.state, 'pz_gpopup');
  assert.equal('login_hint' in p, false);
});

test('without an own Client ID: the shared client with access to the app\'s own files only', () => {
  assert.deepEqual(googleSetup('', SHARED), { clientId: SHARED, scopes: NARROW_SCOPES });
  assert.deepEqual(NARROW_SCOPES, ['https://www.googleapis.com/auth/drive.file']);
});

test('the Client ID is read from Google\'s address in auth-methods; no provider or a broken address → none', () => {
  assert.equal(clientIdFromMethods(METHODS), OWN);
  assert.equal(clientIdFromMethods(NO_GOOGLE), '');
  assert.equal(clientIdFromMethods({ oauth2: { providers: [{ name: 'google', authURL: 'not an address' }] } }), '');
  assert.equal(clientIdFromMethods(null), '');
});

test('the Drive return is read from after «#»; a sign-in return or another state is not one', () => {
  assert.deepEqual(driveReturn('#state=pz_gsync&access_token=T&expires_in=3599'), { popup: false, token: 'T', expiresIn: 3599, error: '' });
  assert.deepEqual(driveReturn('#state=pz_gpopup&error=access_denied'), { popup: true, token: '', expiresIn: 3000, error: 'access_denied' });
  assert.equal(driveReturn(''), null);
  assert.equal(driveReturn('#state=st-1&access_token=T'), null);
  assert.equal(driveReturn('#access_token=T'), null);
});

test('the sign-in\'s code flow never takes a Drive return, even with a half-finished sign-in kept', () => {
  const saved = { state: 'st-1', codeVerifier: 'v', redirect: 'https://pm.example.com/' };
  for (const search of ['', '?state=pz_gsync&code=abc', '?state=pz_gpopup&error=access_denied', '?state=pz_gsync']) {
    assert.deepEqual(startDecision({ search, saved, hasAuth: true }), { kind: 'saved' }, search);
    assert.deepEqual(startDecision({ search, saved, hasAuth: false }), { kind: 'login' }, search);
  }
  // its own return is still its own
  assert.equal(startDecision({ search: '?state=st-1&code=abc', saved, hasAuth: false }).kind, 'code');
});

const memory = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

test('NAS client: the server\'s Client ID is kept as pm.pbGoogleClient and used with the e-mail', async () => {
  const storage = memory();
  const g = createNasGoogle({ loadMethods: async () => METHODS, email: () => 'a@pm.test', storage });
  assert.equal(g.clientId(), '');
  await g.load();
  assert.equal(storage.getItem('pm.pbGoogleClient'), OWN);
  assert.equal(g.clientId(), OWN);
  assert.equal(g.email(), 'a@pm.test');
});

test('NAS client: an unreachable server keeps the kept ID; a server without Google forgets it (the shared client then)', async () => {
  const storage = memory({ 'pm.pbGoogleClient': OWN });
  await createNasGoogle({ loadMethods: async () => { throw Object.assign(new Error('offline'), { status: 0 }); }, email: () => '', storage }).load();
  assert.equal(storage.getItem('pm.pbGoogleClient'), OWN);
  const g = createNasGoogle({ loadMethods: async () => NO_GOOGLE, email: () => undefined, storage });
  await g.load();
  assert.equal(storage.getItem('pm.pbGoogleClient'), null);
  assert.deepEqual(googleSetup(g.clientId(), SHARED), { clientId: SHARED, scopes: NARROW_SCOPES });
  assert.equal(g.email(), '');
});

test('NAS client: a silent server does not hold the first use; one request at a time', async () => {
  let asked = 0; let answer;
  const g = createNasGoogle({ loadMethods: () => { asked += 1; return new Promise((r) => { answer = r; }); }, email: () => '', storage: memory(), wait: 20 });
  await Promise.all([g.load(), g.load()]);
  assert.equal(asked, 1);
  assert.equal(g.clientId(), '');
  answer(METHODS);   // a late answer is still kept
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(g.clientId(), OWN);
});
