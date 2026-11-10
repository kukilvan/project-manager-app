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

## Work and reports

**Work** (code: `catalog` item; UI: «Работа») — a kind of work from the project's catalog (pull, keystone termination, install, test…).

**Journal row** (code: `journal`)
Point × work; closes a point task with one row (`done` boolean). Ids: `${entryId}_${pointId}` from a report entry, `edit_${pointId}_${workId}` from a direct edit. _Avoid_: log (that is the event log).

**Day / entry** (code: `days`, `entries`) — a working day and the works recorded in it; `entry.portQty` holds per-point quantities.

**Daily report** «дох» (Hebrew דו"ח; code: `src/domain/doh.js`; UI: «Отчёты»)
The day's report in Russian with Hebrew text, sent to the employer on WhatsApp. _Avoid_: log, journal.

**Month report** (code: `src/domain/month.js`) — sum of a month's daily reports; the employer bills by it.

**Pull** «протяжка» (code: `pulls`, `src/domain/pull.js`) — laying cable from points to the rack, with meters per point.

**Event log** (code: `src/log.js`; UI: «Журнал событий») — debug log on the device, always Russian. _Avoid_: journal.

**History** (code: `history` subcollection; UI: «История изменений») — who changed what and when; rollback source.

## Drawings

**Drawing** «тохнит» (Hebrew תוכנית; code: `drawings`, `tohnit`) — the customer's PDF plan. _Avoid_: blueprint, map.

**Plan** (UI: «План») — the drawing in the app with points colored by status.

**Caption catalog** (code: `pool_catalog`, `src/tohnit/`; UI: «Каталог подписей») — rules by which parsing recognises point captions in the PDF text layer.

**New drawing version** (code: `src/domain/sheetfit.js`) — moving points to an updated drawing by shift + scale + rotation.

**Point merge** (code: `src/domain/merge.js`) — a double point and its singles recorded separately become one.

## Data, access, sync

**Repo** (code: `src/app/repo.js`) — the storage interface; implementations: Firestore, memory (`?mem=1`), IndexedDB (on-device). _Avoid_: repository when you mean git.

**On-device mode** (code: `pm.mode = local`; UI: «на устройстве») — data only in the phone's IndexedDB, no Firebase.

**Test mode** — `?mem=1`: in-memory data, stub sign-in and Google (`docs/workflow.md`).

**Connect link** (code: `?connect=…`; UI: «Ссылка для подключения») — carries a Firebase config and OAuth Client ID to colleagues.

**Admin** (code: `meta/admin`) — the first user signed in to a database; runs the shared pool and the allowed e-mails. Members are otherwise equal. **Member** (code: `memberUids`, `invitedEmails`).

**Shared pool** (code: `pool_*` collections; UI: «Общий пул») — reference lists (types, devices, cables, works, captions, manuals, door configs) shared by a database. **Starter pool** (code: `src/data/starter-pool.json`) — the pool a new database starts with.

**Management sheets** (code: `src/domain/report.js`, `src/app/managers.js`; UI: «Таблицы для руководства») — Google Sheets for management by **profile** (racks, types, statuses, columns), values only.

**Delta read** (code: `updatedAtServer`, `src/domain/sync.js`) — reading only changes since the last load; a full read on Saturdays.

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
