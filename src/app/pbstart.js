// NAS build start: the sign-in (src/app/pb/auth.js, src/app/pb/signin.js), then the real app on the PocketBase backend with the local copy and the write queue.
// Loaded lazily by src/main.js only when isPocketBase() (the NAS build); absent from the GitHub Pages build (tests/pb-import.test.js). Spec 4 § 3.1–3.4.
// Opens the local copy (src/app/pb/localcopy.js) for the signed-in user, builds the backend (src/app/pb/backend.js) and the sender (src/app/pb/sender.js),
// then starts store.js and the shell as main.js does for Firestore. `window.__pmPb` gives browser checks the sign-in state, the copy, the sender and the backend.
import { h, toast, confirmDialog, openModal } from './ui.js';
import { info, error } from '../log.js';
import { createRepo } from './repo.js';
import * as store from './store.js';
import { createShell } from './shell.js';
import { auth, onChange, onSignIn, startSession, resolveAdmin, signOut, setUnsentCounter, authRefresh, markExpired } from './pb/auth.js';
import { getPb } from './pb/client.js';
import { signInScreen, expiredBanner } from './pb/signin.js';
import { openLocalCopy } from './pb/localcopy.js';
import { createPocketBaseBackend } from './pb/backend.js';
import { createSender } from './pb/sender.js';
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
  let sender = null;
  const backend = createPocketBaseBackend({ copy, user, onQueued: () => sender?.kick(SEND_DELAY_MS) });
  sender = createSender({
    copy, uid: () => user.uid, token: () => getPb().authStore.token,
    isExpired: () => auth.expired, onExpired: markExpired,
    onDone: backend.itemDone, onRejected: backend.itemRejected, onProgress: backend.itemProgress,
  });
  setUnsentCounter(() => backend.queueCount());
  // a sign-in after «Вход истёк»: the same user — sending resumes; another user — the start replaces the local copy (spec 4 § 3.3)
  onSignIn((ev) => { if (ev.previousId && !ev.sameUser) location.reload(); else sender.kick(0); });
  let wasExpired = auth.expired;
  onChange(() => { if (wasExpired && !auth.expired) sender.kick(0); wasExpired = auth.expired; });

  const repo = createRepo(backend, user);
  window.__pmPb = { ...window.__pmPb, copy, sender, backend, repo };
  store.start(repo);
  createShell({
    user,
    banner: expiredBanner(),
    onLogout: async () => { if (await signOut({ confirm: (q) => confirmDialog(q) })) location.reload(); },
    diag: { build: diag.build || 'dev', device: diag.device || '', standalone: !!diag.standalone, backend: 'PocketBase', cacheMode: '—', userEmail: user.email },
  });
  sender.start();
  const notice = switched ? otherAccountNotice(switched.count) : null;
  if (notice) openModal('👤', h('div', {}, notice));
  if (message) toast(message);
}
