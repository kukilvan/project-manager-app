Status: in review

# Stage 8. Field improvements 3 — spec

Built from `.scratch/08-field-improvements-3/description.md` (accepted 2026-11-24), which takes in idea 008 (`docs/ideas/008-colour-without-rack-works.md`) and idea 009 (`docs/ideas/009-plan-remembers-view.md`). Where this spec, the description and the ideas differ, this spec wins; the differences are listed in § 0.

## 0. Decisions of this spec

Answers to the open questions of the description, plus what the code showed.

| # | Decision | Why |
|---|---|---|
| D1 | A work counts in the plan colour unless its `planColour` is exactly `false`. A work of type «Протяжка» always counts, whatever the field holds. One helper `inPlanColour(work)` in `src/domain/plan.js` decides it. | Absent = counted: old works, the pool and the starter set need no migration. The pull must count: idea 006's pink and circles depend on it. |
| D2 | The tasks of unticked works are dropped in **one place**: `planColor` builds its status from a filtered copy of the point's status (`colourInfo`). `markColor`, the mark progress order (`progressOf`) and `numberedInput` all go through `planColor`, so the plan, shared marks and «PDF с номерами» agree. `pointStages`, the plan stage filter, `leftTasks`, the card, «Что осталось», the sheets and the reports keep the full task list. | The colour is the only thing the owner wants changed (description § 1.6). |
| D3 | The box stays out of the pool through **`bare()`** in `src/domain/typelib.js`: besides the service fields it drops the project-only fields, a list `PROJECT_ONLY = ['planColour']`. Every pool path already copies through `bare()` (§ 2.5), so none of them stores, sends, hashes or compares the box. | One place instead of seven; a future project-only field goes into the same list. Items without the field keep their fingerprints, so nothing is re-sent to the administrator's inbox and `pz.poolSent` stays valid. |
| D4 | Taking from the pool never changes the box: «take» writes only items the project lacks (today's rule), with no `planColour`, so a work new to the project arrives ticked. A work the project deleted and takes again keeps its old box, because project writes merge (`{ merge: true }`). | Description decision 2. |
| D5 | The form writes `planColour: false` when the box is unticked, `planColour: true` when it is ticked on a work that had `false`, and nothing otherwise. The box is hidden for works of type «Протяжка» and in the pool administrator's forms (pool edits). | Project writes merge, so clearing needs a value; a never-unticked work keeps no field at all. The pool never has the field. |
| D6 | `NUMBERED_V` stays 4. | `numberedHash` already includes every colour, so the nightly job re-renders exactly the files whose colours changed, once (description § 1.8). |
| D7 | A composite point whose every task is dropped and which has no pull (for example a type whose only work is an unticked «Хивут») has no stages for the colour and follows the existing «no stages» rule: grey, or blue with a length. | No new rule; such a point has nothing counted to show. |
| D8 | Plan view memory: a pure module `src/domain/planmemory.js` (record, validation, choice of drawing, centre ↔ corner); the viewer `src/app/views/planview.js` reports view changes (`onView`), gives the centre (`centre()`) and restores one (`restore()`); `planmodal.js` reads and writes `pz.planView.<projectId>`. Saved 0.5 s after the view stops changing, when the plan closes and when the page is hidden. | The logic is covered by `node:test`; the iPhone may kill a backgrounded app without a close. |
| D9 | Which drawing opens: an internal redraw's own choice > the opening point's drawing > the placing point's floor > the drawing shown earlier in this plan window > the remembered last > the first. | Today's order with the remembered last inserted before the first. |
| D10 | Which view a drawing opens at: the first show of the opening point's drawing → that point (zoom 2.5, as today); the first show of a plan opened for placing → fitted (as today: the owner looks for the icon across the sheet); every other show → the drawing's remembered view, else fitted. Internal redraws (after «🔗 Связать точки», «✏️ Названия и порядок», «🔀 Одинаковые точки», adding a drawing) therefore come back to the same place instead of fitting. | Description § 2.3. The redraw change is a side benefit; a drawing replaced by «🔄 Новая версия чертежа» has a new id and opens fitted. |
| D11 | The viewer keeps the screen-centre point and zoom when its size changes (the phone is turned, the window resized), in every viewer that uses `createViewer`. | Description § 2.5 and idea 009 owner check 5. Today a resize keeps the top-left corner. |
| D12 | Test mode: `?mem=1&memPlan=1` gets one more point, **FA/C-06** (everything done except «Подключение в шкафу» `HIV_DEV`), and a second drawing **«Test drawing 2»** (the same generated PDF under its own file name, no points). The key is the same `pz.planView.<projectId>`; the test project gets a new id on every load and its data lives in memory, so a restart cannot be checked in test mode (owner's check on the phone). | The owner and the self-check can see idea 008 on one point and switch drawings for idea 009. |
| D13 | **Two tickets**, not three: idea 008 in one (rule, box, list mark, pool), idea 009 in the other. | Every ticket goes live before the owner checks it (ADR 0011). A box without the pool rule would send `planColour` to the administrator's inbox; a colour rule without the box cannot be checked by the owner. |

## 1. Works not in the plan colour (idea 008)

### 1.1 The rule

- `inPlanColour(work)` → `true` when `work` is missing, `work.workType === 'Протяжка'` or `work.planColour !== false`; otherwise `false`.
- `colourInfo(info, ctx)` (internal to `plan.js`): for a legacy point (`!info.composed`) returns `info` as is. For a composite point keeps the tasks with `stage === 'Протяжка'` or `inPlanColour(ctx.catalog.get(t.workId))`; if none was dropped, returns `info` as is; otherwise returns `{ ...info, tasks, stageStats, stages }` with `stageStats[s] = { total, done }` recounted for each of `STAGES` and `stages` = the `STAGES` with `total > 0`. It never changes the cached `info` (the app passes its cached `infoOf`).
- `planColor(point, ctx, infoFn)`: `const info = colourInfo(infoFn(point, ctx), ctx)`; the rest of the function is unchanged (`pointStages(point, ctx, info)`, `worksAfterPull(info, list)`, `pullCables(info)`). The red check reads `info.status`, which the copy keeps.
- Results, with the rule of idea 006 counted over the kept tasks:

| Point (composite) | Colour |
|---|---|
| no work unticked | exactly as today |
| pull and every counted work done, an unticked work open | dark green `#1b5e20`, `full`, width ×1.75 |
| pull done, j of M counted works after the pull done (j ≥ 1, j < M) | gradient at `(j − 1) / (M − 1)`; `M`, `j` exclude the unticked works |
| pull done, every work after the pull unticked | dark green, `full` (the only stage left is the pull, done) |
| pull unfinished, every work after the pull unticked | pink, with the pull circles |
| only an unticked work done (rack terminated, nothing pulled) | not started: grey, blue with a length |
| a «Хивут» stage whose every task is unticked | the stage leaves the list for the colour (no empty stage that never completes) |
| an open problem or «Неисправна» | red first, as today |
| legacy point (status by the type's stages) | unchanged |
| every task unticked and no pull (D7) | grey / blue |

- Shared marks (`markColor`): each point's colour by the rule, then red if any is red, else the least finished by `progressOf` (it reads `j`, `M`, `pull` of the rule's result) — unchanged code.
- «PDF с номерами»: `numberedInput` uses `markColor`, so it follows; `numberedHash` changes only for drawings whose colours changed (D6). The nightly job (`scripts/server-tables-lib.mjs`) builds its context from the project's catalog documents, which carry `planColour`, so it computes the same colours as the app.
- Legend under the plan and in the PDF: unchanged.

### 1.2 The box in the work's window

«📋 Справочники» → «Каталог работ» → tap a work (`REFS.catalog` in `src/app/views/settings.js`).

- New field right after «Тип работы»: a checkbox **«Учитывать в цвете точки на плане»**, hint **«Снимите для работ, которые делаются отдельным этапом (например, подключение в шкафу): точка станет зелёной без них. В отчёте и таблицах работа остаётся.»**
- Shown when the chosen work type is not «Протяжка» (it hides and shows as the type changes, like «Может входить в набор двери») and the form writes into the project. Hidden in the pool administrator's forms («✏️ Изменить в пуле», «➕ Новый в пул», «✏️ Изменить и добавить»).
- Value in the form: ticked unless the work has `planColour === false` (a `toForm` step); a new work starts ticked (`defaults`).
- Saved by `planColourPatch(ticked, existing, workType)` from `plan.js`, merged into the form's data:
  - work type «Протяжка» → `{}` (the field, if any, is left as it is and ignored, D1);
  - unticked → `{ planColour: false }`;
  - ticked and `existing?.planColour === false` → `{ planColour: true }`;
  - otherwise `{}`.
- The pool administrator's forms add no `planColour` at all.
- Ticking the box again counts the work again at once; nothing is lost.

### 1.3 The mark in the catalog list

- A work with `planColour === false` and a type other than «Протяжка» shows **« · не в цвете плана»** at the end of its second line, after « · скрыта» when both apply: «חיווט בארון · Галай, Дверь ЭМ 2 кабеля · не в цвете плана».

### 1.4 What does not change

The point card, «🧾 Что осталось», the plan stage filter («Осталось: хивут», the «Работа» lines), «🧵 Протяжки», the daily reports, the management sheets and «Итоги по шкафам», the rack screens: they all keep counting the unticked work.

### 1.5 The pool

- `bare(x)` drops `META` and `PROJECT_ONLY` (`['planColour']`). The module header of `typelib.js` says so.
- Paths that now never carry the box, all through `bare()`:
  - fingerprints `poolHash` and `deepHash`, so the inbox candidates (`inboxCandidates`), the open-item test of the administrator's inbox and the «changed» sections ignore it;
  - `changedFields`, `fieldChanges`, `candidateChanges` and `changedParts`: no «planColour: — → нет» line, and a work that differs from the pool only by the box is not a candidate (no «Новое из проектов», no «отличается от пула»);
  - `depsOf`, `bundleFrom` and the candidate's `item`: what goes to `pool_inbox` and to the personal type library;
  - `takeFromPoolOps`, `addBundleOps` (the point import from a file, `src/domain/pointsimport.js`; types from the pool): what comes into a project;
  - the wizard's new project from the pool (`refs` in `src/app/views/wizard.js`) and «📥 Заполнить пул из …» in `poolview.js`.
- The administrator's «➕ В общий пул» and «✏️ Изменить и добавить» write `bare(cand.item)` and the parts through `bare()` (today they write `cand.item` raw), so an entry sent by a phone with an older build of the app cannot put the field into the pool. Reading paths strip it anyway.
- The starter set (`src/data/starter-pool.json`, built from the pool collections) and a new project from it never have the field: every work arrives ticked. `createProject` copies only what it is given (pool or built-in set), never another project's catalog.
- A colleague's project has its own boxes: the field lives only in each project's `catalog` documents.

## 2. The plan remembers the drawing, place and zoom (idea 009)

### 2.1 Stored record

Device key `pz.planView.<projectId>` in `localStorage` (already listed in `PROJECT_CONTEXT.md`), JSON:

```json
{ "last": "DR_abc123", "views": { "DR_abc123": { "page": 0, "x": 812.4, "y": 433.1, "s": 2.5 } } }
```

- `last` — the id of the drawing shown last; `views` — per drawing id: `page` (0-based), `x`, `y` the drawing point at the centre of the viewer in PDF units, `s` the zoom (screen px per PDF unit, as `view.s`).
- Written with `x`, `y` rounded to 0.1 and `s` to 0.001.
- Not synced, not in backups, nothing in Firestore or on Drive.

### 2.2 `src/domain/planmemory.js` (pure)

- `parsePlanMemory(text)` → `{ last, views }`. Broken JSON, a missing key or a non-object → `{ last: null, views: {} }`. `last` kept only when a non-empty string. A view entry kept only when `page` is an integer ≥ 0, `x` and `y` are finite numbers and `s` is finite and within 0.05–20 (the viewer's limits); others are dropped silently.
- `viewFor(record, drawingId, pages)` → `{ page, x, y, s }` or `null`. `pages` — the page sizes of the opened PDF (`[{ w, h }]`). `null` when there is no entry or `page >= pages.length`. Otherwise `x` clamped to 0…w and `y` to 0…h of that page.
- `rememberView(record, drawingId, view, liveIds)` → a new record: `last = drawingId`, `views[drawingId] = view` (rounded), entries whose id is not in `liveIds` dropped.
- `drawingToOpen({ ids, selectId, pointId, placeId, currentId, last })` → the first of `selectId`, `pointId`, `placeId`, `currentId`, `last` that is in `ids`, else `ids[0]`, else `null` (D9).
- `centreOf({ s, ox, oy }, w, h)` → `{ x: ox + w / (2s), y: oy + h / (2s), s }`; `cornerOf({ x, y, s }, w, h)` → `{ s, ox: x − w / (2s), oy: y − h / (2s) }`; one is the inverse of the other for any `w`, `h`.

### 2.3 The viewer (`createViewer`, `src/app/views/planview.js`)

- New option `onView()` — called after the view or page changes: a pan, a pinch, the wheel, «＋» / «－», «⤢ Весь лист» (`fit`), the fit after a page loads, `focus`. Not called by a redraw alone (`draw`).
- `api.centre()` → `{ page, ...centreOf(view, width, height) }`, or `null` while the viewer has no size or no page loaded.
- `api.restore({ page, x, y, s })` → `focus(x, y, page, s)` with `s` clamped to 0.05–20.
- On resize the centre point and the zoom are kept (D11): before re-measuring, the centre is taken with the old size; after, `ox`, `oy` are set from it by `cornerOf`.
- Callers that pass no `onView` behave as today, apart from the resize rule.

### 2.4 `planModal` (`src/app/views/planmodal.js`)

- Opening: the drawing by `drawingToOpen` with `last` from the stored record (`placeId`: today's floor match of the placing point).
- `show(d)`, after `viewer.start()` (which fits):
  1. the first show of the opening point's drawing → `viewer.focus(point)` as today, once;
  2. else the first show of a plan opened for placing → stays fitted;
  3. else `viewFor(record, d.id, o.pages)` → `viewer.restore(view)`; none → stays fitted.
- «Найти точку» and «🚪 Двери» keep focusing their point as today; the new place is then remembered through `onView`.
- Saving: `onView` takes `viewer.centre()`, keeps it as pending and (re)starts a 500 ms timer; the timer, the close of the plan window and `visibilitychange` to `hidden` write it: read the key again, `rememberView(…, current.id, pending, drawingsOf() ids)`, write. The listener is removed on close. Every read and write is in `try`; a storage error is ignored and the plan behaves as today.
- Switching drawings in the list: `show(d)` of the new one → its remembered view or fitted; `last` follows on the first save.
- Not remembered: filters, the selection, tools, the focus frame, layers (layers keep `pz.layers.<id>`).
- The app still starts on its usual screen; nothing opens the plan by itself.

## 3. Texts

New UI strings, English and Hebrew through `src/i18n/src/*.json` + `node scripts/i18n-build.mjs` (rule 12):

| Russian | English | Hebrew |
|---|---|---|
| Учитывать в цвете точки на плане | Count in the point's colour on the plan | לכלול בצבע הנקודה בתוכנית |
| Снимите для работ, которые делаются отдельным этапом (например, подключение в шкафу): точка станет зелёной без них. В отчёте и таблицах работа остаётся. | Untick for works done as a separate phase (for example, termination in the rack): the point turns green without them. The work stays in the report and the sheets. | בטלו את הסימון לעבודות שנעשות בשלב נפרד (למשל חיווט בארון): הנקודה תהפוך לירוקה בלעדיהן. העבודה נשארת בדוח ובטבלאות. |
| « · не в цвете плана» | « · not in the plan colour» | « · לא בצבע התוכנית» |

In-app guide (`src/app/views/guide.js`; a guide line is a key without its «• »):

- Section «Справочники», after the «Каталог работ» line: «• Галочка «Учитывать в цвете точки на плане» в окне работы: снимите её у работ, которые делаются отдельным этапом (например, подключение в шкафу). На плане и в «PDF с номерами» точка станет тёмно-зелёной без них, а в карточке точки, «Что осталось», отчётах и таблицах работа остаётся. Галочка своя в каждом проекте и в общий пул не попадает.»
  - EN: «The box “Count in the point's colour on the plan” in a work's window: untick it for works done as a separate phase (for example, termination in the rack). On the plan and in the numbered PDF the point turns dark green without them, while the point card, “What's left”, the reports and the sheets keep the work. Each project has its own box; it does not go to the shared pool.»
  - HE: «התיבה „לכלול בצבע הנקודה בתוכנית” בחלון העבודה: בטלו אותה לעבודות שנעשות בשלב נפרד (למשל חיווט בארון). בתוכנית וב-PDF עם מספרים הנקודה תהפוך לירוקה כהה בלעדיהן, ובכרטיס הנקודה, ב„מה נשאר”, בדוחות ובטבלאות העבודה נשארת. לכל פרויקט תיבה משלו; היא לא עוברת למאגר המשותף.»
- Section «План (чертёж)», after the «📍 На чертеже» line: «• План запоминает на этом телефоне последний открытый чертёж и для каждого чертежа — место и увеличение, даже после перезапуска. «📍 На чертеже» и «📍 Отметить на плане» показывают свою точку, как раньше; «⤢ Весь лист» — весь лист.»
  - EN: «On this phone the plan remembers the last drawing opened and, for each drawing, the place and zoom, even after a restart. “📍 On the drawing” and “📍 Mark on the plan” show their point as before; “⤢ Whole sheet” shows the whole sheet.»
  - HE: «בטלפון הזה התוכנית זוכרת את השרטוט האחרון שנפתח, ולכל שרטוט — את המקום ואת הזום, גם אחרי הפעלה מחדש. „📍 בתוכנית” ו„📍 סימון בתוכנית” מראים את הנקודה שלהם כמו קודם; „⤢ כל הגיליון” — את כל הגיליון.»

No other new string: the plan and the viewer add no text.

## 4. Data and external services

- Firestore: one optional field `planColour` (boolean) on documents of `projects/{pid}/catalog`; `false` = not in the colour, absent or `true` = counted. No migration, no rules change (the rules of project subcollections check membership, not fields). Never in `pool_catalog` or `pool_inbox` (§ 1.5).
- Device: `pz.planView.<projectId>` (§ 2.1).
- Google Drive: the nightly job re-renders the «PDF с номерами» files (own and «Для руководства» copies) whose colours change, once; no new request kind.
- Stage 4 (PocketBase) must carry `planColour` on project catalog works (already in `docs/project-spec.md`).
- Nothing here was checked against a real response: no new request is made. D4 and D5 rely on project writes merging into the document: Firestore `batch.set(…, { merge: true })` for every collection but points, and the memory and on-device backends (`commit` in `src/app/repo.js`: `{ ...old, ...data }`).

## 5. Edge cases

| Case | Expected |
|---|---|
| No work unticked | Colours, fingerprints and «PDF с номерами» exactly as today. |
| Several unticked works on one point (rack termination of two cables) | All dropped for the colour. |
| A work unticked, then its type changed to «Протяжка» | The box hides; the field stays and is ignored; the work counts. |
| A «Протяжка» work with `planColour: false` (old data, a file) | Counts. |
| The owner ticks the box again | `planColour: true` written; the work counts at once. |
| A phone with an older build edits the work | It writes without `planColour`; the merge keeps the box. |
| A phone with an older build sends the work to the inbox with the field | The administrator sees no difference (the strip on read); accepting writes it without the field (§ 1.5). |
| The work is deleted, then taken from the pool again | Its old box comes back (merge, D4). |
| A colleague takes the work from the pool | Ticked in the colleague's project. |
| Point import from a file with a pool type | Works arrive ticked; existing project works untouched. |
| Remembered drawing deleted | The first drawing fitted; its entry dropped on the next save. |
| The project has no drawings | «Чертежей пока нет», as today; nothing is written. |
| Drawing replaced by a new file with the same id | The view kept if its page exists, clamped to the page; else page 1 fitted. |
| «🔄 Новая версия чертежа» (new id) | The new drawing opens fitted the first time. |
| Remembered page no longer exists | Page 1 fitted. |
| Zoom outside 0.05–20, a non-number, broken JSON, storage blocked or full | Ignored; fitted as today; the app never fails on this key. |
| Another project | Its own key; views never mix. |
| Two plan windows stacked (a card's «📍 На чертеже» over an open plan) | Each write reads the key first, so neither drops the other's drawings. |
| Phone turned while the plan is open | The same spot stays in the middle at the same zoom (D11). |
| The plan closed within 0.5 s of a move | Written on close. |
| The app killed while backgrounded with the plan open | Written when the page was hidden, or 0.5 s after the last move. |

## 6. Tests

Automated (`npm test`, `node:test`, offline):

- `tests/plan.test.js`:
  - `inPlanColour`: missing work, `planColour` absent / `true` / `false`, a «Протяжка» work with `false`;
  - `planColor`: all done except an unticked work → dark green, `full`, width 1.75; gradient `j / M` without the unticked work (3 counted works, 1 done → `t = 0`; 2 done → `0.5`); only unticked works after the pull → dark green when pulled, pink with `pull` circles when the pull is unfinished; an unticked work done alone → grey, blue with a length; a «Хивут» stage whose tasks are all unticked leaves `stages`; red first; a legacy point unchanged; no work unticked → the same result object as before for every point of the existing cases; the cached `info` passed by `infoFn` is not modified;
  - `markColor` of a pair where one point has only an unticked work open and the other is pink → pink (the least finished);
  - `numberedInput` / `numberedHash`: unticking changes the colour and the fingerprint of a drawing with an affected point and not of a drawing without one;
  - `planColourPatch`: the four cases of § 1.2.
- `tests/domain.test.js` (pool section): `bare` drops `planColour`; `poolHash` of a work with and without `planColour: false` is equal; `inboxCandidates` lists no candidate for a project work that differs from the pool only by the box, and no type candidate through that work; `changedFields` / `candidateChanges` show no line for it; `takeFromPoolOps` and `addBundleOps` write no `planColour` and do not touch an existing project work; `depsOf` and `bundleFrom` carry none.
- `tests/planmemory.test.js` (new): `parsePlanMemory` with broken JSON, a non-object, a bad `last`, out-of-range `s` (0.01, 25, `NaN`), a negative or fractional page → dropped; `viewFor` with a missing entry, a page beyond `pages`, and clamping of `x`, `y`; `rememberView` keeps one entry per drawing, sets `last`, drops ids not in `liveIds`, rounds; `drawingToOpen` order (each level wins over the next, ids not in the list skipped, empty list → `null`); `centreOf` / `cornerOf` round trip for 420×700 and 1280×800, and the same centre gives different corners for the two sizes.
- `tests/testplan.test.js`: the new point FA/C-06 (one caption more, inside the page, no overlap); its look — gradient with every work ticked, dark green `full` with `HIV_DEV` unticked; the second drawing entry.
- The i18n coverage test (rule 12) covers the new strings; `tests/code-docs.test.js` covers the code map.

Self-check in the browser pane (420 px, `?mem=1&memPlan=1`, «Не напоминать»):

- Ticket 1: FA/C-06 is a light-green gradient shade; «Каталог работ» → «Подключение в шкафу»: the box is ticked; untick, «Сохранить» → the list line ends « · не в цвете плана»; «🗺 План»: FA/C-06 dark green with the thick frame, FA/C-05 still dark green, FA/C-04 unchanged shade; FA/C-06's card and «🧾 Что осталось» still list «Подключение в шкафу»; a «Протяжка» work has no box; tick back → FA/C-06 returns to its shade; English and Hebrew show the translated box, hint and mark.
- Ticket 2: open «🗺 План», zoom in on a corner, close, open → same place; switch to «Test drawing 2», zoom elsewhere, switch back → the first place; «⤢ Весь лист», close, open → fitted; a point card «📍 На чертеже» → that point; resize the pane → the same spot in the middle; `localStorage['pz.planView.<id>']` holds both drawings.

Owner's checks on the phone — listed per ticket in § 8. Only the owner can check: the live catalog and its real rack-termination works, the iPhone, a restart after the phone killed the app, the nightly «PDF с номерами» on Drive, and (as pool administrator) the empty inbox for a work changed only by the box.

## 7. Docs to update

- Ticket 1: `CONTEXT.md` — «Not in the plan colour»: add «a project setting: `bare()` keeps it out of the shared pool; a «Протяжка» work always counts»; new ADR `docs/adr/0018-project-only-fields-stay-out-of-the-pool.md` (D3, D4: `PROJECT_ONLY` in `bare()`, absent = default, merge keeps the project's value); the guide line of § 3; header comments of `plan.js` (the rule of works kept out of the colour), `typelib.js` (`PROJECT_ONLY`), `settings.js` if its first sentence changes, `testplan.js`; the code map by the command.
- Ticket 2: header comments of the new `src/domain/planmemory.js`, `planview.js` (centre memory, `onView`, resize keeps the centre), `planmodal.js` (remembers the drawing and place); export from `src/domain/index.js`; the guide line of § 3; the code map by the command. `PROJECT_CONTEXT.md` already lists the device key; `CONTEXT.md` already has «Plan view memory».
- No new `KNOWN_ISSUES.md` entry. No change to `firestore.rules`.

## 8. Proposed tickets

| # | Ticket | Complexity | Depends on |
|---|---|---|---|
| 01 | **Works not in the plan colour (idea 008).** `inPlanColour`, `colourInfo` and `planColourPatch` in `plan.js`; `PROJECT_ONLY` in `bare()`; the administrator's accept and edit write through `bare()`; the box, `toForm`, defaults and list mark in `settings.js`; FA/C-06 in the test drawing; texts, guide line, ADR 0018, `CONTEXT.md`; tests of § 6. | medium | — |
| 02 | **The plan remembers the drawing, place and zoom (idea 009).** `src/domain/planmemory.js`; `onView`, `centre()`, `restore()` and the resize rule in `planview.js`; reading, choosing and saving in `planmodal.js`; «Test drawing 2» in the test drawing; guide line; tests of § 6. | medium | — (independent of 01; after it only because both touch the test drawing) |

Owner's check, ticket 01 (phone, current project):
1. «📋 Справочники» → «Каталог работ» → the rack-termination work («Хивут в шкафа бакары» or the project's own): the box «Учитывать в цвете точки на плане» is ticked. Untick it, «Сохранить»: the list line ends « · не в цвете плана».
2. A work of type «Протяжка»: no box.
3. «🗺 План»: a point with everything done except the rack termination is dark green with the thick frame.
4. Its card and «🧾 Что осталось» still show the rack termination as not done.
5. «📄 Скачать PDF с номерами»: the same colours as the plan.
6. As pool administrator: «🗂 Общий пул» in «Каталог работ» shows nothing new from projects for this work.
7. Tick the box back on one work: its points return to the gradient; untick it again if that is how the project is run.

Owner's check, ticket 02 (phone, a project with several drawings): idea 009's owner check 1–5 (another drawing zoomed in → close and open → same place; two drawings keep their own places; swipe the app away, open, «🗺 План» → same drawing and place; «📍 На чертеже» → the point; turn the phone → same spot in the middle).

Stage estimate: description, spec, slicing, 2 tickets, review — 6 sessions (the table says 7).
