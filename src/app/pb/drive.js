// Google Drive and Sheets on the NAS copy: the owner's Client ID from PocketBase's `auth-methods`, kept on the device, with the user's e-mail.
// Built by src/app/pbstart.js and plugged into src/app/google.js (setNasGoogle); the rules are pure in src/domain/googleauth.js (spec 4 § 3.8). Device key: `pm.pbGoogleClient`.
import { clientIdFromMethods } from '../../domain/googleauth.js';
import { info, warn } from '../../log.js';

const KEY = 'pm.pbGoogleClient';
// The first use waits this long for the server; longer and the phone no longer lets the tap open Google's window
const WAIT_MS = 4000;

export function createNasGoogle({ loadMethods, email, storage = globalThis.localStorage, wait = WAIT_MS }) {
  const clientId = () => { try { return storage?.getItem(KEY) || ''; } catch { return ''; } };
  let running = null;
  // The server's answer replaces the kept Client ID (no Google provider → forgotten); no answer leaves it as it was
  function refresh() {
    running ??= Promise.resolve().then(loadMethods).then((methods) => {
      const id = clientIdFromMethods(methods);
      if (id === clientId()) return;
      try { if (id) storage?.setItem(KEY, id); else storage?.removeItem(KEY); } catch { /* ok */ }
      info(id ? 'Google Диск (PocketBase): Client ID получен с сервера' : 'Google Диск (PocketBase): на сервере нет входа через Google');
    }).catch((e) => warn(`Google Диск (PocketBase): Client ID не получен (${e?.status || 'нет связи'})`))
      .finally(() => { running = null; });
    return running;
  }
  // refresh(), but no longer than `wait`
  async function load() {
    let timer;
    await Promise.race([refresh(), new Promise((r) => { timer = setTimeout(r, wait); })]);
    clearTimeout(timer);
  }
  return { email: () => email() || '', clientId, load };
}
