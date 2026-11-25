Status: in review

# Stage 4. PocketBase storage — description

## Goal

The owner's copy of the app will run on the home NAS: the site and PocketBase behind a Cloudflare Tunnel (ADR 0012–0014). Today the app can store data only in Firebase or on the device. This stage teaches the app to work with PocketBase as well as it works with Firebase, fully offline included. It also hands the NAS project everything the move needs, ready to run.

**Who does what** (owner, 2026-11-24; ADR 0019):
- **This repo** writes and keeps all code: the PocketBase storage in the app, the database description (migrations and hooks), the NAS build of the site, the server-job scripts that work with PocketBase, and the restore tool. It also keeps the NAS document (`docs/nas-requirements.md`). After the move it goes on developing the app, and every change reaches the NAS copy by itself.
- **The NAS project** does the whole move: it sets everything up on the NAS, moves the data from Firebase, runs the server jobs and backups, switches over, and keeps a way back. When the move is done, it sends this repo a report: what is where, and how to work from then on.

Firebase, on-device mode and GitHub Pages keep working for everyone else.

## What the owner will see at the end

Mockup (rough): `mockups/nas-copy.html`. On the NAS copy only three screens differ: sign-in, «Подключение к базе», and a notice shown when the server's database is older than the app. Everything else looks and works as with Firebase.

1. **The site on the NAS.** `https://<host>` opens the app. The NAS copy updates itself about 10 minutes after each push to `main`. The NAS project's updater does that by pulling the NAS build from the GitHub release `nas-build`. GitHub Pages updates as before.
2. **First start.** The owner installs the icon from `https://<host>` and taps «Войти через Google». There is no setup wizard, no connect link and no Firebase config, because the database is the site's own address. The login screen says «База: домашний сервер · <host>».
3. **Same as with Firebase.** Points, works, «Что осталось», daily and month reports, the plan with drawings from Drive, pulls, racks and labels, problems, days off, the shared pool and shared lists, members and invitations, history and rollback, backup to Drive, management sheets from the app. English names (`nameEn`) and the «Учитывать в цвете точки на плане» box (`planColour`, a project setting only) are kept.
4. **Offline.** Everything works without a network, as with Firebase. Changes wait on the phone (the «⬆ N» badge) and go out by themselves when the network is back. Changes made on other phones arrive live while online, and after a break they are caught up by reading what changed.
5. **«Подключение к базе»** on the NAS copy shows the server, its address, the administrator, the connection state, the number of changes waiting, and how to invite a colleague: invite them to the project, then they open the address and sign in. There is no Client ID field and no «Скопировать правила», because the server gets its rules with each update.
6. **A newer app on an older server.** If a new version of the app needs a newer database description than the server has, a notice says so and changes wait on the phone until the NAS project installs it. Reading and working go on as usual.
7. **Test data only during this stage.** The NAS copy holds test data. If the owner wants to try it at real size, it can also hold a copy of a backup, loaded through «Импорт данных» or the restore tool. Real work stays in Firebase until the NAS project switches over.
8. **A rehearsal of the move, done here.** The owner's newest full server backup is loaded with the restore tool into a PocketBase on the PC. The counts of every collection are compared with the backup, and the app is checked on that copy: points, reports, history, members, shared lists, problems. A written result of the rehearsal goes with the release: the steps, the times, what to compare. So the NAS project repeats proven steps on the NAS and meets no surprise in the data. The copy of the data stays in the scratchpad and never enters the repo (ADR 0005).
9. **Switch-over instructions from here**, in plain Russian, step by step:
   - for the owner and each helper: open the new address, install the icon again, sign in with Google, and what to do with the old icon;
   - a check after the move in the app: what to open and compare, what "wrong" looks like;
   - what to do if something is wrong: the way back to the Firebase copy, from the phone's side.

   The NAS project does its own part of that day: stopping, moving the data, switching over.
10. **For the NAS project:** a release with the site, the database description (migrations and hooks) and the server-job scripts, plus the updated NAS document. The scripts cover backup export to `polevoy-backups`, a copy to Google Drive, cleanup, the nightly sheets, and the restore tool, which loads a full server backup into PocketBase. The NAS project uses that tool to move the data, and it is also the way back from the copies kept outside the home.

## In scope

