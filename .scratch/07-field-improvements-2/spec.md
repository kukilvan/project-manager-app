Status: in review

# Stage 7. Field improvements 2 — spec

Built from `.scratch/07-field-improvements-2/description.md` (accepted 2026-11-20), which takes in idea 007 (`docs/ideas/007-multi-choice-filters.md`). Where this spec and the idea differ, this spec wins; the differences are listed in § 0.

## 0. Decisions of this spec

Answers to the open questions of the description and the idea, plus what the code showed.

| # | Decision | Why |
|---|---|---|
| D1 | «All ticked = off» holds only for the **rack and type** filters. On closing their window, a set with every value ticked is stored empty. Every other filter (door configurations, problems, works, plan stages) keeps its ticks as they are. | Every point has a rack («Без шкафа» included) and a type, so all ticked shows the same list as no filter. Door configurations, problems and stages do not cover every point: ticking all door configurations shows only doors, ticking all problems shows only points with a problem. Treating those as «off» would show points the owner did not ask for. The works filter of «Что осталось» keeps its ticks so that «Отметить все» still records every ticked work. |
| D2 | A shared value missing on the current drawing (rack FC ticked in «Точки», no FC point on this drawing) **stays ticked and shows greyed** at the end of the plan's window, with «нет на этом чертеже». It can be unticked there. | The idea hid it. Hidden, the owner cannot see why the plan is empty or untick it without the reset. A shared value that is not ticked and not on the drawing is not shown. |
| D3 | A pull from «Что осталось» records only the ticked cables, **in the one-work path too**. | Found in the code: «✅ Записать «Протяжка cat7»» today opens the one-work form with `cableId: cat7`, but for points made of devices `pullGroups` takes every cable not yet pulled, so 6005 is recorded too. That contradicts the owner's decision 1. |
| D4 | The built-in English names already exist: the seed (`src/domain/seed.js`) is source text, so the coverage test made every seed and starter-pool name translatable, and `tr()` translates them on screen. Of 123 built-in names only 20 show Russian in English: the example problems with their descriptions (marked not-UI in stage 6) and the full names of door configurations through two short words. The seed and `src/data/starter-pool.json` are **not** changed; no `nameEn` is written into them. A test keeps every built-in name translated. | One home for each English name (the dictionaries), no migration, no regeneration of the starter pool. Description § 5.3 (fallback by the Russian name) is exactly how `tr()` works. |
| D5 | `nameEn` (form label «Название (English)») goes on **works, point types, devices, cables and problems**. Door configurations get no field. | A door configuration's name is built from its devices' short words («ЭМ · коре · магнит · 6005×2»); `tr()` translates it part by part through the pattern «{} · {}». |
| D6 | In English, an item's own `nameEn` wins over the dictionary for that exact name. Hebrew is unchanged. | Today `tr()` looks up the static dictionary first and the on-the-fly names (`extra`) second, so an own English name of an item called «Камера» would never show. |
| D7 | A group line «▸ Все: Дверь (типов: N)» is a shortcut, not a value: it ticks or unticks its member types. Sets hold type ids only. | The plan may hold fewer members of a group than «Точки»; type ids carry over between the two screens, group values would not. |
| D8 | Every line of a filter window shows its point count, racks and types included (the mockup shows them). The «Осталось: …» lines of the plan's stage filter keep no count, as today. | Counts help choose; the stage lines would need a status pass per value. |
| D9 | One filter control for all screens: the pure rules in `src/domain/filters.js`, the button and window in `src/app/views/multifilter.js`, the shared set in `src/app/sharedfilters.js`. | Seven screens, one behaviour; the rules are covered by `node:test`. |
| D10 | The app has no «back» action inside windows (no history entries; an installed iPhone PWA has no back button). A filter window closes by «Готово», ✕ or a tap outside, as every window does today; on a computer a click outside does not close windows (existing rule), so there «Готово» or ✕. | Answer to the description's question about back on iPhone. |
| D11 | The test drawing is a PDF built in code (`src/domain/testplan.js`), loaded only with `&memPlan=1` as a separate chunk. No binary file goes into the repo. | The repo is public and holds no drawings (ADR 0005); a generated PDF is small and reviewable. |

## 1. The filter control

### 1.1 Button

- One button per several-value filter, in the same place as today's drop-down, styled like the other secondary buttons, `max-width: 190px`, text on one line, cut with «…» by CSS (`white-space: nowrap; overflow: hidden; text-overflow: ellipsis`). The arrow « ▾» is a separate element after the text, so the translation layer sees the text alone.
- An active filter (any value ticked, after D1) gets the highlighted look of the mockup (class `on`: blue background and border).
- Text:

| State | Text |
|---|---|
| off (nothing ticked; for racks and types also everything ticked) | the filter's «all» text: «Все шкафы», «Все типы», «Все конфигурации дверей», «Все работы», «Все этапы», «Проблемы: все» |
| 1 value | «<prefix>: <name>» — «Шкафы: FA» |
| 2 values | «<prefix>: <name>, <name>» — «Шкафы: FA, FC» |
| 3 or more | «<prefix>: <N>» — «Типы: 3» |
| plan type filter in a mode | the mode's name without count: «❔ Не размеченые», «🙈 Скрытые» |

- Prefixes: racks «Шкафы», types «Типы», door configurations «Двери», works «Работы», plan stages «Этапы», problems «Проблемы».
- Names in the button: racks by their name («FA», «Без шкафа»), types by id, door configurations by their name, works and stages and problems by their line text without the count («Протяжка cat7», «Осталось: хивут», «⚠ С проблемами», «Проблема: Замок»). Names follow the window's order. A missing shared value (D2) counts and is named last.

