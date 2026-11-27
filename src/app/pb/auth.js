// Sign-in on the NAS copy: the three-way start, the Google sign-in (the manual code flow), the password sign-in for local tests, the token refresh, the administrator and sign-out.
// Keeps a small state (`auth`: signedIn, expired, refreshed, user, lastSignIn) with onChange and onSignIn for the screens and the sync of later tickets.
// Talks to PocketBase through src/app/pb/client.js (sign-in requests through a guest client without the saved token); the rules are pure in src/domain/pbauth.js. Device keys: `pocketbase_auth` (the SDK's), `pz.pbOauth`, `pm.admin.pb`.
import { getPb, guestPb, adoptSignIn } from './client.js';
import { startDecision, refreshOutcome, googleProvider, codeFlow, signInMessage, signOutQuestion, signInEvent } from '../../domain/pbauth.js';
import { setAdminEmail } from '../../edition.js';
import { info, warn, error } from '../../log.js';

const OAUTH_KEY = 'pz.pbOauth';     // the manual code flow: { state, codeVerifier, redirect } until the return from Google
const ADMIN_KEY = 'pm.admin.pb';    // the database administrator's e-mail, remembered so the start does not wait for the network
const ADMIN_WAIT_MS = 6000;         // a new device waits for /api/pm/admin no longer than this, as with Firestore

// signedIn: a sign-in is saved; expired: the server refused the token (401), the banner shows; refreshed: a refresh or a sign-in succeeded in this run
export const auth = { signedIn: false, expired: false, refreshed: false, user: null, lastSignIn: null };
const changeListeners = new Set();
const signInListeners = new Set();
export function onChange(fn) { changeListeners.add(fn); return () => changeListeners.delete(fn); }
// After every sign-in in this run: { previousId, userId, sameUser } (also kept in auth.lastSignIn for later subscribers)
export function onSignIn(fn) { signInListeners.add(fn); return () => signInListeners.delete(fn); }
function set(patch) {
  Object.assign(auth, patch);
  changeListeners.forEach((fn) => { try { fn(auth); } catch (e) { error('Вход (PocketBase): подписчик', e); } });
}

const store = () => getPb().authStore;
const userOf = (rec) => (rec ? { uid: rec.id, email: String(rec.email || '').toLowerCase(), displayName: rec.name || rec.email || '' } : null);
export const hasSavedAuth = () => !!(store().token && store().record);
const ls = () => (typeof localStorage !== 'undefined' ? localStorage : null);
function readOauth() { try { return JSON.parse(ls()?.getItem(OAUTH_KEY) || 'null'); } catch { return null; } }
function dropOauth() { try { ls()?.removeItem(OAUTH_KEY); } catch { /* ok */ } }
function cleanAddress() { try { history.replaceState(null, '', location.pathname); } catch { /* ok */ } }

function afterSignIn(previousId) {
  const user = userOf(store().record);
  const ev = signInEvent(previousId, user?.uid);
  info(`Вход (PocketBase): ${user?.email || '?'}${ev.previousId ? (ev.sameUser ? ', тот же пользователь' : ', другой пользователь') : ''}`);
  set({ signedIn: true, expired: false, refreshed: true, user, lastSignIn: ev });
  signInListeners.forEach((fn) => { try { fn(ev); } catch (e) { error('Вход (PocketBase): подписчик', e); } });
  return ev;
}

// The start (spec 4 § 3.1): finish a return from Google, else a saved sign-in at once (offline too) with a refresh in the background, else the sign-in screen.
// Returns { kind: 'session' | 'login', message } — message: a sign-in error to show ('' when none).
export async function startSession() {
  const d = startDecision({ search: typeof location !== 'undefined' ? location.search : '', saved: readOauth(), hasAuth: hasSavedAuth() });
  if (d.kind === 'saved') { beginSaved(); return { kind: 'session', message: '' }; }
  if (d.kind === 'login') return { kind: 'login', message: '' };
  cleanAddress(); dropOauth();
  let message = '';
  if (d.kind === 'code') {
    const previousId = store().record?.id || null;
    try {
      const g = guestPb();
      await g.collection('users').authWithOAuth2Code('google', d.code, d.codeVerifier, d.redirect);
      adoptSignIn(g); afterSignIn(previousId);
      return { kind: 'session', message: '' };
    } catch (e) { error('Вход через Google: ошибка', `${e.status || ''} ${e.message || e}`); message = signInMessage(e); }
  } else {
    message = `Не удалось войти: ${d.kind === 'bad-state' ? 'state' : d.error}`;
    warn(`Вход через Google: ${d.kind === 'bad-state' ? 'state не совпал' : d.error}`);
  }
  if (d.then === 'saved') { beginSaved(); return { kind: 'session', message }; }
  return { kind: 'login', message };
}

