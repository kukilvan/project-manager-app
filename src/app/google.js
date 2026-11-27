// Access to Google Drive and Sheets on the user's behalf (on a button press, a separate consent is needed): tokens, sign-in flows and the Drive/Sheets api object.
// Tokens live in localStorage (`pz_gtoken`, `pz_gtoken_err`, `pz_gsync_pending`); folders come from drivefolders.js; used by drawings.js, manuals.js and the screens that sync sheets and backups.
// Client, scopes and addresses follow src/domain/googleauth.js; the NAS copy plugs in its client and user with setNasGoogle (src/app/pb/drive.js).
import { GoogleAuthProvider, reauthenticateWithPopup, browserPopupRedirectResolver } from 'firebase/auth';
import * as fbm from '../firebase.js';
const auth = { get currentUser() { return fbm.auth?.currentUser || null; } };

import { clientId, connection, DEFAULT_CLIENT_ID } from '../edition.js';
import { FULL_SCOPES, REDIRECT_STATE, POPUP_STATE, googleSetup, googleAuthUrl, returnAddress, driveReturn } from '../domain/googleauth.js';
// Three ways to get access to Drive:
//  - a database with its own OAuth client (the connection has a clientId, e.g. Ivan's database): Firebase sign-in + full access to Drive and Sheets;
//  - the NAS copy: the owner's client from the server with the same full access, through Google's own window or redirect (no Firebase);
//  - everything else («на устройстве» mode, new databases): the app's shared client and the narrow drive.file scope —
//    only files created by the app. Google requires no app verification for it and shows no warnings.
let nas = null;   // the NAS copy only: { email(), clientId(), load() }
export function setNasGoogle(account) { nas = account; }
const viaFirebase = () => !nas && !!connection()?.clientId && !!auth.currentUser;
let cached = { token: '', exp: 0 };

export const useRedirect = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  || window.navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
// Called at start-up: if we came back from Google with a token in the address — save it and clean the address.
// The sign-in window (popup) then closes itself: the token is already in the shared storage and the main window picks it up.
export function captureTokenFromUrl() {
  try {
    const back = driveReturn(location.hash);
    if (!back) return;
    if (back.token) localStorage.setItem('pz_gtoken', JSON.stringify({ token: back.token, exp: Date.now() + back.expiresIn * 920 }));
    else if (back.error) localStorage.setItem('pz_gtoken_err', back.error);
    history.replaceState(null, '', location.pathname + location.search);
    if (back.popup) { try { window.close(); } catch { /* ok */ } return 'popup'; }
  } catch { /* ok */ }
  return null;
}
export const PENDING = 'pz_gsync_pending';

function stored() {
  try { const t = JSON.parse(localStorage.getItem('pz_gtoken') || 'null'); return t && Date.now() < t.exp ? t : null; } catch { return null; }
}

function authUrl(state) {
  return googleAuthUrl({
    ...googleSetup(nas ? nas.clientId() : clientId(), DEFAULT_CLIENT_ID), redirect: returnAddress(location, !!nas), state,
    email: nas ? nas.email() : auth.currentUser?.email,
  });
}

export async function getToken(action = 'managers') {
  if (cached.token && Date.now() < cached.exp) return cached.token;
  const st = stored(); if (st) { cached = st; return st.token; }
  // the NAS copy's first use with no Client ID kept yet: ask the server (without an answer the shared client is used)
  if (nas && !nas.clientId()) await nas.load();
  if (useRedirect()) { // iPhone and the app from the icon: Google windows get closed — go to Google and read the token from the address on return
    try { localStorage.setItem(PENDING, action); } catch { /* ok */ }
    location.href = authUrl(REDIRECT_STATE);
    return new Promise(() => {}); // the page goes to Google; it continues after the return
  }
  if (!viaFirebase()) return popupToken();
  const provider = new GoogleAuthProvider();
  FULL_SCOPES.forEach((s) => provider.addScope(s));
  // no prompt: 'consent' — if access is already given, Google shows no consent screen and the window closes itself
  provider.setCustomParameters({ login_hint: auth.currentUser?.email || '' });
  // the Google sign-in resolver is passed explicitly: on a fast start (no network at start) it is not attached in advance,
  // and without it Firebase answers «auth/argument-error»
  const res = await reauthenticateWithPopup(auth.currentUser, provider, browserPopupRedirectResolver);
  const token = GoogleAuthProvider.credentialFromResult(res)?.accessToken;
  if (!token) throw new Error('Google не выдал разрешение на Диск и Таблицы');
  cached = { token, exp: Date.now() + 55 * 60 * 1000 };  // a Google token lives an hour
  try { localStorage.setItem('pz_gtoken', JSON.stringify(cached)); } catch { /* ok */ }  // and is not asked for again after a page reload
  return token;
}

