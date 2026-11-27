// Rules of the Google Drive and Sheets sign-in: which OAuth client and scopes, the authorization address, the return address and telling this flow's return from any other.
// Pure: no browser and no SDK; src/app/google.js, src/app/pb/drive.js (NAS copy) and src/domain/pbauth.js call it (spec 4 § 3.8).

// An own Client ID (a database's own, or on the NAS copy the owner's) has the full scopes; the app's shared client only files the app created
export const FULL_SCOPES = ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets'];
export const NARROW_SCOPES = ['https://www.googleapis.com/auth/drive.file'];
export const googleSetup = (ownClientId, sharedClientId) => (ownClientId
  ? { clientId: ownClientId, scopes: FULL_SCOPES }
  : { clientId: sharedClientId, scopes: NARROW_SCOPES });

// The `state` of this flow's two ways: a page redirect and a popup window. Google sends it back, so the return is recognised by it.
export const REDIRECT_STATE = 'pz_gsync';
export const POPUP_STATE = 'pz_gpopup';
export const isDriveState = (state) => state === REDIRECT_STATE || state === POPUP_STATE;

// Where Google returns to: the NAS copy lives at the root of its host (the only address registered there), GitHub Pages under its path
export const returnAddress = ({ origin, pathname }, atRoot) => (atRoot ? `${origin}/` : `${origin}${pathname}`);

export function googleAuthUrl({ clientId, scopes, redirect, state, email = '' }) {
  const q = new URLSearchParams({
    client_id: clientId, redirect_uri: redirect, response_type: 'token', scope: scopes.join(' '),
    include_granted_scopes: 'true', state, ...(email ? { login_hint: email } : {}),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

// This flow's return is in the part of the address after «#»; anything else there (and any other flow's state) → null
export function driveReturn(hash) {
  const p = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const state = p.get('state');
  if (!isDriveState(state)) return null;
  return { popup: state === POPUP_STATE, token: p.get('access_token') || '', expiresIn: Number(p.get('expires_in')) || 3000, error: p.get('error') || '' };
}

// The NAS copy: the owner's Client ID, read from Google's `authURL` in PocketBase's `auth-methods`; '' without a Google provider
export function clientIdFromMethods(methods) {
  const google = (methods?.oauth2?.providers || []).find((p) => p && p.name === 'google');
  try { return new URL(google?.authURL || '').searchParams.get('client_id') || ''; } catch { return ''; }
}
