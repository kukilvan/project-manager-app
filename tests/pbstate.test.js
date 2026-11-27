// Tests of what the NAS copy's screens show about the server (src/domain/pbstate.js, spec 4 § 3.6, § 3.7; ticket 4.8): one banner at a time and its priority,
// the «Сейчас» line, the last update, the parts behind «⬇»; and with them the «⚠» texts of PocketBase (rejectReason) and whose refused writes are shown (KI-9).
import test from 'node:test';
import assert from 'node:assert/strict';
import { serverFlags, bannerKind, connectionNow, lastServerTime, whenParts, readBadgeStatus, READ_LABELS } from '../src/domain/pbstate.js';
import { rejectReason, ownRejected } from '../src/domain/sync.js';
import { READ_PARTS } from '../src/domain/pbread.js';

test('banner: sign-in expired, then app older, then server older — one kind, never two (spec 4 § 3.7)', () => {
  assert.equal(bannerKind({}), null);
  assert.equal(bannerKind(), null);
  assert.equal(bannerKind({ serverOlder: true }), 'server-older');
  assert.equal(bannerKind({ appOlder: true }), 'app-older');
  assert.equal(bannerKind({ appOlder: true, serverOlder: true }), 'app-older');
  assert.equal(bannerKind({ signInExpired: true }), 'expired');
  assert.equal(bannerKind({ signInExpired: true, appOlder: true, serverOlder: true }), 'expired');
});

test('banner flags: the server is older when the reader or the sender says so, and fits again when neither does', () => {
  const flags = (sync, read, auth) => serverFlags({ sync, read, auth });
  assert.deepEqual(flags({ serverOlder: false }, { serverOlder: true }), { signInExpired: false, serverOlder: true, appOlder: false });
  assert.equal(flags({ serverOlder: true }, { serverOlder: false }).serverOlder, true);
  assert.equal(flags({ serverOlder: false }, { serverOlder: false }).serverOlder, false);
  assert.equal(flags({}, {}, { expired: true }).signInExpired, true);
  assert.equal(flags({ signInExpired: true }, {}).signInExpired, true);
  assert.equal(flags({ appOlder: true }, {}).appOlder, true);
  assert.deepEqual(serverFlags(), { signInExpired: false, serverOlder: false, appOlder: false });
});

test('«Сейчас»: вход истёк, нет связи, сервер не обновлён, на связи', () => {
  const now = (o) => connectionNow({ online: true, realtime: 'connected', ...o }).text;
  assert.equal(now({}), 'на связи');
  assert.equal(now({ realtime: 'not' }), 'нет связи');
  assert.equal(now({ online: false }), 'нет связи', 'airplane mode, the stream not yet seen as dead');
  assert.equal(now({ serverOlder: true }), 'сервер не обновлён');
  assert.equal(now({ serverOlder: true, realtime: 'not' }), 'нет связи');
  assert.equal(now({ signInExpired: true, realtime: 'not' }), 'вход истёк');
  assert.deepEqual(['ok', 'warn', 'err'], [connectionNow({ realtime: 'connected' }).tone, connectionNow({}).tone, connectionNow({ signInExpired: true }).tone]);
});

test('«Последнее обновление»: the later of the reader\'s and the sender\'s time; today or with the date; «ещё не было» without one', () => {
  assert.equal(lastServerTime({ read: { lastServerAt: 5 }, sync: { lastAnswerAt: 9 } }), 9);
  assert.equal(lastServerTime({ read: { lastServerAt: 9 }, sync: { lastAnswerAt: 0 } }), 9);
  assert.equal(lastServerTime({}), 0);
  const now = new Date(2026, 10, 27, 18, 0).getTime();
  assert.equal(whenParts(0, now), null);
  assert.deepEqual(whenParts(new Date(2026, 10, 27, 4, 5).getTime(), now), { today: true, time: '04:05' });
  assert.deepEqual(whenParts(new Date(2026, 10, 26, 23, 59).getTime(), now), { today: false, time: '23:59', date: '26.11.2026' });
});

test('«⬇»: the parts still waiting and those with a server error; every part has a name', () => {
  assert.deepEqual(READ_PARTS.filter((p) => !READ_LABELS[p]), []);
  const parts = [{ part: 'projects', state: 'done', code: '' }, { part: 'records', state: 'waiting', code: '' }, { part: 'pool', state: 'error', code: '500' }];
  assert.deepEqual(readBadgeStatus({ parts }, 77), { waiting: 1, since: 77, failed: [{ label: 'Общий пул', code: '500' }] });
  assert.deepEqual(readBadgeStatus({ parts: [{ part: 'projects', state: 'done' }] }, 77), { waiting: 0, since: 0, failed: [] });
  assert.deepEqual(readBadgeStatus(null, 77), { waiting: 0, since: 0, failed: [] });
});

test('«⚠» on PocketBase: forbidden has its own text; not-found and invalid as on Firestore; Firestore codes unchanged', () => {
  const f = rejectReason('forbidden', 'pocketbase');
  assert.equal(f.title, 'Нет прав на запись');
  assert.match(f.fix, /только администратор базы/);
  assert.doesNotMatch(f.fix, /Firebase|firestore/i);
  assert.deepEqual(rejectReason('invalid', 'pocketbase'), rejectReason('invalid-argument'));
  assert.deepEqual(rejectReason('not-found', 'pocketbase'), rejectReason('not-found'));
  assert.match(rejectReason('permission-denied').fix, /firestore\.rules/);
  assert.match(rejectReason('forbidden').title, /Ошибка сервера/, 'a PocketBase code means nothing to Firestore');
});

test('«⚠» per account (KI-9): own refused writes and old items without an owner; another account\'s are left out', () => {
  const list = [{ id: 1, uid: 'a' }, { id: 2, uid: 'b' }, { id: 3 }];
  assert.deepEqual(ownRejected(list, 'a').map((x) => x.id), [1, 3]);
  assert.deepEqual(ownRejected(list, 'b').map((x) => x.id), [2, 3]);
  assert.deepEqual(ownRejected(null, 'a'), []);
});
