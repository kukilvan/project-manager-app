// NAS build start: the sign-in (src/app/pb/auth.js, src/app/pb/signin.js), then for now a placeholder with the user's e-mail and «Выйти» until the PocketBase storage arrives.
// Loaded lazily by src/main.js only when isPocketBase() (the NAS build); absent from the GitHub Pages build (tests/pb-import.test.js). Spec 4 § 3.1, § 3.2.
// `window.__pmPb` gives browser checks the sign-in state and the unsent-changes counter (the write queue of ticket 05 plugs in there too).
import { h, toast, confirmDialog } from './ui.js';
import { info, error } from '../log.js';
import { APP_NAME } from '../edition.js';
import { auth, onChange, startSession, resolveAdmin, signOut, setUnsentCounter, authRefresh } from './pb/auth.js';
import { signInScreen, expiredBanner } from './pb/signin.js';

export async function startPocketBase(app) {
  info('Сборка для домашнего сервера: вход PocketBase');
  window.__pmPb = { auth, setUnsentCounter, authRefresh };
  const r = await startSession();
  if (r.kind === 'session') { await enter(app, r.message); return; }
  app.replaceChildren(signInScreen({ message: r.message, onDone: () => enter(app).catch((e) => error('Запуск (PocketBase)', e)) }));
}

let entered = false;
async function enter(app, message = '') {
  if (entered) return;
  entered = true;
  await resolveAdmin();
  const email = h('span', { class: 'grow', style: { overflowWrap: 'anywhere' } });
  const paint = () => { email.textContent = auth.user?.email || ''; };
  paint(); onChange(paint);
  app.replaceChildren(h('div', { class: 'wrap' },
    expiredBanner(),
    h('h1', {}, APP_NAME),
    h('div', { class: 'card' }, 'Хранилище на домашнем сервере появится в следующих версиях.'),
    h('div', { class: 'card row', style: { alignItems: 'center' } },
      email,
      h('button', { class: 'sec', onclick: async () => {
        if (await signOut({ confirm: (q) => confirmDialog(q) })) location.reload();
      } }, '🚪 Выйти'))));
  if (message) toast(message);
}
