// Pure decisions about reading from and writing to Firestore, made without touching the network: delta or full read, retention of deleted records, rejected writes, the daily write limit.
// Used by src/app/repo.js and scripts/server-cleanup.mjs; checked by tests/domain.test.js.
export const DELTA_MARGIN = 10 * 60 * 1000;     // margin back from the last mark, so that a record is not lost to a commit race
// A full check once a week, on Saturday: the first app start from Saturday 00:00 re-reads everything (it also catches hard-deleted documents)
export const lastSaturday = (now) => { const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 1) % 7)); return d.getTime(); };
// 'delta' — read only the changes; 'full' — as before. meta: { last, full, n } from the previous load, cached — the number of documents in the cache
export function decideMode(meta, cached, now = Date.now()) {
  if (!meta || !(meta.last > 0) || !(meta.full > 0)) return 'full';
  if (meta.full < lastSaturday(now)) return 'full';
  if (!(cached >= (meta.n || 0)) || cached === 0) return 'full'; // the cache was cleared or is incomplete
  return 'delta';
}
export const maxMillis = (list) => list.reduce((m, v) => (v && v > m ? v : m), 0);

// ---------- retention of deleted records ----------
// A deleted record (or project) is kept in the database for a year, then the nightly server job deletes it for good.
export const RETENTION_DAYS = 365;
const DAY = 24 * 3600 * 1000;
export const purgeDate = (deletedAt) => (deletedAt ? deletedAt + RETENTION_DAYS * DAY : 0);
// Time to delete for good: marked deleted and the retention period has passed since the deletion (without a timestamp it is never deleted)
export const isExpiredDeleted = (doc, now = Date.now()) => !!doc && doc.deleted === true && Number(doc.deletedAt) > 0 && now >= purgeDate(Number(doc.deletedAt));
// Change-history entries older than the retention period (the field at is the time in milliseconds)
export const historyCutoff = (now = Date.now()) => now - RETENTION_DAYS * DAY;

// ---------- writes rejected by the server ----------
// Firestore error code → what happened and what to do (in Russian)
export function rejectReason(code) {
  const c = String(code || '').replace(/^firestore\//, '');
  if (c === 'permission-denied') return { title: 'Нет прав на запись', fix: 'Возможно, вас убрали из проекта (попросите создателя пригласить снова), не опубликованы правила базы для этого раздела (создатель публикует firestore.rules в консоли Firebase) или истёк вход — выйдите из аккаунта и войдите снова. Потом нажмите «Повторить».' };
  if (c === 'resource-exhausted') return { title: 'Исчерпан суточный лимит записей', fix: 'Подождите сброса лимита (10:00 по Израилю) и нажмите «Повторить».' };
  if (c === 'unauthenticated') return { title: 'Нет входа в аккаунт', fix: 'Выйдите из аккаунта и войдите снова, затем нажмите «Повторить».' };
  if (c === 'invalid-argument' || c === 'out-of-range') return { title: 'Запись не подошла серверу (слишком большая или с неверными данными)', fix: 'Это ошибка приложения. Нажмите «Скопировать журнал» и пришлите мне — исправлю.' };
  if (c === 'not-found') return { title: 'Документ не найден', fix: 'Проект или запись удалены на сервере. Обновите приложение и повторите; если не помогло — пришлите журнал.' };
  return { title: `Ошибка сервера (${c || 'неизвестно'})`, fix: 'Проверьте связь и нажмите «Повторить». Если повторяется — «Скопировать журнал» и пришлите мне.' };
}
// Daily limit of free Firestore writes
export const DAILY_WRITE_LIMIT = 20000;
/** At which thresholds to warn about writes (a share of the limit) */
export const WRITE_WARN_LEVELS = [0.8, 0.95];
export const writeWarnLevel = (before, after, limit = DAILY_WRITE_LIMIT) => WRITE_WARN_LEVELS.filter((l) => before < limit * l && after >= limit * l).pop() || 0;
