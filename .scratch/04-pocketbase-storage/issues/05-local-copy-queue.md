Status: accepted
Complexity: complex
Blocked by: 04

# 05. The local copy and the write queue

The NAS build starts the real app on a PocketBase backend that keeps a full copy of the data in IndexedDB `pm-pb` and a persistent write queue that is sent in chunks. Reading from the server is ticket 06, so here the screens show what is on the phone (and what the phone wrote); the data reaches the server and stays there.

## Spec sections

§ 2.3 (what the phone computes), § 3.3, § 3.4, § 3.6 (the numbers behind «⬆» and «⚠»; texts are ticket 08), § 10 (edge cases 2, 3, 4, 6, 14, 15, 24), § 11 (the queue tests), § 12 (device keys, term «Local copy», «Write queue»). Slicing notes under § 13 apply.

## What to do

1. `src/domain/pbqueue.js` (pure; header comment): the chunking of queue items (≤ 300 ops and ≤ 1.5 MB of JSON per request; an item larger than that is split into consecutive chunks of its own), the classification of every answer of § 3.4 (200, 422 with `index`, 401, 404 without `code`, 409 `schema_old`, 426, 413, 429 / 5xx / network / 60 s, any other 400 → back-off three times, then `invalid`), the back-off steps (2, 5, 10, 30, 60 s, reset after a success), replaying queued ops over a document (uses `pbwrite.js`).
2. `src/app/pb/localcopy.js`: IndexedDB `pm-pb` with the stores `docs`, `queue`, `meta`, `history` of § 3.3; loads everything into memory at start, then replays every queued item over the documents; document writes batched (150 ms and at `pagehide` / hidden); a queue item is written **in the same call** that accepts the write; listeners per scope / project / collection, server and local changes grouped for 100 ms; `navigator.storage.persist()`; history entries kept 60 days.
3. `src/app/pb/backend.js`: `createPocketBaseBackend(...)` with the interface of `createFirestoreBackend` (`src/app/repo.js`) — in this ticket `commit`, `commitPool`, `setInbox`, `allowEmails`, `saveUserPrefs`, and `listenProjects`, `listenColl`, `listenUserPrefs`, `listenPool`, `listenInbox`, `listenInvitations`, `loadHistory`, `readColl`, `readPool` answering from the local copy only (tickets 06 and 07 connect them to the server). A write: ops from `toOps`, applied to the local copy (`_pending: true`), one queue item appended, a promise returned that resolves when the item is on the server and rejects when it is refused — so `track` and `onReject` in `createRepo` work unchanged.
4. `src/app/pb/sender.js`: one request at a time to `POST /api/pm/save` with `PB_SCHEMA`; runs 300 ms after a write, on `online`, when the app becomes visible, after a realtime (re)connect (the hook is called by ticket 06) and on the back-off timer; does not run when the sign-in is expired, the server is older, the app is older or the app is offline; the answers of § 3.4: items done leave the queue and resolve, `_pending` cleared on documents no later item touches; a 422 sends the item holding `index` to «⚠» (`pz.rejected`, code `forbidden` / `not-found` / `invalid`) and sends the rest again at once; a rejected chunk of a large item rejects the whole item (`retryRejected` resends all). State for the banners of ticket 08: `signInExpired`, `serverOlder`, `appOlder`, `lastAnswerAt`, queue size — exposed as `syncState()` and `onSyncState(cb)`.
5. The identity of the copy: `meta.uid`. A sign-in of another user clears `docs`, `meta`, `history`, keeps the old user's queue items (not sent) and shows once «Вы вошли другим аккаунтом. Неотправленные записи прошлого аккаунта (N) ждут, пока он снова войдёт на этом телефоне.» (new string, three languages). Ticket 04's sign-out question now gets its real count (`unsentCount()`).
6. Wiring: the NAS build starts the real app after sign-in with `createRepo(createPocketBaseBackend(...), user)`; the placeholder of ticket 03 and its string go away (the translation files and the coverage test stay consistent). `pendingCount` of `store.js` takes the largest of `ownPendingCount()`, documents with `_pending` and the backend's queue count (§ 3.6); «⬆ N» shows after a restart too.
7. Header comments, `node tools/code-map.mjs`, `PROJECT_CONTEXT.md` environment: IndexedDB `pm-pb`; `CONTEXT.md` terms «Local copy», «Write queue».

## Done when

Local PocketBase (`pb-dev up --serve dist-nas`), browser pane at 420 px, password sign-in:
- A project can be created; its points and a day's entry are saved; «⬆» counts and goes to 0; the server has the records (check through `GET /api/collections/records/records` with the superuser or a second tab as another member later in ticket 07).
- Close and reopen the tab: the project and points are there from IndexedDB, with the server stopped too.
- With `pb-dev down`: record three changes — «⬆ 3» stays; start the server again: the queue goes out by itself and «⬆» disappears; the records are on the server exactly once (send the same request twice by hand: harmless).
- A write the server refuses (e.g. a project the user is not a member of, made by hand in the console) goes to «⚠» with `forbidden`; the other changes of the queue are sent.
- A 400-point import is chunked (`/api/pm/save` requests of ≤ 300 ops each in the network log).
- Signing in as another test user shows the notice once; the first user's queue item is kept and goes out after that user signs in again.
- The Pages build has no PocketBase code; `?mem=1` and Firebase behave as before.
- `npm test`, `npm run build`, `node tools/code-map.mjs --check` pass.

## Tests to add

`tests/pbqueue.test.js` (refines § 11: chunking and answer classification live here, not in `pbwrite.test.js`): chunking limits and a split item, every answer row, back-off steps and reset, replay of queued ops over a server document, the «⚠» choice by `index`, idempotent resend. The IndexedDB layer is tested with a small in-memory fake of the few IndexedDB calls it makes; the sender with a fake `fetch`. Real-server cases (resend after a cut, refusal) in `tests/pb-server.test.js` or a new `tests/pb-queue.test.js` that uses ticket 02's helper.

## Owner check

Needs the NAS and ticket 04's sign-in. Kept for the stage list:
1. On the new icon create a project «Тест NAS» and add two points. Close the icon and open it again: the project and points are there.
2. Turn on the airplane mode, add three more points: a small «⬆ 3» shows. Turn it off: within a minute «⬆» disappears.
3. Wrong: «⚠» shows next to the numbers — send a screenshot.
