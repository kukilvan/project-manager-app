// The PocketBase clients of the NAS copy: the one signed-in client for the page's own origin (sign-in kept under the SDK's own key `pocketbase_auth`) and a guest client for sign-in requests.
// NAS-only: reached from src/main.js through src/app/pbstart.js only when isPocketBase(), so the GitHub Pages build never contains the SDK (tests/pb-import.test.js).
// The app, not the SDK, decides when a sign-in is gone (autoClearAuthStore off, spec 4 § 3.2); requests are never auto-cancelled.
// The guest client holds no token: PocketBase 0.42 answers 401 to any request that carries an expired one, including the public sign-in routes (spec 4 § 1).
import PocketBase, { BaseAuthStore } from 'pocketbase';

const origin = () => (typeof location !== 'undefined' ? location.origin : 'http://127.0.0.1:8090');
let client = null;
export function getPb() {
  if (!client) {
    client = new PocketBase(origin());
    client.autoClearAuthStore(false);
    client.autoCancellation(false);
  }
  return client;
}

// A fresh client with an in-memory store for one sign-in (auth methods, the Google flows, password); adoptSignIn moves its result into the signed-in client
export function guestPb() {
  const g = new PocketBase(origin(), new BaseAuthStore());
  g.autoCancellation(false);
  return g;
}
export function adoptSignIn(guest) {
  getPb().authStore.save(guest.authStore.token, guest.authStore.record);
  guest.authStore.clear();
}

// Tests put a fake client in its place
export function setPbClient(c) { client = c; }
