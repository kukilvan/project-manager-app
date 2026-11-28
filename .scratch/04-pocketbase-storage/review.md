Status: in review

# Stage 4. PocketBase storage — review

## What was reviewed

- Commits `3b9760f..f49f283` (from «Slicing 4: accepted» to «✅ Checked by owner: ticket 4.15»), 43 commits: tickets 01–15 of `.scratch/04-pocketbase-storage/issues/`, the quick fixes inside the range (NAS Google sign-in `d58903a`, pulled points brown `9f706f7`) and the NAS document versions. 129 files, about 11,000 lines added.
- Code: the write route and its rules (`src/domain/pbwrite.js`, `pb/pb_hooks/pm.pb.js`, `pm/pbstore.js`, migration 1); the app on the NAS copy (`src/app/pbstart.js`, `src/app/pb/*`: sign-in, local copy, write queue, sender, reader, backend, screens, Drive); the pure rules (`pbqueue.js`, `pbread.js`, `pbauth.js`, `pbstate.js`, `pbrestore.js`, `googleauth.js`); the changed Firebase modules (`repo.js`, `shared.js`, `starter.js`, `store.js`, `shell.js`, `google.js`, `main.js`, `edition.js`); the jobs (`job-source.mjs`, `fs-source.mjs`, `pb-source.mjs`, `server-backup-lib.mjs`, `server-tables-lib.mjs`, `nas-jobs.mjs`, `nas-git.mjs`, `drive-backup-lib.mjs`, `zip-lib.mjs`, `nas-pack.mjs`); the restore tool and the way back (`pb-restore.mjs`, `server-restore.mjs`); `pages.yml`; the tests.
- Against `spec.md` (§§ 2–11 item by item, the edge cases of § 10, the texts), the tickets, `docs/coding-standards.md` (rules 1–15) and `CONTEXT.md`. Two passes: standards (with the code-review skill at effort xhigh on the whole range: 5 findings, F1–F5), then spec. The move itself was not part of the stage: on 2026-11-28 the NAS project restored the owner's backup `2026-11-28_0801` into the NAS for the parallel test and postponed the switch-over (`nas-report-4.md`).

## Tests

- Start: 598/598 pass (Windows, Node 24, the 58 server tests against PocketBase 0.42.3 included). `npm run build` and `npm run build:nas` pass; `node tools/code-map.mjs --check` (169 modules), `node scripts/pb-hooks-build.mjs --check`, `node tools/ru-comments.mjs` clean; no file of `dist/` contains `PB_CONNECT`; no key-like value or work data in the range (the fixtures are synthetic: `a@x.com`, `tester.a@example.test`).
- End: 603/603 (5 tests added: F1 twice, F2, F3, F3 in the pure module; 4 extended), both builds and the same checks pass.

## Verified by running

- The NAS build on a local PocketBase 0.42.3 (`node tools/pb-dev.mjs up --empty --serve dist-nas`), the browser pane at 420 px, password sign-in:
  - **F1:** user b (allowed, not the administrator) marks the shared door configuration «Дверь РВ» deleted: at once `deleted: true` and «⬆»; the route answers 422 «only the administrator marks deleted»; a second later the phone shows the server's version again (no `deleted`, the same `updated`), «⚠ 1». Before the fix the deleted mark stayed on that phone for good. Also seen on the earlier data folder: a project creation refused («not in the allowed list») left the phone after the re-read.
  - **F3:** the server stopped («no connection»), user b presses «Принять» on the invitation: the project is listed at once as «Ревью-проверка · Корпус Р» with «⬆ 1» (before: no name); the server started again — the acceptance goes out, the server's version replaces the local one.
  - **KI-10:** ☰ → «📖 Как пользоваться приложением» on the NAS build: no section «Где хранятся данные», «Проект» names the card «Как подключить коллегу», «Домашний сервер» has «Подробнее» with the three new lines. The GitHub Pages build (`?mem=1&memPlan=1`): the guide as before (the Firebase section and the connect link, no «Домашний сервер»).
  - The console showed only the expected refusals (422), the server's stop and restart, and 401 after the data folder was replaced.
