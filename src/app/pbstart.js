// NAS build start: the sign-in (src/app/pb/auth.js, src/app/pb/signin.js), then the real app on the PocketBase backend with the local copy, the write queue and the reader.
// Loaded lazily by src/main.js only when isPocketBase() (the NAS build); absent from the GitHub Pages build (tests/pb-import.test.js). Spec 4 § 3.1–3.4.
// Opens the local copy (src/app/pb/localcopy.js) for the signed-in user, builds the reader (src/app/pb/reader.js), the backend (src/app/pb/backend.js) and the sender
// (src/app/pb/sender.js), then starts store.js and the shell as main.js does for Firestore, with the server screens of src/app/pb/screens.js;
// plugs the NAS client of Google Drive (src/app/pb/drive.js) into src/app/google.js.
// `window.__pmPb` gives browser checks the sign-in state, the copy, the sender, the reader and the backend.
import { h, toast, confirmDialog, openModal } from './ui.js';
import { info, error } from '../log.js';
import { createRepo } from './repo.js';
import * as store from './store.js';
import { createShell } from './shell.js';
import { auth, onChange, onSignIn, startSession, resolveAdmin, signOut, setUnsentCounter, authRefresh, markExpired, loadMethods } from './pb/auth.js';
import { setNasGoogle, clearToken } from './google.js';
import { createNasGoogle } from './pb/drive.js';
import { getPb } from './pb/client.js';
import { signInScreen } from './pb/signin.js';
import { createNasScreens } from './pb/screens.js';
import { openLocalCopy } from './pb/localcopy.js';
import { createPocketBaseBackend } from './pb/backend.js';
import { createSender } from './pb/sender.js';
import { createReader } from './pb/reader.js';
import { isAdminEmail, setAdminEmail, adminEmail } from '../edition.js';
import { SEND_DELAY_MS } from '../domain/pbqueue.js';
import { otherAccountNotice } from '../domain/pbauth.js';

// diag: { build, device, standalone } for «Журнал событий»
export async function startPocketBase(app, diag = {}) {
  info('Сборка для домашнего сервера: вход PocketBase');
  window.__pmPb = { auth, setUnsentCounter, authRefresh };
  const r = await startSession();
  if (r.kind === 'session') { await enter(app, diag, r.message); return; }
  app.replaceChildren(signInScreen({ message: r.message, onDone: () => enter(app, diag).catch((e) => error('Запуск (PocketBase)', e)) }));
}

let entered = false;
async function enter(app, diag, message = '') {
  if (entered) return;
  entered = true;
  await resolveAdmin();
  const user = auth.user;
  const { copy, switched } = await openLocalCopy({ uid: user.uid });
  // Google Drive: the owner's client from the server, the user's e-mail as the hint; another user's Google access does not carry over
  if (switched) clearToken();
  const google = createNasGoogle({ loadMethods, email: () => auth.user?.email });
  setNasGoogle(google);
  google.load();
  let sender = null; let backend = null;
  const reader = createReader({
    pb: getPb(), copy, uid: () => user.uid, isAdmin: () => isAdminEmail(user.email),
    auth: { isExpired: () => auth.expired, isRefreshed: () => auth.refreshed, refresh: authRefresh, markExpired, onChange },
    sender: { wake: () => sender?.wake() },
    onRefused: (part, e) => { if (part === 'pool') backend?.poolRefused(e); },
    onAdmin: (email) => { setAdminEmail(email); try { localStorage.setItem('pm.admin.pb', String(email).toLowerCase()); } catch { /* ok */ } },
  });
  backend = createPocketBaseBackend({
    copy, user, onQueued: () => sender?.kick(SEND_DELAY_MS), server: reader, isAdmin: () => isAdminEmail(user.email),
    admin: { load: () => adminEmail() || null, claim: async () => { await resolveAdmin(); return adminEmail() || null; } },
  });
  sender = createSender({
    copy, uid: () => user.uid, token: () => getPb().authStore.token,
    isExpired: () => auth.expired, onExpired: markExpired,
    onDone: backend.itemDone, onProgress: backend.itemProgress,
    // a refused change: the copy dropped what it showed, so the server's versions are read again at once (review 4 F1); a refusal may also mean
    // the user was removed from the project, which the project list of that read shows (spec 4 § 10 case 3)
    onRejected: (seq, code, message) => { backend.itemRejected(seq, code, message); reader.readNow('full'); },
  });
  setUnsentCounter(() => backend.queueCount());
  // a sign-in after «Вход истёк»: the same user — sending resumes; another user — the start replaces the local copy (spec 4 § 3.3)
  onSignIn((ev) => { if (ev.previousId && !ev.sameUser) location.reload(); else sender.kick(0); });
  let wasExpired = auth.expired;
  onChange(() => { if (wasExpired && !auth.expired) sender.kick(0); wasExpired = auth.expired; });

  // the reader saw that the server was updated: the held queue goes at once, not at the next probe
  let wasOlder = reader.readState().serverOlder;
  reader.onReadState((s) => { if (wasOlder && !s.serverOlder) sender.wake(); wasOlder = s.serverOlder; });

  const repo = createRepo(backend, user);
  window.__pmPb = { ...window.__pmPb, copy, sender, reader, backend, repo, google };
  store.start(repo);
  createShell({
    user,
    server: createNasScreens({ sender, reader }),
    onLogout: async () => { if (await signOut({ confirm: (q) => confirmDialog(q) })) location.reload(); },
    diag: {
      build: diag.build || 'dev', device: diag.device || '', standalone: !!diag.standalone, userEmail: user.email,
      backend: 'PocketBase (домашний сервер)', cacheLine: 'своя копия на телефоне (IndexedDB)',
    },
  });
  sender.start();
  reader.start();
  const notice = switched ? otherAccountNotice(switched.count) : null;
  if (notice) openModal('👤', h('div', {}, notice));
  if (message) toast(message);
}
