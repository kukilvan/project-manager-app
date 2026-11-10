// Firebase connection: Google sign-in and a Firestore database with a persistent offline cache.
// Config comes from edition.js; keeps `pm.authCached` and `pz_gtoken` in localStorage; loaded by main.js with a dynamic import, and google.js reads its current user.
import { initializeApp } from 'firebase/app';
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, browserPopupRedirectResolver,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut,
} from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache } from 'firebase/firestore';
import { firebaseConfig } from './edition.js';
import { info, warn, error } from './log.js';

// The connection is created by the initFirebase() call: in the open edition the settings appear only after the setup wizard
export let auth = null;
export let db; export let cacheMode = 'нет';
// Fast start. Before, on every start Firebase (1) first loaded the Google sign-in window from the network on the phone and
// (2) checked the account on the server — on a weak connection this hung for minutes. Now, if this device has signed in before,
// the app takes the saved user at once (as in airplane mode) and the check runs later, in the background.
const CACHED = 'pm.authCached';
export const wasSignedIn = () => { try { return localStorage.getItem(CACHED) === '1'; } catch { return false; } };
export const forgetSignedIn = () => { try { localStorage.removeItem(CACHED); } catch { /* ok */ } };
export let fast = false;
let endDefer = () => {};
function deferStartupLookup() {
  // The account check at start (accounts:lookup): without a connection Firebase keeps the saved user,
  // so we answer «no connection» at once, without waiting for the network; the real check comes later (verifyInBackground).
  const orig = window.fetch; let active = true;
  const mine = function (input, init) {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (active && url.includes('identitytoolkit.googleapis.com') && url.includes('accounts:lookup')) return Promise.reject(new TypeError('startup lookup deferred'));
    return orig.call(window, input, init);
  };
  window.fetch = mine;
  endDefer = () => { active = false; if (window.fetch === mine) window.fetch = orig; };
}
/** The real account check (disabled/deleted?) — in the background; on a weak connection it simply does not finish. */
export function verifyInBackground() { setTimeout(() => { auth?.currentUser?.reload().catch(() => {}); }, 3000); }

export function initFirebase() {
  if (auth) return;
  const app = initializeApp(firebaseConfig());
  fast = wasSignedIn();
  if (fast) deferStartupLookup();
  auth = initializeAuth(app, fast
    ? { persistence: [indexedDBLocalPersistence, browserLocalPersistence] }
    : { persistence: [indexedDBLocalPersistence, browserLocalPersistence], popupRedirectResolver: browserPopupRedirectResolver });
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      experimentalAutoDetectLongPolling: true, // WebKit sometimes breaks WebChannel
    });
    cacheMode = 'постоянный (IndexedDB)';
  } catch (e) {
    warn('Постоянный кэш Firestore недоступен, работаю с кэшем в памяти', e);
    db = initializeFirestore(app, { localCache: memoryLocalCache(), experimentalAutoDetectLongPolling: true });
    cacheMode = 'в памяти (офлайн не переживёт перезапуск)';
  }
  info(`Кэш Firestore: ${cacheMode}`);
}

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

export async function loginPopup() {
  info('Вход: popup…');
  const res = await signInWithPopup(auth, provider, browserPopupRedirectResolver);
  info('Вход popup OK', res.user.email);
}
export async function loginRedirect() { info('Вход: redirect…'); await signInWithRedirect(auth, provider, browserPopupRedirectResolver); }
export const logout = () => { info('Выход'); forgetSignedIn(); return signOut(auth); };

export function watchAuth(cb) {
  const redirect = getRedirectResult(auth, browserPopupRedirectResolver)
    .then((res) => {
      info(res ? `Redirect-результат: вход OK ${res.user.email}` : 'Redirect-результата нет');
      // Return after asking for Drive/Sheets access (iPhone): save the token for google.js
      const token = res && GoogleAuthProvider.credentialFromResult(res)?.accessToken;
      if (token) { try { localStorage.setItem('pz_gtoken', JSON.stringify({ token, exp: Date.now() + 50 * 60 * 1000 })); } catch { /* no storage */ } }
    })
    .catch((e) => error('Redirect-результат ошибка', `${e.code || ''} ${e.message || e}`));
  return onAuthStateChanged(auth, async (user) => {
    endDefer();
    // «not signed in» is announced after the return from Google is checked (without a connection that is instant)
    if (!user) { await redirect; if (auth.currentUser) return; }
    info(user ? `Пользователь: ${user.displayName || ''} <${user.email}>` : 'Пользователь: не вошёл');
    if (user) { try { localStorage.setItem(CACHED, '1'); } catch { /* ok */ } }
    cb(user);
  });
}