### 1.2 Window

- `openModal(title, …)` over the current screen (windows stack, so it opens over «Что осталось» and the plan). Title: «Шкафы», «Типы», «Конфигурации дверей», «Работы», «Этапы», «Проблемы».
- Lines: a 22 px checkbox, the text, the count on the far end (`margin-inline-start: auto`, muted, 13 px). The list scrolls inside the window, `max-height: 55vh`.
- Section headings (plan stages only): «Осталось», «Работа», «Проблемы», not tickable, as today's `optgroup` labels.
- Under the list: «Отметить все», «Снять все», «Готово» («Готово» is the primary button, at the end).
  - «Отметить все» ticks every plain line (not «⚠ С проблемами», not the plan modes); group lines follow their members.
  - «Снять все» unticks every line, the special ones included.
- The ticks are applied once, when the window closes, by any way (`onClose`): «Готово», ✕, a tap outside. Pressing «Готово» or «Отметить все» twice changes nothing.
- After the window closes the screen refreshes as it does today after a drop-down change (the list, the plan drawing, the counters, the reset button).

### 1.3 Special lines

- **Group line** «▸ Все: <group> (типов: N)» (type filters built by `typeFilterOptions`): its count is the points of all member types. Shown ticked when every member type present in the list is ticked, unticked otherwise (no third state). A tap ticks all members when not all are ticked, otherwise unticks all. Members follow below as normal lines.
- **«⚠ С проблемами (N)»** (problems of «Точки», value `__any`) and **«⚠ С проблемами (N)»** of the plan's stage filter (value `pr|*`): ticking it unticks every single problem; ticking a single problem unticks it.
- **Plan modes** «❔ Не размеченые (N)» and «🙈 Скрытые (N)» at the end of the plan's type window: ticking one unticks every type and the other mode; ticking a type unticks both modes.

### 1.4 Matching

- Values of one filter: **or**. Different filters: **and** (unchanged).
- Racks: value is the rack name, «Без шкафа» is `__none`; a point matches when `set.has(point.cabinet || '__none')`.
- Types: `set.has(point.typeId)`.
- Door configurations: any value matches by today's `cfgMatch(value, point)` («⚠ Без запирания», «Без конфигурации», a configuration id).
- Problems («Точки»): `__any` — any open problem; a problem id — an open mark of that problem; several ids — any of them.
- Works («Что осталось»): the point still waits for any ticked key (`leftTasks(point)` has a task with that key).
- Plan stages: a point is bright when `planFilterMatch(value, …)` holds for any ticked value; empty set — all bright.
- Off (empty set; racks and types also full, D1): every point passes.

### 1.5 Values that disappear

- A ticked value that is no longer in the screen's options (a rack emptied, a work done on every point, a problem solved) is dropped from the set silently when the screen builds its options, as today's `typeFilterValid` / `cfgFilterValid` do.
- Exception: the shared sets are pruned only by «Точки» (whole project); the plan never drops a shared value (D2).

### 1.6 Pure module `src/domain/filters.js`

Covered by `tests/filters.test.js`. Option shape: `{ value, text, count?, kind: 'plain' | 'group' | 'any' | 'mode' | 'head', members?: [values] }`.

- `toggleValue(set, option, options)` → new set, applying § 1.3.
- `tickAll(options)`, `clearAll()`.
- `isOff(set, options, { covering })` — empty, or (covering) every plain value ticked.
- `normalize(set, options, { covering })` → empty set when covering and full; otherwise the set.
- `prune(set, options)` → set without values not among the options.
- `buttonText({ set, options, allText, prefix, missing = [] })` → the text of § 1.1 (without the arrow). `missing` — names of ticked shared values not in `options` (D2).
- `anyOf(set, test)` → `true` for an empty set, else whether `test(value)` holds for some value.
- `groupState(set, option)` → whether a group line shows ticked.

`src/app/typegroups.js` gains `typeOptions(typeIds, countOf)` (options with `kind: 'group'` and `members`), `src/app/cfgfilter.js` gains `cfgSetMatch(set, point)` and counts in its options already. Today's single-value `typeMatch`, `cfgMatch`, `typeFilterValid`, `cfgFilterValid` stay only where still used.

### 1.7 UI module `src/app/views/multifilter.js`

- `multiFilter({ title, allText, prefix, options: () => [...], get: () => Set, set: (Set) => void, covering = false, missing: () => [...], onChange })` → `{ el, refresh() }`: the button; a tap opens the window with a working copy of the set; on close it calls `set(normalize(copy))` and `onChange()` only when the set changed.
- `resetButton({ active: () => boolean, onReset })` → `{ el, refresh() }`: «✖ Сбросить фильтры», a secondary button with the red look of the mockup, hidden (`display: none`) while `active()` is false.

### 1.8 «✖ Сбросить фильтры»

Placed right under the filter row of each screen (above the selection bar, the list or the drawing). Shown while the screen has something active; a tap clears the screen's filters and search line and puts its single-value filters and checkboxes back to their defaults. The selection (points ticked for an action) is kept, apart from what the screen already does when its filters change.

