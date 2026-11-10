# Code map

What lives where. The list of the modules at the bottom is built from the first sentence of each module's header comment by `tools/code-map.mjs` (stage 1 creates it); nobody edits it by hand. When you add, rename or change what a module holds, write its header comment, then run the code-map command (`CLAUDE.md`, "Run"); the code-map test fails when the list is out of date or a module has no header. Tests are found by name or with a search; each test module starts with a comment that says what it checks.

## Architecture

Vanilla JS PWA built by Vite (`vite-plugin-pwa`, service worker `autoUpdate`), no framework; UI built with the `h()` helper (`src/app/ui.js`). Firebase Auth + Firestore with persistent offline cache; MuPDF in a Web Worker for drawings; Google Drive and Sheets through user OAuth. Tests: `node:test`. Stage 1 expands this section (data paths, sync, offline, server jobs).

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
- `README.md`, `ВОССТАНОВЛЕНИЕ.md` — for people, Russian.

## Modules (built)

<!-- code-map:start (built by tools/code-map.mjs from the header comments; do not edit by hand) -->
<!-- code-map:end -->
