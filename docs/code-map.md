# Code map

What lives where. The list of the modules at the bottom is built from the first sentence of each module's header comment by `tools/code-map.mjs`; nobody edits it by hand. When you add, rename or change what a module holds, write its header comment, then run `node tools/code-map.mjs`; the code-map test (`tests/code-docs.test.js`) fails when the list is out of date or a module has no English header. During stage 1 modules still waiting for their ticket read `(no English header yet)`. Tests are found by name or with a search; each test module starts with a comment that says what it checks.

## Architecture

Vanilla JS PWA built by Vite (`vite-plugin-pwa`, service worker `autoUpdate`), no framework; UI built with the `h()` helper (`src/app/ui.js`). Firebase Auth + Firestore with persistent offline cache; MuPDF in a Web Worker for drawings; Google Drive and Sheets through user OAuth. Tests: `node:test`. Ticket 09 of stage 1 rewrites this section (storage and the repo, sync, offline, data paths, Google Drive and Sheets, server jobs, drawings).

- `src/main.js` — start: connection, sign-in in the background, shell. `src/edition.js` — which database to connect (ADR 0004). `src/firebase.js` — auth and Firestore init.
- `src/domain/` — pure logic, tested: statuses, composition, daily report, pulls, racks, import parsing, drawing fit, merge, sync decisions.
- `src/app/` — storage, sync, Google, shared pool, tour. **Repo** (`src/app/repo.js`): one interface, three implementations — Firestore; memory (`?mem=1`); memory with IndexedDB (on-device, `localdb.js`). All writes go through `repo.save(pid, ops)`, which stamps author and time and writes history. `src/app/store.js` — app state.
- `src/app/views/` — screens. `src/tohnit/` — drawing parsing (MuPDF in `worker.js`). `src/i18n/` — translations (ADR 0008).
- `scripts/` — server jobs run by GitHub Actions (backup, cleanup, sheets, starter pool) and i18n tools; `*-lib.mjs` hold their testable logic.

**Firestore layout.** `projects/{pid}` (fields `memberUids`, `invitedEmails`) with subcollections from `COLLECTIONS` in `repo.js` and `history`; `pool_types`, `pool_devices`, `pool_cables`, `pool_catalog`, `pool_manuals`, `pool_doorcfg`, `pool_inbox`; `allowed/{email}`, `users/{uid}/…` (personal prefs in `users/{uid}/prefs/main`, e.g. glossary, `tohnitLearned`), `meta/admin`. Rules: `firestore.rules`; `firestore.open.rules` is generated from it by `openRules`, a test compares them.

**Journal.** A row is point × work; ids `${entryId}_${pointId}` (from a report entry) and `edit_${pointId}_${workId}` (direct edit). A point task is closed by one row (`done` boolean); quantities reach the report total through `taskQty`; `entry.portQty: [{id, v}]` — own quantity per point.

## Not code (written by hand)

- `firestore.rules` — rules of the owner's database; `firestore.open.rules` — generated rules for everyone (wizard shows them).
- `vite.config.js` — base path (`VITE_BASE`), PWA manifest in three languages, build stamp.
- `index.html` — entry page; icons linked with `%BASE_URL%`.
- `public/` — icons (`*-v2.png`), `privacy.html`.
- `src/data/starter-pool.json` — starter reference lists for a new database, refreshed weekly by the pool bot.
- `src/i18n/src/*.json` — translation sources; `src/i18n/en.json`, `he.json` — built from them, in git.
- `src/style.css` — all styles. `src/tohnit/NotoSansHebrew-OFL.txt` — font license.
- `.github/workflows/` — `pages.yml` (deploy on push to `main`), `server-backup.yml` (every 2 days 08:30 UTC), `server-tables.yml` (00:00 UTC, retry 07:20 UTC), `export-pool.yml` (Mondays 09:00 UTC, commits the starter pool to `main`). All also run by hand; they extend their own schedule (GitHub disables schedules after 60 idle days).
- `tools/tohnit/` — Claude's drawing-parsing tool (Python `tohnit.py`, `catalog.json`, `SKILL.md` built by `build_skill.py`).
- `tools/code-map.mjs` — builds the module list below (`--check` only checks). `tools/ru-comments.mjs` — lists Russian comments in the code; `PENDING` holds the paths still waiting for their stage-1 ticket. `tools/same-code.mjs` — same-code check: only comments changed since a base commit and the built site is byte-identical (`--no-build`, `--expect <path>`).
- `.gitattributes` — keeps `firestore.rules` and `firestore.open.rules` LF on every checkout (KI-2).
- `README.md`, `ВОССТАНОВЛЕНИЕ.md` — for people, Russian.

## Modules (built)