function beginSaved() {
  set({ signedIn: true, user: userOf(store().record) });
  info(`Вход (PocketBase): сохранённый вход ${auth.user?.email || '?'}`);
  refreshInBackground();
}

let waitingOnline = false;
function refreshInBackground() {
  authRefresh().then((o) => {
    if (o !== 'unchanged' || waitingOnline || typeof window === 'undefined') return;
    // no network now: one more try when the phone is back online
    waitingOnline = true;
    window.addEventListener('online', () => { waitingOnline = false; if (!auth.refreshed && !auth.expired) refreshInBackground(); }, { once: true });
  });
}

// The token refresh (spec 4 § 3.2): 'ok' — a new token is saved; 'expired' — 401, the sign-in is kept and the banner shows; 'unchanged' — no answer, nothing changes
export async function authRefresh() {
  try {
    await getPb().collection('users').authRefresh();
    set({ expired: false, refreshed: true, user: userOf(store().record) });
    info('Вход (PocketBase): токен обновлён');
    return 'ok';
  } catch (e) {
    const o = refreshOutcome(e);
    if (o === 'expired') { warn('Вход (PocketBase): вход истёк (401)'); set({ expired: true }); }
    else info(`Вход (PocketBase): токен не обновлён (${e.status || 'нет связи'})`);
    return o;
  }
}

// The write route answered 401 (src/app/pb/sender.js): the sign-in is expired, the banner shows, the queue waits for a sign-in
export function markExpired() { if (!auth.expired) set({ expired: true }); }

// The sign-in methods of the server (public, asked without the saved token): Google's address, state and code verifier; whether password sign-in is on
export const loadMethods = () => guestPb().collection('users').listAuthMethods();

// «Войти через Google»: the manual code flow — fresh auth methods, `pz.pbOauth` kept, the page goes to Google and comes back to `/?code=…&state=…`.
// The only Google sign-in: PocketBase's window flow (the SDK's authWithOAuth2) ends its window on the dashboard page `/_/#/auth/oauth2-redirect-…`,
// which the WAF rule R-NET-4 blocks, so the window showed Cloudflare's block page (NAS note of 2026-11-27, `.scratch/04-pocketbase-storage/nas-report-3.md`).
export async function startCodeFlow() {
  const g = googleProvider(await loadMethods());
  if (!g) throw { kind: 'no-google' };
  const { url, saved } = codeFlow(g, location.origin);
  ls()?.setItem(OAUTH_KEY, JSON.stringify(saved));
  info('Вход через Google: переход к Google');
  location.assign(url);
}

// Password sign-in: only where the server allows it (the local test server, never the NAS — A5)
export async function signInPassword(email, password) {
  const previousId = store().record?.id || null;
  const g = guestPb();
  await g.collection('users').authWithPassword(String(email || '').trim(), String(password || ''));
  adoptSignIn(g);
  return afterSignIn(previousId);
}

// The administrator (spec 4 § 3.1): the remembered one at once with a check in the background; a new device waits at most 6 s
export async function resolveAdmin() {
  let cached = ''; try { cached = ls()?.getItem(ADMIN_KEY) || ''; } catch { /* ok */ }
  const ask = async () => {
    try {
      const r = await getPb().send('/api/pm/admin', { method: 'POST' });
      setAdminEmail(r?.admin || '');
      try { if (r?.admin) ls()?.setItem(ADMIN_KEY, String(r.admin).toLowerCase()); } catch { /* ok */ }
      return true;
    } catch (e) { warn(`Администратор базы (PocketBase): ${e.status || 'нет связи'}`); return false; }
  };
  if (cached) { setAdminEmail(cached); ask(); return; }
  await Promise.race([ask(), new Promise((r) => setTimeout(r, ADMIN_WAIT_MS))]);
}

// Unsent changes: src/app/pbstart.js plugs in the write queue's count (src/app/pb/backend.js); 0 until the session starts
let unsentCounter = () => 0;
export function setUnsentCounter(fn) { unsentCounter = typeof fn === 'function' ? fn : () => 0; }
export const unsentCount = () => Number(unsentCounter()) || 0;

// ☰ → «Выйти»: with unsent changes asks first (confirm(question) → true/false). Returns whether the user signed out.
export async function signOut({ confirm } = {}) {
  const q = signOutQuestion(unsentCount());
  if (q && !(await confirm?.(q))) return false;
  store().clear();
  info('Выход (PocketBase)');
  set({ signedIn: false, expired: false, user: null });
  return true;
}
