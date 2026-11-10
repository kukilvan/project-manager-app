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
- `src/app/backup.js` — Backs a project up to Google Drive: one JSON file per project and day, in the format the «Импорт данных» screen reads (`polevoy-import-1`).
- `src/app/cfgfilter.js` — Filter of points by door configuration for lists and the plan: «Без запирания», «Без конфигурации» and each configuration with its point count.
- `src/app/doorpool.js` — The shared pool of door configurations (pool_doorcfg): a new kind of door gets there by itself (any member writes it), only the pool administrator deletes.
- `src/app/drawings.js` — Project drawings (PDF plans) for the plan in the app: a file on Google Drive plus a copy on the device, so the plan opens offline.
- `src/app/drivefolders.js` — The app's folders on Google Drive: «Менеджер проектов» → the project folder → «Чертежи», «Резервные копии»; sheets go into the project folder.
- `src/app/excel.js` — Exports a project to .xlsx and saves it on the phone (on iPhone through the «Поделиться» → «Сохранить в Файлы» menu).
- `src/app/google.js` — Access to Google Drive and Sheets on the user's behalf (on a button press, a separate consent is needed): tokens, sign-in flows and the Drive/Sheets api object.
- `src/app/keyboard.js` — Keeps input windows visible above the iPhone on-screen keyboard, which covers the page instead of shrinking it.
- `src/app/localdb.js` — On-device storage for the «на этом телефоне» mode: every document lives in IndexedDB (`pm-local`), a working copy in memory.
- `src/app/managers.js` — Management sheets: the app itself creates a Google Sheet (no template) and writes the ready values into it.
- `src/app/manuals.js` — Manuals for the guide (diagrams, wiring photos, tables, PDFs), shared by all projects.
- `src/app/migrate.js` — Moves projects from the «на устройстве» mode into the Firebase database (after setting up one's own database or joining by invitation).
- `src/app/nodoubletap.js` — Stops a double tap from zooming the screen on iPhone (app opened from the home-screen icon).
- `src/app/pool.js` — The shared pool inside the app: listens to the pool (all users) and to the inbox (pool administrator only), and sends the administrator what is new or changed in the current project.
- `src/app/racksheet.js` — Formats and writes the rack sheets into a Google Sheet (values go straight into cells, no links between sheets).
- `src/app/racktablecore.js` — The «תכנון ארונות ושילוט» management sheet (rack plans + labels): the part shared by the app and the night server job.
- `src/app/repo.js` — Project data repository: one interface over a Firestore backend and an in-memory backend, plus the shared layer that stamps author and time, writes history and soft-deletes.
- `src/app/scan.js` — Barcode and QR scanner for a serial number / MAC: the live camera or a photo from the gallery.
- `src/app/setup.js` — The «своя база Firebase» wizard: one step at a time, with «Открыть страницу» and «Проверить» buttons; the draft is kept on the device.
- `src/app/shell.js` — The shell: top bar, bottom bar of 5 tabs, the menu, screen switching, and the status badges (waiting to send, waiting to read, rejected by the server).
- `src/app/start.js` — First launch of a clean app: welcome → home-screen icon (on a phone) → «Как будете работать»: on this device (no setup) or one's own Firebase database (the wizard), or joining by an invitation link.
- `src/app/starter.js` — Seeds a new database (open edition) with the starter set of the shared pool on the administrator's first sign-in.
- `src/app/store.js` — Application state: the user's projects, the data of the current project and the calculation context.
- `src/app/theme.js` — Colour theme: dark (default), light or follow the phone; applies it to the page and remembers the choice.
- `src/app/tour/demo.js` — Demo project for the tour, kept in a separate in-memory store: real data is not touched and nothing goes to the server.
- `src/app/tour/engine.js` — Tour engine: a dimmed screen with a «window» around the target element, a caption and a «Далее» button.
- `src/app/tour/index.js` — App tour: starting it (whole or by topics), the offer at the first project, and the short guide for those who create a project.
- `src/app/tour/topics.js` — Tour topics: the step lists (title, text, target element) for each topic, built for the current UI by `buildTopics`.
- `src/app/typegroups.js` — Shared groups of point types (e.g. «Дверь» holds every door type with its own devices and cables) for type filters.
- `src/app/ui.js` — Small interface helpers: element creation (`h`), popup windows and forms, confirmation dialog, toast notifications.
- `src/app/views/cablespick.js` — Cables picker for a point, shown next to the type chooser: the type's default cables appear at once and their kind and count can be changed.
- `src/app/views/catalogview.js` — (no English header yet)
- `src/app/views/doh.js` — (no English header yet)
- `src/app/views/doorcfgview.js` — Doors: the door configuration chooser (pinned / build / shared pool), a form field and the «Конфигурации дверей» tab.
- `src/app/views/doorchips.js` — Door configuration name as chips (locking filled, other parts in a colored outline, count «×2» on top, cables in grey at the end) and the device color picker.
- `src/app/views/guide.js` — (no English header yet)
- `src/app/views/history.js` — (no English header yet)
- `src/app/views/import.js` — (no English header yet)
- `src/app/views/journal.js` — (no English header yet)
- `src/app/views/latinfix.js` — Quick input in Latin letters: the shortcut list («тв = TV») kept in user preferences, and the settings dialog that edits it.
- `src/app/views/log.js` — (no English header yet)
- `src/app/views/managersfolder.js` — (no English header yet)
- `src/app/views/manualsview.js` — (no English header yet)
- `src/app/views/members.js` — (no English header yet)
- `src/app/views/month.js` — (no English header yet)
- `src/app/views/ownworks.js` — Form field «Работы на точках» of the «Изменить» dialog (one point or a group, from «Точки», the plan or a rack): the works required now (from type, devices, cables) and an own set on top of them.
- `src/app/views/pdfpick.js` — (no English header yet)
- `src/app/views/planassign.js` — (no English header yet)
- `src/app/views/planlink.js` — (no English header yet)
- `src/app/views/planmodal.js` — (no English header yet)
- `src/app/views/plannumbers.js` — (no English header yet)
- `src/app/views/planpick.js` — (no English header yet)
- `src/app/views/planversion.js` — (no English header yet)
- `src/app/views/planview.js` — (no English header yet)
- `src/app/views/pointchooser.js` — Dialog to choose a point of the project: search, type, rack and «only without a place on the drawing»; on choice it calls onPick(point, { rename }).
- `src/app/views/pointmerge.js` — Dialogs «🔀 Одинаковые точки» (point merge) and «🔌 Кабели не по номеру»: merge a point recorded two ways, and fix cable counts that do not follow the label.
- `src/app/views/points.js` — Points screens: the point form, the batch generator, the length input, the point card with history, the «Что осталось» list, mass actions and the «Точки» tab.
- `src/app/views/pointsfile.js` — Preview and adding of points from drawing parsing (JSON format polevoy-points-1).
- `src/app/views/poolview.js` — (no English header yet)
- `src/app/views/project.js` — (no English header yet)
- `src/app/views/projects.js` — (no English header yet)
- `src/app/views/pullview.js` — Pulls «🧵 Протяжки»: pick points on the plan → «До шкафа» → meters per point (own numeric keypad) → checklist → «Завершить» (the report form).
- `src/app/views/racks.js` — Racks and shilut screen «🗄 Шкафы и шильют»: the rack plan — which cat7 points sit in which panels (U) and ports (1–24).
- `src/app/views/racktable.js` — Rack table «📊 Таблица для шильюта»: card, dialog and generator of one Google Sheets file «תכנון ארונות ושילוט» per project — a plan sheet per rack plus a common shilut (port labels) sheet.
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
- `src/edition.js` — Connection to the database, the work mode (Firebase or on this device) and the pool administrator.
- `src/firebase.js` — Firebase connection: Google sign-in and a Firestore database with a persistent offline cache.
- `src/i18n/index.js` — Interface languages: Russian (the source), English, Hebrew (right to left), and the translation layer over the screen.
- `src/log.js` — Event log for debugging: kept in memory and in localStorage (`pz.log.v1`, the last 300 lines).
- `src/main.js` — App entry point: starts the language, theme and device helpers, decides what to show (the first-launch screens, the on-device mode or the Firebase sign-in) and starts the shell.
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
