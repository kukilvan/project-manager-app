# Code map

What lives where. The architecture and "Not code" parts are written by hand (at most 10,000 bytes together); the module list at the bottom is built from the first sentence of each module's header comment by `tools/code-map.mjs`, and nobody edits it by hand. When you add, rename or change what a module holds, write its header comment, then run `node tools/code-map.mjs`; `tests/code-docs.test.js` fails when the list is stale or a module has no English header. Tests are found by name; each test module starts with a comment that says what it checks.

## Architecture

Vanilla JS PWA, no framework, built by Vite; screens are built with `h()` of `src/app/ui.js`. Pure logic lives in `src/domain/` (no DOM, no network, tested with `node:test`); everything that touches storage, Google or the screen lives in `src/app/`; screens in `src/app/views/`. ADRs in `docs/adr/` hold the reasons.

**Start.** `src/main.js` reads the connection and mode from `src/edition.js` (`pm.connection`, `pm.mode`; no Firebase config in the code, ADR 0004), then builds the repo on one of three backends: Firestore (`src/firebase.js`, Google sign-in), on-device (`src/app/localdb.js`) or memory (`?mem=1`). A first launch goes through `start.js` and the database wizard `setup.js`; `migrate.js` moves on-device projects into Firebase later. `src/app/shell.js` draws the bars, the menu and the badges and switches screens; `src/i18n/index.js` lays English or Hebrew over the Russian texts on the screen (ADR 0008).

**Storage and the repo.** `src/app/repo.js` is the one door to data. `createRepo(backend, user)` wraps a backend: every write goes through `save(pid, ops)`, which fixes Latin labels, stamps author and time, adds a `history` entry per record and commits the batch; delete is soft (`deleted`, `deletedAt`), and a rollback is itself a history entry. Backends: `createFirestoreBackend` and `createMemoryBackend` (`localdb.js` gives it a `persist` hook into IndexedDB `pm-local`). `src/app/store.js` subscribes to the current project's collections and rebuilds `state.ctx` with `buildContext` (`src/domain/context.js`); screens read `state` and write through `getRepo().save`. Statuses are never stored: `src/domain/status.js` and `compose.js` compute them from points, devices, cables and journal rows.

**Sync and delta reads.** Firestore runs with a persistent multi-tab cache (`src/firebase.js`). The UI listens to the cache; a second query (`updatedAtServer` newer than the last mark minus 10 minutes) only fills the cache with changes, so offline writes show at once (ADR 0010). `deltaListen` in `repo.js` keeps the marks in `pz.sync.*` and the daily counters `pz.reads`, `pz.writes` (limits: 50,000 reads in `repo.js`, 20,000 writes in `sync.js`); `src/domain/sync.js` decides delta or full read (full once a week from Saturday, or when the cache looks incomplete) and what a rejected write means (`pz.rejected`, the «⚠» badge). Unsent writes carry `_pending` and feed the shell's waiting badge. Spark plan, so quotas matter (ADR 0002).

**Offline.** The service worker (`vite-plugin-pwa`, `autoUpdate`, `vite.config.js`) precaches the app; MuPDF wasm is cached on first use. Data comes from the Firestore cache (or IndexedDB in on-device mode); a cached sign-in (`pm.authCached`) starts without the network. Drawings keep a device copy in IndexedDB `pz-drawings` (`src/app/drawings.js`), so the plan opens offline. Google actions need the network; an action cut off by the iPhone sign-in redirect resumes from `pz_gsync_pending` (`shell.js`).

**Data paths.** Firestore: `projects/{pid}` (`memberUids`, `invitedEmails`, `drawings`, `rackTable`…) with subcollections from `COLLECTIONS` in `repo.js` plus `history`; the shared pool `pool_types`, `pool_devices`, `pool_cables`, `pool_catalog`, `pool_manuals`, `pool_doorcfg` and the administrator's inbox `pool_inbox` (`src/app/pool.js`, `src/domain/pool.js`); `allowed/{email}`, `users/{uid}/prefs/main` (personal settings: glossary, `tohnitLearned`, patch-panel models), `meta/admin`, `meta/probe` (wizard check). Rules: `firestore.rules`; `firestore.open.rules` is generated from it by `src/domain/openrules.js`, and a test compares them. Journal: a row is point × work (its ids: `CONTEXT.md`, «Journal row»); one row closes a point task (`done`), quantities reach the report through `taskQty`, `entry.portQty: [{id, v}]` is the own quantity per point. Device keys: `PROJECT_CONTEXT.md`, Environment.

