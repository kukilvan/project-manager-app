# Project Manager — glossary

The project's words. Code, docs and messages use them and avoid the listed synonyms. The session that introduces a term adds it here. The owner writes Russian and uses Hebrew trade words without explanation; their Russian form is given in «».

## Site and points

**Project** (code: `project`, `pid`; UI: «Проект»)
One site (object) with its points, days, journal and reference lists, shared by its members. _Avoid_: object, job.

**Point** (code: `point`; UI: «Точка»)
An installation place: camera, door, controller, Wi-Fi, detector… Labels look like `FC/B05-06`, `1A-C154`, `RA/D-09.1`. _Avoid_: device (a point is made of devices), node.

**Single / double / triple point**
By its label: `FC/B29` is single (1 cable), `FC/B05-06` double (2 cables), a range of three — triple. `RANGE` in `src/domain/merge.js` counts 1–8.

**Point type** (code: `type`; UI: «Тип»)
What a point is (camera, door…). Composite types list `devices` and `cables`; legacy types only `defaultCable(s)` (ADR 0006). `type.cables` are the point's own cables, not the devices'.

**Device** (code: `device`) — equipment inside a point with its cables and works. **Cable** (code: `cable`) — a cable kind with works per cable.

**Composition** (code: `src/domain/compose.js`)
Cable → device → point type → the point's own set; tasks and statuses of a point are computed from it. _Avoid_: «cat7×1» field (dropped).

**Own works** (code: `point.ownWorks`; UI: «Работы на точках»)
Per-point works on top of type, devices and cables: `[{ workId, qty, per? }]`, `qty: 0` removes, `per: 'cable'` — per cable. **Cable override** (code: `point.cableOverride`) — the point's own cables as a whole.

**Cables by label** (code: `cablesByLabel`) — default rule: cat7 single → 1 cable, double → 2, triple → 3; doors untouched.

**Rack** (code: `cabinet`; UI: «Шкаф») — a server cabinet with 24-port panels; points are grouped by rack, often by label prefix. **Panel port** — panel U + port 1–24 for cat7 points (`src/domain/rack.js`).

**Door configuration** (code: `doorcfg`) — the kind of door (locking, accessories) giving composition and cables to a «Дверь» point.

**Point filter** (UI: «Все шкафы», «Все типы», «Все конфигурации дверей», «Все работы»…) — narrows a list of points or the plan. From stage 7 (idea 007) a button opens a window with checkboxes: ticked values of one filter add up (rack FA or FC), different filters narrow each other; nothing ticked — the filter is off, and for racks and types also everything ticked. «✖ Сбросить фильтры» clears a screen's filters and search. Code: `src/domain/filters.js` (rules), `src/app/views/multifilter.js` (button and window). _Avoid_: selection (that is the points ticked for an action).

**Shared filters** (idea 007; code: `src/app/sharedfilters.js`) — the rack, type and door-configuration filters that «Точки» and «План» share while the app is open, per project; kept in memory only, another project clears them.

## Work and reports

**Work** (code: `catalog` item; UI: «Работа») — a kind of work from the project's catalog (pull, keystone termination, install, test…).

**Journal row** (code: `journal`)
Point × work; closes a point task with one row (`done` boolean). Ids: `${entryId}_${pointId}` from a report entry, `edit_${pointId}_${workId}` from a direct edit. _Avoid_: log (that is the event log).

**Day / entry** (code: `days`, `entries`) — a working day and the works recorded in it; `entry.portQty` holds per-point quantities.

**Day off** (code: `day.off`, `offReason`, `offText`, `src/domain/dayoff.js`; UI: «🌴 Выходной») — a day of a project with no work and a reason («Праздник», «Болезнь»… or own text); shown in «Отчёты» and «Месяц», not counted as a working day; blocked on a date that is a working day in another project.

**Shared list** (code: `pool_delayReasons`, `pool_culprits`, `pool_problems`, `src/app/shared.js`) — a reference list kept once per database in the shared pool and read directly by every project: any member adds and edits, only the administrator deletes (a `deleted` mark). Old per-project lists are merged in once and kept read-only (ADR 0016).

**Delay reason** (code: `pool_delayReasons`, `point.delayReasonId`; UI: «Причина задержки») — why a point is not done, in general (also the delay of a day entry, `entry.delayReason`); does not make a point red. A shared list (ADR 0016).

**Culprit** (code: `pool_culprits`, `entry.delayCulprit`; UI: «Виновник простоя») — who caused the downtime of a day entry; «Месяц» sums downtime by culprit. A shared list (ADR 0016).

**Problem** (code: `pool_problems`; UI: «Проблема») — a concrete trouble from the shared «Проблемы» list: a Russian and Hebrew name, the point types it is for (empty — all) and ready descriptions. _Avoid_: fault (that is «Неисправна», a failed check).

