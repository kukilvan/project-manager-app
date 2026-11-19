# Project Manager (Менеджер проектов) — project spec

The product as it stands at adoption (2026-11-10) and its remaining stages. Once a stage's description is approved, it overrides that stage's section here; a session that changes the plan of later stages updates this file. The original Russian hand-off is in git: `HANDOFF.md` at commit `44ac16d`.

## Vision

The owner is a field technician installing low-voltage systems in Israel (access control, alarms, cameras, controllers, Wi-Fi, cabling). They work for an employer who finds the sites and pays the salary, and plan to open their own business. The app replaced notes on the iPhone and later AppSheet over the Google Sheet «Полевой журнал» (AppSheet is left alone; the owner decides its fate).

Goal: keep everything about a site in one place on the phone, fully offline, and produce the daily report and the management sheets automatically. **Everything must work offline end to end**: sites often have no signal; the network is only for syncing a copy of the data.

## Users and access

- **The owner** — main user, iPhone (home-screen icon) and a Windows PC.
- **The owner's helper and colleagues**, some Uzbek-speaking, who know neither Hebrew nor the trade terms: hence the in-app guide, the tour and the glossary screen. They sign in with their own Google accounts into a shared project. All members are equal; every change shows who and when, and everything can be rolled back (ADR 0003).
- **Management and the customer** never open the app: they see only Hebrew Google Sheets the app builds (ADR 0009).
- Since 1.1 the site is shared: any installer can connect their own Firebase or work in on-device mode (ADR 0004). In practice the owner is almost the only user.
- Current working project: «Мегасон Бэйт Шемеш» (~750 points, racks FA, FC and others); before it Mega Or (Modiin).

## Core scenarios

1. **Points of a site.** Create a project; add points by batch generator, from a parsed drawing or by import; each point has type, rack, floor, cables, length, panel ports, serial and MAC (scanner). Statuses come from the point's composition and the work journal.
2. **Daily report (дох).** Record the day's works on points; the app builds the report in Russian with Hebrew text; the owner sends it to the employer on WhatsApp every day. Equal works of a day are summed; time in hours and minutes.
3. **Cable pulls and meters.** Pick points on the plan → «до шкафа» → meters per point → checklist; pairs on one mark get one meter.
4. **Racks and labels.** Panel layout per rack, port labels (шилют), a Google Sheet «תכנון ארונות ושילוט».
5. **Plan.** The customer's drawing (тохнит) with points colored by status: filters, layers, works on selected points, «➕ Точка на плане», «📄 PDF с номерами», a new drawing version moves points over.
6. **Management sheets.** Hebrew Google Sheets without cable lengths, by profile, refreshed nightly by the server.
7. **Month report.** Sum of the month's daily reports; the employer bills the customer by it.

## Features

Done (versions as `release-*` branches, `docs/rollback.md`):
- **1.0** (until 2026-10-23, named «Полевой журнал»): Firebase sync (Google sign-in, Firestore with offline cache), AppSheet import; history, soft delete, rollback of a record and of a user's changes over a period; members. Points, point card, bulk actions, «Что осталось», readiness bars per rack. Serial/MAC scanner (Code128, QR, DataMatrix), Excel export, delays by culprit, light theme, glossary. Pending-writes indicator, backup to Drive, server auto-backup every 2 days, project archive and permanent delete after a year, Firestore read economy. Management sheets with profiles. «Point from devices» model (ADR 0006). Drawing parsing in the app without AI (ADR 0007). Plan, door configurations, shared pool of reference lists, pulls with meters, racks and labels.
- **1.1** (2026-10-23) «one site for all» (ADR 0004): no Firebase config in code, setup wizard or on-device mode, connect link `?connect=…`, first signed-in user is admin (`meta/admin`), starter pool refreshed weekly from the auto-backup, Google Drive without Firebase via the shared OAuth client, renamed to «Менеджер проектов».
- **1.2** (2026-10-24): UI in Russian, English and Hebrew (ADR 0008).
- **After 1.2** (version stays `1.2.0`; the build is shown in «Журнал событий»): pull «Предыдущая» and select-all; points without cable need no meters; new icon (`*-v2.png`), no double-tap zoom; equal works summed in the daily report; fast start without waiting for the network; offline changes visible at once (ADR 0010); «🔄 Новая версия чертежа»; «🔀 Одинаковые точки в разном виде»; cables by point label; own set of works on points (`ownWorks`).

Later (no stage yet): growing the drawing caption catalog as new drawings come (quick fixes); photos on points — only if the owner brings a concrete scenario.

