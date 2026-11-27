// Screens of the NAS copy that depend on the server: the one banner under the top bar, «Подключение к базе» with «Связь с сервером», and the «⬇» state for the shell.
// The banner is the sign-in expired card (src/app/pb/signin.js), «app older» or «server older», never two; the rules are pure in src/domain/pbstate.js.
// Reads auth (src/app/pb/auth.js), the sender's and the reader's states, the «⚠» list of src/app/repo.js; created by src/app/pbstart.js and handed to src/app/shell.js
// as `server` (spec 4 § 3.6, § 3.7; mockup `.scratch/04-pocketbase-storage/mockups/nas-copy.html`).
import { h, openModal, confirmDialog, toast } from '../ui.js';
import { auth, onChange } from './auth.js';
import { expiredCard } from './signin.js';
import { adminEmail } from '../../edition.js';
import { rejectedList, onRejectedChange } from '../repo.js';
import { ownRejected } from '../../domain/sync.js';
import { serverFlags, bannerKind, connectionNow, lastServerTime, whenParts, readBadgeStatus } from '../../domain/pbstate.js';
import { tr } from '../../i18n/index.js';

const BANNERS = {
  'server-older': '⚠ База на домашнем сервере ещё не обновлена под эту версию приложения. Записи ждут на телефоне (⬆) и уйдут сами, как только сервер обновят.',
  'app-older': 'Вышла новая версия приложения, а эта уже не может записывать на сервер. Закройте приложение и откройте снова.',
};
const TONES = { ok: 'var(--ok)', warn: 'var(--warn)', err: 'var(--err)' };

// opts: { sender — syncState(), onSyncState(fn); reader — readState(), onReadState(fn), rereadAll() }
export function createNasScreens({ sender, reader }) {
  const since = Date.now();
  const flags = () => serverFlags({ auth, sync: sender.syncState(), read: reader.readState() });

  // The banner: one element that stays under the top bar; its content changes only with the kind, so a tap is never lost to a repaint
  const banner = h('div', {});
  let shown = null;
  const paint = () => {
    const kind = bannerKind(flags());
    if (kind === shown) return;
    shown = kind;
    banner.replaceChildren(...[kind === 'expired' ? expiredCard() : kind ? h('div', { class: 'card', style: { borderColor: 'var(--warn)' } }, BANNERS[kind]) : null].filter(Boolean));
  };
  paint();
  onChange(paint); sender.onSyncState(paint); reader.onReadState(paint);

  // «Подключение к базе»: the values are live while the window is open
  function openConnection() {
    const value = () => h('span', { style: { textAlign: 'end' } });
    const now = value(); const last = value(); const waiting = value(); const refused = value();
    const row = (label, el) => h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '4px 0' } }, h('span', {}, label), el);
    const update = () => {
      const sync = sender.syncState(); const read = reader.readState(); const f = flags();
      const c = connectionNow({ online: navigator.onLine !== false, signInExpired: f.signInExpired, serverOlder: f.serverOlder, realtime: read.realtime });
      // new text nodes each time: the translation layer lays the other language over them
      now.replaceChildren(c.text); now.style.color = TONES[c.tone];
      const w = whenParts(lastServerTime({ read, sync }));
      last.replaceChildren(...(!w ? ['ещё не было'] : w.today ? [h('span', {}, 'сегодня'), ` ${w.time}`] : [`${w.date} ${w.time}`]));
      waiting.replaceChildren(String(sync.queue));
      refused.replaceChildren(String(ownRejected(rejectedList(), auth.user?.uid).length));
    };
    update();
    const offs = [onChange(update), sender.onSyncState(update), reader.onReadState(update), onRejectedChange(update)];
    window.addEventListener('online', update); window.addEventListener('offline', update);
    const address = location.origin;
    openModal('Подключение к базе', h('div', {},
      h('div', {}, 'База: домашний сервер (PocketBase)'),
      h('div', { class: 'mut' }, `Адрес: ${address}`),
      h('div', { class: 'mut', style: { margin: '4px 0 10px' } }, `Администратор базы: ${adminEmail() || 'ещё не определён'}`),
      h('div', { class: 'card' },
        h('b', {}, 'Связь с сервером'),
        row('Сейчас', now), row('Последнее обновление', last), row('Ждут отправки', waiting), row('Не принято сервером', refused),
        h('div', { class: 'mut', style: { margin: '4px 0' } }, 'Без интернета всё работает: записи ждут на телефоне и уйдут сами.'),
        h('div', { class: 'btns' }, h('button', { class: 'sec', onclick: async () => {
          if (!(await confirmDialog('Перечитать все данные с сервера? Записи, которые ждут отправки, не пропадут.'))) return;
          toast('Читаю данные с сервера…');
          reader.rereadAll();
        } }, '🔄 Перечитать всё с сервера'))),
      h('div', { class: 'card' },
        h('b', {}, 'Как подключить коллегу'),
        h('div', { class: 'mut', style: { margin: '4px 0' } }, 'Пригласите его в проект (☰ → «👥 Участники»), пусть откроет этот адрес на телефоне, установит значок на экран «Домой» и войдёт через Google.'),
        h('div', { class: 'btns' }, h('button', { class: 'sec', onclick: async () => {
          try { await navigator.clipboard.writeText(`${address}/`); toast('Адрес скопирован'); } catch { toast('Не удалось скопировать'); }
        } }, '📋 Скопировать адрес')))), {
      onClose: () => { offs.forEach((off) => off()); window.removeEventListener('online', update); window.removeEventListener('offline', update); },
    });
  }

  return {
    banner,
    openConnection,
    // «⬇» in the shape of readStatus() of repo.js; labels already in the screen's language, as they stand inside a longer toast
    readStatus() { const s = readBadgeStatus(reader.readState(), since); return { ...s, failed: s.failed.map((x) => ({ ...x, label: tr(x.label) })) }; },
    onReadChange: (fn) => reader.onReadState(fn),
  };
}
