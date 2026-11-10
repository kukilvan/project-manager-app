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
- `src/domain/compose.js` — (no English header yet)
- `src/domain/context.js` — (no English header yet)
- `src/domain/deviceid.js` — (no English header yet)
- `src/domain/doh.js` — (no English header yet)
- `src/domain/doorcfg.js` — (no English header yet)
- `src/domain/export.js` — (no English header yet)
- `src/domain/fbcheck.js` — (no English header yet)
- `src/domain/generator.js` — (no English header yet)
- `src/domain/index.js` — (no English header yet)
- `src/domain/latin.js` — (no English header yet)
- `src/domain/managers.js` — (no English header yet)
- `src/domain/manuals.js` — (no English header yet)
- `src/domain/merge.js` — (no English header yet)
- `src/domain/month.js` — (no English header yet)
- `src/domain/openrules.js` — (no English header yet)
- `src/domain/ownworks.js` — (no English header yet)
- `src/domain/plan.js` — (no English header yet)
- `src/domain/points.js` — (no English header yet)
- `src/domain/pointsimport.js` — (no English header yet)
- `src/domain/pool.js` — (no English header yet)
- `src/domain/pull.js` — (no English header yet)
- `src/domain/rack.js` — (no English header yet)
- `src/domain/remaining.js` — (no English header yet)
- `src/domain/report.js` — (no English header yet)
- `src/domain/seed.js` — (no English header yet)
- `src/domain/sheetfit.js` — (no English header yet)
- `src/domain/shilutsheet.js` — (no English header yet)
- `src/domain/status.js` — (no English header yet)
- `src/domain/sync.js` — (no English header yet)
- `src/domain/typelib.js` — (no English header yet)
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
