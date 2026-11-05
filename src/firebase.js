// Подключение к Firebase: вход через Google и база с постоянным офлайн-кэшем.
import { initializeApp } from 'firebase/app';
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, browserPopupRedirectResolver,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut,
} from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache } from 'firebase/firestore';
import { firebaseConfig } from './edition.js';
import { info, warn, error } from './log.js';

// Подключение создаётся по вызову initFirebase(): в открытой версии настройки появляются только после мастера настройки
export let auth = null;
export let db; export let cacheMode = 'нет';
// Быстрый запуск. Раньше при каждом старте Firebase (1) на телефоне сначала грузил из сети окно входа Google и
// (2) проверял учётную запись на сервере — при слабой связи это висело минутами. Теперь, если на этом устройстве уже
// входили, приложение берёт сохранённого пользователя сразу (как в режиме полёта), а проверка идёт потом, в фоне.
const CACHED = 'pm.authCached';
export const wasSignedIn = () => { try { return localStorage.getItem(CACHED) === '1'; } catch { return false; } };
export const forgetSignedIn = () => { try { localStorage.removeItem(CACHED); } catch { /* ok */ } };
export let fast = false;
let endDefer = () => {};
function deferStartupLookup() {
  // Проверка учётной записи при старте (accounts:lookup): без связи Firebase оставляет сохранённого пользователя,
  // поэтому отвечаем «нет связи» сразу, не дожидаясь сети; настоящую проверку делаем позже (verifyInBackground).
  const orig = window.fetch; let active = true;
  const mine = function (input, init) {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (active && url.includes('identitytoolkit.googleapis.com') && url.includes('accounts:lookup')) return Promise.reject(new TypeError('startup lookup deferred'));
    return orig.call(window, input, init);
  };
  window.fetch = mine;
  endDefer = () => { active = false; if (window.fetch === mine) window.fetch = orig; };
}
/** Настоящая проверка учётной записи (отключена/удалена?) — в фоне; при слабой связи просто не завершится. */
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
      experimentalAutoDetectLongPolling: true, // WebKit иногда ломает WebChannel
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
      // Возврат после запроса доступа к Диску/Таблицам (iPhone): сохраняем токен для google.js
      const token = res && GoogleAuthProvider.credentialFromResult(res)?.accessToken;
      if (token) { try { localStorage.setItem('pz_gtoken', JSON.stringify({ token, exp: Date.now() + 50 * 60 * 1000 })); } catch { /* без хранилища */ } }
    })
    .catch((e) => error('Redirect-результат ошибка', `${e.code || ''} ${e.message || e}`));
  return onAuthStateChanged(auth, async (user) => {
    endDefer();
    // «не вошёл» объявляем после проверки возврата с Google (без связи она мгновенная)
    if (!user) { await redirect; if (auth.currentUser) return; }
    info(user ? `Пользователь: ${user.displayName || ''} <${user.email}>` : 'Пользователь: не вошёл');
    if (user) { try { localStorage.setItem(CACHED, '1'); } catch { /* ok */ } }
    cb(user);
  });
}
