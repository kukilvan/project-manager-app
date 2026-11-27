// Sign-in screens of the NAS copy: the sign-in screen with «База: домашний сервер · <host>», the sign-in panel (two Google buttons, the password form for local tests) and the «Вход истёк» banner.
// The panel is shared by the screen and the «Войти снова» window; actions and state come from src/app/pb/auth.js, error texts from src/domain/pbauth.js (spec 4 § 3.2).
import { h, openModal } from '../ui.js';
import { APP_NAME } from '../../edition.js';
import { error } from '../../log.js';
import { auth, onChange, loadMethods, signInGoogle, startCodeFlow, signInPassword } from './auth.js';
import { googleProvider, passwordOn, signInMessage } from '../../domain/pbauth.js';

// The two Google buttons, the password form when the server allows it, and the error line. onDone() runs after a sign-in.
export function signInPanel({ onDone, message = '' } = {}) {
  const msg = h('div', { style: { color: 'var(--err)', marginTop: '10px', display: message ? '' : 'none' } }, message);
  const say = (text) => { msg.textContent = text || ''; msg.style.display = text ? '' : 'none'; };
  let methods = null;
  const buttons = [];
  const busy = (on) => buttons.forEach((b) => { b.disabled = on; });
  const fail = (e) => { busy(false); const text = signInMessage(e); if (text) say(text); };
  const detail = (e) => `${e?.status ?? e?.code ?? ''} ${e?.originalError?.message || e?.message || e?.kind || e}`;
  const google = h('button', { class: 'grow', style: { width: '100%' }, onclick: () => {
    if (methods && !googleProvider(methods)) { say(signInMessage({ kind: 'no-google' })); return; }
    say(''); busy(true);
    // signInGoogle opens its window synchronously, inside this tap
    signInGoogle({ onClosed: () => busy(false) }).then(() => { busy(false); onDone?.(); }).catch((e) => { error('Вход через Google: ошибка', detail(e)); fail(e); });
  } }, 'Войти через Google');
  const backup = h('button', { class: 'sec', onclick: () => {
    say(''); busy(true);
    startCodeFlow().catch((e) => { error('Вход (запасной способ): ошибка', detail(e)); fail(e); });
  } }, 'Войти (запасной способ)');
  buttons.push(google, backup);

  const pwBox = h('div', { style: { display: 'none', marginTop: '14px', borderTop: '1px solid var(--line)', paddingTop: '10px' } });
  const showPassword = () => {
    const email = h('input', { type: 'email', autocomplete: 'username', autocapitalize: 'off' });
    const pass = h('input', { type: 'password', autocomplete: 'current-password' });
    const go = h('button', { type: 'submit' }, 'Войти по паролю');
    buttons.push(go);
    const form = h('form', { onsubmit: (ev) => {
      ev.preventDefault(); say(''); busy(true);
      signInPassword(email.value, pass.value).then(() => { busy(false); onDone?.(); }).catch((e) => { error('Вход по паролю: ошибка', detail(e)); fail(e); });
    } },
    h('div', { class: 'mut', style: { marginBottom: '8px' } }, 'Вход по паролю — только для проверки на компьютере'),
    h('label', { class: 'field' }, h('span', {}, 'Почта'), email),
    h('label', { class: 'field' }, h('span', {}, 'Пароль'), pass),
    go);
    pwBox.replaceChildren(form); pwBox.style.display = '';
  };
  // The server's sign-in methods: whether Google is set up and password sign-in is on; no answer → the server is unreachable
  loadMethods().then((m) => { methods = m; if (passwordOn(m)) showPassword(); })
    .catch((e) => { const text = signInMessage(e); if (text && !msg.textContent) say(text); });

  return h('div', {},
    google,
    h('div', { class: 'mut', style: { margin: '10px 0 6px' } }, 'Если кнопка выше не сработала на iPhone («Домой»), попробуйте запасной способ:'),
    backup,
    pwBox,
    msg);
}

// The sign-in screen: the same texts as the Firebase one, the database line under the card, no «⚙ Подключение»
export function signInScreen({ onDone, message = '' } = {}) {
  return h('div', { class: 'wrap' },
    h('h1', {}, APP_NAME),
    h('div', { class: 'card' },
      h('div', { style: { marginBottom: '10px' } }, 'Войдите через Google, чтобы открыть свои проекты. Работает и без интернета: записи сохраняются на устройстве.'),
      signInPanel({ onDone, message })),
    h('div', { class: 'mut', style: { margin: '10px 2px' } }, `База: домашний сервер · ${location.host}`));
}

// «Вход истёк» under the top bar: shown while auth.expired; «Войти снова» opens the sign-in panel in a window
export function expiredBanner() {
  const el = h('div', { class: 'card', style: { borderColor: 'var(--warn)', display: 'none' } },
    h('div', { style: { marginBottom: '8px' } }, 'Вход истёк. Записи ждут на телефоне и уйдут после входа.'),
    h('button', { onclick: () => {
      const close = openModal('Войти снова', signInPanel({ onDone: () => close() }));
    } }, 'Войти снова'));
  const paint = () => { el.style.display = auth.expired ? '' : 'none'; };
  paint();
  onChange(paint);
  return el;
}
