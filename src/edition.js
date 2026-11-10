// Connection to the database, the work mode (Firebase or on this device) and the pool administrator. One site for everyone: there is no Firebase config in the code —
// each person connects their own Firebase project in the setup wizard at first launch, colleagues join by an invitation link (it carries the same settings).
// Stores on the device in localStorage: `pm.connection`, `pm.mode`, `pm.localUser`; read by firebase.js, google.js, pool.js and most screens.
export const APP_NAME = 'Менеджер проектов';

const KEY = 'pm.connection';
/** The connection: { firebase: {...}, clientId?: '...' } */
export function connection() {
  try { const c = JSON.parse(localStorage.getItem(KEY) || 'null'); return c?.firebase?.projectId ? c : null; } catch { return null; }
}
export function saveConnection(c) { localStorage.setItem(KEY, JSON.stringify(c)); }
export function clearConnection() { try { localStorage.removeItem(KEY); } catch { /* ok */ } }
export const firebaseConfig = () => connection()?.firebase || null;
export const clientId = () => connection()?.clientId || '';
// The app's shared OAuth client (public): Drive access without Firebase and for databases without their own client
export const DEFAULT_CLIENT_ID = '473054171494-sin5sm8i45hi24oi23udnk13iduqtbrs.apps.googleusercontent.com';

// Work mode: 'firebase' (own or someone else's database, a connection exists) or 'local' (everything on this device)
const MODE = 'pm.mode';
export function mode() {
  if (connection()) return 'firebase';
  try { return localStorage.getItem(MODE) === 'local' ? 'local' : null; } catch { return null; }
}
export const isLocal = () => mode() === 'local';
export function setLocalMode(on) { try { if (on) localStorage.setItem(MODE, 'local'); else localStorage.removeItem(MODE); } catch { /* ok */ } }
/** The user of the «на устройстве» mode: there is no sign-in, the name is set in the app */
export function localUser() {
  let u = null; try { u = JSON.parse(localStorage.getItem('pm.localUser') || 'null'); } catch { /* ok */ }
  if (!u?.uid) { u = { uid: `local-${Math.random().toString(36).slice(2, 10)}`, displayName: 'Я' }; try { localStorage.setItem('pm.localUser', JSON.stringify(u)); } catch { /* ok */ } }
  return { uid: u.uid, displayName: u.displayName || 'Я', email: '' };
}

// Phone/tablet and launch from the home-screen icon (the phone may delete site data kept in the browser)
export const isMobile = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => !!(window.navigator.standalone || window.matchMedia?.('(display-mode: standalone)').matches);

// The database administrator (shared pool, list of allowed emails) is whoever signed in to a new database first (document meta/admin).
// On the device the administrator is the phone's owner.
let admin = '';
export const setAdminEmail = (e) => { admin = String(e || '').toLowerCase(); };
export const adminEmail = () => admin;
export const adminKnown = () => !!admin;
export const isAdminEmail = (e) => isLocal() || (!!admin && String(e || '').toLowerCase() === admin);

// ---------- Firebase settings from text the person copied from the console ----------
// Accepts both JSON and a piece of code «const firebaseConfig = { apiKey: "...", ... };»
export function parseFirebaseConfig(text) {
  const s = String(text || '');
  const pick = (k) => { const m = s.match(new RegExp(`["']?${k}["']?\\s*:\\s*["']([^"']+)["']`)); return m ? m[1].trim() : ''; };
  const cfg = { apiKey: pick('apiKey'), authDomain: pick('authDomain'), projectId: pick('projectId'), storageBucket: pick('storageBucket'), messagingSenderId: pick('messagingSenderId'), appId: pick('appId') };
  const missing = ['apiKey', 'authDomain', 'projectId', 'appId'].filter((k) => !cfg[k]);
  if (missing.length) throw new Error(`Не нашёл в тексте: ${missing.join(', ')}. Скопируйте весь блок firebaseConfig целиком`);
  Object.keys(cfg).forEach((k) => { if (!cfg[k]) delete cfg[k]; });
  return cfg;
}

// ---------- invitation link: connect to the same database without the wizard ----------
const b64 = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
export function connectLink(c = connection(), base = `${location.origin}${location.pathname}`) {
  return `${base}?connect=${b64(JSON.stringify({ f: c.firebase, c: c.clientId || '' }))}`;
}
export function parseConnect(param) {
  const j = JSON.parse(unb64(param));
  if (!j?.f?.projectId || !j.f.apiKey) throw new Error('Ссылка повреждена');
  return { firebase: j.f, clientId: j.c || '' };
}
