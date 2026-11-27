// What the NAS copy's screens show about the server: which one banner is under the top bar, the «Сейчас» line of «Подключение к базе», the last update and the «⬇» parts.
// Pure: it reads the states of src/app/pb/auth.js (`auth`), src/app/pb/sender.js (`syncState()`) and src/app/pb/reader.js (`readState()`);
// src/app/pb/screens.js shows the result (spec 4 § 3.6, § 3.7). Checked by tests/pbstate.test.js.

// ---------- the banner ----------

// The flags behind the banner. The server is older when the reader (`/api/pm/info`) or the sender (a refused write) says so.
export function serverFlags({ auth = null, sync = null, read = null } = {}) {
  return {
    signInExpired: !!(auth?.expired || sync?.signInExpired),
    serverOlder: !!(sync?.serverOlder || read?.serverOlder),
    appOlder: !!sync?.appOlder,
  };
}

// One place under the top bar, never two banners: 'expired' (nothing is read or sent without a sign-in, and only the user can fix it),
// then 'app-older' (the user must open the app again), then 'server-older' (nothing to do, it goes away by itself); null — no banner
export function bannerKind({ signInExpired = false, serverOlder = false, appOlder = false } = {}) {
  if (signInExpired) return 'expired';
  if (appOlder) return 'app-older';
  return serverOlder ? 'server-older' : null;
}

// ---------- «Подключение к базе» ----------

// «Сейчас»: { text, tone: 'ok' | 'warn' | 'err' }. Without a connection the last known schema says nothing about now, so «нет связи» goes before «сервер не обновлён».
export function connectionNow({ online = true, signInExpired = false, serverOlder = false, realtime = 'not' } = {}) {
  if (signInExpired) return { text: 'вход истёк', tone: 'err' };
  if (!online || realtime !== 'connected') return { text: 'нет связи', tone: 'warn' };
  if (serverOlder) return { text: 'сервер не обновлён', tone: 'warn' };
  return { text: 'на связи', tone: 'ok' };
}

// «Последнее обновление»: the later of the last event or answer the reader heard and the last answer to the sender; 0 — none yet
export const lastServerTime = ({ read = null, sync = null } = {}) => Math.max(Number(read?.lastServerAt) || 0, Number(sync?.lastAnswerAt) || 0);

// A time as the card shows it: null — never; { today: true, time: '14:32' } or { today: false, time, date: '26.11.2026' }
export function whenParts(ms, now = Date.now()) {
  if (!(ms > 0)) return null;
  const d = new Date(ms);
  const two = (n) => String(n).padStart(2, '0');
  const time = `${two(d.getHours())}:${two(d.getMinutes())}`;
  if (d.toDateString() === new Date(now).toDateString()) return { today: true, time };
  return { today: false, time, date: `${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()}` };
}

// ---------- «⬇» ----------

// The names of the parts of READ_PARTS (src/domain/pbread.js)
export const READ_LABELS = {
  projects: 'Список проектов', records: 'Данные проектов', pool: 'Общий пул', invites: 'Приглашения', prefs: 'Настройки пользователя', inbox: 'Входящие пула',
};

// The reader's state in the shape the shell's «⬇» badge takes (as readStatus() of src/app/repo.js): parts still waiting, parts with a server error
// and its code, and `since` — when the waiting began (the app start: a part never goes back to waiting)
export function readBadgeStatus(read, since = 0) {
  const parts = read?.parts || [];
  const waiting = parts.filter((p) => p.state === 'waiting').length;
  return {
    waiting,
    since: waiting ? since : 0,
    failed: parts.filter((p) => p.state === 'error').map((p) => ({ label: READ_LABELS[p.part] || p.part, code: p.code })),
  };
}
