# Known issues

Bugs decided not to fix now, and rare cases where the app can go wrong (source data, races, network failures, unusual settings) — whoever found them: review, check, tests or the owner.

- Recorded in the same session it was found, never only in chat.
- IDs `KI-<n>` go in order and are never reused.
- Fixed: the entry stays, its status becomes `fixed (test: …)`, and the index row changes too.
- Each stage description pulls in the open entries that fit its stage.
- Before final polishing, every open entry gets a test.
- Sessions read the index; a full entry is found by its `## KI-<n>` heading.

## Index

| ID | Title | Where | Status | Fix in |
|---|---|---|---|---|
| KI-1 | i18n tests import a Windows path without `file://` | `tests/i18n.test.js` | fixed | stage 1, ticket 1.1 |
| KI-2 | open-rules test fails on CRLF checkout | `tests/domain.test.js`, `src/domain/openrules.js` | fixed | stage 1, ticket 1.1 |
| KI-3 | two same-code runs at once break each other | `tools/same-code.mjs`, `checkSite` | open | — |
| KI-4 | an editor's sort of the points sheet scatters section and empty rows | management sheet (Google Sheets), `src/domain/report.js` | open | — |
| KI-5 | a working day and a day off on one date after offline edits on two devices | `src/app/views/doh.js` (day form checks), `src/domain/month.js` | open | — |
| KI-6 | a conflicting Hebrew name merged into a shared list on two devices at once keeps the last write | `src/app/shared.js` (merge), `src/domain/shared.js` (`mergePlan`) | open | — |
| KI-7 | the translation coverage test sees string literals, not sentences built from parts (the half «catalog names show Russian in English» is fixed) | `tests/i18n-coverage.test.js` | open (catalog names fixed) | stage 7, ticket 7.7 (catalog names) |
| KI-8 | a database with rules older than stage 6 cannot read the shared lists: no merge, no seeding, no «rules out of date» toast, empty lists in a new project | `src/app/shared.js`, `listenPool` in `src/app/repo.js`, `firestore.rules` | fixed | stage 4, ticket 4.10 |
| KI-9 | the «⚠» list is one per phone, not per user: after another sign-in the previous account's refused writes show and «Повторить» sends them as the new user | `pz.rejected` in `src/app/repo.js` | fixed | stage 4, ticket 4.8 |
| KI-10 | on the NAS copy some texts still speak of Firebase: guide lines (connect link, «Где хранятся данные», publishing rules, Drive «only its own files») and the toasts after a refused shared-list write or read | `src/app/views/guide.js`, `rejected` and `unreadable` in `src/app/shared.js` | fixed | stage 4, «Ревью 4» |
| KI-11 | after an abandoned Google redirect on iPhone, a later start runs the waiting Drive action with an expired token and goes to Google unasked | `createShell` in `src/app/shell.js` (`pz_gsync_pending`) | open | — |
| KI-12 | on the NAS copy without a Client ID from the server, the shared client is used, and Google likely refuses the NAS address (`redirect_uri_mismatch`) | `getToken` in `src/app/google.js`, `src/app/pb/drive.js` | open | — |
| KI-13 | on the Firebase and on-device copies the Google token stays after sign-out: another account within the hour uses the previous account's Drive | `logout` in `src/firebase.js`, `pz_gtoken` | open | — |
| KI-14 | in winter the 07:20 UTC retry of the night sheets runs before the Firestore quota resets (08:00 UTC), so a night run that failed on the quota fails again | `.github/workflows/server-tables.yml` (cron `20 7 * * *`) | open | — |
| KI-15 | NAS jobs run before the switch-over write over the live files: management sheets, the Drive zip and the backup repository, with the NAS's test data | `scripts/nas-jobs.mjs`, `docs/nas-requirements.md` (R-JOB-1) | open | stage 4, ticket 15 (proposed) |
| KI-16 | the way back into Firebase is close to the free plan's 20,000 writes a day and a cut run starts over | `runFirestoreRestore` in `scripts/server-backup-lib.mjs` | open | — |
| KI-17 | on Windows the `state.json` test of the job runner failed once: the rename over the file was refused (`EPERM`) | `recordState` in `scripts/nas-jobs.mjs`, `tests/nas-jobs.test.js` | open | — |
| KI-18 | on a new device of the NAS copy the lists answer empty until the first read: a door configuration chosen in that moment can overwrite its shared-pool entry | `listenPool` in `src/app/pb/backend.js`, `useDoorCfg` in `src/app/doorpool.js` | open | — |
| KI-19 | on the NAS copy a request whose answer was lost is sent again and can put back an older value over another phone's change made in between | `src/app/pb/sender.js`, `src/domain/pbqueue.js` (resend), `pb/pb_hooks/pm.pb.js` | open | — |
| KI-20 | the administrator's pool inbox stays empty for the run when the administrator became known after the start (a new device, `/api/pm/admin` slower than 6 s) | `startPool` in `src/app/pool.js`, `listenInbox` in `src/app/pb/backend.js` | open | — |
| KI-21 | without a project the guide does not open: ☰ → «📖 Как пользоваться приложением» shows «У вас пока нет проекта» | `content` in `src/app/shell.js` | open | — |