- The tests against a real PocketBase cover F1 end to end (the reader brings the server version back after a refusal), F3 (named at once before the server answers) and F2 (the backup with no clone and GitHub down still uploads the Drive zip; GitHub back → pushed).
- **Not verifiable here:** the real NAS, the tunnel and Google; the iPhone; two people at once on the NAS; the jobs with the real secrets. These are the phone check list below.

## Findings

- **F1** — On the NAS copy a change the server refuses stayed on the phone for good, as if saved: the copy cleared only `_pending`, and the reader skips a server record whose `updated` equals the phone's, so no delta read, Saturday full read or «🔄 Перечитать всё с сервера» brought the server's version back; the refused history entries stayed in «Откат записей». `src/app/pb/localcopy.js`, `src/app/pb/reader.js`. **Fix now:** `refusedRepair` (`src/domain/pbqueue.js`, pure, tested) says what a refused item undoes; `copy.refuse(seq)` clears the server version mark of its documents (those no later item touches), drops the full-read stamps of their scopes and its history entries; the backend uses it and `pbstart.js` reads again at once after any refusal. Firestore does the same by itself (its cache reverts a refused write).
- **F2** — The NAS backup job stopped before the export when the clone of `polevoy-backups` could not be made (no or wrong token, GitHub down on the first run, a broken clone that cannot be cloned again), so the Drive copy was skipped too, although the runner promises it. `scripts/nas-jobs.mjs`. **Fix now:** without a clone the export goes into `PM_STATE/backups-local`, the Drive zip is made from it, the run fails with the GitHub reason and skips the cleanup. Matters on the switch-over day: a token without access to `polevoy-backups` would have left both off-site copies missing.
- **F3** — An invitation accepted on the NAS copy showed a project without a name until the server answered (offline: until online): the invitee cannot read the project, so the local document held only what the acceptance wrote. `src/app/pb/backend.js`. **Fix now:** `withInvitationNames` (`src/domain/pbread.js`) gives such a project its invitation's name and object until the server's version comes; nothing extra is sent.
- **F4** — A request whose answer was lost is sent again and can put an older value back over another phone's change of the same field made in between (spec 4 counts ops as idempotent; that holds for one phone). **Defer KI-19:** very rare (a lost answer and the same field changed elsewhere within a minute), one field goes back; the fix (request ids the route remembers) is a design change of the route.
- **F5** — The administrator's pool inbox stays empty for the run when `/api/pm/admin` answered after the 6 s start wait (a new device). Older than stage 4 (the same on Firestore). **Defer KI-20:** rare, nothing lost, a restart shows it.
- **F6** — KI-10 (Firebase texts on the NAS copy), left to this review by ticket 15. **Fix now:** on the NAS build the guide drops «Где хранятся данные», «Проект» gets its own lines (`nasMore`: the card «Как подключить коллегу» instead of the connect link), «Домашний сервер» gets «Подробнее» (where the data is, a new colleague, Drive access); the toasts after a refused shared-list write or read point at «⚠» and the administrator. Seven new strings in English and Hebrew (`src/i18n/src/21-nas.json`). KI-10 → fixed.
- **F7** — Without a project the guide does not open (☰ → «📖 Как пользоваться приложением» shows «У вас пока нет проекта»). Older than stage 4, seen while checking F6. **Defer KI-21:** a newcomer before the first project; the tour still works; the fix is a small change of `content()` in `shell.js`, outside this stage.

No fix-round finding.

Checked and left as they are:
- The route's rules equal `firestore.rules` row by row (project create, member and non-creator member, invitee accept and decline, subcollections, pool kinds, inbox, allowed, prefs); every app collection's write rules are `null` (rule 14); the hook copy is generated and fresh (rule 15); a refused op rolls back the whole request.
- The Pages build has no PocketBase (no `PB_CONNECT`), `?mem=1` and the Firebase paths behave as before; `deltaListen`'s new options are passed by every caller.
- The night sheets on PocketBase write the same fields as the Firestore transaction (`itemPatches` for drawings and tables, the whole `tables` list for a project without one, managers and rack table as merges of scalar fields).
- The Firestore delta backup skips NAS exports (`source`), the cleanup on PocketBase runs only after the push, the Drive zip sets the UTF-8 name flag (Cyrillic file names survive unzipping).
- The restore tool: plan, write, count check and `--verify` passed on the NAS with the owner's data on 2026-11-28 (`nas-report-4.md`).
- On the move day a phone that kept the trial icon gets 401 (its user was deleted with the trial data), signs in again as a new user id and its old queue stays unsent: `ПЕРЕЕЗД.md` § 1 item 5 removes the trial icon first.