| Screen | Active when | Reset sets |
|---|---|---|
| «Точки» | search text; shared racks, types, door configurations; problems; «План: …» not «все» | all of these empty / «все»; the shared sets are cleared for the plan too |
| «Что осталось» | works, racks, types, door configurations; «Протяжка: …» not «все» | all empty / «все» |
| «План» | shared sets (any not off on this drawing, or holding a missing value); stage set; a type mode | shared sets, stages, mode cleared (shared ones for «Точки» too); `sel` cleared as a type change clears it today; «Найти точку» untouched |
| «Протяжки» step 1 | types, door configurations, racks; «Только не протянутые» ticked | all empty; checkbox unticked |
| «Протяжки» step 3 | types | empty |
| points picker («Точки» window of «Добавить работу» / «Несколько работ») | search, racks, types, door configurations | all empty |
| choosing a point for a mark | search, types, racks; «Только точки без места на чертеже» unticked | all empty; checkbox ticked |
| placing points into a panel | types | empty |

`choosePoint({ typeId })` opens with that type ticked (as today it preselects it), so its reset button shows at once; the reset unticks it.

## 2. Screens

### 2.1 «Точки» (`meterView`, `src/app/views/points.js`)

- Filter row: search line (unchanged), then buttons racks («Все шкафы»), types («Все типы», with group lines), door configurations (only when the project has options, as today), «План: все» (drop-down, unchanged), problems («Проблемы: все», shown when some point has a problem or the filter is set, as today). Order as today.
- Racks, types and door configurations read and write the shared sets (§ 3). Problems and «План: …» stay module-level variables of `points.js`, as today (kept while the app is open, not shared).
- Counts: points of the whole project per value.
- Under the row: the reset button (§ 1.8).
- `showProblemPoints()` («Проект» → «⚠ Открытых проблем … — показать»): search empty, «План: все», shared sets cleared, problems = `{__any}`.
- Nothing matches: «Ничего не найдено» as today; the reset button is visible above it.

### 2.2 «Что осталось» (`remainingModal`)

- Filters: works («Все работы»; lines `<label> (<n>)`, pulls first as today), racks (shown when more than one rack value, as today; with «Без шкафа»), types, door configurations, «Протяжка: все» (drop-down, unchanged). Own sets, reset when the window opens (as today).
- The chips of every ticked work get today's outline.
- The line «Точек: N — фильтр по работе» shows while any work is ticked.
- Record button: see § 4.

### 2.3 «План» (`planModal`, `src/app/views/planmodal.js`)

