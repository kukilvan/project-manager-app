// Sign-in rules of the NAS copy (PocketBase): the three-way start, the outcome of a token refresh, the manual code flow's address and state check, error texts and the sign-out question.
// Pure: no browser and no SDK; src/app/pb/auth.js and src/app/pb/signin.js call it (spec 4 § 3.1, § 3.2). Errors are read in the shape of the SDK's
// ClientResponseError: { status, isAbort, response: { message }, originalError: { name, message } }; `kind: 'no-google'` marks the app's own "no Google provider".
import { isDriveState } from './googleauth.js';

// Where the start goes: a return from Google (`?code=&state=`, or `?error=`) is finished only when its state matches the one kept in `pz.pbOauth`;
// otherwise a saved sign-in starts at once, or the sign-in screen opens. `then` says where a failed return goes: the saved sign-in or the screen.
// A return of the Drive flow (its own state, src/domain/googleauth.js) is not a sign-in return.
export function startDecision({ search = '', saved = null, hasAuth = false } = {}) {
  const q = new URLSearchParams(search);
  const code = q.get('code'); const state = q.get('state'); const err = q.get('error');
  const then = hasAuth ? 'saved' : 'login';
  if ((code || err || state) && !isDriveState(state)) {
    if (!saved || !saved.state || !state || state !== saved.state) return { kind: 'bad-state', then };
    if (err || !code) return { kind: 'oauth-error', error: err || 'code', then };
    return { kind: 'code', code, codeVerifier: saved.codeVerifier || '', redirect: saved.redirect || '', then };
  }
  return { kind: hasAuth ? 'saved' : 'login' };
}

// authRefresh(): done → 'ok'; 401 → 'expired' (the app keeps working, the banner shows); anything else (no network, a server error) → 'unchanged'
export function refreshOutcome(err) {
  if (!err) return 'ok';
  return err.status === 401 ? 'expired' : 'unchanged';
}

export const googleProvider = (methods) => (methods?.oauth2?.providers || []).find((p) => p && p.name === 'google') || null;
export const passwordOn = (methods) => !!methods?.password?.enabled;

// The manual code flow: Google's address from `auth-methods` with our page as the return address, and what to keep for the return
export function codeFlow(provider, origin) {
  const redirect = `${String(origin || '').replace(/\/+$/, '')}/`;
  return {
    url: String(provider.authURL || '') + encodeURIComponent(redirect),
    saved: { state: provider.state, codeVerifier: provider.codeVerifier, redirect },
  };
}

// The SDK's own messages that are not a network failure even though they come with status 0
const SDK_OWN = /State parameters don't match|OAuth2 redirect error|realtime connection interrupted|Not in a browser context/i;

// What a sign-in error is: 'abort' (cancelled, say nothing), 'no-google', 'unreachable' (no answer from the server) or 'other'
export function signInErrorKind(err) {
  if (!err) return null;
  if (err.kind === 'no-google') return 'no-google';
  if (err.isAbort) return 'abort';
  const orig = String(err.originalError?.message || '');
  if (/Missing or invalid provider/i.test(orig)) return 'no-google';
  if (err.status === 0 && !SDK_OWN.test(orig) && (!err.originalError || err.originalError.name === 'TypeError')) return 'unreachable';
  return 'other';
}

// The text under the sign-in buttons ('' — say nothing)
export function signInMessage(err) {
  const kind = signInErrorKind(err);
  if (!kind || kind === 'abort') return '';
  if (kind === 'unreachable') return 'Сервер недоступен — проверьте интернет и попробуйте ещё раз.';
  if (kind === 'no-google') return 'Вход через Google на этом сервере не настроен.';
  const orig = err.originalError && !err.status ? String(err.originalError.message || '') : '';
  const detail = [err.status || '', err.response?.message || orig || err.code || err.message || ''].filter(Boolean).join(' ');
  return `Не удалось войти: ${detail || '?'}`;
}

// Sign-out with unsent changes asks first; null — sign out without a question
export function signOutQuestion(unsent) {
  const n = Number(unsent) || 0;
  return n > 0 ? `Есть неотправленные записи: ${n}. Если выйти, они останутся на телефоне и уйдут, когда вы снова войдёте этим же аккаунтом. Выйти?` : null;
}

// Another user signed in on this phone (spec 4 § 3.3): the local copy was replaced; the previous user's unsent items wait for them. null — nothing to say.
export function otherAccountNotice(unsent) {
  const n = Number(unsent) || 0;
  return n > 0 ? `Вы вошли другим аккаунтом. Неотправленные записи прошлого аккаунта (${n}) ждут, пока он снова войдёт на этом телефоне.` : null;
}

// After a sign-in: is it the same user as before (the write queue of ticket 05 decides by it, spec 4 § 3.3)
export function signInEvent(previousId, userId) {
  return { previousId: previousId || null, userId: userId || null, sameUser: !!previousId && previousId === userId };
}