## Entries

Entry format:

```text
## KI-<n>. <title>

- Where: file and function.
- What's wrong: one or two sentences.
- How to reproduce: concrete input or state, and what comes out.
- Likelihood / impact:
- Status: open | fixed (test: …)
- Found: date, by what (review, check, owner).
```

## KI-1. i18n tests import a Windows path without `file://`

- Where: `tests/i18n.test.js`, the helper that writes a temp module and calls `import(file)`.
- What's wrong: `import()` gets a plain absolute path; on Windows Node needs a `file://` URL (`pathToFileURL`).
- How to reproduce: `npm test` on Windows → «i18n: английский» and «i18n: иврит» fail with `ERR_UNSUPPORTED_ESM_URL_SCHEME`, protocol `c:`.
- Likelihood / impact: always on Windows; test-only, the app and the Linux deploy are unaffected.
- Status: fixed (test: «i18n: английский», «i18n: иврит» pass on Windows) — 2026-11-10, ticket 1.1: the test imports `pathToFileURL(file).href`.
- Found: 2026-11-10, adoption (first run on the owner's PC).

## KI-2. open-rules test fails on CRLF checkout

- Where: the test «правила открытой версии: без вшитой почты, администратор из meta/admin»; `openRules` in `src/domain/openrules.js`.
- What's wrong: with `core.autocrlf=true` the rules files are checked out with CRLF; git stores them with LF and there is no `.gitattributes`; `openRules` inserts its own lines joined with `\n`, so the generated text mixes CRLF and LF and differs from the CRLF `firestore.open.rules` (cause confirmed 2026-11-10, stage 1 description).
- How to reproduce: `npm test` on Windows with `core.autocrlf=true` → that test fails.
- Likelihood / impact: always on this PC; test-only, the deploy runs on Linux with LF.
- Status: fixed (test: «правила открытой версии: без вшитой почты, администратор из meta/admin» passes on Windows) — 2026-11-10, ticket 1.1: `.gitattributes` keeps both rules files LF on every checkout.
- Found: 2026-11-10, adoption.

## KI-3. Two same-code runs at once break each other

- Where: `tools/same-code.mjs`, `checkSite` and `cleanUp`.
- What's wrong: check 2 always uses the same temp folder (`<OS temp>/pm-same-code`) and first removes what is there, so that a crashed run leaves nothing behind (spec 01-code-docs, section 11). A second run started while the first is building removes the first run's worktree and outputs.
- How to reproduce: two sessions (e.g. two worktrees) run `node tools/same-code.mjs` within the same minute → one of them fails with exit 2 (build or git error) or reports missing files.
- Likelihood / impact: rare (sessions run one step at a time; a quick fix runs the tool only for a comment-only change); the run fails or gives a wrong report — run it again alone. Fix when it happens: a per-run temp folder (`mkdtemp`) plus removal of stale `pm-same-code-*` folders older than an hour.
- Status: open
- Found: 2026-11-15, «Ревью 1» (standards pass).

## KI-4. An editor's sort of the points sheet scatters section and empty rows

- Where: the points sheet of a management file; sections come from `sectionRows` in `src/domain/report.js`.
- What's wrong: when someone with edit access sorts the sheet (Data → Sort range), the section heading rows and the empty rows between sections move with the points and end up scattered, until the next rebuild.
- How to reproduce: open the management sheet with edit rights, select the points, sort by any column → section rows are mixed into the points.
- Likelihood / impact: rare (the sheet is for reading; a viewer's sort or filter is temporary and only theirs, so other people do not see it); cosmetic and temporary. Workaround: change anything in the app or wait for a data change, the next refresh writes the sheet again from scratch. Not fixed because rebuilding on every press of «Обновить» would cost a full rewrite even when nothing changed (ADR 0009).
- Status: open
- Found: 2026-11-16, spec 3 (§9).

## KI-5. A working day and a day off on one date after offline edits on two devices

- Where: the day form checks in `src/app/views/doh.js` (`dayConflict` in `src/domain/dayoff.js`), `workdaysReport` in `src/domain/month.js`.
- What's wrong: the clash check between a working day of one project and a day off of another reads the days the device already has. When two devices edit offline (project A: a working day on a date; project B: a day off on the same date) and then sync, both days exist and nothing stops them.
- How to reproduce: device 1 offline — project A, a working day for 05.11; device 2 offline — project B, a day off for 05.11; both go online. «Месяц» shows both blocks; the working day counts, the day off is also listed and counted in «выходных».
- Why not fixed now: the clash is only visible after sync; a fix would need a server rule or a repair pass. The month report stays readable and the working day is counted, so the employer's figures are right. The owner can turn the day off back into a working day or delete it.

## KI-6. A conflicting Hebrew name merged into a shared list on two devices at once keeps the last write

- Where: the one-time merge of the old project lists into `pool_delayReasons` / `pool_culprits` — `src/app/shared.js` (the run) and `mergePlan` in `src/domain/shared.js`.
- What's wrong: each device plans the merge from its own server read. When two devices merge at the same time, both see a pool item with empty Hebrew (or an absent item) and both write their project's Hebrew for the same name; the write that reaches the server last wins. The other Hebrew is not listed as a conflict in either event log.
- How to reproduce: two projects with the same reason and different Hebrew, neither merged; two devices of different members open the app at the same moment, each on a project of its own.
- Why not fixed now: it needs a transaction per item, and it happens only during the one-time merge. Nothing is lost: the old project lists still hold both names, and the Hebrew can be fixed in «Выпадающие списки» by hand.

## KI-7. The translation coverage test sees string literals, not sentences built from parts

- Where: `tests/i18n-coverage.test.js` (through `scripts/i18n-extract.mjs`); the catalogs `src/domain/seed.js`, `src/domain/problems.js`, the colour names in `src/domain/rack.js`.
- What's wrong: the test checks every Russian literal, so a sentence assembled at run time from pieces (`` `${label} ×${n}` ``, `` `${action}: ${name}` ``) passes while the screen can show a mix of Russian and the other language. Found on screen at ticket 6.7: a trailing « ×3» (fixed in `tr()`), the history rows «создал: Точка …» in Hebrew (fixed with `tr()` per part). Names that are data of a catalog (the example problems, the colour names) had a Hebrew name of their own but no English one, so the English UI showed them in Russian («default (зелёный)», the groups «Замок», «Доступ») — fixed, see Status.
- How to reproduce: any new sentence built with `+` or a template of translated parts without `tr()` on each part. (An own catalog item without `nameEn` shows its Russian name in English by design, spec 7 § 5.2.)
- Likelihood / impact: every new UI line built from parts; a few Russian words in a translated screen, nothing breaks.
- Status: open (catalog names fixed — test: «every built-in name reads in English with no Cyrillic letters» in `tests/catalog-en.test.js`; 2026-11-21, stage 7 ticket 7.7: example problems and colour names translated, own English names `nameEn`, review 7). The sentences-built-from-parts half stays open.
- Found: 2026-11-19, screen check of ticket 6.7.

## KI-8. A database with rules older than stage 6 cannot read the shared lists

- Where: `src/app/shared.js` (merge, seeding, the toast «Общий список не записался: правила базы устарели…»), `listenPool` / `deltaListen` in `src/app/repo.js`; the rules come from `firestore.rules` (`firestore.open.rules` for the open edition).
- What's wrong: the rules have no catch-all read rule, so in a database whose rules were pasted before ticket 6.2 the listeners of `pool_delayReasons`, `pool_culprits` and `pool_problems` fail with `permission-denied`. `startShared` then never sees the three lists loaded, so it neither merges the old project lists nor seeds the defaults, and the «rules out of date» toast of spec § 2.4 never shows (it is tied to a rejected write, and nothing is written). A project created there gets no delay reasons and culprits (`createProject` no longer copies them); old projects keep offering their own lists. What the person sees is the red «⬇ ошибка» badge; tapping it names the three pool collections with `permission-denied`.
- How to reproduce: a colleague's own database with the rules of 2026-11-17 or older; open the app after ticket 6.2; create a project; open «Причины задержки точек».
- Likelihood / impact: only a colleague with their own database who has not pasted the new rules; the owner's database has them since 2026-11-18. Empty pickers in new projects until «Подключение к базе» → «📋 Скопировать правила» is done in that database's Firebase console.
- Why not fixed at once: the fix changes the sync core, `?mem=1` could not show it then, it is rare and has a plain remedy.
- Status: fixed (test: «startShared, memory backend with a denied pool (?memPoolDenied=1): one long toast, no merge, no seeding (KI-8)» in `tests/shared.test.js`; 2026-11-27, stage 4 ticket 4.10: `listenPool` takes `onError`, `startShared` stops the merge and seeding and shows «Общие списки не читаются: правила базы устарели…» once). The empty pickers stay until the fresh rules are published. Test mode `?mem=1&memPoolDenied=1`.
- Found: 2026-11-19, review 6.

## KI-9. The «⚠» list is one per phone, not per user

- Where: `pz.rejected` in `src/app/repo.js` (`addRejected`, `noteRejected`, `retryRejected`), shown by the «⚠» badge; both the Firebase and the NAS copy.
- What's wrong: refused writes are kept per device. After another account signs in on the same phone, the previous account's refused writes still show in «⚠», and «🔁 Повторить» sends them with the new account's sign-in (the documents keep the first person's `updatedBy` stamps).
- How to reproduce: user A has a write in «⚠» (for example after being removed from a project); A signs out, B signs in on the same phone; «⚠» shows A's write; «Повторить» sends it as B.
- Likelihood / impact: only a phone shared by two accounts with a refused write left; a wrong author stamp or a second refusal, nothing is lost.
- Status: fixed (test: «⚠» per account (KI-9) in `tests/pbstate.test.js` and `tests/pbqueue.test.js`) — 2026-11-27, ticket 4.8: each item keeps its `uid`; the badge, the list and «🔁 Повторить» take only the signed-in account's items. Items saved before have no owner and show to everyone.
- Found: 2026-11-27, ticket 4.5 (note), decided in ticket 4.7.

## KI-10. Firebase texts on the NAS copy

- Where: `SECTIONS` in `src/app/views/guide.js` (sections `project`, `base`); `rejected` and `unreadable` in `src/app/shared.js` (since ticket 4.10 a refused read of a shared list — 403 — also says to paste fresh rules into Firebase).
- What's wrong: the NAS copy has the section «Домашний сервер», but other guide lines still describe «Ссылка для подключения», «Своя база» (Firebase) and publishing rules; a refused write of a shared list says the rules must be updated in Firebase; «Где хранятся данные» says Google Drive access covers only the app's own files, while on the NAS copy the app asks for the whole Drive and Sheets (ticket 4.9).
- How to reproduce: NAS build → ☰ → «📖 Как пользоваться приложением» → «Проект: создать, пригласить коллег» → «Подробнее» names the connect link, which this copy does not have.
- Likelihood / impact: always for the guide lines, rare for the toast; a colleague may look for a button that is not there.
- Why not fixed now: spec 4 asks for one new section only; the other lines need new texts the owner has not seen. Ticket 4.15 wrote the switch-over texts (`ПЕРЕЕЗД.md`) and changed only the section «Домашний сервер»; proposed for «Ревью 4».
- Status: fixed (test: `tests/i18n-coverage.test.js` covers the new texts; checked in the browser pane on the NAS build) — «Ревью 4», 2026-11-28: on the NAS copy the guide has no Firebase section «Где хранятся данные», «Проект» names the card «Как подключить коллегу», «Домашний сервер» got «Подробнее» (data, colleagues, Drive access); the two shared-list toasts point at «⚠» and the administrator.
- Found: 2026-11-27, ticket 4.8.

## KI-11. A waiting Drive action runs with an expired Google token

- Where: `createShell` in `src/app/shell.js`, the block that resumes `pz_gsync_pending`.
- What's wrong: it checks that `pz_gtoken` exists, not that it is still valid. If the user left Google's page without finishing, `pz_gsync_pending` stays; the next start with an old token runs the action, `getToken` finds the token expired and sends the page to Google again.
- How to reproduce: iPhone, at least one earlier Drive access; after an hour press a Drive button, leave Google's page without agreeing (close it and open the app from the icon). The app goes to Google by itself once its project is loaded.
- Likelihood / impact: rare; one unexpected Google page, nothing is lost.
- Why not fixed now: found while reading the flow in ticket 4.9, which keeps the Google flows as they are; the likely fix is `storedTokenValid()` in that check.
- Status: open
- Found: 2026-11-27, ticket 4.9 (reading the code, not reproduced).

## KI-12. The shared-client fallback on the NAS address

- Where: `getToken` in `src/app/google.js`, `createNasGoogle` in `src/app/pb/drive.js`.
- What's wrong: without a Client ID from the server the NAS copy uses the app's shared client (spec 4 § 3.8). Its Google settings were not given the NAS address, so Google would show `redirect_uri_mismatch` instead of asking for access.
- How to reproduce: NAS copy on a phone with no `pm.pbGoogleClient` while `auth-methods` does not answer (or has no Google provider), then a Drive button.
- Likelihood / impact: very rare (the ID is read at every start, and signing in needs the server); Drive fails until the app is opened with the server reachable. Not checked against Google.
- Status: open
- Found: 2026-11-27, ticket 4.9.

## KI-13. The Google token stays after sign-out

- Where: `logout` in `src/firebase.js` and the on-device mode; `pz_gtoken` in `localStorage`.
- What's wrong: signing out does not forget the Google Drive token. Another account signing in on the same device within the token's hour uses the previous account's Drive and Sheets. The NAS copy forgets it when another user signs in (ticket 4.9).
- How to reproduce: Firebase copy: user A makes a management sheet, signs out, user B signs in and presses a Drive button within an hour: no Google question, A's Drive is used.
- Likelihood / impact: only a device shared by two accounts; files land in or are read from the other person's Drive.
- Status: open
- Found: 2026-11-27, ticket 4.9 (reading the code, not reproduced).

## KI-14. The winter retry of the night sheets comes before the quota reset

- Where: `.github/workflows/server-tables.yml`, the retry cron `20 7 * * *` and its comment «right after the daily Firebase quota reset (midnight Pacific time)».
- What's wrong: the Spark read quota resets at midnight Pacific time: 07:00 UTC in summer (PDT), 08:00 UTC in winter (PST). In winter the retry at 07:20 UTC runs with the old day's quota, so when the 00:00 UTC run failed because the quota was used up, the retry fails too and the sheets wait a whole day. The server backup at 08:30 UTC is after the reset in both seasons.
- How to reproduce: seen 2026-11-27: a hand-started «Server backup» at 21:14 UTC stopped with `8 RESOURCE_EXHAUSTED: Quota exceeded` after the scheduled backup (18:20 UTC) and a hand-started «Server tables» (21:13 UTC) had used the day's reads; a night run before 08:00 UTC on that quota fails the same way.
- Likelihood / impact: only on days the read quota runs out (heavy use, extra hand runs); the sheets and «PDF с номерами» are a day late. No data is lost. Fix: retry at 08:20 UTC all year (also after the summer reset), or move to the NAS (stage 5) where there is no quota.
- Status: open
- Found: 2026-11-27, ticket 4.11 (owner-approved hand runs of «Server backup» and «Server tables»).

## KI-15. NAS jobs before the switch-over write over the live files

- Where: `scripts/nas-jobs.mjs` (`tables`, `backup`, `catch-up`) run on the NAS while the Firebase copy is still the main one; R-JOB-1 of `docs/nas-requirements.md` does not say from when.
- What's wrong: a NAS loaded with a copy of the owner's data holds the same sheet and drawing file ids and uses the same service account, so `tables` writes the NAS data into the real management sheets, rack tables and «PDF с номерами». `backup` replaces the contents of the owner's Drive zip and adds folders to `polevoy-backups`, where the newest folder feeds the weekly starter pool and the GitHub Drive step, and daily folders push Firebase ones out of the 15 kept. The Firestore delta backup passes NAS copies over (ticket 4.12).
- How to reproduce: restore a backup into the NAS, change a point there, run `nas-jobs.mjs tables`: the management sheet shows the NAS value until the next night run on Firebase.
- Likelihood / impact: only if the jobs are switched on or tried before the switch-over with the real secrets; management sees wrong data, the off-site copies hold test data (Drive keeps earlier versions ≈ 30 days). Until then: do not run the jobs with the real data and Google key; for a trial use a separate `BACKUP_REPO` and a test project.
- Status: open
- Found: 2026-11-27, ticket 4.12 (reading the job code). 2026-11-28, ticket 4.14: the go / no-go list of `docs/nas-move-rehearsal.md` keeps the jobs off until the switch-over; how the two off-site copies are proven before it is for ticket 4.15. 2026-11-28, ticket 4.15: decided — real secrets only from the switch-over on, the off-site copies are proven that day (R-JOB-1, R-BAK-2 of the NAS document); the app's own Google buttons on a trial NAS copy with real data write over the live files too, the owner is told in `ПЕРЕЕЗД.md` § 7.1. Nothing in code prevents either; closes when the move is done.

## KI-16. The way back into Firebase against the free write limit

- Where: `runFirestoreRestore` in `scripts/server-backup-lib.mjs` (`scripts/server-restore.mjs`), R-MOVE-2 of `docs/nas-requirements.md`.
- What's wrong: the way back writes every document of the NAS export: 17,148 on the data of 2026-11-27, and history grows by thousands of entries a month. The Spark plan allows 20,000 writes a day. A run cut by the quota or the network starts again from the first document with `--force` and spends the same writes.
- How to reproduce: restore an export of more than 20,000 documents into a Spark database: the batch over the limit fails with `RESOURCE_EXHAUSTED`; the next day's run begins at 1 (not reproduced against Firebase).
- Likelihood / impact: only if the move is undone, more and more likely a few weeks after it; the return to Firebase takes more than a day or does not finish. Ways out: continue from a given position, write only what changed since the switch-over, or switch the project to the paid plan for that day.
- Status: open
- Found: 2026-11-28, ticket 4.14 (the rehearsal's export, counted).

## KI-17. A refused rename of `state.json` on Windows

- Where: `recordState` in `scripts/nas-jobs.mjs` (writes a temporary file and renames it over `state.json`), the test «state.json: …» of `tests/nas-jobs.test.js`.
- What's wrong: `fs.renameSync` over an existing file threw `EPERM` once in a full run of `npm test`; the next run passed. Probably another program (an antivirus) held the file for a moment.
- How to reproduce: not reproduced.
- Likelihood / impact: seen once, on the owner's PC only; the jobs run on Linux (the NAS), where a rename over an open file works.
- Status: open
- Found: 2026-11-28, ticket 4.14.

## KI-18. Lists that answer empty before the first read on a new device of the NAS copy

- Where: `listenPool` in `src/app/pb/backend.js` (answers from the local copy at once; Firestore waits for the server while online), `useDoorCfg` in `src/app/doorpool.js`.
- What's wrong: until the first read a shared list looks empty. The starter set no longer trusts that (ticket 4.14), but a door configuration chosen in that moment is written into the shared pool as new: an entry with the same composition gets the project's name, and a deleted one comes back.
- How to reproduce: a new device of the NAS copy on a slow connection: choose a door configuration before the pool arrives (not reproduced).
- Likelihood / impact: very rare (seconds, once per device); one pool entry changed.
- Status: open
- Found: 2026-11-28, ticket 4.14 (reading the code). Ticket 4.15: `ПЕРЕЕЗД.md` and the guide section «Домашний сервер» ask to wait until «⬇» is gone.

## KI-19. A resend after a lost answer can undo another phone's change

- Where: the sender `src/app/pb/sender.js` (no answer in 60 s or a cut connection → back-off and the same request again), `classify`/`settle` in `src/domain/pbqueue.js`, the write route `pb/pb_hooks/pm.pb.js` (no memory of requests already applied).
- What's wrong: spec 4 counts every op as idempotent. That holds for one phone, but a `deep` or `fields` upsert sent again after another phone wrote the same field puts this phone's older value back: the request had reached the server, its answer was lost, and the resend comes after the other phone's write.
- How to reproduce: phone A saves a point; the tunnel drops right after the server's commit, before the answer; within the back-off (2–60 s) phone B changes the same field of that point; A resends — the server holds A's older value again (not reproduced, found by reading the code).
- Likelihood / impact: very rare (a lost answer and a change of the same field by another phone within a minute); one field of one record goes back to the earlier value on every phone. Firestore's write stream does not resend acknowledged writes. Fix: a request id the route remembers for a while (answered 200 without writing on a repeat).
- Status: open
- Found: 2026-11-28, «Ревью 4» (code review, F4).

## KI-20. The administrator's pool inbox empty when the administrator is known late

- Where: `startPool` in `src/app/pool.js` (subscribes to the inbox only when `isPoolAdmin()` at start, as on Firestore), `listenInbox` in `src/app/pb/backend.js` (decides `isAdmin()` once).
- What's wrong: a new device waits at most 6 s for `/api/pm/admin`; if the answer comes later, the session starts without an administrator and the administrator's «Входящие пула» stay empty until the app is opened again.
- How to reproduce: a new device of the owner (no `pm.admin.pb` yet) on a slow connection where `/api/pm/admin` takes over 6 s (not reproduced).
- Likelihood / impact: rare, the administrator only, once per new device; nothing is lost, a restart shows the inbox. Older than stage 4 on Firestore (`resolveAdmin` there has the same 6 s).
- Status: open
- Found: 2026-11-28, «Ревью 4» (code review, F5).

## KI-21. The guide does not open without a project

- Where: `content()` in `src/app/shell.js`: the no-project screen is returned before the `guide` screen is looked at.
- What's wrong: a user with no project yet (a new helper before accepting an invitation, a new database) taps ☰ → «Руководства» → «📖 Как пользоваться приложением» and sees «У вас пока нет проекта» with «Создать проект» instead of the guide; the screen title says «Как пользоваться приложением».
- How to reproduce: `?mem=1` (no project), ☰ → «Руководства» → «📖 Как пользоваться приложением».
- Likelihood / impact: every user without a project; the guide is out of reach exactly when a newcomer needs it (the tour still works). Older than stage 4. Fix: answer the `guide` screen (its general and glossary parts) before the no-project check; the manuals part may need the project's context.
- Status: open
- Found: 2026-11-28, «Ревью 4» (seen while checking the guide in the browser pane).