- A PocketBase storage behind the same repo interface (`src/app/repo.js`), next to Firestore, memory and on-device storage.
- The offline layer: a local copy on the phone, a write queue that survives restarts, sending in batches one after another with a retry on 429 and network errors, delta reads by PocketBase's `updated` field, and realtime with reconnect and a delta read after every reconnect.
- Sign-in with Google through PocketBase (both flows on an installed iPhone app), the token refreshed at every online start, members, invitations, administrator, allowed e-mails, personal settings.
- The database description as migration files, with hooks if needed: collections, indexes and API rules that copy today's Firestore rules (members are equal, ADR 0003; the shared-list split of ADR 0016; users created only by Google sign-in).
- The NAS build, moved here from stage 5 (owner's decision 2): a workflow that builds the site with `VITE_BASE=/` on every push to `main` and publishes it to the release `nas-build` together with the migrations, hooks and job scripts. The service worker stops answering `/api/` and `/_/`.
- A version number of the database description, so the app knows when the server is older and the NAS project knows when to install new migrations.
- The server-job scripts able to work with PocketBase: backup export in the `polevoy-import-1` format to `polevoy-backups`, a zip of it to the owner's Google Drive, cleanup, and the nightly sheets and «PDF с номерами». The NAS project runs them; it does not write them.
- The restore tool: a full server backup (Firebase today, PocketBase later) → PocketBase, with a dry run and a count check. Firebase user ids are mapped to PocketBase users by e-mail: members, administrator, history authors.
- The rehearsal of the move on the PC with a copy of the owner's backup, and its written result for the NAS project.
- The switch-over instructions for the phones and the check in the app after the move (Russian, for the owner and the helpers).
- KI-8: a listener refused by the server (`permission-denied`) shows the «rules out of date» toast. The PocketBase listeners get the same error path.
- `docs/nas-requirements.md` updated in this session (who does what, the NAS build in stage 4, the off-site copy, the answers to the NAS project) and again in the spec and the tickets that change it.

## Out of scope

- **The move itself** (NAS project): setting up the NAS, moving the data, running the jobs and backups, the parallel test, the switch-over, the way back to Firebase.
- **Project files on the NAS** (spreadsheets, PDFs that helpers download only through the app): a separate idea after the move (owner's decision 4). Drawings stay on Google Drive.
- Changes to the Firebase storage or to on-device mode, beyond KI-8.
- Offline conflicts: the last write still wins per record, as with Firestore. KI-5 and KI-6 stay as they are.
- Management sheets stay in Google (ADR 0009). Password sign-in stays off. No photos.
- This repo's stage 5 shrinks to taking in the NAS project's report after the move (`docs/project-spec.md`).

## Pulled-in known issues and review wishes

- **KI-8** (fixed in this stage): the sync code is touched here anyway, and the PocketBase listeners need the same error path.
- **Review 2:** the `users` rules come as a migration and stop sign-up through the records API, while Google sign-in still creates users. Try both on a real PocketBase with a real Google client. The token refresh at every start is not limited by `*:auth`.
- **Review 6:** shared lists with the split of ADR 0016: members create and update with `deleted: false`, only the administrator marks deleted, and every member can read them, so KI-8 does not come back in another form.
- **Review 7:** `nameEn` on works, point types, devices and cables (project and pool) and on shared problems.
- **Stage 8 / ADR 0018:** `planColour` on project catalog works, never in the pool. `pz.planView.<projectId>` stays on the device.
- **Stage 2 facts** (`docs/project-spec.md`, stage 4): the app's ids live in their own field; batches of at most 500 requests, one batch is one transaction; pages of 1,000; JSON values up to 1 MB; `updated` is the delta mark; realtime is cut after ≈ 125 s through the tunnel; the token lasts 30 days; batch chunks are sent one after another because of the rate limits.
- KI-3, KI-4 and KI-7 do not fit. KI-5 and KI-6 stay (above). Review 7's other two wishes and review 8's wish do not fit.

## Decisions taken with the owner

1. **The code is written here, the move is done by the NAS project** (owner, 2026-11-24: «весь перенос делает проект nas… этот проект остается для редактирования и дальнейшей работы над приложением»; on the follow-up question: «Код здесь, перенос — NAS»). One codebase, so later fixes reach the NAS by themselves. ADR 0019.
2. **The NAS build moves into stage 4** (owner, 2026-11-24). Reason: the owner checks this stage on the iPhone on the real NAS (Google sign-in from the installed icon, offline on site), and that needs the site at the NAS address. The site updater on the NAS is the NAS project's job (R-SITE-2).
3. **The copy outside the home, once the NAS is the main copy:** the daily JSON export to `polevoy-backups` and a zip on the owner's Google Drive, two places (owner, 2026-11-24). Until the switch-over Firebase is the main copy with its own backups, so the missing off-site copy on the NAS costs nothing. R-BAK-2 moves to stage 5 and must hold before the switch-over.
4. **Project files on the NAS:** a separate idea after the move (owner, 2026-11-24). This stage is already the riskiest. The NAS project's proposal (PocketBase protected file fields) is a good basis for it.
5. **After the move, the NAS project reports back** what is where and how to work from then on (owner, 2026-11-24). The answers file asks for it.
6. **Answers to the NAS project's questions of 2026-11-24:** `.scratch/04-pocketbase-storage/nas-answers.md`, sent by the owner together with the updated NAS document after «Коммит». The technical answers are agent decisions within the NAS document's limits: port 8090 on `0.0.0.0`; the tailnet among the superuser addresses; a home-only HTTPS name for the dashboard, under conditions; settings set by script; `cloudflared` updates; A12.
7. **The stage starts now.** Code is self-checked against a local PocketBase on the PC (Docker, as in stage 2), which does not wait for the NAS. The owner's phone checks need the NAS side: A1–A7, A13 and the site updater. A10 and A11 are needed before the switch-over, not before this stage.
8. **The move is rehearsed here, and the phone side of the switch-over is written here** (owner, 2026-11-25, «Да, добавь», after asking which way round is better). Reason: the riskiest part of the move is the correctness of the data and the app's behaviour, which only this repo knows. Running the move on the NAS needs the NAS's access and secrets, which only the NAS project has, so it stays there.

## Open questions for the spec

- **Collections.** One PocketBase collection per Firestore collection, or a few general ones: project records with `coll`, `key` and a JSON `data`; history; pool items with `kind`; inbox; admin and allowed e-mails; personal settings. The general shape needs one delta read and one realtime topic per project instead of 17. Check the rules on both.
- **Merging writes.** Firestore merges a write into the record (`merge: true`, and `mergeFields` for points). ADR 0018 relies on that: an older build that saves a work without `planColour` keeps the box. PocketBase replaces a JSON field whole. Choose between a hook that merges on the server (`pb_hooks`) and reading then writing on the phone, and test the older-build case.
- **The offline layer.** Reuse the on-device storage (`src/app/localdb.js`) as the local copy. Decide how the write queue is stored, how sending stays idempotent (upsert by the app's id), and how a batch rejected as a whole finds its one bad record and puts it into «⚠». Write down what `src/domain/sync.js` keeps (delta margin, the Saturday full read) and what goes (Firestore read and write counters, the «⬇ лимит» badge).
- **Realtime.** Use the cut time that A7 measures through the tunnel. Decide whether a keep-alive hook is needed.
- **Sign-in.** PocketBase's Google OAuth (popup with realtime, and the manual code flow with redirect on an iPhone PWA). Find out whether the same sign-in can return the Google token for Drive and Sheets, so one sign-in serves both.
- **Users.** PocketBase user ids differ from Firebase uids. The restore tool maps them by e-mail. Who becomes the administrator on an empty server: the first user, as now?
- **How the app knows it is the NAS copy:** a build flag in the NAS build, or a probe of `/api/health` at its own origin.
- **The database version.** Where the app reads the version the server has, what the app does while it is older (mockup, screen 3), and the order in which the NAS updater installs migrations and switches the site.
- **The release.** Asset names and contents (`nas-site.zip`, migrations and hooks, job scripts with their npm dependencies), the checksums and `nas-site.json`.
- **The job scripts.** A PocketBase reader beside the Firestore one, with the same output, so `server-tables-lib.mjs`, the backup format and the starter-pool job stay as they are. Decide how secrets come in (files, R-JOB-1).
- **PocketBase version.** 0.40.6 is still the latest release (checked 2026-11-24). Confirm or move it, and re-check the rate limits of R-PB-6 against real batches.
- **Tests.** Which parts are automated against a real PocketBase (a local binary with its checksum, also in CI?) and which are walked by hand.
- **The rehearsal.** Where the copy of the backup lives (scratchpad), what is compared (counts per collection, a sample of records, the app's screens), and what the written result for the NAS project holds.
- **The switch-over instructions.** Where they live (a Russian file for the owner and the helpers, and a line in the in-app guide), and how the old Firebase icon is retired without losing changes still waiting on a phone.
- **Ticket split.** About 20–22 sessions in all (was 16), because the NAS build, the job scripts, the restore tool, the rehearsal and the switch-over instructions are now in this stage.