- Filter row: «Найти точку или порт U38-05» (unchanged), types (with group lines and the two modes), door configurations (when options exist), racks (when the drawing has racks or «Без шкафа» points), stages. Then the reset button.
- Racks: values of this drawing's points, «Без шкафа» included now. Counts: points of this drawing.
- Types, racks and door configurations are the shared sets (§ 3). Missing shared values: D2. Covering (D1) is computed against this drawing's values: when every rack of this drawing is ticked, the plan treats the rack filter as off, and its button shows «Все шкафы».
- Stages: the window shows the three sections «Осталось» (the seven `LEFT_FILTERS` lines, no counts), «Работа» (works waiting on this drawing's points, with counts, pulls first), «Проблемы» («⚠ С проблемами (N)» and «Проблема: <name> (N)», only when some point has an open problem). A gone value is dropped (§ 1.5). Matching points stay bright, the others grey, as today.
- Modes: plan-local, reset when the plan opens. Ticking a mode clears the shared type set (§ 1.3), so «Точки» shows all types after it.
- **Nothing under the filters:** when no point of this drawing passes the type, rack and door-configuration filters (and no mode is on), a line «Под фильтры на этом чертеже точек нет» shows under the reset button (muted, 13 px). The drawing stays visible.
- **Focus point:** the point in focus (`focusId`: the point the plan was opened for from the card «📍 На чертеже» or another jump, the result of «Найти точку», the door of the «🚪 Двери» wizard, a point of the review list) is drawn and tappable even when the filters hide it — its progress frame, tag and the focus frame. It goes away with the focus frame (a tap on an empty spot, opening its card; idea 006 rules). The filters do not change.
- When the plan closes after a shared set changed, «Точки» shows the new filters (the tab re-renders, § 3).

### 2.4 «Протяжки» (`src/app/views/pullview.js`)

- Step 1: types, door configurations (when options exist), racks (with «Без шкафа» now), then «Только не протянутые» (unchanged). Own sets, reset when the pull opens (as today). «☑ Все видимые (N)» uses the new matching. Reset button under the row.
- Step 3 «Метраж»: types of the chosen points (shown when more than one, as today), several values; «▶ Следующая» and «Метраж: X из Y» use the set. Reset button when the set is not empty. The message «Все точки этого типа с метражом ✅ Выберите другой тип или сбросьте фильтр» stays.

### 2.5 Points picker (`pointsPicker`, `src/app/views/doh.js`)

Racks (when more than one value, as today), types, door configurations; search; reset button under the row. «Все показанные» ticks the shown points as today. Own sets, reset when the picker opens.

### 2.6 Choosing a point for a mark (`choosePoint`, `src/app/views/pointchooser.js`)

Types and racks (with «Без шкафа» now) as buttons; search, «Только точки без места на чертеже» (ticked when it opens, as today); reset button under the checkbox.

### 2.7 Placing points into a panel (`placeModal`, `src/app/views/racks.js`)

Types as a button (plain types, no group lines, as today). It opens with nothing ticked (today a single type was preselected; with one type the filter changes nothing). «Отметить все» of the dialog ticks the shown points as today. Reset button under the row.

## 3. Shared filters of «Точки» and «План» (`src/app/sharedfilters.js`)

- State in memory only: `{ pid, cab: Set, type: Set, cfg: Set }`. Nothing is written to the device or Firestore.
- `sharedFilters()` returns the sets for `currentProject().id`; when the stored `pid` differs (another project chosen, or none yet), the sets are cleared first. So switching projects clears them.
- `setShared(key, set)` stores and calls the change listeners; `clearShared()` empties all three.
- `meterView` uses them directly; `planModal` reads them each time it draws and writes them from its windows and reset.
- The shell re-renders the «Точки» tab after a change made on the plan: a listener in `meterView`'s module marks the tab stale, and the plan's `onClose` calls `ui.render()` when the tab is «Точки» (the plan is a window over the tab). The list never shows stale filters after the plan closes.
- Only «Точки» prunes the shared sets (§ 1.5).

## 4. «Что осталось» records several works

### 4.1 The record button

Let `ticked` be the ticked work keys, `rec` those that can be recorded (`p:<cable>` and `w:<workId>`; `s:<stage>` keys of old points cannot), `n` the ticked points.

| Case | Button | Action |
|---|---|---|
| no work ticked | «✅ Записать работу», disabled, title «Сначала выберите работу в фильтре» | — |
| `rec` empty (only `s:` keys) | «✅ Записать работу», disabled, title «Сначала выберите работу в фильтре» | — |
| `rec` has 1 key | «✅ Записать «<label>» (n)» (today's text) | the one-work form, § 4.2 |
| `rec` has 2+ keys | «✅ Записать выбранные работы (n)» | «Несколько работ», § 4.3 |
| `n` = 0 | the text above, disabled | — |

When `ticked` has `s:` keys besides `rec`, opening the form shows a toast: «Не записываются отсюда (старые точки): <labels> — запишите их в «Отчёты» → «Добавить работу»».

Before opening either form: `todayBlocked()` (a day off today blocks with today's message, unchanged). «Что осталось» closes, the form opens 60 ms later, as today.

### 4.2 One work

- `w:<id>`: as today — `addWorkForPoints(ids, { workId, workType })`.
- `p:<cable>`: `addWorkForPoints(ids, { workType: 'Протяжка', workId: <pull work>, cableId: <cable>, onlyCables: [<cable>] })`.
- `<pull work>`: the first active catalog work of type «Протяжка» that applies to points (`workUsesPoints`), so «Протяжка без точек» is never taken.
- `entryForm` with `preset.onlyCables`: while the work type is «Протяжка» and points are chosen, the pull groups (`pullGroups`) keep only the groups whose cable is in `onlyCables` (for old points the point's main cable). The form shows a line under «Точки»: «Протяжка записывается только для кабеля <cable>». When no group is left: toast «Уже протянуто: <labels>» and the form stays open (today's message). Changing the work type away from «Протяжка» drops the limit.

### 4.3 Several works — «Несколько работ» with a preset

New export in `src/app/views/doh.js`: `addWorksForPoints(pointIds, { workIds, pullCables })`, the twin of `addWorkForPoints`: finds today's day or makes `{ id, date: today, helper, helperHe, _new: true }` and opens `batchForm(day, preset)`.

Preset from «Что осталось»:
- `pointIds`: the ticked points that are shown, in list order.
- `workIds`: every `w:` key's work id, plus `<pull work>` (§ 4.2) once when any `p:` key is ticked.
- `pullCables`: the cables of the ticked `p:` keys (`null` when none).

`batchForm(day, preset)`:
- The picker starts with `preset.pointIds`; the works list starts with `preset.workIds` ticked (only those that apply to the points, as the list is built today).
- With `pullCables`, the pull work's line reads «<work name> — только <cable>, <cable>» («Протяжка по точкам — только cat7»).
- «Сохранить всё»:
  - each ticked work, as today: a pull → `pullGroups(...)`, with `pullCables` keeping only the groups of those cables; other works → only the points that still wait for it (`workApplicable`);
  - a work with no points left writes nothing;
  - all writes go in **one** `repo.save`: when `day._new`, the day first (`{ date, helper: day.helper || 'сам', helperHe: day.helperHe || 'сам' }`, exactly as `entryForm` writes it), then the entries; then `syncJournal` per entry, `bumpLastWork(day.date)`, toast «Записей добавлено: N»;
  - nothing to write at all (every point already done): toast «Записей добавлено: 0», the day is not created.
- Opened from a day screen («Несколько работ» button): no preset, the day exists — as today.

### 4.4 Pull entries are the same as from the one-work form

An entry written by «Несколько работ» for one cable is `{ dayId, workType: 'Протяжка', workId, pointIds, cableId, result: undefined }`. The one-work form writes the same fields plus `deviceIds: null` and empty extras (minutes, culprit, note, delay…), which `clean()` in `src/app/repo.js` stores as `null`. A `null` and a missing field mean the same everywhere (`entry.deviceIds?.length`, `blank()` checks). So the report line, the point status and the journal rows are the same. A test compares the two.

## 5. English names of catalog items (KI-7, catalog part)

### 5.1 Built-in names

- The example problems and their ready descriptions get dictionary entries (removed from `src/i18n/not-ui.json`): see § 8.
- «по умолчанию (зелёный)» in the shilut settings (`src/app/views/shilutsettings.js`): today the template `по умолчанию${…}` passes « (зелёный)» as one part that `tr()` cannot split. The two branches become two literals: `по умолчанию (${name})` and `по умолчанию — без цвета`.
- New test `tests/catalog-en.test.js`: every Cyrillic name of the seed (`CATALOG`, `composedTypes(POINT_TYPES)`, `DEVICES`, `CABLES`, `UNITS`, `CULPRITS`, `DELAY_REASONS`), of `src/data/starter-pool.json` (types, devices, cables, works, door configurations), of `EXAMPLE_PROBLEMS` (names and descriptions), of `SHILUT_COLORS`, the door part names and the short words of `doorcfg.js` goes through the real `tr()` in English (the loader of `tests/i18n-coverage.test.js`) and comes out with no Cyrillic letters.

### 5.2 Own English name `nameEn`

- Field «Название (English)», optional, text, placed right after the Hebrew name in:
  - «Каталог работ», «Устройства» (`REFS.catalog`, `REFS.devices` in `src/app/views/settings.js`) — after «Название (иврит)»;
  - «Типы точек», «Кабели» (`REFS.types`, `REFS.cables`) — after the Hebrew name field;
  - the problem form (`src/app/views/problems.js`) — after «Название на иврите».
- Saving (`prepare` and the problem form's `onSubmit`): the trimmed value; written only when not empty, or as `''` when the item had a `nameEn` before (to clear it). An item that never had one gets no field, so its pool fingerprint (`deepHash`) does not change by editing other fields.
- The reference-list line (`line()`) shows nothing new.
- Display (`ctxNames` in `src/app/shell.js`): today it runs only in Hebrew. In English it builds `name → nameEn` from the catalog, devices and problems (`name`), types and cables (`id`), for items with a non-empty `nameEn`, and passes it to a new `addOwnNames(map)` in `src/i18n/index.js`.
- `tr()` order in English: own names (exact text) → static dictionary → `extra` → patterns. In Hebrew the order stays as today. Sentences with a name inside («Проблема: {} ({})», «{} · {}») translate the name part through the same lookup, so own names show there too.
- Russian and Hebrew screens, the daily report, the month report, «PDF с номерами», the management sheets: unchanged (they never read `nameEn`).
- `nameEn` travels with the item to the shared pool and its inbox like any other field (`src/domain/pool.js` compares whole items); `scripts/export-pool.mjs` keeps it.

## 6. Test drawing `?mem=1&memPlan=1`

### 6.1 Behaviour

- Only in test mode: `?mem=1&memPlan=1`. Without `memPlan` test mode is unchanged. On the live site without `mem` the flag does nothing.
- After the test sign-in, the app creates a project «Test drawing» (Latin name, so the coverage test sees no new Russian), makes it current and opens «Точки». The plan's drawing «test-plan.pdf» is there; «🗺 План» opens it.
- The tour still pops up first, as in every test-mode start («Не напоминать»).
- `docs/workflow.md`, test mode paragraph: «`&memPlan=1` adds a project with a ready drawing and points at every progress stage (spec 7 § 6)». `PROJECT_CONTEXT.md`: the gotcha «`?mem=1` has no drawing …» is replaced by the flag.

### 6.2 Modules

- `src/domain/testplan.js` (pure): `testPlanPdf()` → `Uint8Array` of a one-page PDF, 600 × 400 pt, Helvetica 9 pt captions (`BT /F1 9 Tf x y Td (label) Tj ET`), grey lines for a few rooms, the cross-reference table with correct byte offsets; `testPlanData()` → `{ drawing, points, journal, marks, unlinked, hidden }` with ids and positions (`pos: { sheet: 'test-plan.pdf', page: 0, x, y: 400 − pdfY, w, h, text: label }`, `w`/`h` from the caption width at 9 pt).
- `src/app/testplan.js`: `startTestPlan()` — `createProject`, `setCurrentProject`, `cachePut(drawing.id, bytes)` (the device copy `pz-drawings`), the drawing entry on the project (`drawings: [{ id: 'DR_test', name: 'test-plan.pdf', title: 'Test drawing', pages: [{ w: 600, h: 400 }], size, addedAt, addedBy }]`, `unlinked`, `hidden`), the points, the journal edit rows, the problem marks; when the shared problems list has no «Кабель» problem yet, the example problems are written to the pool first. Imported dynamically from `src/main.js` only when `memPlan` is set, so the live bundle does not load it.

### 6.3 The points

Types and works from the seed (`createProject` without `refs`). Progress through journal edit rows `edit_<pointId>_<workId>` = `{ pointId, editDate, editWorkId, editCableId?, entryId: null, deleted: false }`.

| Label | Type | Rack | On the drawing | State | Plan look |
|---|---|---|---|---|---|
| FA/C-01 | Камера | FA | yes | nothing | default frame |
| FA/C-02 | Камера | FA | yes | length 25 m | default frame |
| FA/C-03 | Камера | FA | yes | pulled (`PR_PTS`) | pink |
| FA/C-04 | Камера | FA | yes | pulled, keystone (`HIV_KEY`) | gradient, early |
| FA/C-05 | Камера | FA | yes | pulled, `HIV_KEY`, `HIV_DEV`, `INS_CAM`, `CHK_FLUKE`, `SHL` | thick dark green |
| FA/W-01 | Вайфай | FA | yes | pulled; open problem «Кабель» | red |
| FA/B-01-02 | Бакар | FA | yes | nothing (2 × cat7) | default frame |
| FB/K-01 | Коре биометри | FB | yes | 6005 pulled (`editCableId: '6005'`), cat7 not | pull circles |
| FB/D-01 | Дверь | FB | yes | door configuration «ЭМ» (the standard one of `doorcfg.js`), 6005 pulled | pink |
| FB/D-02 | Дверь | FB | yes | no configuration | default frame |
| FB/G-01 | Галай | FB | yes | pulled, installed (`INS_GALAI`) | gradient |
| FB/C-10, FB/C-11 | Камера | FB | one shared mark | FB/C-10 pulled | one frame, colour of the least finished |
| G-02 | Галай | — (no rack) | yes | nothing | default frame |
| FC/C-01, FC/C-02 | Камера | FC | no | nothing | — (for D2 and «Нет на плане») |

Plus one unlinked caption «X-99» («❔ Не размеченые (1)») and one hidden mark «X-98» («🙈 Скрытые (1)»), both printed on the PDF. Exact positions are the ticket's; captions must not overlap and must stay 20 pt from the page edges.

## 7. Edge cases

| Case | Expected |
|---|---|
| All racks ticked, «Готово» | stored empty; button «Все шкафы»; not active |
| All door configurations ticked | kept; button «Двери: N»; only door points with those values show |
| Group line with one of three members ticked | shows unticked; a tap ticks all three |
| Group whose members are partly on this drawing | the line counts and ticks only the members on the drawing |
| «⚠ С проблемами» ticked, then «Проблема: Замок» | «⚠ С проблемами» unticked, «Замок» ticked |
| Plan mode «❔ Не размеченые» ticked with types ticked | types unticked (shared set cleared, «Точки» too), mode on |
| A ticked rack is emptied (points moved) | «Точки» drops it silently next time it builds options |
| Shared rack FC ticked, plan of a drawing without FC | FC greyed and ticked at the end of the window «Шкаф FC — нет на этом чертеже»; with no other rack ticked: no points and «Под фильтры на этом чертеже точек нет» |
| Shared racks FA, FB ticked, drawing has only FA and FB, project also FC | plan: rack filter off, button «Все шкафы»; «Точки»: «Шкафы: FA, FB» |
| Plan opened from a card for a point hidden by the shared types | the point is drawn with the focus frame; the filters stay; after a tap on an empty spot it is hidden again |
| Project switched | shared sets empty; «Точки» problems, «План: …» and search kept (as today) |
| «Что осталось»: 2 works, a ticked point waits for one | that point gets only that work |
| «Что осталось»: «Протяжка cat7» and «Протяжка 6005» ticked | «Несколько работ» with one pull line «Протяжка по точкам — только cat7, 6005»; one entry per cable |
| «Что осталось»: only «Протяжка cat7», point FB/K-01 (6005 done, cat7 left) | one entry cat7; the point's other cables untouched |
| «Что осталось»: only «Протяжка cat7» on a door with 6005 left only | the door is not in the list (it does not wait for cat7) |
| «Несколько работ» with the preset, the owner unticks a point in the picker | only the remaining points are written |
| «Несколько работ» with the preset, today has no day | the day is created in the same save as the entries |
| «Несколько работ», every work already done on every point | «Записей добавлено: 0», no day created |
| Today is a day off | the forms do not open; today's day-off message |
| The same value ticked twice / «Отметить все» twice | no change |
| 20+ types, 15 racks | the window scrolls; the button shows «Типы: 20» |
| Very long door configuration names in the button | cut by «…» at 190 px |
| English UI, own work «Датчик протечки» without `nameEn` | Russian name shows |
| English UI, own work with `nameEn` «Leak sensor» | «Leak sensor» in lists, filters, «Проблема: …»-type sentences |
| English UI, built-in «Камера» given own `nameEn` «CCTV camera» | «CCTV camera» (own name wins, D6) — also where «Камера» is a UI word, which is the same word |
| Hebrew UI | unchanged; `nameEn` ignored |
| No network | nothing changes; filters are on the device |

## 8. Texts

New UI strings (Russian → English, Hebrew). The ticket that adds a string adds its entry (`src/i18n/src/*.json` + `node scripts/i18n-build.mjs`, rule 12).

| Russian | English | Hebrew |
|---|---|---|
| Шкафы: {} | Cabinets: {} | ארונות: {} |
| Типы: {} | Types: {} | סוגים: {} |
| Двери: {} | Doors: {} | דלתות: {} |
| Работы: {} | Works: {} | עבודות: {} |
| Этапы: {} | Stages: {} | שלבים: {} |
| Проблемы: {} | Problems: {} | בעיות: {} |
| ✖ Сбросить фильтры | ✖ Reset filters | ✖ איפוס מסננים |
| Под фильтры на этом чертеже точек нет | No points on this drawing match the filters | אין בתוכנית הזו נקודות שמתאימות למסננים |
| {} — нет на этом чертеже | {} — not on this drawing | {} — לא בתוכנית הזו |
| ✅ Записать выбранные работы ({}) | ✅ Record the ticked works ({}) | ✅ רישום העבודות שנבחרו ({}) |
| Не записываются отсюда (старые точки): {} — запишите их в «Отчёты» → «Добавить работу» | Can't be recorded from here (old points): {} — record them in “Reports” → “Add work” | לא נרשמות מכאן (נקודות ישנות): {} — רשמו אותן ב„דוחות” ← „הוספת עבודה” |
| {} — только {} | {} — only {} | {} — רק {} |
| Протяжка записывается только для кабеля {} | The pull is recorded only for cable {} | ההשחלה נרשמת רק לכבל {} |
| Название (English) | Name (English) | שם (אנגלית) |
| по умолчанию ({}) | default ({}) | ברירת מחדל ({}) |
| по умолчанию — без цвета | default — no colour | ברירת מחדל — בלי צבע |
| Замок | Lock | מנעול |
| Доступ | Access | גישה |
| Не просверлены двери | Doors not drilled | הדלתות לא קדוחות |
| Нет питания на замке | No power at the lock | אין מתח במנעול |
| Кабель повреждён | Cable damaged | כבל פגום |
| Кабель не дотянут | Cable not pulled all the way | הכבל לא הושחל עד הסוף |
| Нет доступа в помещение | No access to the room | אין גישה לחדר |

Existing strings reused: «Все шкафы», «Все типы», «Все конфигурации дверей», «Все работы», «Все этапы», «Проблемы: все», «Шкафы», «Типы», «Конфигурации дверей», «Работы», «Этапы», «Проблемы», «Осталось», «Работа», «Отметить все», «Снять все», «Готово», «Без шкафа», «Шкаф {}», «⚠ С проблемами ({})», «Проблема: {} ({})», «❔ Не размеченые ({})», «🙈 Скрытые ({})», «Сначала выберите работу в фильтре», «✅ Записать работу», «✅ Записать «{}» ({})», «Записей добавлено: {}», «Уже протянуто: {}», «Ничего не найдено».

Guide lines (`src/app/views/guide.js`), each in the section of its screen; the ticket of that screen adds it:

| Russian | English | Hebrew |
|---|---|---|
| • Фильтры точек — кнопки: нажмите, отметьте галочками несколько значений (например, два шкафа и три типа) и нажмите «Готово». Значения одного фильтра складываются, разные фильтры сужают список. | • Point filters are buttons: tap one, tick several values (for example two cabinets and three types) and press “Done”. Values of one filter add up; different filters narrow the list. | • מסנני הנקודות הם כפתורים: הקישו, סמנו כמה ערכים (למשל שני ארונות ושלושה סוגים) והקישו „סיום”. ערכים של מסנן אחד מצטרפים, ומסננים שונים מצמצמים את הרשימה. |
| • «✖ Сбросить фильтры» под фильтрами очищает все фильтры и строку поиска этого экрана. Отмеченные для действия точки остаются. | • “✖ Reset filters” under the filters clears all filters and the search line of this screen. Points ticked for an action stay ticked. | • „✖ איפוס מסננים” מתחת למסננים מנקה את כל המסננים ואת שורת החיפוש של המסך. נקודות שסומנו לפעולה נשארות מסומנות. |
| • Шкафы, типы и конфигурации дверей общие у «Точек» и «Плана», пока приложение открыто: план открывается с тем, что выбрано в «Точках», и наоборот. | • Cabinets, types and door configurations are shared by “Points” and “Plan” while the app is open: the plan opens with what you chose in “Points”, and the other way round. | • ארונות, סוגים ותצורות דלתות משותפים ל„נקודות” ול„תוכנית” כל עוד האפליקציה פתוחה: התוכנית נפתחת עם מה שנבחר ב„נקודות”, וגם להפך. |
| • В «Что осталось» можно отметить несколько работ: «✅ Записать выбранные работы» откроет «Несколько работ» с этими точками и работами. Протяжка записывается только по отмеченным кабелям. | • In “What's left” you can tick several works: “✅ Record the ticked works” opens “Several works” with those points and works. A pull is recorded only for the ticked cables. | • ב„מה נשאר” אפשר לסמן כמה עבודות: „✅ רישום העבודות שנבחרו” פותח „כמה עבודות” עם הנקודות והעבודות האלה. השחלה נרשמת רק לכבלים שסומנו. |
| • Английское название своей работы, типа, устройства, кабеля или проблемы — поле «Название (English)» в справочнике. Без него в английском интерфейсе видно русское название. | • An English name for your own work, type, device, cable or problem: the “Name (English)” field in the reference list. Without it the English interface shows the Russian name. | • שם באנגלית לעבודה, סוג, אביזר, כבל או בעיה משלכם — השדה „שם (אנגלית)” ברשימה. בלעדיו הממשק באנגלית מציג את השם ברוסית. |

## 9. Data and external services

- Filters: memory only, per open app; nothing on the device, nothing in Firestore.
- New optional field `nameEn` (string) on project and pool items of `catalog`, `types`, `devices`, `cables`, and on `pool_problems` items. No migration. Firestore rules: unchanged (they do not list fields). Stage 4 must carry it (`docs/project-spec.md` already says so; § 10 corrects the list).
- Entries written by «Несколько работ»: the same shape as today (§ 4.4); a day created by it is the same shape as `entryForm`'s.
- Test drawing: memory and the browser's `pz-drawings` IndexedDB of the test profile only.
- No Google Drive, Sheets or Firebase calls are added; no cost.

## 10. Tests

Automated (`node:test`):
- `tests/filters.test.js` — `toggleValue` (plain, group with partial members, «⚠ С проблемами» against singles both ways, modes against types and each other), `tickAll` / `clearAll`, `isOff` and `normalize` (covering vs not, D1), `prune`, `buttonText` (none, 1, 2, 3+, covering full, missing names last), `anyOf` (empty set passes all).
- Matching with sets through the domain helpers: racks with `__none`; types; door configurations with «⚠ Без запирания» / «Без конфигурации» (a stub `cfgMatch`); problems `__any` and ids; works keys of `leftTasks`; plan stages via `planFilterMatch` with several values (any matches).
- Shared filters: a change through `setShared` is seen by a second reader; another `pid` clears; the plan path does not prune a missing value (pure part of `sharedfilters.js` kept testable, or the test drives the module with a stub `currentProject`).
- «Что осталось» preset: a pure `remainingPreset(tickedKeys, pointIds, catalog)` → `{ mode: 'one' | 'many' | 'none', workIds, pullCables, left: [s: labels] }` for: one `w:`, one `p:`, two `w:`, `p:` + `w:`, two `p:`, only `s:`, `s:` + two `w:`.
- Pull limit: `pullGroups` filtered by `onlyCables` on a point with 6005 done and cat7 left, and on a point with both left; old points by their main cable.
- Entries alike (§ 4.4): the entry built by «Несколько работ» for one cable and by the one-work form give the same `entryLine` and the same `pointInfo` after `syncJournal` (domain-level, with a small ctx).
- `tests/catalog-en.test.js` (§ 5.1).
- `tests/testplan.test.js` — the PDF starts with `%PDF-`, every xref offset points at `N 0 obj`, the `/Length` of the content stream is right, every point of `testPlanData()` with a position lies inside the page, labels are unique, every progress state of § 6.3 is present.
- `tr()` with own names: own name wins in English; Hebrew order unchanged (in `tests/i18n-coverage.test.js` or a new file using its loader).
- The coverage test passes with the new strings.

Checked in the browser pane by each ticket (`?mem=1&memPlan=1`, 420 px): the screens of § 2, the plan look of every row of § 6.3, the reset, the shared filters both ways, D2, the focus point, the two record paths and their entries in «Отчёты», English and Hebrew.

The owner checks on the phone (each ticket's check; the whole list after the review):
1. «Точки»: «Все шкафы» → tick two racks → «Готово»: the button shows both names, the list shows both racks only.
2. «Все типы» → tick three types: only those types within those racks; «✖ Сбросить фильтры» is visible.
3. «🗺 План»: the same racks and types are ticked; only those points show.
4. «✖ Сбросить фильтры» on the plan: all points back; in «Точки» filters and search are empty and the reset button is gone.
5. Plan: «Все этапы» → tick «Осталось: хивут» and «Осталось: шилют»: points waiting for either are bright.
6. «🧾 Что осталось»: tick two works and a few points → «✅ Записать выбранные работы»: «Несколько работ» opens with them; «Сохранить всё»: both works are in today's report on the right points.
7. «Что осталось»: tick only «Протяжка cat7» on a point that also has 6005 → record: only cat7 is pulled, 6005 still «осталось».
8. «Протяжки», «Добавить работу» → «Выбрать точки…», «➕ Поставить точки в панель»: several types can be ticked; «Сбросить фильтры» clears them.
9. English: a work of your own → «Название (English)» → its English name shows in English; the example problem «Замок» shows «Lock». Hebrew: the buttons and windows read right to left.

## 11. Docs to update

- `CONTEXT.md`: «Point filter» and «Shared filters» exist; add **Test drawing** (code: `src/domain/testplan.js`, `?mem=1&memPlan=1`) — a generated one-page PDF with points at every progress stage for checks in test mode; add `nameEn` to **Shared pool** («items carry `nameEn`, an optional English name»).
- `docs/project-spec.md`, stage 7, Data: «One new optional field, `nameEn`, on works, point types, devices, cables (project and shared pool) and on shared problems»; door configurations removed from that list (D5).
- `docs/workflow.md`, test mode: `&memPlan=1` (§ 6.1).
- `PROJECT_CONTEXT.md`: the gotcha on the missing drawing replaced (§ 6.1); stage 7 sessions estimate → 11 (description, spec, slicing, 7 tickets, review).
- `KNOWN_ISSUES.md`, KI-7: status «fixed (catalog names)» after the review; the sentences-from-parts part stays open.
- `docs/coding-standards.md`: a rule «point filters use `multiFilter` (`src/app/views/multifilter.js`); no new single-value drop-downs for point filters», added by ticket 02 with its check (grep for `h('option', { value: '' }, 'Все типы'` and the other «all» texts in `src/app/views/` outside `multifilter.js`).
- In-app guide: § 8.
- No new ADR: filters in memory are easy to reverse; the English name is one optional field.
- No new `KNOWN_ISSUES.md` entries.

## 12. Proposed tickets

| # | Ticket | Complexity | Blocked by | Holds |
|---|---|---|---|---|
| 01 | Test drawing `&memPlan=1` | medium | — | § 6; docs of § 6.1 |
| 02 | Filter control, matching rules and «Точки» | complex | 01 | § 1, § 2.1, § 3 (store and «Точки» side), the coding-standards rule, guide lines 1–2 |
| 03 | Plan: shared filters, stages, modes, D2, empty line, focus point | complex | 02 | § 2.3, § 3 (plan side), guide line 3 |
| 04 | «Что осталось» filters and «Протяжки» steps 1 and 3 | medium | 02 | § 2.2 (filters and reset; the record button keeps today's one-work behaviour), § 2.4 |
| 05 | Pickers: points picker, point for a mark, placing into a panel | simple | 02 | § 2.5–2.7 |
| 06 | «Что осталось» records several works; pull by ticked cables | complex | 04 | § 4, guide line 4 |
| 07 | English names: `nameEn`, own names first, example problems, test | medium | — | § 5, guide line 5, `CONTEXT.md` and `docs/project-spec.md` of § 11 |

Order: 01 → 02 → 03 → 04 → 05 → 06 → 07 (07 has no dependency and may move earlier). Each ticket goes live after its self-check (ADR 0011) and the owner checks it on the phone.