Never (owner's decisions): copy yesterday's day, favourite work sets, «report not filled» reminder; routes and lengths on the plan, racks on the plan; Firebase Blaze, Firebase Hosting, a native app and an Apple developer account; own LiDAR apartment scanning (OpenPlan3D Capture exists); the manual «cat7×1» field; password sign-in. Technically failed: reading MAC from a photo (Hikvision labels print MAC as small text only) — MAC is typed.

## Interface

PWA, phone first (420 px), also the browser on Windows. UI in Russian (source), English and Hebrew (RTL); dark theme by default, light and system. In-app guide (`src/app/views/guide.js`), tour, glossary screen. The daily report, management sheets and reference names (`nameHe`) carry Hebrew.

## Running and data

- Site: GitHub Pages `https://kukilvan.github.io/project-manager-app/`, built from `main` by `.github/workflows/pages.yml` (tests → build → deploy). Service worker with `autoUpdate`.
- Data: each user's own Firebase project (owner: `polevoy-zhurnal`, Spark plan, ADR 0002) or IndexedDB on the device. Customer drawings on Google Drive with a copy on the device.
- Server jobs (GitHub Actions): auto-backup every 2 days to the private repo `kukilvan/polevoy-backups` and a zip on Google Drive, then permanent delete of year-old soft-deleted data; management sheets nightly; starter pool weekly. Secrets: GitHub Actions secrets (names in `PROJECT_CONTEXT.md`).
- Restore everything elsewhere: `ВОССТАНОВЛЕНИЕ.md`.

## Quality

- Automated: `npm test` (node:test) — pure logic of `src/domain` and server scripts; the deploy runs them and stops on failure.
- Session self-check: build and the browser at phone width in test mode `?mem=1` (`docs/workflow.md`).
- The owner checks on their iPhone and PC with real data: offline and weak network, start speed, daily report sums and Hebrew, plan and drawings, Drive and Sheets, nothing lost after point operations. Firestore, Google sign-in, Drive and the iPhone count as unverified until the owner checks.
- Privacy: the repo is public — no work data, drawings or keys in it (ADR 0005); each user's data stays in their own Firebase.

## Stages

Adoption (2026-11-10) moved the project onto this workflow; numbering starts here. Quick fixes («Правка: …») run between any steps. Stage numbers are names, not the order of work: stage 6 runs before stage 4 (the NAS document already names stages 4 and 5, so they keep their numbers).

### Stage 1. Code documentation

Description approved: `.scratch/01-code-docs/description.md` (it overrides this section).

- Goal: every part of the code is described so a session finds what it needs without reading the code through; the owner asked to document how everything works and what connects to what.
- The owner sees at the end: the site works exactly as before; every module starts with an English header comment — what it holds, what it talks to; no Russian comments left in the code and config files (Russian strings stay); `docs/code-map.md` has the architecture (storage, sync, offline, data paths, server jobs) and the module list built by a script; all tests green on Windows too. The owner checks once, after the stage review.
- Contains: `tools/code-map.mjs` and its test (behaviour: `docs/formats.md`, "Code map"); English header comments for all modules in `src/` and `scripts/` and for test modules; translation of all Russian comments (`src/`, `scripts/`, `tests/`, `tools/tohnit/`, `firestore.rules`, `vite.config.js`, workflows); a check that comment-only changes leave the built site unchanged; architecture section; fix KI-1 and KI-2; the Run line of `CLAUDE.md` for the code map.
- Sessions (est.): ≈ 15.

### Stage 2. What the app needs from the NAS

Description: `.scratch/02-nas-requirements/description.md` approved (it overrides this section). Site and PocketBase both on the NAS, reached through a Cloudflare Tunnel to the owner's own domain (ADR 0013).

- Goal: the owner sets up a home NAS (UGREEN DXP2800, 2×3 TB HDD mirror, 500 GB NVMe) in a separate project; that project needs to know what this app requires to move there.
- The owner sees at the end: a document for the NAS project (`docs/nas-requirements.md`): PocketBase (container, storage, ports), hosting the site on the NAS, HTTPS access from the phone outside home (Cloudflare Tunnel, own domain), backups, the server jobs now in GitHub Actions, Google sign-in and OAuth origins for the new address, the data volume.
- Contains: research of what PocketBase needs for this app's data and auth; the list of external dependencies; open questions for the NAS project.
- Output: `docs/nas-requirements.md` (the NAS document: requirements R-…, acceptance checks A1–A14) and `tools/nas-check.mjs` (the NAS check: the automated part of the acceptance checks, no credentials). Decisions: ADR 0014.
- Sessions (est.): ≈ 6.

### Stage 3. Management sheets

Description approved: `.scratch/03-management-sheets/description.md` (it overrides this section).

- Goal: the owner's remarks on the look of the management sheets (collected in the stage description), and a list of old files on Google Drive to delete — AppSheet-era template sheets and empty debug sheets. The owner deletes them; sessions never delete from Drive.
- The owner sees at the end: the sheets as asked; the list of old files.
- Sessions (est.): ≈ 8.

### Stage 4. PocketBase storage

- Goal: the app can work with PocketBase on the owner's NAS as a fourth storage implementation behind the same repo interface; Firebase and on-device mode keep working for everyone else (ADR 0012).
- The owner sees at the end: the app connected to a PocketBase instance works like with Firebase, including fully offline with later sync, history and rollback, members.
- Contains: storage implementation, sign-in, an offline cache and write queue (PocketBase has no Firestore-like offline persistence — the main risk), management sheets still in Google.
- PocketBase facts checked in stage 2 (PocketBase 0.40.6, `.scratch/02-nas-requirements/spec.md` § 1): the app's ids live in their own field, not as PocketBase ids where they can be names (a catalog id is a name; PocketBase ids reject `/`, space and `.`); batch writes stay ≤ 500 requests and one batch is one transaction; list reads page by 1,000; a JSON value is limited to 1 MB per field (raise per field if needed); the server-set `updated` field is the delta-read mark; an idle realtime stream is cut (through the tunnel, NAS document R-NET-5), so the app reconnects and runs a delta read after every reconnect (a keep-alive hook is optional); the auth token is refreshed at every online start (lifetime: R-AUTH-2); both Google OAuth flows (popup with realtime, and the manual code flow with redirect) are tried on an installed iPhone PWA, and the redirect URIs of R-GOOG-2 cover both; the `users` create rule lets only Google sign-in create users — with password sign-in off the records API still creates users under the default rule (checked in «Ревью 2»).
- Data added by stage 6 that the storage must carry (`.scratch/06-field-improvements/spec.md`): `days.off`, `offReason`, `offText`; top-level shared lists `pool_delayReasons`, `pool_culprits`, `pool_problems` (problems with nested `descs`, soft delete by a `deleted` mark, any member writes, only the administrator deletes — ADR 0016); the project subcollection `problemMarks` (ADR 0017); `projects.sharedLists`. The old per-project `delayReasons` and `culprits` stay read-only.
- Rate limits (NAS document R-PB-6) count every request inside a batch and limit batch calls per second: today `commit` sends all chunks at once, so a mass edit of ≈ 2,500 points would get 429 for some chunks. Chunks go one after another, with a retry on 429.
- Starts when the NAS acceptance checks A1–A7 and A10–A13 pass (`docs/nas-requirements.md`) and the owner says the NAS is reliable.
- Sessions (est.): ≈ 16.

### Stage 5. Move to the NAS

- Goal: a full copy of the app and the owner's data runs on the NAS; the owner tests it in parallel for several days and, if all is well, makes it the main one.
- The owner sees at the end: the site and PocketBase on the NAS with their data migrated from Firestore; server jobs (backup, sheets) working for it; a way back to Firebase.
- Contains (ADR 0014): a workflow that builds the NAS variant with `VITE_BASE=/` on every push to `main` and publishes it to the release `nas-build`; `/api/` and `/_/` in the service worker's `navigateFallbackDenylist`; the agent container (site updater, backup export, cleanup, nightly sheets) with its secrets on the NAS; the NAS document updated in the same sessions.
- After the move the owner checks on the NAS, once its build shows the new commit (ADR 0011 and `docs/workflow.md` updated then).
- Sessions (est.): ≈ 10.

### Stage 6. Field improvements

Runs now, before stage 4, while the NAS is being checked; the owner finishes the whole stage, then «Описание 4» follows (when the NAS checks pass).

- Goal: the owner's wishes from field work, filed 2026-11-17 as ideas 001–005, in this order; description: `.scratch/06-field-improvements/description.md`.
- The owner sees at the end: a day off with a reason, blocked on a date with a working day in another project (idea 001); one shared list of delay reasons and one of culprits for all projects (idea 002 plus the owner's addition; ADR 0016, which replaced ADR 0015); problems on points — reference list «Проблемы» with point types per problem, marking one by one and in bulk, red on the plan and in the management sheet, «Решено» with history, an open-problems counter on «Проект» (idea 003); plan colours by the share of stages done, with dots for done stages and the stage filter with shilut on the plan (idea 004); everything in the English and Hebrew UI translated, and a check that stops untranslated strings (idea 005).
- Idea 006 (added 2026-11-19, after slicing; ticket 08 `.scratch/06-field-improvements/issues/08-plan-colours-works.md`): plan colour by works after the pull instead of stages — pink `#E99AC4` for a pulled point, an even yellow → green gradient for the works after it, circles per cable for an unfinished pull; phone plan frames ×0.75; the focus frame goes away after an action on the point.
- New data (day-off fields, shared pool collections, problem marks) must be carried by stage 4's PocketBase storage.
- Sessions (est.): ≈ 15.