// Google sign-in window without Firebase: it returns to the site with the token in the address, captureTokenFromUrl puts it into storage
function popupToken() {
  try { localStorage.removeItem('pz_gtoken_err'); } catch { /* ok */ }
  const w = window.open(authUrl(POPUP_STATE), 'pz_google', 'width=520,height=640');
  if (!w) { location.href = authUrl(REDIRECT_STATE); return new Promise(() => {}); }  // popups are blocked — go by navigation instead
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const t = setInterval(() => {
      const st = stored();
      if (st) { clearInterval(t); cached = st; resolve(st.token); return; }
      let err = null; try { err = localStorage.getItem('pz_gtoken_err'); } catch { /* ok */ }
      if (err) { clearInterval(t); reject(new Error(err === 'access_denied' ? 'Доступ к Google Диску не дан' : `Google: ${err}`)); return; }
      // w.closed is unreliable after Google pages (the window gets «detached»), so we simply wait up to 3 minutes
      if (Date.now() - started > 180000) { clearInterval(t); reject(new Error('Разрешение Google не получено — попробуйте ещё раз')); }
    }, 400);
  });
}

async function call(token, method, url, body) {
  const r = await fetch(url, {
    method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!r.ok) {
    const e = new Error(json?.error?.message || `HTTP ${r.status}`); e.status = r.status; e.reason = json?.error?.errors?.[0]?.reason; throw e;
  }
  return json;
}

// The same set of operations that sync needs; replaced by a stub in tests.
import { projectFolder, moveInto } from './drivefolders.js';

export function realApi(token) {
  const req = (m, u, b) => call(token, m, u, b);
  const D = 'https://www.googleapis.com/drive/v3/files';
  const S = 'https://sheets.googleapis.com/v4/spreadsheets';
  return {
    async fileInfo(id) {
      try { const f = await call(token, 'GET', `${D}/${id}?fields=id,name,trashed`); return f.trashed ? null : f; } catch (e) { if (e.status === 404) return null; throw e; }
    },
    // A new empty spreadsheet (no template); the app creates the sheets
    create: async (title) => { const r = await call(token, 'POST', S, { properties: { title } }); return { id: r.spreadsheetId, name: title }; },
    // Edit access for the service account (without a notification email)
    share: (id, email) => call(token, 'POST', `${D}/${id}/permissions?sendNotificationEmail=false&fields=id`, { role: 'writer', type: 'user', emailAddress: email }),
    rename: (id, name) => call(token, 'PATCH', `${D}/${id}?fields=id`, { name }),
    sheetsOf: async (id) => (await call(token, 'GET', `${S}/${id}?fields=sheets.properties(sheetId,title,gridProperties)`)).sheets.map((x) => x.properties),
    batch: (id, requests) => call(token, 'POST', `${S}/${id}:batchUpdate`, { requests }),
    async folder(name) {
      const q = encodeURIComponent(`name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
      const f = (await call(token, 'GET', `${D}?q=${q}&fields=files(id)`)).files?.[0];
      if (f) return f.id;
      return (await call(token, 'POST', `${D}?fields=id`, { name, mimeType: 'application/vnd.google-apps.folder' })).id;
    },
    // Creates or overwrites a JSON file in the folder (by name)
    async putJson(folderId, name, text) {
      const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`);
      const old = (await call(token, 'GET', `${D}?q=${q}&fields=files(id)`)).files?.[0];
      const boundary = 'pzb' + Math.random().toString(36).slice(2);
      const meta = old ? { name } : { name, parents: [folderId], mimeType: 'application/json' };
      const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${text}\r\n--${boundary}--`;
      const url = `https://www.googleapis.com/upload/drive/v3/files${old ? `/${old.id}` : ''}?uploadType=multipart&fields=id`;
      const r = await fetch(url, { method: old ? 'PATCH' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
      if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; }
      return (await r.json()).id;
    },
    // project folders on Drive (see drivefolders.js)
    projectFolder: (project, kind) => projectFolder(req, project, kind),
    placeIn: async (fileId, project, kind) => moveInto(req, fileId, await projectFolder(req, project, kind)),
    req,
    write: (id, data) => call(token, 'POST', `${S}/${id}/values:batchUpdate`, { valueInputOption: 'RAW', data }),
  };
}

// The token was rejected by Google (expired or revoked): forget it, the next call asks for a new one
export function clearToken() { cached = { token: '', exp: 0 }; try { localStorage.removeItem('pz_gtoken'); } catch { /* ok */ } }
export function storedTokenValid() { return !!stored(); }
