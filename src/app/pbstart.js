// NAS build start: for now a placeholder screen saying the home server storage comes in later versions, so the NAS project can test its site updater.
// Loaded lazily by src/main.js only when isPocketBase() (the NAS build); absent from the GitHub Pages build. Ticket 4.4 replaces the placeholder with the sign-in (spec 4 § 3.1, § 3.2).
import { h } from './ui.js';
import { info } from '../log.js';
import { APP_NAME } from '../edition.js';

export function startPocketBase(app) {
  info('Сборка для домашнего сервера: заглушка до хранилища PocketBase');
  app.replaceChildren(h('div', { class: 'wrap' },
    h('h1', {}, APP_NAME),
    h('div', { class: 'card' }, 'Хранилище на домашнем сервере появится в следующих версиях.')));
}