## The phone check list (spec § 13: every «Needs the NAS» line of the tickets)

Already done on the NAS copy (owner, 2026-11-27): Google sign-in from the installed iPhone icon (A14, ticket 04 after the quick fix); drawings from Drive and the management sheet (ticket 09). The NAS project: release installer, A9, A15, `nas-check` 11 pass (ticket 03); the restore of the real data (ticket 13, 14).

**Part 1 — now, during the parallel test** (iPhone, the NAS icon; nothing is written in it and no Google button that writes is pressed, `ПЕРЕЕЗД.md` § 7.1; the data is the copy of 2026-11-28 10:01, so what was recorded in the old icon after that is missing — expected):
1. Open the NAS icon. If «Вход истёк» shows (the NAS replaced the users when it loaded the copy), press «Войти снова» and sign in with Google. The projects appear; wait until «⬇» is gone.
2. `ПЕРЕЕЗД.md` § 3, items 1–7: «Подключение к базе», the project list, points per project, the last report, «🕘 Откат записей» (names, no rollback), «👥 Участники», the shared lists — against the old icon, keeping in mind the records made after 10:01.
3. ☰ → «👥 Участники»: the card «Как подключить коллегу»; «💬 WhatsApp» opens WhatsApp with the text and the address (close it without sending).
4. ☰ → «📖 Как пользоваться приложением»: the section «Домашний сервер» with «Подробнее»; no section «Где хранятся данные»; «Проект: создать, пригласить коллег» → «Подробнее» names «Как подключить коллегу».
5. Close the icon completely and open it again: still signed in. Airplane mode on, open the icon: the projects and points are there; «Подключение к базе» says «нет связи». Airplane mode off: «на связи».
6. «🗺 План»: each drawing opens (Google may ask for Drive access — allow).

**Part 2 — after the switch-over** (stage 5; recording is allowed then):
1. Create a project «Тест NAS» with two points; close and open the icon: they are there. Airplane mode, add three points: «⬆ 3»; airplane mode off: «⬆» goes within a minute; «Подключение к базе» → «Ждут отправки» 0. Then archive the test project.
2. Two devices at once (the phone and the PC browser at the NAS address, or a helper's phone): a point added on one shows on the other within seconds; a phone left offline overnight gets the other's changes after the network is back.
3. When a helper joins: invite by Google e-mail, the helper opens the address, signs in, accepts the banner and sees the project; a delay reason added on one phone shows on the other; as the administrator, «Общий пул» and its inbox show what the helper's project brought.
4. A management sheet from the NAS address («Таблицы для руководства»): the file fills; the next morning the night run has updated it.
5. Both off-site copies every day: a new folder in `polevoy-backups` and today's date on the Drive file «Автокопия данных (обновляется каждые 2 дня).zip» (the NAS project watches `state.json` too).
6. Wrong in any step: «⚠», a red «⬇ ошибка», a project or points missing, «Вход истёк» right after signing in — a screenshot to this project's session.

Still pending from the Firebase side (unchanged by the postponed move): the scheduled GitHub «Server backup» of 2026-11-29 08:30 UTC runs the new Drive step code (tickets 4.11, 4.12) — green expected.

## Wishes for later stages

- Stage 5 (the move, done by the NAS project): the day goes by `ПЕРЕЕЗД.md` § 7.2 from step 1 again (a new «Server backup», the trial icon removed); this repo then takes in the R-MOVE-3 report, runs part 2 above with the owner and closes KI-15. KI-16 (the way back against Firebase's write limit) matters only if the move is undone; settle it before the first weeks of history make it larger.
- Every push to `main` now reaches the NAS within about two minutes, and from the switch-over on the NAS holds the only live data: a ticket that touches the NAS build or the hooks keeps the NAS self-check of `docs/workflow.md`, and a change of the hooks bumps the schema with a migration test.
- The reader's decisions that are still in `src/app/pb/reader.js` (when a server record replaces the local one, what a full read removes) are where F1 hid. If that code grows, move the rest into `src/domain/pbread.js` with tests, as `refusedRepair` and `withInvitationNames` are now.