<!-- code-map:start (built by tools/code-map.mjs from the header comments; do not edit by hand) -->
- `scripts/export-pool.mjs` — (no English header yet)
- `scripts/i18n-build.mjs` — (no English header yet)
- `scripts/i18n-extract.mjs` — (no English header yet)
- `scripts/server-backup-lib.mjs` — (no English header yet)
- `scripts/server-backup.mjs` — (no English header yet)
- `scripts/server-cleanup.mjs` — (no English header yet)
- `scripts/server-drive-backup.mjs` — (no English header yet)
- `scripts/server-restore.mjs` — (no English header yet)
- `scripts/server-tables-lib.mjs` — (no English header yet)
- `scripts/server-tables.mjs` — (no English header yet)
- `scripts/starter-from-backup.mjs` — (no English header yet)
- `scripts/tohnit-eval.mjs` — (no English header yet)
- `src/app/backup.js` — (no English header yet)
- `src/app/cfgfilter.js` — (no English header yet)
- `src/app/doorpool.js` — (no English header yet)
- `src/app/drawings.js` — (no English header yet)
- `src/app/drivefolders.js` — (no English header yet)
- `src/app/excel.js` — (no English header yet)
- `src/app/google.js` — (no English header yet)
- `src/app/keyboard.js` — (no English header yet)
- `src/app/localdb.js` — (no English header yet)
- `src/app/managers.js` — (no English header yet)
- `src/app/manuals.js` — (no English header yet)
- `src/app/migrate.js` — (no English header yet)
- `src/app/nodoubletap.js` — (no English header yet)
- `src/app/pool.js` — (no English header yet)
- `src/app/racksheet.js` — (no English header yet)
- `src/app/racktablecore.js` — (no English header yet)
- `src/app/repo.js` — (no English header yet)
- `src/app/scan.js` — (no English header yet)
- `src/app/setup.js` — (no English header yet)
- `src/app/shell.js` — (no English header yet)
- `src/app/start.js` — (no English header yet)
- `src/app/starter.js` — (no English header yet)
- `src/app/store.js` — (no English header yet)
- `src/app/theme.js` — (no English header yet)
- `src/app/tour/demo.js` — (no English header yet)
- `src/app/tour/engine.js` — (no English header yet)
- `src/app/tour/index.js` — (no English header yet)
- `src/app/tour/topics.js` — (no English header yet)
- `src/app/typegroups.js` — (no English header yet)
- `src/app/ui.js` — (no English header yet)
- `src/app/views/cablespick.js` — (no English header yet)
- `src/app/views/catalogview.js` — (no English header yet)
- `src/app/views/doh.js` — (no English header yet)
- `src/app/views/doorcfgview.js` — (no English header yet)
- `src/app/views/doorchips.js` — (no English header yet)
- `src/app/views/guide.js` — (no English header yet)
- `src/app/views/history.js` — (no English header yet)
- `src/app/views/import.js` — (no English header yet)
- `src/app/views/journal.js` — (no English header yet)
- `src/app/views/latinfix.js` — (no English header yet)
- `src/app/views/log.js` — (no English header yet)
- `src/app/views/managersfolder.js` — (no English header yet)
- `src/app/views/manualsview.js` — (no English header yet)
- `src/app/views/members.js` — (no English header yet)
- `src/app/views/month.js` — (no English header yet)
- `src/app/views/ownworks.js` — (no English header yet)
- `src/app/views/pdfpick.js` — (no English header yet)
- `src/app/views/planassign.js` — (no English header yet)
- `src/app/views/planlink.js` — (no English header yet)
- `src/app/views/planmodal.js` — (no English header yet)
- `src/app/views/plannumbers.js` — (no English header yet)
- `src/app/views/planpick.js` — (no English header yet)
- `src/app/views/planversion.js` — (no English header yet)
- `src/app/views/planview.js` — (no English header yet)
- `src/app/views/pointchooser.js` — (no English header yet)
- `src/app/views/pointmerge.js` — (no English header yet)
- `src/app/views/points.js` — (no English header yet)
- `src/app/views/pointsfile.js` — (no English header yet)
- `src/app/views/poolview.js` — (no English header yet)
- `src/app/views/project.js` — (no English header yet)
- `src/app/views/projects.js` — (no English header yet)
- `src/app/views/pullview.js` — (no English header yet)
- `src/app/views/racks.js` — (no English header yet)
- `src/app/views/racktable.js` — (no English header yet)
- `src/app/views/settings.js` — (no English header yet)
- `src/app/views/sheetslist.js` — (no English header yet)
- `src/app/views/shilutsettings.js` — (no English header yet)
- `src/app/views/tables.js` — (no English header yet)
- `src/app/views/todos.js` — (no English header yet)
- `src/app/views/tohnitview.js` — (no English header yet)
- `src/app/views/wizard.js` — (no English header yet)
- `src/domain/compose.js` — Composition of points from devices (the composite model): tasks, stages and statuses of a point computed from cables, devices and its type.
- `src/domain/context.js` — Builds the calculation context: lookup indexes over a project's data.
- `src/domain/deviceid.js` — Serial number and MAC address of a device: parses scanned barcodes and QR codes, normalises the values and finds duplicates.
- `src/domain/doh.js` — Text of the daily report («дох») in Russian, Hebrew and English (section 3.5, Appendix A).
- `src/domain/doorcfg.js` — Door configurations (new scheme): there is one point type, «Дверь», and the kind of door is set by its configuration.
- `src/domain/export.js` — Export of a whole project to Excel: sheets with values only (no formulas).
- `src/domain/fbcheck.js` — Checks of the own-database setup wizard: no sign-in, only public Google endpoints with the key from the settings (apiKey).
- `src/domain/generator.js` — Batch point generator (section 2.4): prefix + number (+ «-» and the next number for a pair) (+ suffix).
- `src/domain/index.js` — Re-exports the pure domain modules as one import point for the app. fbcheck.js, openrules.js and shilutsheet.js are not re-exported: callers import them directly.
- `src/domain/latin.js` — Cyrillic ↔ Latin in point names: look-alike letters, layout-independent search and quick-input shortcuts.
- `src/domain/managers.js` — Small shared helpers of the management sheets: file names, dates for Google Sheets and the data hash.
- `src/domain/manuals.js` — Manuals of the guide: photos of diagrams, PDFs, tables.
- `src/domain/merge.js` — Point merge: the same point recorded in two ways — a double «FC/B05-06» and singles «FC/B05» + «FC/B06» (the old drawing parsing split doubles into singles, the new one keeps them double).
- `src/domain/month.js` — Month report: the sum of all daily reports of a month (RU) and «דוח חודשי» in Hebrew (section 5.2 of the technical specification).
- `src/domain/openrules.js` — Derives the open-version Firestore rules from firestore.rules, so the two files never diverge.
- `src/domain/ownworks.js` — The own set of works on selected points (the point's or a group's «Изменить» window): what is required now and what to write into the point.
- `src/domain/plan.js` — Drawing plan, the part shared by the app and the server: status colour, the drawing's points for the «PDF с номерами», and a fingerprint to tell whether it changed.
- `src/domain/points.js` — Points: natural sorting, cables and metrage (sections 3.4, 3.8, Appendix A).
- `src/domain/pointsimport.js` — Adds points from a file (for example after a drawing is parsed): parses it, plans the import and builds the write operations.
- `src/domain/pool.js` — Shared pool (one database for everyone): point types, devices, cables and works; fingerprints, dependencies, inbox candidates and change lists.
- `src/domain/pull.js` — Cable pulls («Протяжки»): choose points on the plan → «до шкафа» (to the rack) → metres per point → checklist → finish (written into the daily report).
- `src/domain/rack.js` — Racks and port labels: panel ports of cat7 points, the rack plan, automatic port assignment, label colours and caption texts.
- `src/domain/remaining.js` — «What is left»: points where termination, installation or checking is not done yet (taking the point type's stages into account).
- `src/domain/report.js` — Management sheets: profiles (what to show) and building the sheets with values only, no formulas.
- `src/domain/seed.js` — Starting reference lists for a new project: work catalog, point types, cables, devices, units, culprits and delay reasons (section 4 of the functional description).
- `src/domain/sheetfit.js` — New drawing version («тохнит»): moving points from the old sheet to the new one when the new sheet has another size, a different crop or another scale.
- `src/domain/shilutsheet.js` — Rack table for Google Drive: a «rack plan» sheet for each rack (section) and a common sheet of port labels.
- `src/domain/status.js` — Point statuses, installation and completeness (sections 3.1–3.3, Appendix A): pointInfo and the cable helpers around it.
- `src/domain/sync.js` — Pure decisions about reading from and writing to Firestore, made without touching the network: delta or full read, retention of deleted records, rejected writes, the daily write limit.
- `src/domain/typelib.js` — Shared pool of point types: the standard types + «my pool» (types saved from any project; kept in the personal settings).
- `src/edition.js` — (no English header yet)
- `src/firebase.js` — (no English header yet)
- `src/i18n/index.js` — (no English header yet)
- `src/log.js` — (no English header yet)
- `src/main.js` — (no English header yet)
- `src/tohnit/engine.js` — (no English header yet)
- `src/tohnit/extract.js` — (no English header yet)
- `src/tohnit/hefont.js` — (no English header yet)
- `src/tohnit/icons.js` — (no English header yet)
- `src/tohnit/legendhe.js` — (no English header yet)
- `src/tohnit/linking.js` — (no English header yet)
- `src/tohnit/numbered.js` — (no English header yet)
- `src/tohnit/pattern.js` — (no English header yet)
- `src/tohnit/worker.js` — (no English header yet)
<!-- code-map:end -->
