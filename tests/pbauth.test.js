// Tests of the NAS copy's sign-in: the pure rules of src/domain/pbauth.js (start decision, refresh outcomes, state check, the code flow address, error texts,
// the sign-out question) and signOut of src/app/pb/auth.js with a fake PocketBase client (spec 4 § 3.1, § 3.2, ticket 4.4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { startDecision, refreshOutcome, googleProvider, passwordOn, codeFlow, signInErrorKind, signInMessage, signOutQuestion, signInEvent } from '../src/domain/pbauth.js';

// src/log.js (imported by auth.js) listens on window: a minimal stand-in for Node
globalThis.window ??= { addEventListener() {} };
const { setPbClient } = await import('../src/app/pb/client.js');
const { signOut, setUnsentCounter, unsentCount, auth } = await import('../src/app/pb/auth.js');

const SAVED = { state: 'st-1', codeVerifier: 'v'.repeat(43), redirect: 'https://pm.example.com/' };

test('start: no return from Google — a saved sign-in starts at once, else the sign-in screen', () => {
  assert.deepEqual(startDecision({ search: '', hasAuth: true }), { kind: 'saved' });
  assert.deepEqual(startDecision({ search: '', hasAuth: false }), { kind: 'login' });
  assert.deepEqual(startDecision({ search: '?lang=en', saved: SAVED, hasAuth: false }), { kind: 'login' });
});

test('start: a return whose state matches pz.pbOauth is finished with the kept verifier and address', () => {
  const d = startDecision({ search: '?state=st-1&code=abc&scope=email', saved: SAVED, hasAuth: false });
  assert.deepEqual(d, { kind: 'code', code: 'abc', codeVerifier: SAVED.codeVerifier, redirect: SAVED.redirect, then: 'login' });
});

test('start: a state that does not match (or nothing kept) is refused; a saved sign-in still starts', () => {
  assert.deepEqual(startDecision({ search: '?state=other&code=abc', saved: SAVED, hasAuth: false }), { kind: 'bad-state', then: 'login' });
  assert.deepEqual(startDecision({ search: '?state=st-1&code=abc', saved: null, hasAuth: false }), { kind: 'bad-state', then: 'login' });
  assert.deepEqual(startDecision({ search: '?code=abc', saved: SAVED, hasAuth: true }), { kind: 'bad-state', then: 'saved' });
});

test('start: Google answered with an error (the user cancelled)', () => {
  assert.deepEqual(startDecision({ search: '?state=st-1&error=access_denied', saved: SAVED }), { kind: 'oauth-error', error: 'access_denied', then: 'login' });
});

test('refresh: 200 → ok, 401 → expired, no network or another error → unchanged', () => {
  assert.equal(refreshOutcome(null), 'ok');
  assert.equal(refreshOutcome({ status: 401 }), 'expired');
  assert.equal(refreshOutcome({ status: 0, originalError: { name: 'TypeError', message: 'Failed to fetch' } }), 'unchanged');
  assert.equal(refreshOutcome({ status: 500 }), 'unchanged');
  assert.equal(refreshOutcome({ status: 403 }), 'unchanged');
});

test('auth methods: Google provider and password sign-in are read from the server answer', () => {
  const m = { password: { enabled: true }, oauth2: { enabled: true, providers: [{ name: 'github' }, { name: 'google', state: 's' }] } };
  assert.equal(googleProvider(m).state, 's');
  assert.equal(passwordOn(m), true);
  assert.equal(googleProvider({ oauth2: { providers: [] } }), null);
  assert.equal(googleProvider(null), null);
  assert.equal(passwordOn({ password: { enabled: false } }), false);
});

