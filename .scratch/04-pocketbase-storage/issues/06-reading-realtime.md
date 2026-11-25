Status: in review
Complexity: complex
Blocked by: 05

# 06. Reading: realtime, reads after every connect, full and delta

The phone learns what the server has: one realtime connection with the keep-alive, the reads of § 3.5 after every (re)connect (full, delta, Saturday, rollback check), new and removed projects, the history read, the one-off reads, and the «⬇» parts.

## Spec sections

§ 1 (reading facts), § 3.5, § 3.6 («⬇» parts, `sync.js`), § 10 (edge cases 3, 7, 10, 11, 12, 13, 22, 24, 25), § 11 (the read tests). Slicing notes under § 13 apply.

## What to do

1. `src/domain/pbread.js` (pure; header comment): a record → the app's document (`projects.data`, `records.data`, `pool.data`, `{...inbox.data, key}`, `prefs.data`, `invites.data`; `_pb: {id, updated}`); the delta filter (`updated > mark − DELTA_MARGIN`, sorted, pages of 1,000, `skipTotal=1`); marks = the newest `updated` seen per scope (server time, never the phone's clock); `decideMode` use for the Saturday full read; the rollback check decision (the newest server record older than the newest the phone has seen → every scope in full); a full read replaces a scope (documents the server no longer has are removed, unless a queued item touches them); the event-apply rule (applied when its `updated` is not older than the local `_pb.updated`; `delete` removes); a server version shown with the queued ops replayed on top.
2. `src/app/pb/reader.js`: one SDK realtime connection subscribed to `projects/*`, `records/*`, `pool/*`, `invites/*`, `prefs/*`, `pm_ping`, and `inbox/*` for the administrator — subscriptions made **before** the reads; events grouped for 100 ms. After every `PB_CONNECT`: the six steps of § 3.5 in order (`/api/pm/info` with the schema check and the administrator → rollback check → `projects` in full, a missing project removed locally with its records, a new project read in full → `invites` and `prefs` in full → per-project `records`, `pool`, `inbox` full or delta). A full read that would drop every local project is applied only after a successful `authRefresh` in this run (§ 3.2). The sender is told after each connect.
3. The backend (`src/app/pb/backend.js`) wires `listenProjects` and `listenColl` (and the generic scope listeners the next ticket reuses) to the local copy fed by the reader; `readColl` and `readPool` read all pages straight from the server and reject offline; `loadHistory(pid, since, max)`: `history` filtered by project and `at >= since`, sorted `-at`, pages of 1,000, up to `max`, waits at most 6 s, else the local `history` store.
4. `src/domain/sync.js` stays as is for `DELTA_MARGIN`, `lastSaturday`, `decideMode`, `maxMillis`, retention; check that nothing there needs the Firestore read counter on the NAS copy (the counter is ticket 08's screen work).
5. State for the screens of ticket 08: `realtime` (`connected` / `not`), `lastServerAt`, the six «⬇» parts (waiting / done / error with the code) as `readState()` and `onReadState(cb)`; the `/api/pm/info` check every 10 min and at every reconnect (server older → sending holds, reading goes on; a collection the server does not have yet reads as empty).
6. Header comments, `node tools/code-map.mjs`.

## Done when

Local PocketBase, browser pane at 420 px, two tabs as two test users (a project shared by ticket 07's invitation is not ready yet: use the superuser to add the second user to `memberUids` through the route, as the tests do):
- A change made in tab A (a point) appears in tab B within a second; a point deleted in A (soft delete) disappears in B.
- A new tab (empty copy) signs in and reads everything: the project list, the points, the days.
- With tab B offline (server stopped) and changes made through the superuser meanwhile, B catches up by a delta read after the server is back; marks and the 10-minute margin are as in the tests.
- The server data directory restored from an older state (stop, replace, start) makes the phone read everything (rollback check).
- A project the user was removed from disappears with its records; a new project is read in full at once.
- The keep-alive event `pm_ping` arrives about every minute (network log); the connection is re-made after the server restarts.
- The Pages build has no PocketBase code; `?mem=1` and Firebase behave as before.
- `npm test`, `npm run build`, `node tools/code-map.mjs --check` pass.

## Tests to add

`tests/pbread.test.js` (§ 11, read part): record → document, marks, the delta filter, the rollback check, full-read replacement keeping queued documents, the event-apply order, a server version shown with queued ops on top. (The export shape of § 5.2 is added to this file by ticket 11.) Real-server cases in `tests/pb-*.test.js` with ticket 02's helper: delta after a cut, rollback detection, events reach members only.

## Owner check

Needs the NAS. Kept for the stage list:
1. Two phones (or the phone and the PC browser) signed in with two different accounts that are members of one project (the invitation itself is ticket 07: until then the second account is made a member by the session, through the write route): a point added on one appears on the other within a few seconds.
2. A phone left in the airplane mode for a night wakes up: after the network is back, the other phone's changes arrive by themselves.
3. Wrong: a change never arrives; the «⬇» shows «ошибка» — send a screenshot.