**Google Drive and Sheets.** User OAuth on a button press (`src/app/google.js`): a database with its own Client ID gets full Drive and Sheets scopes through Firebase re-auth; the rest get `drive.file` with the shared client. Token in `pz_gtoken`; `realApi` is the Drive/Sheets object the rest uses. `drivefolders.js` finds the app's folders by `appProperties` («Менеджер проектов» → project → «Чертежи», «Резервные копии»). On top: drawings (`drawings.js`), manuals (`manuals.js`), the daily JSON backup (`backup.js`, format `polevoy-import-1`), management sheets (`managers.js` with `src/domain/report.js`, ADR 0009), the rack table (`racktablecore.js`, `racksheet.js`, `src/domain/shilutsheet.js`), the «Для руководства» folder (`views/managersfolder.js`). Sheets get values only, no formulas.

**Server jobs.** GitHub Actions run Node scripts with the `FIREBASE_SERVICE_ACCOUNT` secret (firebase-admin; Drive and Sheets by REST as the service account). `server-tables.yml` → `scripts/server-tables.mjs`: every night refreshes the management sheets, rack tables and «PDF с номерами» with auto-update on, reusing `managers.js`, `racktablecore.js` and `src/tohnit/numbered.js` through `server-tables-lib.mjs`. `server-backup.yml` → `server-backup.mjs` (all projects into the private repo `polevoy-backups`), then `server-cleanup.mjs` (hard-deletes what was soft-deleted over a year ago, by `src/domain/sync.js`), then `server-drive-backup.mjs` (a zip to the owner's Drive). `export-pool.yml` → `starter-from-backup.mjs`: the starter pool `src/data/starter-pool.json` from the latest backup, committed to `main`. `server-restore.mjs` is run by hand. `*-lib.mjs` hold the testable parts.

**Drawings.** A drawing is a PDF on Drive plus its device copy; the project lists them in `project.drawings`, and a point sits on one by `pos.sheet` and coordinates. All PDF work runs in a Web Worker (`src/tohnit/worker.js`, MuPDF, ADR 0007): `extract.js` reads the text layer, icons and layers; `engine.js` turns captions into points by the caption catalog (`pattern.js`, `views/catalogview.js`), a port of `tools/tohnit/tohnit.py`; `icons.js` finds unnumbered icons; `linking.js` matches points to captions; `numbered.js` and `legendhe.js` build «PDF с номерами». Screens: `views/planmodal.js` (the plan), `planview.js` (canvas, tiles from the worker's `crop`), `tohnitview.js`, `planlink.js`, `planpick.js`, `planversion.js` with `src/domain/sheetfit.js`, `plannumbers.js`. `src/domain/plan.js` is the part shared with the server.

## Not code (written by hand)

- `firestore.rules` — rules of the owner's database; `firestore.open.rules` — generated rules for everyone (the wizard shows them).
- `vite.config.js` — base path (`VITE_BASE`), PWA manifest in three languages, build stamp. `package.json`, `package-lock.json` — dependencies and npm scripts.
- `index.html` — entry page; icons linked with `%BASE_URL%`. `public/` — icons (`*-v2.png`), `privacy.html`.
- `src/data/starter-pool.json` — starter reference lists for a new database, refreshed weekly by the pool bot.
- `src/i18n/src/*.json` — translation sources; `src/i18n/en.json`, `he.json` — built from them, in git.
- `src/style.css` — all styles. `src/tohnit/NotoSansHebrew-OFL.txt` — font license.
- `.github/workflows/` — `pages.yml` (deploy on push to `main`), `server-backup.yml` (every 2 days 08:30 UTC), `server-tables.yml` (00:00 UTC, retry 07:20 UTC), `export-pool.yml` (Mondays 09:00 UTC). All run by hand too; `server-backup.yml` and `server-tables.yml` re-enable their own schedule (GitHub disables schedules after 60 idle days).
- `tools/tohnit/` — Claude's drawing-parsing tool (`tohnit.py`, `catalog.json`; `SKILL.md` built by `build_skill.py` from `skill_head.md` and `library.md`; `PROMPT.md` — the starting prompt of a parsing chat; `ОПИСАНИЕ_ДЛЯ_ИИ.md` — the tool described for another AI, Russian).
- `tools/code-map.mjs` — builds the module list below (`--check` only checks). `tools/ru-comments.mjs` — lists Russian comments in the code; exit 1 if there is one. `tools/same-code.mjs` — same-code check: only comments changed since a base commit and the built site is byte-identical (`--no-build`, `--expect <path>`). `tools/nas-check.mjs` — NAS check: probes a NAS address and reports PASS, FAIL or SKIP for the acceptance checks A1–A9 of `docs/nas-requirements.md`; no credentials, changes nothing (`--quick`, `--hold <s>`).
- `tests/` — `node:test` suites. `.gitattributes` — keeps both rules files LF on every checkout (KI-2). `.gitignore`.
- `README.md`, `ВОССТАНОВЛЕНИЕ.md` — for people, Russian. Docs for sessions: `docs/workflow.md`, "Documents".

## Modules (built)

<!-- code-map:start (built by tools/code-map.mjs from the header comments; do not edit by hand) -->
- `scripts/export-pool.mjs` — Starter set for the open edition: a copy of the shared pool (types, devices, cables, works, door configurations, shared lists) without service fields.
- `scripts/i18n-build.mjs` — Builds the translation dictionaries: src/i18n/src/*.json ({ "<Russian text>": ["English", "Hebrew"] }) → src/i18n/en.json and he.json.
- `scripts/i18n-extract.mjs` — Collects every Russian UI string (strings and `…${x}…` templates in src) for the translation dictionaries and the coverage test.
- `scripts/server-backup-lib.mjs` — Server backup logic: reading projects from Firestore, writing the backup folders and planning a restore.
- `scripts/server-backup.mjs` — Server backup run by GitHub Actions every 2 days: copies all projects from Firestore into a folder that the workflow then commits to the private backup repo.
- `scripts/server-cleanup.mjs` — Server cleanup: permanently deletes what has been marked deleted for over a year (records, whole projects) and change-history entries older than a year.
- `scripts/server-drive-backup.mjs` — Backup copy outside GitHub: zips the newest auto-backup folder and uploads it to the owner's Google Drive.
- `scripts/server-restore.mjs` — Restores a database from a server backup (a folder like 2026-10-23_0830 from the polevoy-backups repo) into an EMPTY Firebase project.
- `scripts/server-tables-lib.mjs` — Server-side logic of the nightly auto-update of the management sheets, the rack table and the «PDF с номерами» drawings (GitHub Actions).
- `scripts/server-tables.mjs` — Nightly server run (GitHub Actions) that refreshes the management sheets, the rack table and the «PDF с номерами» drawings of every active project.
- `scripts/starter-from-backup.mjs` — Starter set built from the latest server backup (the database is not read, so no Firestore daily quota is spent).
- `scripts/tohnit-eval.mjs` — Checks the app's drawing parsing (JS) against reference data.
- `src/app/backup.js` — Backs a project up to Google Drive: one JSON file per project and day, in the format the «Импорт данных» screen reads (`polevoy-import-1`).
- `src/app/cfgfilter.js` — Filter of points by door configuration for lists and the plan: «Без запирания», «Без конфигурации» and each configuration with its point count.
- `src/app/doorpool.js` — The shared pool of door configurations (pool_doorcfg): a new kind of door gets there by itself (any member writes it), only the pool administrator deletes.
- `src/app/drawings.js` — Project drawings (PDF plans) for the plan in the app: a file on Google Drive plus a copy on the device, so the plan opens offline.
- `src/app/drivefolders.js` — The app's folders on Google Drive: «Менеджер проектов» → the project folder → «Чертежи», «Резервные копии»; sheets go into the project folder.
- `src/app/excel.js` — Exports a project to .xlsx and saves it on the phone (on iPhone through the «Поделиться» → «Сохранить в Файлы» menu).
- `src/app/google.js` — Access to Google Drive and Sheets on the user's behalf (on a button press, a separate consent is needed): tokens, sign-in flows and the Drive/Sheets api object.
- `src/app/keyboard.js` — Keeps input windows visible above the iPhone on-screen keyboard, which covers the page instead of shrinking it.
- `src/app/localdb.js` — On-device storage for the «на этом телефоне» mode: every document lives in IndexedDB (`pm-local`), a working copy in memory.
- `src/app/managers.js` — Management sheets: the app itself creates a Google Sheet (no template) and writes the ready values and the update stamp into it.
- `src/app/manuals.js` — Manuals for the guide (diagrams, wiring photos, tables, PDFs), shared by all projects.
- `src/app/migrate.js` — Moves projects from the «на устройстве» mode into the Firebase database (after setting up one's own database or joining by invitation).
- `src/app/nodoubletap.js` — Stops a double tap from zooming the screen on iPhone (app opened from the home-screen icon).
- `src/app/pool.js` — The shared pool inside the app: listens to the pool (all users) and to the inbox (pool administrator only), and sends the administrator what is new or changed in the current project.
- `src/app/racksheet.js` — Formats and writes the rack sheets into a Google Sheet (values go straight into cells, no links between sheets).
- `src/app/racktablecore.js` — The «תכנון ארונות ושילוט» management sheet (rack plans + labels): the part shared by the app and the night server job.
- `src/app/repo.js` — Project data repository: one interface over a Firestore backend and an in-memory backend, plus the shared layer that stamps author and time, writes history and soft-deletes.
- `src/app/scan.js` — Barcode and QR scanner for a serial number / MAC: the live camera or a photo from the gallery.
- `src/app/setup.js` — The «своя база Firebase» wizard: one step at a time, with «Открыть страницу» and «Проверить» buttons; the draft is kept on the device.
- `src/app/shared.js` — The shared lists inside the app (ADR 0016): listens to pool_delayReasons, pool_culprits and pool_problems, merges the projects' old lists into the pool once and seeds empty lists with their defaults.
- `src/app/shell.js` — The shell: top bar, bottom bar of 5 tabs, the menu, screen switching, and the status badges (waiting to send, waiting to read, rejected by the server).
- `src/app/start.js` — First launch of a clean app: welcome → home-screen icon (on a phone) → «Как будете работать»: on this device (no setup) or one's own Firebase database (the wizard), or joining by an invitation link.
- `src/app/starter.js` — Seeds a new database (open edition) with the starter set of the shared pool on the administrator's first sign-in.
- `src/app/store.js` — Application state: the user's projects, the data of the current project and the calculation context.
- `src/app/theme.js` — Color theme: dark (default), light or follow the phone; applies it to the page and remembers the choice.
- `src/app/tour/demo.js` — Demo project for the tour, kept in a separate in-memory store: real data is not touched and nothing goes to the server.
- `src/app/tour/engine.js` — Tour engine: a dimmed screen with a «window» around the target element, a caption and a «Далее» button.
- `src/app/tour/index.js` — App tour: starting it (whole or by topics), the offer at the first project, and the short guide for those who create a project.
- `src/app/tour/topics.js` — Tour topics: the step lists (title, text, target element) for each topic, built for the current UI by `buildTopics`.
- `src/app/typegroups.js` — Shared groups of point types (e.g. «Дверь» holds every door type with its own devices and cables) for type filters.
- `src/app/ui.js` — Small interface helpers: element creation (`h`), popup windows and forms, confirmation and message windows, toast notifications.
- `src/app/views/cablespick.js` — Cables picker for a point, shown next to the type chooser: the type's default cables appear at once and their kind and count can be changed.
- `src/app/views/catalogview.js` — «🧩 Каталог подписей» screen: the caption rules the drawing parser uses to recognise points, with an editor for the user's own rules.
- `src/app/views/doh.js` — «Отчёты» tab: working days, the entries of a day, the daily report text in Russian and Hebrew, copying, and the link to the iPhone Shortcuts command «Doh».
- `src/app/views/doorcfgview.js` — Doors: the door configuration chooser (pinned / build / shared pool), a form field and the «Конфигурации дверей» tab.
- `src/app/views/doorchips.js` — Door configuration name as chips (locking filled, other parts in a colored outline, count «×2» on top, cables in grey at the end) and the device color picker.
- `src/app/views/guide.js` — The in-app guide «Как пользоваться приложением»: sections from the design and the project to serial numbers and MAC, plus the separate «Шпаргалка» and «Словарик» parts.
- `src/app/views/history.js` — Change history screen: who changed what and when, with undo of one record and undo of all a member's edits in a period.
- `src/app/views/import.js` — One-off import of a project's data from a polevoy-import-1 file (prepared from the AppSheet table) and its screen (opened by shell.js).
- `src/app/views/journal.js` — «История» tab: journal rows (point × work, from which statuses are computed) and the «Правка» form that adds or removes rows without a daily report entry.
- `src/app/views/latinfix.js` — Quick input in Latin letters: the shortcut list («тв = TV») kept in user preferences, and the settings dialog that edits it.
- `src/app/views/log.js` — Event log screen: build and device diagnostics plus the lines of the on-device event log, with copy and clear.
- `src/app/views/managersfolder.js` — Management folder «Для руководства»: a view-only shared Google Drive folder of a project with its management sheets and numbered drawings.
- `src/app/views/manualsview.js` — «Инструкции» card in the guide: a list by section, adding (title, section, file) and viewing photos and PDFs inside the app.
- `src/app/views/members.js` — Project members: names, invitations and removal (offering to undo the removed member's edits), plus the connect-link card.
- `src/app/views/month.js` — «Месяц» screen: workdays of one month across all projects (date and place as in the daily report), with copy and send.
- `src/app/views/ownworks.js` — Form field «Работы на точках» of the «Изменить» dialog (one point or a group, from «Точки», the plan or a rack): the works required now (from type, devices, cables) and an own set on top of them.
- `src/app/views/pdfpick.js` — Modal picker for a drawing PDF: from this project, from Google Drive (the «Чертежи» folders of the app's projects) or from the device.
- `src/app/views/planassign.js` — «🗺 Распределить на плане»: a modal where the marks of a drawing whose rack is unclear (one number exists in several racks) are assigned to racks.
- `src/app/views/planlink.js` — «🔗 Связать точки с чертежом»: parses a drawing by the caption catalog so that project points with the same labels get a place on the drawing.
- `src/app/views/planmodal.js` — «🗺 План»: the project's drawing with points colored by progress (how many of their stages are done); tapping a point opens its card, and «📍 На чертеже» on a point card opens the plan at that point.
- `src/app/views/plannumbers.js` — Builds the «📄 PDF с номерами» file of a drawing: the plan as the app shows it, with frames in the plan's progress colors, non-overlapping captions, hidden marks in white and a legend.
- `src/app/views/planpick.js` — «🔎 Значки без номеров»: a modal where icons on the drawing plan are found, numbered and turned into points.
- `src/app/views/planversion.js` — «🔄 Новая версия чертежа»: moves the points of a drawing onto its updated version, with recalculated coordinates.
- `src/app/views/planview.js` — Viewer of one drawing sheet on a canvas: dragging, zooming by pinch, wheel or buttons, and a sharp tile re-rendered when zoomed in.
- `src/app/views/pointchooser.js` — Dialog to choose a point of the project: search, type, rack and «only without a place on the drawing»; on choice it calls onPick(point, { rename }).
- `src/app/views/pointmerge.js` — Dialogs «🔀 Одинаковые точки» (point merge) and «🔌 Кабели не по номеру»: merge a point recorded two ways, and fix cable counts that do not follow the label.
- `src/app/views/points.js` — Points screens: the point form, the batch generator, the length input, the point card with history, the «Что осталось» list, mass actions and the «Точки» tab.
- `src/app/views/pointsfile.js` — Preview and adding of points from drawing parsing (JSON format polevoy-points-1).
- `src/app/views/poolview.js` — «🗂 Общий пул» browser inside every reference list (point types, devices, cables, works).
- `src/app/views/problems.js` — Problems on points (ADR 0017): the «Проблемы» reference screen and its form, the «⚠ Проблема» and «✔ Решено» forms for selected points, and the «Проблемы» block of the point card.
- `src/app/views/project.js` — «Проект» tab: the card of the current project, the readiness bars per rack and the Google Drive and Sheets actions of the project.
- `src/app/views/projects.js` — All projects list plus the create and edit project forms.
- `src/app/views/pullview.js` — Pulls «🧵 Протяжки»: pick points on the plan → «До шкафа» → meters per point (own numeric keypad) → checklist → «Завершить» (the report form).
- `src/app/views/racks.js` — Racks and shilut screen «🗄 Шкафы и шильют»: the rack plan — which cat7 points sit in which panels (U) and ports (1–24).
- `src/app/views/racktable.js` — Rack table «📊 Таблица для шильюта»: card, dialog and generator of one Google Sheets file «תכנון ארונות ושילוט» per project — a plan sheet per rack plus a common shilut (port labels) sheet.
- `src/app/views/settings.js` — «Настройки» tab: the project's reference lists (dropdown lists) with their item forms, and the entries to the management, rack and sheets screens.
- `src/app/views/sheetslist.js` — «Таблицы»: the user's own Google Sheets from Drive under their own names — a list in the app, tapping opens the sheet.
- `src/app/views/shilutsettings.js` — Shilut settings: patch-panel models (shared by all the user's projects), colors per point type, rack names and label templates.
- `src/app/views/tables.js` — «Таблицы для руководства» screen: the profiles of management sheets (which racks, types, statuses and columns go into a Google Sheet) and their edit form.
- `src/app/views/todos.js` — «Дела» tab: the project's to-do checklist and reference notes with a full-screen note editor.
- `src/app/views/tohnitview.js` — «📐 Из чертежа»: parses a drawing (PDF) right in the app, without AI, by the caption catalog, and turns the captions into points.
- `src/app/views/wizard.js` — New project wizard: the required steps from the project data to the «Создать проект» summary, then optional steps after the project is created.
- `src/domain/compose.js` — Composition of points from devices (the composite model): tasks, stages and statuses of a point computed from cables, devices and its type.
- `src/domain/context.js` — Builds the calculation context: lookup indexes over a project's data.
- `src/domain/dayoff.js` — Day off: the ready reasons, the text of a day off in Russian, Hebrew and English, and the check against a day of another project on the same date.
- `src/domain/deviceid.js` — Serial number and MAC address of a device: parses scanned barcodes and QR codes, normalises the values and finds duplicates.
- `src/domain/doh.js` — Text of the daily report («дох») in Russian, Hebrew and English (section 3.5, Appendix A).
- `src/domain/doorcfg.js` — Door configurations (new scheme): there is one point type, «Дверь», and the kind of door is set by its configuration.
- `src/domain/export.js` — Export of a whole project to Excel: sheets with values only (no formulas).
- `src/domain/fbcheck.js` — Checks of the own-database setup wizard: no sign-in, only public Google endpoints with the key from the settings (apiKey).
- `src/domain/generator.js` — Batch point generator (section 2.4): prefix + number (+ «-» and the next number for a pair) (+ suffix).
- `src/domain/index.js` — Re-exports the pure domain modules as one import point for the app.
- `src/domain/latin.js` — Cyrillic ↔ Latin in point names: look-alike letters, layout-independent search and quick-input shortcuts.
- `src/domain/managers.js` — Small shared helpers of the management sheets: file names, dates for Google Sheets, the update stamp text and the data hash.
- `src/domain/manuals.js` — Manuals of the guide: photos of diagrams, PDFs, tables.
- `src/domain/merge.js` — Point merge: the same point recorded in two ways — a double «FC/B05-06» and singles «FC/B05» + «FC/B06» (the old drawing parsing split doubles into singles, the new one keeps them double).
- `src/domain/month.js` — Month report: the sum of all daily reports of a month (RU) and «דוח חודשי» in Hebrew (section 5.2 of the technical specification).
- `src/domain/openrules.js` — Derives the open-version Firestore rules from firestore.rules, so the two files never diverge.
- `src/domain/ownworks.js` — The own set of works on selected points (the point's or a group's «Изменить» window): what is required now and what to write into the point.
- `src/domain/plan.js` — Drawing plan, the part shared by the app and the server: the progress color of a point (planColor), the plan legend, the drawing's points for the «PDF с номерами» and its fingerprint.
- `src/domain/points.js` — Points: natural sorting, cables and metrage (sections 3.4, 3.8, Appendix A).
- `src/domain/pointsimport.js` — Adds points from a file (for example after a drawing is parsed): parses it, plans the import and builds the write operations.
- `src/domain/pool.js` — Shared pool (one database for everyone): point types, devices, cables and works; fingerprints, dependencies, inbox candidates and change lists.
- `src/domain/problems.js` — Problems on points (ADR 0017): which shared problems fit a point, the open and solved marks of a point, the write operations for marking and solving, labels and counts.
- `src/domain/pull.js` — Cable pulls («Протяжки»): choose points on the plan → «до шкафа» (to the rack) → meters per point → checklist → finish (written into the daily report).
- `src/domain/rack.js` — Racks and port labels: panel ports of cat7 points, the rack plan, automatic port assignment, label colors and caption texts.
- `src/domain/remaining.js` — «What is left»: the stages and works a point still lacks (taking the point type's stages into account), readiness by rack.
- `src/domain/report.js` — Management sheets: profiles (what to show) and building the sheets (colour legend, update stamp, point rows, the last rack sheet «Итоги по шкафам») with values only, no formulas.
- `src/domain/seed.js` — Starting reference lists for a new project: work catalog, point types, cables, devices, units, culprits and delay reasons (section 4 of the functional description).
- `src/domain/shared.js` — Shared lists (delay reasons, culprits, problems — one list per database in the pool): the lookup view over the pool and a project's old list, what pickers offer, and the one-time merge plan.
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
- `src/tohnit/engine.js` — Drawing parsing without AI, step 2: the logic that turns the extracted PDF text into points (a port of tools/tohnit/tohnit.py: scan → catalog rules → points + questions for a person).
- `src/tohnit/extract.js` — Drawing parsing, step 1: extracts text, icons and layers from a PDF through MuPDF (the same engine as tools/tohnit/tohnit.py).
- `src/tohnit/hefont.js` — Noto Sans Hebrew (Hebrew letters only) as a base64 string, for the Hebrew legend of «PDF с номерами».
- `src/tohnit/icons.js` — Icons without numbers: tap an icon, find the same ones (by the text inside or by shape), then number them in a chain by neighbours.
- `src/tohnit/legendhe.js` — The Hebrew legend of «PDF с номерами»: the page is drawn separately (MuPDF DocumentWriter + the embedded Hebrew font) and inserted into the document.
- `src/tohnit/linking.js` — Matching project points to the captions on a drawing: exact pairs, similar ones (other separators, an extra beginning) and those without a pair.
- `src/tohnit/numbered.js` — Builds «PDF с номерами»: the drawing PDF marked like the plan in the app, with a legend page at the end (in Russian or in Hebrew through legendhe.js).
- `src/tohnit/pattern.js` — Caption pattern builder from examples: a caption is cut into parts (letters / digits / signs) and a person says what each part means.
- `src/tohnit/worker.js` — Background drawing parsing (a Web Worker): heavy PDF reading does not slow the screen down.
<!-- code-map:end -->