**Problem mark** (code: `problemMarks`, `src/domain/problems.js`) — a problem on one point: a ready description or own Hebrew text, who and when marked, who and when solved; an open mark makes the point red on the plan, in «PDF с номерами» and in the management sheet; «Решено» closes it and keeps it in history (ADR 0017).

**Progress colour** (code: `planColor` in `src/domain/plan.js`) — the plan colour of a point by its pull and the works after it: brown `#79443B` for a pulled point (whatever its type; pink until 2026-11-27, too close to the problem red), then an even OKLab gradient from yellow to green with every work done after the pull (works = the lines of the point's work list), a thick dark-green frame when all are done; red for an open problem or «Неисправна». An unfinished pull shows a circle per cable (filled for a pulled one) when zoomed in. Idea 006, ticket 6.8; before it the colour was the share of stages done (ticket 6.5).

**Not in the plan colour** (code: `planColour: false` on a catalog work; UI: box «Учитывать в цвете точки на плане» unticked) — a work recorded as usual but ignored by the progress colour, for phases done apart from the points, such as termination in the rack. The card, «Что осталось», reports and sheets still count it. A project setting: `bare()` keeps it out of the shared pool (ADR 0018); a «Протяжка» work always counts. Idea 008, stage 8.

**Daily report** «дох» (Hebrew דו"ח; code: `src/domain/doh.js`; UI: «Отчёты»)
The day's report in Russian with Hebrew text, sent to the employer on WhatsApp. _Avoid_: log, journal.

**Month report** (code: `src/domain/month.js`) — sum of a month's daily reports; the employer bills by it.

**Pull** «протяжка» (code: `pulls`, `src/domain/pull.js`) — laying cable from points to the rack, with meters per point.

**Event log** (code: `src/log.js`; UI: «Журнал событий») — debug log on the device, always Russian. _Avoid_: journal.

**History** (code: `history` subcollection; UI: «История изменений») — who changed what and when; rollback source.

## Drawings

**Drawing** «тохнит» (Hebrew תוכנית; code: `drawings`, `tohnit`) — the customer's PDF plan. _Avoid_: blueprint, map.

**Plan** (UI: «План») — the drawing in the app with points colored by status.

**Plan view memory** (code: device key `pz.planView.<projectId>`) — the last drawing opened on «План» and, for each drawing, its page, centre and zoom, kept on the device across app restarts. Idea 009, stage 8.

**Caption catalog** (code: `pool_catalog`, `src/tohnit/`; UI: «Каталог подписей») — rules by which parsing recognises point captions in the PDF text layer.

**New drawing version** (code: `src/domain/sheetfit.js`) — moving points to an updated drawing by shift + scale + rotation.

**Point merge** (code: `src/domain/merge.js`) — a double point and its singles recorded separately become one.

## Data, access, sync

**Repo** (code: `src/app/repo.js`) — the storage interface; implementations: Firestore, memory (`?mem=1`), IndexedDB (on-device), and from stage 4 PocketBase on the NAS copy. _Avoid_: repository when you mean git.

**On-device mode** (code: `pm.mode = local`; UI: «на устройстве») — data only in the phone's IndexedDB, no Firebase.

**Test mode** — `?mem=1`: in-memory data, stub sign-in and Google (`docs/workflow.md`).

**Test drawing** (code: `src/domain/testplan.js`, `?mem=1&memPlan=1`) — a generated one-page PDF with points at every progress stage, for checking the plan in test mode.

**Connect link** (code: `?connect=…`; UI: «Ссылка для подключения») — carries a Firebase config and OAuth Client ID to colleagues.

**Admin** (code: `meta/admin`) — the first user signed in to a database; runs the shared pool and the allowed e-mails. Members are otherwise equal. **Member** (code: `memberUids`, `invitedEmails`).

**Shared pool** (code: `pool_*` collections; UI: «Общий пул») — reference lists (types, devices, cables, works, captions, manuals, door configs) shared by a database; items carry `nameEn`, an optional English name. **Starter pool** (code: `src/data/starter-pool.json`) — the pool a new database starts with.

**Management sheets** (code: `src/domain/report.js`, `src/app/managers.js`; UI: «Таблицы для руководства») — Google Sheets for management by **profile** (racks, types, statuses, columns), values only.

**Section** (code: `sectionRows`; UI: «Разделы по типам точек») — a heading row before the points of one type with its name and count.

**Rack sheet** (UI: «Итоги по шкафам», Hebrew «התקדמות לפי ארון») — the per-rack progress sheet in the same file.

**Update stamp** (code: `stamp`) — «עודכן: …» in E2, the time of the last refresh, written even when the data is unchanged.

**Delta read** (code: `updatedAtServer`, `src/domain/sync.js`; on PocketBase the `updated` field) — reading only changes since the last load; a full read on Saturdays.

**NAS copy** — the owner's copy of the app on the home NAS: the site and PocketBase behind a Cloudflare Tunnel (ADR 0013, 0014). _Avoid_: server, home server (the UI says «домашний сервер» to people; docs and code say NAS copy).

**NAS project** — the owner's separate private project that sets up the home NAS and does the move of the NAS copy: setup, the data move, running jobs and backups, the switch-over. All code stays in this repo (ADR 0019).

**NAS document** (code: `docs/nas-requirements.md`) — what the app requires from the NAS: requirements `R-…` and acceptance checks A1–A15.

**NAS check** (code: `tools/nas-check.mjs`) — the automated acceptance checks of the NAS copy.

**NAS build** (code: `npm run build:nas` → `dist-nas/`, `VITE_BACKEND=pocketbase`, `isPocketBase()`; release by `scripts/nas-pack.mjs`) — the app built for the NAS copy: base `/`, PocketBase storage, no setup wizard or Firebase; published with the migrations, hooks and job scripts to the GitHub release `nas-build` on every push to `main` (stage 4; after the sign-in the real app on the local copy and the write queue).

**Write route** (code: `POST /api/pm/save` in `pb/pb_hooks/pm.pb.js`, logic in `src/domain/pbwrite.js`, the PocketBase store in `pb/pb_hooks/pm/pbstore.js`) — the one way a user writes to PocketBase: ops merged like Firestore and checked against a copy of the Firestore rules in one transaction (ADR 0020).

**Local copy** (code: IndexedDB `pm-pb` with the stores `docs`, `queue`, `meta`, `history`; `src/app/pb/localcopy.js`, backend `src/app/pb/backend.js`) — the NAS copy's data on the phone: every project the user is a member of, the pool, settings and invitations; screens read only it (ADR 0021). _Avoid_: cache (that is Firestore's).

**Write queue** (code: the `queue` store of `pm-pb`; rules in `src/domain/pbqueue.js`, sending in `src/app/pb/sender.js`) — changes waiting on the phone to be sent to PocketBase, counted by «⬆ N»; sent in chunks one after another, kept across restarts. One item per write call; a refused item goes to «⚠»; the items of another account that signed in on the phone wait for it.

**Schema version** (code: `PB_SCHEMA` in `src/domain/pbwrite.js`, `PM_SCHEMA` in the hook, `schema` in `nas-site.json`, `GET /api/pm/info`) — the version of the PocketBase database description (migrations and hooks); goes up by one when the app needs a migration or hook change. The write route answers 409 `schema_old` to an app with a higher one («server older»: the app shows a banner and holds the write queue, ticket 08) and 426 `app_old` to one below `MIN_CLIENT_SCHEMA`.

**Restore tool** (code: `scripts/pb-restore.mjs`) — loads a full server backup (Firebase or PocketBase export) into PocketBase: users by e-mail, ids mapped, a count check and a full compare.

**Job runner** (code: `scripts/nas-jobs.mjs`) — the NAS copy's server jobs (`backup`, `tables`, `catch-up`), run by the NAS project's agent.

**Rehearsal of the move** (code: `docs/nas-move-rehearsal.md`) — the move done once on the PC with a copy of the owner's backup; its steps, times and checks go to the NAS project.

## Development

**Header comment** — the leading comment of a module (`//` lines or one `/* … */` block); its first sentence says what the module holds and is the module's line in the code map.

**Code map** (code: `docs/code-map.md`) — what lives where; its module list is built from the header comments by `tools/code-map.mjs`, never edited by hand.

**Same-code check** (code: `tools/same-code.mjs`) — proof that a change touched only comments: the code of every changed file is the same without comments, and the built site is byte-identical.

## Trade words

| Word | Meaning |
|---|---|
| бакар (בקר) | controller; double `FC/B05-06` — 2 cables, single `FC/B29` — 1 |
| галай (גלאי) | detector |
| авизар (אביזר) | door accessory |
| хивут (חיווט) | termination: «хивут кистона на шетахе» at the point, «хивут в шкафу» in the rack — two different works |
| кистон | keystone jack |
| шетах (שטח) | the field / point side |
| шилют (שילוט) | port labels on panels |
| метаэм пас-дин (מתאם פס דין) | DIN-rail adapter |
| орэх (אורך) | length |
| cat7 | any data cable, whatever its category (no separate cat6) |
| 6005 | multi-core signal cable for doors and detectors |
| Fluke | cable test with a tester |
| эсек (עסק) | own business |