test('code flow: Google address plus our page as the return address; state and verifier kept for the return', () => {
  // the shape PocketBase 0.42 returns: authURL ends with `redirect_uri=` (spec 4 § 1)
  const provider = { name: 'google', state: 'st-9', codeVerifier: 'cv'.repeat(20), authURL: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=X&code_challenge=Y&response_type=code&state=st-9&redirect_uri=' };
  const { url, saved } = codeFlow(provider, 'https://pm.example.com');
  assert.equal(url, `${provider.authURL}https%3A%2F%2Fpm.example.com%2F`);
  assert.deepEqual(saved, { state: 'st-9', codeVerifier: provider.codeVerifier, redirect: 'https://pm.example.com/' });
  assert.equal(new URL(url).searchParams.get('redirect_uri'), 'https://pm.example.com/');
  assert.equal(codeFlow(provider, 'http://localhost:8090/').saved.redirect, 'http://localhost:8090/');
});

test('sign-in errors: server unreachable, no Google provider, aborted, anything else', () => {
  const net = { status: 0, isAbort: false, originalError: { name: 'TypeError', message: 'Failed to fetch' } };
  assert.equal(signInErrorKind(net), 'unreachable');
  assert.equal(signInMessage(net), 'Сервер недоступен — проверьте интернет и попробуйте ещё раз.');
  const noProvider = { status: 0, isAbort: false, originalError: { name: 'Error', message: 'Missing or invalid provider "google".' } };
  assert.equal(signInErrorKind(noProvider), 'no-google');
  assert.equal(signInMessage({ kind: 'no-google' }), 'Вход через Google на этом сервере не настроен.');
  assert.equal(signInErrorKind({ status: 0, isAbort: true }), 'abort');
  assert.equal(signInMessage({ status: 0, isAbort: true }), '');
  assert.equal(signInMessage({ status: 400, response: { message: 'Failed to authenticate.' } }), 'Не удалось войти: 400 Failed to authenticate.');
  // the SDK's own messages come with status 0 but are not a network failure
  assert.equal(signInMessage({ status: 0, originalError: { name: 'Error', message: "State parameters don't match." } }), "Не удалось войти: State parameters don't match.");
  assert.equal(signInMessage({ code: 'popup', message: 'popup' }), 'Не удалось войти: popup');
});

test('sign-out question: only when unsent changes are above 0', () => {
  assert.equal(signOutQuestion(0), null);
  assert.equal(signOutQuestion(undefined), null);
  assert.equal(signOutQuestion(3), 'Есть неотправленные записи: 3. Если выйти, они останутся на телефоне и уйдут, когда вы снова войдёте этим же аккаунтом. Выйти?');
});

test('sign-in event: the same user as before or another one', () => {
  assert.deepEqual(signInEvent('u1', 'u1'), { previousId: 'u1', userId: 'u1', sameUser: true });
  assert.deepEqual(signInEvent('u1', 'u2'), { previousId: 'u1', userId: 'u2', sameUser: false });
  assert.deepEqual(signInEvent(null, 'u2'), { previousId: null, userId: 'u2', sameUser: false });
});

test('signOut: asks when the unsent counter is above 0, keeps the sign-in on «no», signs out on «yes» or with nothing unsent', async () => {
  let cleared = 0;
  setPbClient({ authStore: { token: 't', record: { id: 'u1' }, clear: () => { cleared += 1; } } });
  const asked = [];
  assert.equal(unsentCount(), 0);
  // nothing unsent: no question
  assert.equal(await signOut({ confirm: async (q) => { asked.push(q); return false; } }), true);
  assert.deepEqual(asked, []); assert.equal(cleared, 1); assert.equal(auth.signedIn, false);
  // the stub counter of ticket 05 above 0: the question, «Отмена» keeps the sign-in
  setUnsentCounter(() => 2);
  assert.equal(await signOut({ confirm: async (q) => { asked.push(q); return false; } }), false);
  assert.equal(asked.length, 1); assert.match(asked[0], /^Есть неотправленные записи: 2\./); assert.equal(cleared, 1);
  assert.equal(await signOut({ confirm: async () => true }), true);
  assert.equal(cleared, 2);
  setUnsentCounter(null);
});
