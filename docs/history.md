# History

Dated details of every accepted step, newest first. Read only when a session needs a past detail.

## 2026-11-25 — Description 4: PocketBase storage («Описание 4»)

- `.scratch/04-pocketbase-storage/description.md` and mockup `mockups/nas-copy.html` (sign-in, «Подключение к базе», the «server older than the app» notice on the NAS copy). The owner started the stage before the NAS checks: code is self-checked on a local PocketBase.
- Owner's decisions: the NAS project does the whole move, all code stays here (ADR 0019); the NAS build moves from stage 5 into stage 4; off-site copy once the NAS is main = daily JSON in `polevoy-backups` + a zip on Drive (R-BAK-2, before the switch-over); project files on the NAS — an idea after the move; the NAS project reports back after the move (R-MOVE-3); the move is rehearsed here on a copy of the owner's backup and the phone side of the switch-over is written here. KI-8 is fixed in this stage.
- `docs/nas-requirements.md` version 2026-11-25 (commit `ae41367`): who does what, R-PB-4 `0.0.0.0`, tailnet in Superuser IPs, home-only HTTPS dashboard name, settings by script, R-PB-8 delivery with `schema`, R-SITE-1/2 stage 4, `cloudflared` pinned by the NAS project, R-BAK-2 stage 5, R-MOVE-1…3, A11 before the switch-over, A12 accepted, data volume of 2026-11-23. Answers to the NAS project: `.scratch/04-pocketbase-storage/nas-answers.md`. `docs/project-spec.md` stages 4 (≈ 21 sessions) and 5 (≈ 3) and «Later»; `CONTEXT.md` term «NAS project». Next: «Спека 4».

## 2026-11-24 — Review 8: stage 8 closed («Ревью 8»)

- Tickets 8.1 and 8.2 (`06e4960..47997ab`) against spec 8 and the coding standards, plus the code-review skill at effort high; walked in `?mem=1&memPlan=1` at 420 px (two drawings, pan, resize, «📍 Отметить на плане»). Output `.scratch/08-field-improvements-3/review.md`.
- 4 findings, all fixed now and live (commit `0067d11`): F1 a plan opened for placing replaced the drawing's remembered view with the fitted one, F2 a slow page load during `restore()` could store page 1 fitted — `planModal.show()` now saves nothing until it has chosen the view (`settled`), then queues it once, and a placing open queues the drawing's old entry; F3 `centre()` is `null` for a 0×0 viewer; F4 (older than stage 8) `addBundleOps` writes `deleted: false`, so an item the project deleted comes back with a pool type (test extended). No fix round, no deferral. Tests 357.
- Wish: move the view choice of `planModal.show()` into `planmemory.js` if it grows. Next: «Описание 4» once the NAS passes its checks.

## 2026-11-24 — Ticket 8.2: the plan remembers the drawing, place and zoom («Тикет 8.2»)

- Idea 009 live and checked by the owner on the phone. `src/domain/planmemory.js` (pure): `parsePlanMemory`, `viewFor`, `rememberView`, `drawingToOpen`, `centreOf` / `cornerOf`. `createViewer` gets `onView()`, `centre()`, `restore()` and keeps the centre and zoom on resize for every caller. `planModal` reads and writes `pz.planView.<projectId>` (0.5 s after the view stops, on close, on `visibilitychange` to hidden); internal redraws now return to the same place instead of fitting (D10).
- Decisions: `rememberView` drops the written drawing too when it is not in `liveIds` (a drawing removed meanwhile keeps nothing); a pending view carries its drawing id and is flushed before switching drawings. «Test drawing 2» (`DR_test2`, `test-plan-2.pdf`) added to `?mem=1&memPlan=1`. Tests 340 → 357. Next: «Ревью 8».

## 2026-11-24 — Ticket 8.1: works not in the plan colour («Тикет 8.1»)

- Idea 008 live and checked by the owner on the phone. `inPlanColour`, `colourInfo` (inside `planColor`) and `planColourPatch` in `src/domain/plan.js`: a work with `planColour: false` (not «Протяжка») is dropped from the status the colour is built from, so the plan, shared marks and «PDF с номерами» agree; the card, «Что осталось», reports and sheets keep it. `NUMBERED_V` stays 4.
- `PROJECT_ONLY = ['planColour']` in `bare()` (ADR 0018) keeps the box out of the pool, inbox and type library; `addBundleOps` and the administrator's accept and edit now write through `bare()`. The box, its hint and the list mark « · не в цвете плана» in `REFS.catalog` (hidden for «Протяжка» and in pool forms; `itemForm` passes `pool` to `fields` and `prepare`). FA/C-06 in the test drawing (16 captions). English and Hebrew, guide line, 14 new tests (340 in all).
- Also fixed: five starter-pool names added by the pool bot on 2026-11-23 had no English (`catalog-en` test red, every deploy since failed); translated in `src/i18n/src/04-data.json`.

## 2026-11-24 — Tickets 8: stage 8 sliced («Тикеты 8»)

- Two tickets accepted in `.scratch/08-field-improvements-3/issues/`: 01 works not in the plan colour (idea 008; `inPlanColour`, `colourInfo`, `planColourPatch`, `PROJECT_ONLY` in `bare()`, the box and list mark in the catalog, FA/C-06 in the test drawing, ADR 0018), 02 the plan remembers the drawing, place and zoom (idea 009; `planmemory.js`, viewer `onView` / `centre()` / `restore()`, «Test drawing 2»). Both medium, independent, 01 first. Next: «Тикет 8.1».

## 2026-11-24 — Spec 8: stage 8 specified («Спека 8»)

- `.scratch/08-field-improvements-3/spec.md` accepted by the owner. Idea 008: `inPlanColour` (absent or `true` = counted, a «Протяжка» work always counts) and `colourInfo` inside `planColor`, so the plan, shared marks and «PDF с номерами» agree while the card, «Что осталось», filters and sheets keep the full task list; `NUMBERED_V` stays (the fingerprint already holds the colours). The box is kept out of the pool by `bare()` (`PROJECT_ONLY = ['planColour']`), the administrator's accept writes through `bare()`; the form writes `false` / `true` / nothing because project writes merge; hidden for «Протяжка» works and in the pool forms.
- Idea 009: `src/domain/planmemory.js` (record validation, `viewFor`, `rememberView`, `drawingToOpen`, `centreOf` / `cornerOf`); the viewer gets `onView`, `centre()`, `restore()` and keeps the centre on resize; the plan saves 0.5 s after a move, on close and when the page is hidden; the opening point and placing keep today's view, internal redraws return to the remembered place.
- Test drawing: FA/C-06 (all done but `HIV_DEV`) and «Test drawing 2». Two tickets instead of three: the box and the pool rule must go live together. Next: «Тикеты 8».

## 2026-11-24 — Description 8: stage 8 described («Описание 8»)

- `.scratch/08-field-improvements-3/description.md` accepted, with the rough mockup `mockups/catalog-work.html` (catalog list mark « · не в цвете плана», the box in the work's edit window, plan colour before and after). Takes in ideas 008 and 009 as written; their status lines point to the description.
- Owner's decisions: no work is unticked by default — the owner unticks the rack termination per project (replaces the idea's `HIV_DEV` default; its live pool name is «Хивут в шкафа бакары»); the box is a project setting, not stored or compared by the shared pool, and a pool update never changes it; no other wishes for the stage. Agent: test mode uses the same `pz.planView.<projectId>` key (test projects have their own ids).
- No open KI fits the stage. `docs/project-spec.md`: stage 8 lines corrected, stage 4 data line for `planColour` on project works only; the stage 4 line of the Next step too. Next: «Спека 8».

## 2026-11-23 — Quick fix: «Только не протянутые» on by default («Правка: pull-meters»)

- Checked by the owner on the phone. Step 1 of a pull (`src/app/views/pullview.js`) opens with «Только не протянутые» ticked, so pulled points are hidden from the plan, «Все видимые» and the frame; untick it to see all. «✖ Сбросить фильтры» returns it to ticked and shows up when it is unticked. Search still finds a pulled point. Guide line updated in three languages.

## 2026-11-23 — Quick fix: a pull takes the card length by itself («Правка: pull-meters»)

- Checked by the owner on the phone. The owner: chosen points that already had a length in their card showed «без метража» and «Метраж: 0 из N» in «Протяжки»; the card length was taken only after «✓ Оставить из карточки» on each point. Now `reconcilePull` (`src/domain/pull.js`) also gives every unmeasured, not pulled point with a card length «kept from the card» (total as in the card, «до шкафа» not added); it runs when a pull opens, in the pull list and whenever points are added or removed in step 1 (`toggle` in `src/app/views/pullview.js`). A different length can still be entered over it. Test in `tests/pull.test.js`, a guide line in «Шаг 3. Протяжка».

## 2026-11-21 — Review 7: stage 7 closed («Ревью 7»)

- Reviewed commits `9b30097..77e7f13` (seven tickets) against spec 7, coding-standards rules 1–13 and the running app (`?mem=1&memPlan=1`, 420 px, Russian, English, Hebrew); 326/326 tests, build, code map and comment check pass. The owner checked the stage on the phone (spec 7 § 10, nine steps) and accepted it.
- Two findings, both fixed now, no fix round: F1 KI-7 marked fixed for the catalog names (test in `tests/catalog-en.test.js`), still open for sentences built from parts; F2 the stage 4 data line in `docs/project-spec.md` names `nameEn` on project and pool items of the five kinds.
- Checked and left: the missing-rack line reads «FC — нет на этом чертеже» without «Шкаф» (spec § 8 string); «Точки» follows the plan through the in-place listener instead of `ui.render()` on close; `remainingPreset` takes `ctx`; «Несколько работ» from a day screen also saves in one `repo.save`. Wishes: if a very large project feels slow, mark the «Точки» tab stale instead of refilling it while the plan filters change; stage 4 carries `nameEn`.

## 2026-11-21 — Ticket 7.7: English names of catalog items («Тикет 7.7»)

- New optional `nameEn` («Название (English)», right after the Hebrew name) on works, point types, devices, cables (`settings.js`) and shared problems (`problems.js`); pure `nameEnPatch(value, existing)` and `ownNameMap(ctx)` in the new `src/domain/ownnames.js`: written only when not empty, `''` clears, no key for an item that never had one, so the pool fingerprint is unchanged. Door configurations get no field (D5). `pool.js` labels it «English» in the change list, `poolview.js` shows it.
- Display: `ctxNames` in `shell.js` now runs in English and gives `ownNameMap` to `addOwnNames` in `src/i18n/index.js`; `tr()` order in English is own names → dictionary → `extra` → patterns, so sentences with a name show them too; an own name keyed by a Latin id (cable «cat7») also works. Hebrew and Russian never read `nameEn`.
- The seven example-problem texts left `not-ui.json` and got English and Hebrew; «по умолчанию (…)» in `shilutsettings.js` is two literals. Seed and starter pool unchanged (D4). Guide line 5 in «Справочники». `CONTEXT.md` and `docs/project-spec.md` updated.
- Tests 317 → 326: `tests/catalog-en.test.js` (every built-in name in English with no Cyrillic, own names win in English, Hebrew order unchanged, patch and map rules, fingerprint); the `tr()` loader moved to `tests/i18n-loader.js`. Walked at 420 px in `?mem=1&memPlan=1` in English and Hebrew. KI-7 stays open until «Ревью 7».

## 2026-11-21 — Ticket 7.6: «Что осталось» records several works («Тикет 7.6»)

- Record button of `remainingModal` by spec 7 § 4.1: one recordable key — the one-work form, two or more — «✅ Записать выбранные работы (n)» opens «Несколько работ» (`addWorksForPoints` in `doh.js`) with the ticked points and works; only `s:` keys — disabled; `s:` keys besides others — a toast «Не записываются отсюда (старые точки): …»; `todayBlocked()` before the window closes. `batchForm(day, preset)`: the picker and works start from the preset, the pull line reads «<work> — только cat7, 6005», «Сохранить всё» writes the new day and all entries in one `repo.save`; nothing to write → «Записей добавлено: 0», no day.
- D3 fixed: `pullGroups(..., onlyCables)` in `compose.js` keeps only the ticked cables (old points by their main cable); the one-work form gets `onlyCables` from «Что осталось», shows «Протяжка записывается только для кабеля {}», and drops the limit for good when the work type leaves «Протяжка».
- `remainingPreset(tickedKeys, pointIds, ctx)` and `pullWorkOf(ctx)` in `src/domain/remaining.js` (takes `ctx`, not the catalog, because the pull work must apply to points through `workUsesPoints`); `p:` keys without a pull work by points count as not recordable. `singleWorkKey` removed. `tests/remaining-record.test.js` (presets, the pull limit on the test drawing's FB/K-01, entries of «Несколько работ» and of the one-work form read the same); tests 312 → 317.
- Found and fixed: in English the pull line came out «Cable pull по точкам — only …» (the pattern «Протяжка {}» won over «{} — только {}»): the work name is translated with `tr()` on its own. Guide line 4 of § 8 and strings in three languages. Walked at 420 px in Russian, English and Hebrew (the pane's delayed taps land on sliding windows: buttons pressed through JS there); owner checked on the phone: works.

## 2026-11-21 — Ticket 7.5: pickers («Тикет 7.5»)

- Points picker (`doh.js`): racks (when more than one value), types with group lines and door configurations are `multiFilter` buttons with counts; own sets, empty when the picker opens; search and sets cleared by the reset button under the row. Point chooser (`pointchooser.js`): types and racks («Без шкафа» included) as buttons; `choosePoint({ typeId })` opens with that type ticked (a full set counts as off); the reset also ticks «Только точки без места на чертеже» again. Panel dialog (`racks.js` `placeModal`): types as one button, plain types, opens with nothing ticked (was: a single type preselected); «Отметить все» ticks the shown points.
- `typeMatch`, `cfgFilterOptions`, `cfgFilterValid` removed; the rule-13 allow-list of `tests/filter-control.test.js` is empty and the rule text in `docs/coding-standards.md` no longer mentions it. No new UI strings. Tests stay 312. Walked at 420 px in `?mem=1&memPlan=1`; the owner checked on the phone: works.

## 2026-11-21 — Ticket 7.4: «Что осталось» and «Протяжки» filters («Тикет 7.4»)

- `remainingModal` (`points.js`): works, racks («Без шкафа» included), types and door configurations are `multiFilter` buttons with counts, own sets reset when the window opens, racks and types covering (D1), works not; «Протяжка: все» stays a drop-down; reset button under the row; chips of every ticked work outlined; «Точек: N — фильтр по работе» while any work is ticked. Pull step 1 (`pullview.js`): types, door configurations, racks with «Без шкафа»; «Все видимые» uses the new matching; reset also unticks «Только не протянутые». Step 3: types of the chosen points as one button, «▶ Следующая» and «Метраж: X из Y» use the set.
- New pure `worksMatch` and `singleWorkKey` in `src/domain/filters.js`; `typeFilterValid` removed; `points.js` and `pullview.js` left the rule-13 allow-list (left: `doh.js`, `pointchooser.js`, `racks.js`). Tests 308 → 312.
- Decision: the record button follows the works filter: exactly one ticked `w:` / `p:` key behaves as before, none or several — disabled with «Сначала выберите работу в фильтре»; ticket 7.6 replaces it by recording several works (spec 7 § 4). The owner asked about this after the check: it stays planned for 7.6. Walked at 420 px; owner checked on the phone: works.

## 2026-11-20 — Ticket 7.3: plan filters («Тикет 7.3»)

- `planModal`: types (with the plan modes «❔ Не размеченые» / «🙈 Скрытые»), door configurations, racks («Без шкафа» included now) and stages are `multiFilter` buttons with counts of this drawing; racks, types and door configurations read and write the shared sets, covering is computed against this drawing's values; a shared value absent on the drawing stays ticked and greyed at the end of the window («{} — нет на этом чертеже») and is never pruned by the plan; stage window with the sections «Осталось» (no counts), «Работа», «Проблемы»; reset button; the muted line «Под фильтры на этом чертеже точек нет». The point in focus (card «📍 На чертеже», «Найти точку», «🚪 Двери», review list) is drawn bright and tappable through the filters and hides again with the focus frame. The type, rack, door and stage drop-downs are gone; `planmodal.js` left the rule-13 allow-list.
- New `src/domain/planfilters.js` (`stageOptions`, `stageMatch`, `shownPoints`, `noneUnderFilters`), `rackOptions` / `missingValues` in `filters.js` (`rackOptions` now also builds «Точки»'s racks), `tests/planfilters.test.js`; tests 301 → 308. `multiFilter`: ticking a mode unticks missing values, re-ticking a missing value unticks the modes.
- Decisions: «Точки» follows plan changes through ticket 7.2's in-place listener, so no extra `ui.render()` on close; ticking every rack of the drawing on the plan stores the set empty (D1 against the drawing); with a single shared rack ticked, «➕ Точка на плане» preselects it. Found and fixed: the plan's status line («(файл …)», «точек на чертеже», «не размеченых») stayed partly Russian in Hebrew and English — now built from separate parts. Walked at 420 px in Russian and Hebrew (taps on the drawing at desktop width: the pane's phone emulation misplaces clicks); owner checked on the phone: works.

## 2026-11-20 — Ticket 7.2: filter control and «Точки» («Тикет 7.2»)

- `src/domain/filters.js` (pure rules: ticking, group lines, «⚠ С проблемами» against single problems, plan modes, «all ticked = off» only for racks and types, button text, matching) with `tests/filters.test.js`; `src/app/views/multifilter.js` (`multiFilter`: button with «…» at 190 px and a separate «▾», window with 22 px checkboxes, counts at the far end, scroll inside 55vh, ticks applied once on close by any way; `resetButton`); `src/app/sharedfilters.js` (`createSharedFilters(pidOf)`: racks, types, door configurations in memory per project, listeners). `typeOptions()` in `typegroups.js`, `cfgOptions()` / `cfgSetMatch()` in `cfgfilter.js` (`cfgFilterOptions` now built from `cfgOptions`).
- «Точки»: racks, types, door configurations (shared) and problems as `multiFilter` buttons with point counts of the whole project, «План: …» stays a drop-down; vanished values pruned (shared sets only here, and only when the project has points); `showProblemPoints()` clears the shared sets; a shared change from elsewhere refreshes the rendered tab in place (hook for ticket 7.3); a filter window closed after the tab was drawn again (new data) calls `ui.render()`.
- Decisions: every window line shows its count in a separate column and its text without «(N)» (new keys «⚠ С проблемами», «Проблема: {}», «⚠ Без запирания», «Без конфигурации»); names in the button are translated one by one with `tr()`; a window with no change applies nothing (so the plan will not clear a shared set by just opening and closing). Coding-standards rule 13 with `tests/filter-control.test.js` (allow-list: `planmodal.js`, `points.js` for «Что осталось», `pullview.js`, `doh.js`, `pointchooser.js`, `racks.js`; `wizard.js` outside the rule). Strings «Шкафы: {}» … «Проблемы: {}», «✖ Сбросить фильтры» and guide lines 1–2 of § 8 in three languages. Tests 283 → 301. Walked at 420 px in Russian, English and Hebrew; owner checked on the phone: works.

## 2026-11-20 — Ticket 7.1: test drawing ("Тикет 7.1")

- `src/domain/testplan.js` (pure): `testPlanPdf()` builds a one-page 600 × 400 PDF (Helvetica 9 pt captions, grey rooms, true xref offsets and /Length), `testPlanData()` gives the drawing entry, 16 points of spec 7 § 6.3, journal edit rows, one problem mark, the standard electromagnet door configuration, one unlinked caption «X-99» and one hidden «X-98». `src/app/testplan.js` `startTestPlan()` creates the project «Test drawing», caches the PDF in `pz-drawings`, writes everything and opens «Точки»; `src/main.js` imports it dynamically only with `?mem=1&memPlan=1` (own chunk, checked in the build). `tests/testplan.test.js` (10 tests); tests 273 → 283.
- Decisions: FB/G-01 also carries `HIV_DEV` so the plan has an early (FA/C-04) and a later gradient shade; FA/C-02 with only a length shows blue (planColor), not gray; FB/C-10 and FB/C-11 share one mark, so the button «Одинаковые точки в разном виде: 1» is expected. Walked in the browser pane at 420 px: all looks, the type filter lines «Не размеченые (1)» and «Скрытые (1)»; `?mem=1` alone unchanged. Owner checked on the PC: works.

## 2026-11-20 — Tickets 7: field improvements 2 («Тикеты 7»)

- Seven tickets in `.scratch/07-field-improvements-2/issues/`: 01 test drawing (medium), 02 filter control, rules and «Точки» (complex), 03 plan filters (complex), 04 «Что осталось» filters and «Протяжки» (medium), 05 pickers (simple), 06 several works and pull by ticked cables (complex), 07 English names (medium). Order 01 → 02 → 03 → 04 → 05 → 06 → 07; 07 has no dependency.
- Decisions: the coding-standards check for `multiFilter` starts as an allow-list of screens not yet converted and each of tickets 03–05 shrinks it, ticket 05 leaves it empty; ticket 04 keeps the record button on one work (disabled for none or several), ticket 06 replaces it by the table of spec § 4.1; KI-7 is closed only after the review.

## 2026-11-20 — Spec 7: field improvements 2 («Спека 7»)

- `.scratch/07-field-improvements-2/spec.md`: one filter control for every point filter (`src/domain/filters.js` pure rules, `src/app/views/multifilter.js` button and checkbox window, `src/app/sharedfilters.js` racks/types/door configurations shared by «Точки» and «План» per project in memory), «✖ Сбросить фильтры» per screen with its «active» and defaults table, «Что осталось» → «Несколько работ» with a preset (`addWorksForPoints`, the day created in the same save), English names, the test drawing `?mem=1&memPlan=1` (`src/domain/testplan.js` builds the PDF; points at every plan look). RU/EN/HE strings and guide lines in § 8; 7 proposed tickets.
- Spec decisions the owner accepted with «Коммит»: «all ticked = off» only for racks and types (door configurations, problems, works and stages do not cover every point); a shared value missing on the drawing stays ticked and greyed in the plan's window; the one-work pull from «Что осталось» is also limited to the ticked cable (found: `entryForm` took every open cable of points made of devices); the seed and starter pool are not changed — the dictionaries already translate 103 of 123 built-in names, the gap is the example problems and «по умолчанию (…)»; `nameEn` on works, types, devices, cables and problems, not door configurations; an own English name wins over the dictionary in English only.
- Stage 7 estimate → 11 sessions.

## 2026-11-20 — Description 7: stage 7 described («Описание 7»)

- `.scratch/07-field-improvements-2/description.md` with the mockup `mockups/filters.html`. It takes idea 007 in full (several values in every point filter, «✖ Сбросить фильтры», filters shared by «Точки» and «План», «Что осталось» recording several works through «Несколько работ»). It also adds KI-7's catalog part (English names of catalog items: built-in by the Russian name, an optional `nameEn` for own items) and the review-6 test drawing `?mem=1&memPlan=1`.
- Owner's decisions: a pull ticked per cable in «Что осталось» records only the ticked cables; the test drawing and English catalog names are part of stage 7. Agent: the English fallback by the Russian name of a built-in item, so no data migration.
- Facts for the spec: `batchForm` has no preset and does not create today's day (`addWorkForPoints` does); filters are inline `<select>`s with no shared control. `docs/project-spec.md`: stage 7 line updated (≈ 8 sessions), stage 4 carries `nameEn`. Idea 007 status → taken in.

## 2026-11-19 — Review 6: stage 6 closed («Ревью 6»)

- Reviewed `6dc9e20..a918180` (tickets 6.1–6.8) against the spec, idea 006 and the coding standards; tests 272 → 273. Walked in `?mem=1` at 420 px: day off (checks, day screen, recording block, the other-project block, «Месяц»), the shared-list merge and seeding, administrator delete, problems (fit on a mixed selection, own Hebrew text, filter, «Проект» line, card block), the management sheet through the Google stub, the plan with a generated drawing.
- F1: the plan and Hebrew PDF legends of ticket 6.8 said משיכה; now השחלה as everywhere, also one drawing-version line; `NUMBERED_V` 4, so every «PDF с номерами» on Drive is rebuilt once. F2: 18 Russian texts had two different translations in `src/i18n/src` (the build keeps the last file's); the overridden entries removed — built translations unchanged, compared key by key — and `tests/i18n.test.js` fails on a new clash. F3: the guide line of the «Проблема» column had a wrong path and tied the red row to the column. F4: ADR 0016 / 0017 accepted, glossary «planned» marks, the project-spec stage-6 line, a «Changed» note in spec § 4. F5 deferred as KI-8: a database with rules older than ticket 6.2 cannot read the shared lists (no merge, no seeding, no toast, empty lists in a new project).
- Test drawing recipe for `?mem=1`: a PDF string with `/MediaBox[0 0 600 400]`, Helvetica and `BT /F1 12 Tf x y Td (D-01) Tj ET` per caption, xref offsets computed in the page, `TextEncoder` → `File`; open «🗺 План» → «➕ Чертёж (PDF)», set the hidden file input's `files` through a `DataTransfer` and dispatch `change`; points get `pos: { sheet: <file name>, page: 0, x, y: 400 − pdfY, w: 30, h: 10, text }`; progress through journal edit rows `{ pointId, editDate, editWorkId, editCableId }` (catalog ids such as `PR_PTS`, `HIV_DEV`).

## 2026-11-19 — Ticket 6.8: plan colours by works («Тикет 6.8»)

- `src/domain/plan.js`: `planColor` by idea 006 (pink for pulled, `gradientColor` — OKLab yellow → green at `t = (j − 1) / (M − 1)`, dark green when all done, red over all), `pull: { done, total }` counted in cables (composite: quantity of pull tasks, legacy: counts of cable kinds), `markColor` ranks by `progressOf`, new `PLAN_PALETTE` / `PLAN_LEGEND` (gradient and circles entries), `NUMBERED_V` 3.
- `src/app/views/planmodal.js`: pull circles in the tag (or under a caption with no tag), legend swatches, phone frames ×0.75, the focus frame cleared on opening a card and on a tap on an empty spot. `numbered.js`: legend without the circles line.
- Decisions: `M = 1`, the only work done and the pull not — the top shade (not yellow); the owner made the pink stronger at the check: `#E99AC4` → `#E0609F`, circles `#A8285F`. Checked in a throwaway dev server at phone width with a generated PDF; the owner checked on the phone: works. Commits `0cb81f1`, `0080eb4`.

## 2026-11-19 — Ticket 6.7: translations 2, the rest and the coverage test («Тикет 6.7»)

- `scripts/i18n-extract.mjs` exports `collectStrings()`; everything inside the arguments of `info` / `warn` / `error` and `console.*` is skipped (the event log is Russian). `tests/i18n-coverage.test.js` runs each string through the real `tr()` with `{}` → `0` (Russian may stay only inside quotes or `{…}` tokens), cuts the guide's «• » / «# » prefix, fails listing up to 30 strings with files, and fails on a stale or reason-less `src/i18n/not-ui.json` entry (63 entries: Drive folder and file names, Russian report and sheet captions, seed data, stored stage keys, label-template tokens).
- 54 strings translated in `src/i18n/src/19-rest.json`. Sentences built from parts are now translated per part with `tr()`: plan-version notes (`planversion.js`), own-works line (`ownworks.js`), Drive move toast (`project.js`), history rows (`history.js`); `tr()` got a trailing « ×N» rule like «(N)»; merge notes join with « / » instead of « и ».
- Rule 12 in `docs/coding-standards.md` (rule 8 keeps only the guide), `docs/workflow.md` Ticket paragraph and quick-fix list point to it. KI-7: the test cannot see sentences built from parts; catalog names (colours, example problems) have no English.
- Screen check in `?mem=1` at 420 px: about 100 screens in English and 50 in Hebrew walked by script (menu, tabs, lists, labels, history); found and fixed «Подключение в шкафу ×3» and the history rows. Not walked: plan (no drawing in `?mem=1`), forms behind danger-word filters (Google, Drive, export). Owner checked English and Hebrew on the phone: works.
- Commit `8ffa48b`; the push to `main` was first stopped by the auto-mode classifier and went after the owner's «Да, в main».

## 2026-11-19 — Ticket 6.6: translations 1, the guide («Тикет 6.6»)

- A check of every `guide.js` literal through `tr()` said all covered, but the guide shows lines without their leading «• » / «# » (`body()`), and `tr()` translated the raw literal through its icon branch. On screen 15 lines (added by tickets 1–5) stayed Russian; their keys and values lost the prefix in `src/i18n/src/` files 07, 13, 15, 16, 17, 18.
- Quoted names aligned with the real buttons: Hebrew «תקולה», «השחלת כבלים», «רשימות נפתחות»; English «Termination in the cabinet», «Your own database», «Drop-down lists». Hebrew Latin point-code runs wrapped in LRI/PDI.
- Checked in `?mem=1` at 420 px in English and Hebrew (all guide sections, day form, day off, shared lists, problem forms, point card): no Russian except the Russian input examples. Ticket 07 got a note so its coverage test strips the guide prefixes. Owner checked: works.

## 2026-11-18 — Ticket 6.5: plan colours by progress («Тикет 6.5»)

- `src/domain/plan.js`: `pointStages` (composite — stages with tasks; legacy — the type's `stages`, all five without them), `planColor` (red for an open problem or «Неисправна»; gray / blue when nothing is started; dark green `#1b5e20` with frame ×1.75 when every stage is done; otherwise step clamp(round(k / n × 5), 1, 4) of `#f2c80f`, `#c0ca33`, `#8bc34a`, `#43a047`), `markColor` (a shared mark follows its least finished point, red when any is red), `PLAN_LEGEND`, `LEFT_FILTERS`, `planFilterMatch`, `planFilterGroups`; `numberedInput` gives each point its mark's color and `full`; `numberedHash` got a look version, so every «PDF с номерами» is re-rendered once (by the nightly job when the project changes or at the 3-day full run). `statusColor` stays for the pull screen. `leftTasks` moved from `views/points.js` to `src/domain/remaining.js` (tested against the old function). Commits `a4199f6` … `e07f127`.
- Plan view: one frame, color and tag per mark; legend line; stage filter with groups «Осталось» (new «Осталось: шилют»), «Работа» (works waiting on the drawing's points, with counts) and «Проблемы» (only with open problems), rebuilt as data changes. `numbered.js`: progress colors, thicker frames for finished points, legends of § 4.3; the Russian legend avoids «—», «…», «■» (the annotation font prints dots instead) and keeps «≈» in lines with Cyrillic.
- Owner's changes at the check: stage dots first lost the pull dot, then the dots for pulled-only points, then were removed entirely («больше мешают, чем помогают»); plan lines are twice as thick on a computer with a mouse (`mousePc()` of `ui.js`), thin on the phone. `CONTEXT.md` lost «Stage dots».
- Checked in `?mem=1` (desktop and phone widths) and by rendering both PDF legends; owner checked on the phone and the PC: works.

## 2026-11-18 — Ticket 6.4: problems in the management sheet («Тикет 6.4»)

- `src/domain/report.js`: column `problem` after `delay` (`openProblemsOf`, `problemLabel` in the sheet's language, oldest first, solved hidden), `PROBLEM_COLOR` `#E57373` row colour over any status colour, legend cell G «Есть проблема» / «יש בעיה», both default profiles get the column, `STYLE_V` 8; `src/app/managers.js`: `wrapStrategy: 'WRAP'` on the problem cells of point rows, summary rows sized by their length; nightly job `NEED` has `problemMarks` (`changedSince` covers it through `NEED`; the pool lists were already read once per run).
- After the owner's check: the summary row got an 8th counter «С проблемами» / «עם בעיות» — points with an open problem (not the number of marks). A sheet with the counter rebuilds by hash.
- Decisions: the legend cell is last (G), as the ticket says; saved profiles are not changed; a guide line explains the tick.
- Checked in `?mem=1` (stub requests: column, wrap, red row, solve → empty cell and no red); Google Sheets itself and the nightly run by the owner. Owner checked: works.

## 2026-11-18 — Ticket 6.3: problems on points («Тикет 6.3»)

- `src/domain/problems.js` (`problemFits` by type id or group, `problemsForPoints`, `openProblemsOf`, `marksOf`, `markOps`, `solveOps`, `problemLabel`, `problemCounts`, `hasCyrillic`, `EXAMPLE_PROBLEMS`); `buildContext` builds `ctx.marksByPoint` (marks of existing points, open by `markedAt` desc, then solved by `solvedAt` desc). `problemMarks` added to `COLLECTIONS`, the history labels («Проблема на точке») and, beyond the ticket, to the Drive backup and «Импорт данных» (so a restore keeps the marks). `SHARED_DEFAULTS.problems` = the four examples. Commit `2d8e71d`.
- `src/app/views/problems.js`: the «Проблемы» reference screen and form (type ticks of the project's types and groups, descriptions editable in place, ✕ soft-deletes, administrator-only delete), the mark and solve forms, `problemButtons` for the selection bars of «Точки», the plan and the rack screen, and the point card block (the card now re-renders on store changes). «Точки» filter «Проблемы: все / ⚠ С проблемами / Проблема: …» and red line; «Проект» line opens «Точки» filtered (`showProblemPoints`).
- Point merge (`mergeOps(…, { by, now })`): an open mark of a removed point moves to the first kept point, other kept points get a copy (`<markId>_<pointId>`); a problem the kept point already has open is solved by the merge.
- Decisions: re-marking with two offline duplicates updates the newest one; own text allows Latin letters and digits; descriptions show with `dir="auto"` (Hebrew with a model name reads right).
- Checked in `?mem=1` at 420 px (the seven owner steps, deleted problem and description, merge, history, Hebrew card); the plan and rack bars only by code. Owner checked on the phone: works.

## 2026-11-18 — Ticket 6.2: shared delay reasons and culprits («Тикет 6.2»)

- `firestore.rules` and `firestore.open.rules`: `pool_delayReasons`, `pool_culprits`, `pool_problems` with the door-configuration rule; the owner published them in the console of `polevoy-zhurnal` before the code reached `main`.
- Repo: `listenPool(kind, cb, { withDeleted })`, `readColl` / `readPool` (`getDocsFromServer`, counted), memory backend pool delete is soft, `savePool(ops, { strict })`; `createProject` copies no reasons or culprits and sets `sharedLists: 1`.
- `src/domain/shared.js` (`sharedView`, `choiceList` with `keep` for a record's own value, `mergePlan`, `applyMerge`, `sharedImportOps`); `buildContext` takes `shared`. `src/app/shared.js`: listeners → `store.setShared`, merge on any unmerged live project (not only at start, so an invited project merges in the same session), seeding after the merge, toast once per start. Screens per spec § 2.5; pickers in the point form, mass edit and the day-entry form. Commit `863dbf5`.
- Decisions: deleting a shared item writes `{ he, deleted: true }` as data (works for an item that was only in an old list); the server backup reads the common collections first so «(импорт)» copies carry the shared lists; `__pzTest.setAdminEmail` for checks in `?mem=1`. KI-6 (two devices merging a conflicting Hebrew at once).
- Checked in `?mem=1` at 420 px (merge, conflicts, screens, delete, re-add, rejected write); the backup only by tests. Owner checked on the phone: works.

## 2026-11-17 — Ticket 6.1: day off («Тикет 6.1»)

- `src/domain/dayoff.js` (reasons, `dayOffText`, `dayOffLine`, `dayConflict`), day form with six ordered checks (`src/app/views/doh.js`), `todayBlocked()` for the recording paths (`markShilutForPoints` returns `blocked`), «Отчёты» and «Месяц» lines, Excel row, `messageDialog` in `ui.js`; strings in `src/i18n/src/16-dayoff.json`; KI-5. Commit `7c3f48a`.
- Decisions: a working day is also checked when a day is moved to another date; the clash check for an unchanged off day is skipped (only turning on or a date change); `doh()` of a day off returns the line plus the comment.
- After the check the owner asked to drop «Шаббат», «Погода», «Нет работы на объекте» from the list: they are retired (not offered, still read on saved days).
- Checked in `?mem=1` at 420 px; not checked by the agent: the rack «Поклеил» path, iPhone, real Firestore. Owner checked on the phone: works.

## 2026-11-17 — Tickets 6: field improvements («Тикеты 6»)

- Seven tickets in `.scratch/06-field-improvements/issues/`: 01 day off (medium), 02 shared delay reasons and culprits (complex; goes live only after the owner publishes `firestore.rules`), 03 problems (complex), 04 problems in the management sheet (medium), 05 plan colours (complex), 06 translations of the guide (medium), 07 the rest of the translations and the coverage test (medium). Order 01 → 02 → 03 → 04 and 05 → 06 → 07.
- Decision: ticket 02 builds the pool plumbing for all three lists and seeds only reasons and culprits; ticket 03 plugs the four example problems into the seeding.

## 2026-11-17 — Spec 6: field improvements («Спека 6»)

- `.scratch/06-field-improvements/spec.md`: behaviour, RU/EN/HE strings, data, edge cases, tests and seven proposed tickets for ideas 001–005. Day off: `days.off`, `offReason` (seven ready reasons in `src/domain/dayoff.js`), `offText`; blocked on a day with entries and against a working day / day off of another project on the same date; «Месяц» «Дней: N · выходных: M».
- Shared lists: `pool_delayReasons`, `pool_culprits`, `pool_problems`, read straight from the pool, soft delete by the administrator only; old project lists kept read-only, merged once per project from server reads (`sharedLists: 1`), code defaults seed an empty list; rules like `pool_doorcfg` — the owner publishes them before ticket 02 reaches `main`. ADR 0016 (replaces 0015).
- Problems: project subcollection `problemMarks`, one document per point × problem × time (ADR 0017); mark and solve forms, point card block, filters, «Проект» line «⚠ Открытых проблем: M (точек: N)»; management sheet column «בעיה», row `#E57373`, legend «יש בעיה», `STYLE_V` 8; point merge moves open marks.
- Plan: `planColor` by the share of stages done (rounding table), palette «Жёлтые чуть темнее» (owner's pick), stage dots on the plan only, plan filter «Осталось» + shilut + concrete works + problems. Translations: `src/i18n/not-ui.json` and `tests/i18n-coverage.test.js`.
- Owner accepted the agent's choices with «Коммит»: block a day with entries, the symmetric day-off block, no dots in «PDF с номерами», own red for problems in the sheet, the column ticked by hand in saved profiles. `CONTEXT.md` (Shared list, Problem mark, Stage dots…) and `docs/project-spec.md` stage 4 (new data to carry) updated.

## 2026-11-17 — Description 6: field improvements («Описание 6»)

- `.scratch/06-field-improvements/description.md` with mockups `day-off.html`, `reference-lists.html`, `problems-on-points.html`, `plan-colours.html` (the last one can show a local drawing under the points, nothing uploaded). Ideas 001–005 taken in, in that order; their `Status:` points to the description.
- Owner's decisions: a day off is blocked on a date that has a working day in another project («Месяц» counts all projects); «Виновники простоя» become a shared list like delay reasons (ADR 0015 is to be replaced by ADR 0016 in the spec); problems get point types (empty — all) and an «Открытых проблем: N» counter on «Проект»; no other wishes. Agent's, accepted with the description: plan colour by the share of stages, not single works; Hebrew of ready reasons and example problems proposed by the session.
- Facts: delay reasons are used on points and in day entries (with culprits); the plan already filters by stage except shilut; 284 strings without translation (166 in the guide). `docs/project-spec.md` stage 6 and `CONTEXT.md` (Culprit) updated.

## 2026-11-17 — Quick fix: lock type column («Идея: тип замка в таблице»)

- Asked as an idea, done at once as a quick fix at the owner's request (no idea file). `src/domain/report.js`: column `lockType` «Тип замка» / «סוג מנעול» — ЭМ «אלקטרו מגנט» or МХ «מנעול חשמלי» from the door configuration (`doorLockOf`, new in `src/domain/doorcfg.js`, also used by `doorCfgShort`); old configurations and old door types by the ЭМ / МХ word in their name; off in the default profiles, the owner ticks it in the profile form; the Excel export gets it too. Hebrew words from the owner.
- Guide line, RU/EN/HE strings, a test in `tests/doorcfg.test.js`. Tests 212 → 213. Checked by the owner on the phone with a real Google Sheet.

## 2026-11-16 — Review 3: stage 3 closed («Ревью 3»)

- `.scratch/03-management-sheets/review.md`: the whole stage (`1a50462..a27b68d`) against the spec and coding standards, two passes, then runs in `?mem=1` at 420 px (form, «Обновить» with the stub Google, the date-only write) and a script over every default profile's Sheets requests.
- 6 findings, all fixed now, no fix round: the rack sheet with no filtered points sent a row-height request with an empty range (the whole `batchUpdate` could fail) — sent only when there are rack rows; racks sorted with the device language (`undefined`) — now `'ru'` like the form, so the phone and the night job give one hash (Russian collation puts «Щ1» before «A1», English after); ticket 02's file had garbled encoding since ticket 3.2 — restored; KI-4 wording on viewers; spec §4.4 note with the look the owner chose in ticket 3.3; stage-3 State lines folded into one.
- Tests 210 → 212. No `STYLE_V` bump (no look change). Not checked against a real Google response: the empty-profile requests.

## 2026-11-16 — Ticket 3.4: profile form, guide, glossary («Тикет 3.4»)

- `src/app/views/tables.js`: `typeList` (tick + ▲▼ per point type, «Все» row, `typeOrderOf` order); on «Сохранить» `typeOrder` = the whole ordered list, `types` = the ticked ones; ticks «Разделы по типам точек» and «Лист „Итоги по шкафам“» (on for a new profile and a profile without the fields); the preview counts the rack sheet.
- Six new strings (RU/EN/HE) in `09-wizard-tables.json`, the guide line in `guide.js` and `13-guide-2.json`, glossary terms Section, Rack sheet, Update stamp, KI-4 (an editor's sort scatters section rows).
- Slip fixed before the push to `main`: the first edit missed the two ticks in the form (mixed CRLF/LF line endings, the replace did nothing and was not asserted); found by the `?mem=1` walk at 420 px. Checked by the owner on the phone. Tests: 210, all pass.

## 2026-11-16 — Ticket 3.3: rack sheet («Тикет 3.3»)

- `src/domain/report.js`: `rackSheetOf` (racks in natural order, «Без шкафа» last; per stage the base = points whose type has the stage, done only inside the base, percent ⌊done × 100 / base⌋ / 100, «—» for base 0; partly installed and faults as in the totals; total row), the sheet is last when `rackSheet !== false`, a rack sheet of «perCabinet» with the same name gets « (2)»; `STYLE_V` 7.
- `src/app/managers.js`: `rackSheetRequests` (merges, `0%` format, row heights 34/24/30/34, frozen rows 5 and column A), `progressColor(p)` (white for 0 and «—», else a blend from `#E6B422` to `#C6E5C9`; both cells of a stage), blocks (rack + total, each stage, partly + faults) framed in navy through the header, dotted line inside a stage, teal `#12A3A3` medium lines between racks, thick navy top of the total row and outer frame.
- Decisions: the owner asked for the look in four rounds on browser mockups (gradient, readability, frames through the header, line colour between racks: teal); rack names centred (left and right-to-left alignment both looked wrong on the Hebrew sheet). Two slips fixed on the way: a look-only change needs a `STYLE_V` bump or files stay «актуальна» (shipped without it first), and the phone needs ☰ → «Обновить приложение». Checked by the owner on the phone and the PC.

## 2026-11-16 — Ticket 3.2: sections by point type («Тикет 3.2»)

- `src/domain/report.js`: `typeOrderOf(table, ctx)` (ids of `typeOrder` that still exist, then the rest by name), `pointsCountText(n, lang)` (Russian plural, «נקודה אחת»), grouping in `sheetOf` when `sections !== false` with «Без типа» / «ללא סוג» last, section rows «<type> — <count>», two empty rows between groups, `sectionRows`, `pointRuns` per group, `rowColors` `''` on section and empty rows; `defaultTables()` writes `sections: true, rackSheet: true`. `src/domain/export.js`: builds with `sections: false, rackSheet: false` (Excel unchanged).
- `src/app/managers.js`: section rows white, bold 12, navy text, 28 px, alignment cleared, thick `#1F3B5C` frame, no inner vertical lines; order of borders: point rows, section frames, header frame.
- Decisions: section look is formatted after the column formats (they would centre the row's cells). The owner saw the result on the PC and the phone: works; the grey strip under the frozen rows (PC) and the grey area right of the last column (phone) are Google Sheets display.

## 2026-11-16 — Ticket 3.1: points sheet look («Тикет 3.1»)

- `src/domain/managers.js`: `stampText(date, lang)` (Israel time, 24 h). `src/domain/report.js`: legend row A–F and an empty row under the totals, sheet fields `stamp` (E2, outside `rows` and the hash), `frozenRows`, `frozenCols`, `legendRow`, `legend`, `sectionRows` (empty until ticket 02), `pointRuns`; `buildReport(…, { nameOf, now })`; `STYLE_V` 4; the `blank` rule and `COLORS.pink` removed.
- `src/app/managers.js`: requests for the legend, stamp look, thin `#D0D4D9` borders per point run and the thick `#1F3B5C` header frame (point borders first); `frozenRowCount` from `frozenRows`; `rebuildSheets` writes the stamp into the same values write; `syncTable(…, { now })` with unchanged data writes only the stamp cells and rebuilds when that write fails. `scripts/server-tables-lib.mjs` passes the night job's `now`. `exportSheets` already cut rows from the header down, so Excel is unchanged.
- Decisions: the stamp is a fixed cell E2 on every points sheet; the date-only write failing means a full rebuild (new hash, `changed: true`). Checked on a real test spreadsheet through the Sheets connector (the owner deletes the file): `updateBorders` with `color`, `SOLID_THICK`, `frozenRowCount` 7 accepted. The connector itself rejects parenthesized `fields` masks; the app's own Sheets API calls are unaffected.

## 2026-11-16 — Tickets 3: slicing of the management sheets stage («Тикеты 3»)

- `.scratch/03-management-sheets/issues/`: 01 points sheet look (legend, stamp, no pink, borders, header frame, date-only write with rebuild fallback, `STYLE_V` 4), 02 sections by type (`typeOrderOf`, section rows and frames, export flags), 03 rack sheet (`rackSheetOf`, merges, percents, frozen column), 04 profile form with type arrows and two ticks, translations, guide line, glossary and known issue. Order 01 → 02 → 03 → 04; 02 and 03 touch the same modules, so never in parallel.
- Decision: sections and the rack sheet become visible for every profile as soon as tickets 02 and 03 are live (default on); the ticks to switch them off arrive with ticket 04. The tickets are marked `open`.

## 2026-11-16 — Spec 3: management sheets («Спека 3»)

- `.scratch/03-management-sheets/spec.md`: points sheet rows (title, project and update stamp in E2, totals, legend A–F, empty row, header; 7 or 5 frozen rows), sections by type (column A only, not merged, default alignment so the text overflows; thick `#1F3B5C` frame; «Без типа» last for no or deleted type; Russian plural, «נקודה אחת»), no pink rule, thin borders per point block, header frame; the rack sheet (12 columns, percent base = points whose type has the stage, rounded down, «—» for base 0, green only at 100%, frozen column A); `buildReport(…, { now })`, stamp out of the hash, date-only write on unchanged data with a rebuild fallback, `STYLE_V` 4; profile fields `sections`, `rackSheet` (absent = on) and `typeOrder` (`typeOrderOf`: listed, then by name); form strings with English and Hebrew; a guide line.
- Open questions answered: date on every refresh; the basic filter stays (viewers' sorts are their own; an editor's sort → a known issue in ticket 04); Excel export unchanged; one rack sheet for «perCabinet»; rack-sheet name kept, the clashing rack sheet gets « (2)».
- New Sheets requests (`updateBorders`, `mergeCells`, row height, frozen column, percent format) not checked against a real response: ticket 01 checks them on a test spreadsheet if the owner allows; `batchUpdate` is all-or-nothing, so a bad request leaves the old sheet. Four tickets proposed (01 look and stamp, 02 sections, 03 rack sheet, 04 form and guide).

## 2026-11-16 — Description 3: management sheets («Описание 3»)

- `.scratch/03-management-sheets/description.md` and mockups `status-sheet.html`, `progress-by-rack.html`, `table-profile-form.html`. Owner's and management's remarks: points grouped by type with a section row (name and count; white, large bold dark-blue text, thick dark-blue frame), two empty rows between sections; the column header keeps its colour and gets the same outer frame; update date on row 2; a legend row then one empty row (7 frozen rows); a not-done stage stays white instead of pink; thin borders; the whole row keeps its status colour; no percents in the totals row; a new sheet «Progress by rack» (counts and percents, green only at 100%). Both new parts in every profile, by two ticks on by default; the section order by ↑↓ arrows on the profile's types list (proposed, accepted at «Коммит»). The rack and label sheet stays as it is.
- Old Drive files listed by a read-only search for the owner to delete: the old template sheet, an early template-based sheet, the AppSheet data sheet (it changed on 2026-11-16, so AppSheet goes off first), its copy and the «appsheet» folder; three groups for the owner to decide. Nothing deleted by the session.
- Ten open questions for the spec (date write on unchanged data, percent base, points without a type, per-rack layout, the filter, texts, frozen rows, Excel export, storing the type order, sheet-name clash).

## 2026-11-15 — Review 2: stage 2 closed («Ревью 2»)

- `.scratch/02-nas-requirements/review.md`: the whole stage (`2deeaa5..20d6edf`) against the spec and coding standards, two parallel passes, then runs on a real PocketBase 0.40.6 (Windows binary) and on the NAS document's Dockerfile and Compose example built in Docker (downloads allowed by the owner; all removed from the scratchpad and Docker at the end).
- 15 findings, all fixed now, no fix round: the WAF rule and A3b also cover the superuser collection's id `pbc_3142635823` (a wrong password gets 400, a right one 403, so the id path was a password oracle); `PB_ENCRYPTION_KEY` exactly 32 characters (another length: PocketBase exits, restart loop); the first-superuser command with `--encryptionEnv`; password sign-in off does not stop sign-up through the records API (stage 4 sets the `users` rules, in `docs/project-spec.md`); A8 needs 200 on the second answer, A9 SKIPs only for 404 or the HTML fallback; the cleanup row names history; project-spec stage 4 points to R-ids instead of repeating numbers; settings count as musts; test host allow list as spec § 6; the document test resolves its path from the file; tool naming; `docs/formats.md` allows `accepted (planned, stages …)`; PROJECT_CONTEXT state folded.
- Checked: backup into the separately mounted folder and a restore work in the container; `auth-refresh` is not counted by `*:auth`. Not checked: anything through a real Cloudflare Tunnel. Tests 191 → 192. NAS document version `11f01e9`.

## 2026-11-15 — Ticket 2.2: the NAS check tool («Тикет 2.2»)

- `tools/nas-check.mjs`: A1–A9 and the realtime cut time (A7, A7i); `parseArgs`, `judgeA1…A9`, `checkRealtime`, `runChecks` (takes a `fetch` function), `main`; no file read or written, no dependency. `tests/nas-check.test.js`: 31 tests (stubbed responses, a stubbed realtime stream, the CLI, the NAS document check). `CLAUDE.md` Run line and the `docs/code-map.md` tools line. Tests 160 → 191.
- Beyond the spec: A8 and A9 also SKIP when `sw.js` or the manifest come back as an HTML page with 200 (PocketBase's fallback page before the site is there), not only on 404; `--quick` prints no A7i line; a `--hold` below or equal to 0 is a usage error.
- Self-check on a local PocketBase 0.40.6 (SHA-256 matched `checksums.txt`; the first start of the downloaded binary was stopped by the auto-mode classifier, the owner allowed it in chat): batch off/on flips A4, password sign-in and a dummy Google provider flip A5 (the text names the part), `--origins *` vs a custom origin flips A6, a stopped server gives exit 2. Binary and data removed from the scratchpad. Node's `fetch` checked to return 3xx with `redirect: 'manual'` and to send an `Origin` header.
- Live at `3470fb3`; owner checked `--help`. Next: «Ревью 2».

## 2026-11-15 — Ticket 2.1: the NAS document («Тикет 2.1»)

- `docs/nas-requirements.md` (24,391 bytes): sections 1–12 as spec 2 § 3; 32 requirement ids with phases; a Dockerfile (Alpine 3.22, release zip with SHA-256 re-checked against `checksums.txt`) and a Compose example (`pocketbase`, `cloudflared` 2026.11.0, secrets in `.env`); acceptance checks A1–A14 exactly as spec § 3.10. Added beyond the spec: the placeholder `<docker-subnet>` (superuser IPs need the Docker network's subnet, and the document may hold no real IP); a note that PocketBase also accepts a collection id in the URL, so the WAF rule on `_superusers` is only the outer layer and the superuser IP list is what holds; a "should" that helpers be test users while the OAuth consent screen is in Testing.
- ADR 0014 (D1–D4 with rejected options); `docs/project-spec.md` stage 2 output, stage 4 PocketBase facts and the rate-limit note, start condition A1–A7 and A10–A13, stage 5 contents; `CONTEXT.md`: NAS copy, NAS document, NAS check.
- Version line names commit `a528881` (the content commit); live in `main` at `00aa606`. The push to `main` was first stopped by the auto-mode classifier; the owner approved it in chat. Owner checked the GitHub link.

## 2026-11-15 — Stage 2 slicing («Тикеты 2»)

- Two tickets in `.scratch/02-nas-requirements/issues/` accepted: 01 the NAS document, ADR 0014, project spec and `CONTEXT.md` (complex, Opus 5.5); 02 `tools/nas-check.mjs`, `tests/nas-check.test.js` with the document check, code map and `CLAUDE.md` lines (medium, blocked by 01). Branch `claude/s02-tickets`. Ticket files stay `open` until their own sessions.
- Ticket 01 has no test of its own: the document check lives in ticket 02, so 01 checks size, ids and placeholders by hand. Ticket 02's self-check runs the tool against a local PocketBase 0.40.6 kept in the scratchpad.

## 2026-11-15 — Spec 2: NAS requirements («Спека 2»)

- `.scratch/02-nas-requirements/spec.md`: facts checked on a local PocketBase 0.40.6 (official release, checksum matched, run in the scratchpad), Cloudflare docs, the 2026-11-15 server backup and the owner's Drive. Key facts: batch off by default (50 requests, 3 s), one batch = one transaction; ids with `/`, space or `.` are rejected even with a wide pattern; JSON value ≤ 1 MB; `updated` is server time and works as the delta mark; realtime has no keep-alive, PocketBase closes an idle stream after 300 s and Cloudflare cuts it after ≈ 125 s; password sign-up open by default, token 5 days; the default rate limits count every request inside a batch (a batch of > 20 creates fails); superuser IP list honours `CF-Connecting-IP`; static files have no `Cache-Control`, so Cloudflare would keep `sw.js` 2 hours. Data: 15,827 documents, 18.4 MB JSON, history 87 %; PDFs on Drive ≈ 34 MB.
- Decisions D1–D10: one hostname served by PocketBase (site in `pb_public`, `/api/`, `/_/`); the NAS pulls builds from a public GitHub release `nas-build` (stage 5); server jobs of the NAS copy in an agent container on the NAS, `export-pool.yml` stays on GitHub; no Cloudflare Access, WAF blocks `/_/` and the superuser login; realtime may drop — stage 4 reconnects and delta-reads; drawings stay on Drive; data on the HDD mirror; PocketBase pinned. Exact settings as requirement ids (R-PB, R-SITE, R-NET, R-AUTH, R-GOOG, R-JOB, R-BAK, R-DATA, R-POW), acceptance checks A1–A14.
- Proposed tickets: 01 the NAS document + ADR 0014 + project spec and glossary (complex); 02 `tools/nas-check.mjs` with tests and the document check (medium). Owner accepted; the NAS project has decided nothing yet.

## 2026-11-15 — Description 2: NAS requirements («Описание 2»)

- `.scratch/02-nas-requirements/description.md`: stage 2 writes `docs/nas-requirements.md` (11 parts: PocketBase, site on the NAS, Cloudflare Tunnel, sign-in and Google, server jobs, backups, data volume, power and network, acceptance checks, open questions); no code change. Facts: latest backup 2026-11-13 — two projects, ≈ 15,000 documents, full JSON ≈ 18 MB.
- Owner's decisions: the site moves to the NAS too (new address, icons reinstalled; GitHub Pages stays for everyone else); the copy is used by the owner and the helpers, so public HTTPS without a VPN app; Cloudflare Tunnel to the owner's own domain (≈ 40 ₪ a year); document in English, no Russian summary. Recorded as ADR 0013; `docs/project-spec.md` stage 2 points to the description.
- Open for the spec: one address or two subdomains, build delivery to the NAS, where server jobs run, Cloudflare Access, PocketBase checks on a real instance, drawings size, a `tools/nas-check.mjs` acceptance tool.

## 2026-11-15 — Review 1: stage 1 closed («Ревью 1»)

- `.scratch/01-code-docs/review.md`: the whole stage (`0fa2436..48ceeed`) against the spec and coding standards, two parallel passes; `same-code` over the whole stage exit 0 (only comments changed, built site byte-identical); owner check walked in `?mem=1`, then done by the owner on the phone.
- 16 findings, 15 fixed now: pullview Contents, `src/domain/index.js` header, three test headers, glossary words and American spelling in comments (rule 10 now says so), code-map facts (sync limits, workflow schedules, tohnit files, journal ids by pointer), rule 11 names the open-rules exception; tools: `ru-comments` scope matches the code map, YAML apostrophe, `same-code` compares token source text. KI-3 (two same-code runs at once) deferred. 160 tests.

## 2026-11-15 — Ticket 1.9: architecture section and strict checks («Тикет 1.9»)

- `docs/code-map.md`: the hand-written architecture written from the code and module headers — start, storage and the repo, sync and read saving, offline, data paths, Google Drive and Sheets, server jobs, drawings; the "Not code" list checked against `git ls-files` (added `package.json`, `package-lock.json`, `tests/`, `.gitignore`, the `tools/tohnit/` sources). Hand-written part 8,927 bytes, whole file ≈ 30 KB: the ticket's "≤ 10,000 bytes for the whole file" cannot hold with a built list of ≈ 21 KB, so the spec 13 limit (the architecture section) was kept — left to «Ревью 1».
- `tools/code-map.mjs`, `tools/ru-comments.mjs`: both `PENDING` arrays and every pending path deleted; a module without an English header, or any Russian comment, is always a problem (exit 1). `isPending` became `inPaths(file, list)` — still used for CLI folder arguments and for `--expect`, so `tools/same-code.mjs` follows the rename (two identifiers; a fourth expected exception beyond the ticket's three). The placeholder line now reads `(no English header)`.
- `tests/code-docs.test.js`: pending cases and the stale-entry case dropped; new cases for strict `buildList` (a temp folder) and `inPaths`; 159 tests. `docs/coding-standards.md` rules 3 and 10 say how the strict checks work; `CLAUDE.md` and `CONTEXT.md` already matched.
- Proof: `node tools/same-code.mjs --expect tools/code-map.mjs --expect tools/ru-comments.mjs --expect tests/code-docs.test.js --expect tools/same-code.mjs` — exit 0, built site byte-identical (28 files); `code-map --check` and `ru-comments` (whole scope, 154 files) exit 0; deploy of `main` succeeded (commit `cc52459`).

## 2026-11-15 — Ticket 1.8: tests and Python tools documented («Тикет 1.8»)

- All 14 `tests/*.test.js` start with an English comment saying what they check and which modules they cover (9 got one, 3 were translated); the 276 Russian comments of `tests/` and `tools/tohnit/` are translated. Test names, assertion messages and Russian test data stay (strings).
- `tools/tohnit/tohnit.py`: English header comment after the shebang, English comments and docstrings; the module docstring stays Russian on purpose (printed as usage help by `print(__doc__)`), as do the Russian output texts and the Russian type names in the data. `build_skill.py` translated; `SKILL.md` needs no rebuild.
- `git rm --cached tools/tohnit/__pycache__` (already in `.gitignore`); the `tests/` and `tools/tohnit/` entries are gone from the `ru-comments` `PENDING`, so the stage test now checks every test file.
- Proof: `node tools/same-code.mjs --expect tools/ru-comments.mjs` — all other changed files comment-only, built site byte-identical (28 files); 158/158 tests; `code-map --check` exit 0; 0 Russian comments; deploy of `main` succeeded (commit `d7b0e7e`).

## 2026-11-15 — Ticket 1.7: drawings, scripts, config documented («Тикет 1.7»)

- The 9 modules of `src/tohnit/` and the 12 of `scripts/` have an English header (first sentence = the code-map line; `vite.config.js` got one too, outside the map) and every Russian comment is translated: `src/style.css`, `vite.config.js`, `firestore.rules`, the three workflows with comments. The entries are removed from both `PENDING` lists. Commit `4017aa2`, branch `claude/s01-ticket-07`; deploy of `main` succeeded.
- The one real text change: the two comment literals of `src/domain/openrules.js` are translated and `firestore.open.rules` regenerated from `firestore.rules` (never by hand), so the setup chunk of the built site carries English comments in the rules the wizard copies. Databases already set up need nothing (probe check, spec 1). `same-code` check 1 listed `openrules.js` as expected (read: exactly the two literals); check 2 passed with the new open rules copied into the base build.
- Proof: `node tools/same-code.mjs --expect src/domain/openrules.js --expect tools/code-map.mjs --expect tools/ru-comments.mjs` — every other file comment-only; 158/158 tests; `code-map --check` exit 0; 0 Russian comments in the ticket's paths.
- Found: `scripts/export-pool.mjs` says «run by hand» while the weekly workflow runs `starter-from-backup.mjs`; the header now says so. A stale comment, not a bug: no `KNOWN_ISSUES.md` entry.

## 2026-11-15 — Ticket 1.6: views 3 documented («Тикет 1.6»)

- The last 18 files of `src/app/views/` (`doh`, `settings`, `wizard`, `catalogview`, `project`, `poolview`, `shilutsettings`, `managersfolder`, `tables`, `todos`, `sheetslist`, `history`, `manualsview`, `members`, `journal`, `projects`, `month`, `log`) have an English header (first sentence = the code-map line; `doh.js` and `settings.js` also a Contents list; `log.js` had none before) and all 164 Russian comments translated; their entries removed from both `PENDING` lists, so `src/app/views/` is clean. Commit `2bb81c2`, branch `claude/s01-ticket-06`; deploy of `main` succeeded.
- Proof: `node tools/same-code.mjs --expect tools/code-map.mjs --expect tools/ru-comments.mjs` — code identical without comments (the two tools differ only by the removed `PENDING` entries), built site byte-identical (28 files); 158/158 tests; `code-map --check` exit 0.
- Found: the old header of `settings.js` promised an «installation binding» that the tab does not hold; the new header says what the code does. A stale comment, not a bug: no `KNOWN_ISSUES.md` entry.

## 2026-11-15 — Ticket 1.5: views 2 documented («Тикет 1.5»)

- 11 files of `src/app/views/` (`planmodal`, `tohnitview`, `planversion`, `planpick`, `planlink`, `planview`, `planassign`, `plannumbers`, `pdfpick`, `import`, `guide`) have an English header (first sentence = the code-map line; `planmodal.js`, `tohnitview.js`, `guide.js` also a Contents list, `planversion.js` a short one) and all 150 Russian comments translated; their entries removed from both `PENDING` lists. Commit `f74dd93`, branch `claude/s01-ticket-05`; deploy of `main` succeeded.
- Proof: `node tools/same-code.mjs --expect tools/code-map.mjs --expect tools/ru-comments.mjs` — code identical without comments (the two tools differ only by the removed `PENDING` entries), built site byte-identical (28 files); 158/158 tests; `code-map --check` exit 0. `guide.js` texts are UI strings and stayed as they were.
- Found: nothing wrong; no `KNOWN_ISSUES.md` entry.

## 2026-11-10 — Ticket 1.4: views 1 documented («Тикет 1.4»)

- 12 files of `src/app/views/` (`points`, `racks`, `pullview`, `racktable`, `pointmerge`, `pointsfile`, `pointchooser`, `cablespick`, `doorchips`, `doorcfgview`, `ownworks`, `latinfix`) have an English header (first sentence = the code-map line; `points.js`, `racks.js`, `pullview.js` also a Contents list) and all 139 Russian comments translated; their entries removed from both `PENDING` lists. Commit `634ed75`, branch `claude/s01-ticket-04`; deploy of `main` succeeded.
- Proof: `node tools/same-code.mjs --expect tools/code-map.mjs --expect tools/ru-comments.mjs` — code identical without comments (the two tools differ only by the removed `PENDING` entries), built site byte-identical (28 files); 158/158 tests; `code-map --check` exit 0.
- Found: the old header of `latinfix.js` promised a «search of names typed in the wrong layout», but the file only holds the shortcut list and its dialog (`fixLatin`, `fixCabinet`, `needsFix` are imported and silenced with `void`, never used); the new header says what the code does. A stale comment, not a bug: no `KNOWN_ISSUES.md` entry.

## 2026-11-10 — Ticket 1.3: app core documented («Тикет 1.3»)

- All 35 modules of `src/app/` (with `tour/`), `src/main.js` (no header before), `src/edition.js`, `src/firebase.js`, `src/log.js` and `src/i18n/index.js` have an English header (first sentence = the code-map line; `repo.js` also a Contents list) and every Russian comment translated (359 comments); the seven entries removed from both `PENDING` lists. Commit `e5a5f8f`, branch `claude/s01-ticket-03`; deploy of `main` succeeded.
- Proof: `node tools/same-code.mjs --expect tools/code-map.mjs --expect tools/ru-comments.mjs` — code identical without comments (the two tools differ only by the removed `PENDING` entries), built site byte-identical (28 files); 158/158 tests; `code-map --check` exit 0. The JSON dictionaries of `src/i18n/` untouched.
- Comments that no longer matched the code were rewritten to say what it does (no bug found, no `KNOWN_ISSUES.md` entry): `drawings.js` named an old Drive folder (files now sit in the project's «Чертежи» folder), `shell.js` called the pending-send badge «⏳ N» (it shows «⬆ N»), `store.js` has two comments on one line (the second belongs to `nav`, kept in place), the first of two comments above the Drive placement in `managers.js` was older than the code under it. Cyrillic examples inside comments are in «…» (e.g. «С108» in `repo.js`).

## 2026-11-10 — Ticket 1.2: `src/domain/` documented («Тикет 1.2»)

- All 30 modules of `src/domain/` have an English header comment (first sentence = the module's line in `docs/code-map.md`) and every Russian comment translated (409 comments); `src/domain/` removed from both `PENDING` lists. Commit `464c2a3`, branch `claude/s01-ticket-02`.
- Proof: `node tools/same-code.mjs --expect tools/ --expect tests/code-docs.test.js` — code identical without comments, built site byte-identical (28 files); 158/158 tests.
- Fix beyond the ticket: `tools/same-code.mjs` no longer counts a line break before the *first* token of a file (a header added above `src/domain/index.js`, which had no comment, was flagged as a code change; the first token has no statement before it); one test case added in `tests/code-docs.test.js`.
- Left as is: the two Russian strings of `src/domain/openrules.js` (ticket 07). Misplaced comments kept in place and made true: the «U|порт» line above `hasShilut` in `shilutsheet.js` describes `portsOf`; the rename comment above `replaced` in `points.js` now says what that helper does. No bug found, no `KNOWN_ISSUES.md` entry.

## 2026-11-10 — Ticket 1.1: tools, KI-1, KI-2 («Тикет 1.1»)

- New `tools/code-map.mjs` (module list of `docs/code-map.md`, `--check`), `tools/ru-comments.mjs` (Russian comments; `PENDING` per ticket), `tools/same-code.mjs` (per-file code compare + byte-for-byte build compare in a git worktree with a `node_modules` junction); `tests/code-docs.test.js` (14 tests). Commit `036d628`, branch `claude/s01-ticket-01`.
- Decisions beyond the spec: `same-code --expect <path>` names intended code changes (the expected exceptions of spec 10 could not exit 0 otherwise; spec 6.2 and tickets 07, 09 updated); JS token compare also records whether a line break precedes each token (ASI); the base worktree gets the working tree's `.gitattributes` before checkout, otherwise KI-2 line endings made the setup chunk differ on Windows; `src/app/tour/` was missing from the spec table — added to both `PENDING` lists and to ticket 03.
- Baseline: 1,751 Russian comments in 144 files (the spec's 1,565 counted JS only, guillemets included). KI-1 and KI-2 fixed; tests 158/158 on Windows. The `tests/i18n.test.js` header translated.
- Coding standards 3 (checked), 10 (comments in English), 11 (same-code check); `CLAUDE.md` Run; `CONTEXT.md` Development.

## 2026-11-10 — Stage 1 slicing («Тикеты 1»)

- Nine tickets in `.scratch/01-code-docs/issues/` accepted (01 tools, 02 domain, 03 app core, 04–06 views, 07 drawings/scripts/config, 08 tests and Python, 09 architecture and strict checks). Branch `claude/s01-tickets`. Ticket files stay `open` until their own sessions.
- Found while slicing: the two Russian comment lines inserted by `src/domain/openrules.js` are string literals, so ticket 07 translates them (a string change); `same-code` check 1 lists `openrules.js` as an expected exception and the build differs only in the setup chunk with the open rules text. Noted in spec section 11, tickets 02 and 07.

## 2026-11-10 — Stage 1 spec («Спека 1»)

- `.scratch/01-code-docs/spec.md` accepted. Branch `claude/s01-spec`.
- Checked on the owner's PC: with a fixed `__BUILD__` two builds are byte-identical, and comment edits in JS, CSS and `vite.config.js` leave `dist/` byte-identical; the only comment text in the bundle is `firestore.open.rules` (wizard copy button, `?raw`); pasted rules are checked by the `meta/probe` read, so no re-paste after translation. acorn parses all 141 JS files (1,565 Cyrillic comment tokens). KI-2 fix by `.gitattributes` `eol=lf` verified (domain tests 48/48). `SKILL.md` does not include `tohnit.py`; `tohnit.py` prints its module docstring as usage help (stays Russian). A `.pyc` under `tools/tohnit/__pycache__/` is tracked (untracked in ticket 08).
- Decided: Cyrillic in a comment allowed only inside «…» (UI text, data); test names, assertion messages, event-log lines stay Russian; `PENDING` lists in `tools/code-map.mjs` and `tools/ru-comments.mjs` shrink per ticket, ticket 09 removes them; new `tools/same-code.mjs` (token-level code comparison of changed files + byte comparison of both builds via a git worktree) replaces the browser walk in this stage's self-check; header shape with a Contents list for modules ≥ 30 KB; coding standards 10 (comments in English) and 11 (comment-only change keeps the build identical).
- Tickets: 9 instead of the description's 8 — tests and the Python tool split out (simple), architecture section last; estimate stays ≈ 14 sessions.

## 2026-11-10 — Stage 1 description («Описание 1»)

- `.scratch/01-code-docs/description.md` accepted. Branch `claude/s01-description`.
- Owner's decisions: translate all Russian comments now (code, tests, `style.css`, `firestore.rules`, `tools/tohnit/`, workflows), not gradually (+3–4 sessions, stage ≈ 14); no Russian explainer or diagram for the owner; every ticket gets the self-check plus a built-site-unchanged check and goes live, the owner checks once after the stage review; rollback point before any file change.
- Rollback branch `rollback-2026-11-10` at `172c588` created and pushed (code identical to `2966523`).
- Found: 124 of 127 modules have a Russian header (missing: `src/main.js`, `src/app/views/log.js`, `src/domain/index.js`); ~1,360 Russian comment lines in `src/` and `scripts/`; 4 of 13 test modules have a header. KI-2 cause confirmed (CRLF checkout vs `\n`-joined lines inserted by `openRules`); `docs/project-spec.md` Stage 1 updated.
- Proposed for the spec (owner: no objection): `firestore.rules` comment changes need no re-paste into the Firebase console.

## 2026-11-10 — Adoption onto the workflow («Перенос на схему»)

- The project (version 1.2.0, ~368 commits, last owner-checked commit `2966523`) moved onto the stage workflow. Branch `claude/adopt-workflow`.
- `HANDOFF.md` (47 KB, Russian, the hand-off from the claude.ai project sessions) was split into: `docs/project-spec.md` (purpose, users, done, plans → stages), `CONTEXT.md` (glossary), `docs/adr/0001`–`0012` (decisions), `docs/code-map.md` (architecture), `PROJECT_CONTEXT.md` (environment, keys by name, gotchas), `docs/coding-standards.md` (rules from gotchas and the work order), `docs/workflow.md` (work order with the owner, quick fixes), `docs/rollback.md` (branches). The full original is at commit `44ac16d`. `README.md` and `ВОССТАНОВЛЕНИЕ.md` stay as they were (Russian, for people); README got a docs line.
- Owner's answers: quick fixes as a separate one-session lane; code goes to `main` after the self-check and the owner checks live, as before (ADR 0011); NAS setup is a separate project, this app writes its requirements (stage 2); management sheets remarks come in stage 3's description; PocketBase when the owner trusts the NAS — a full copy tested in parallel for several days, then possibly main (ADR 0012); the owner wants the whole code documented — stage 1, detailed.
- Decided alone: new docs, comments and commit messages in English (cheaper to read every session); `✅ Checked by owner: …` replaces `✅ Проверено Иваном: …`; drawing catalog growth and photos stay "later"; code map script in Node (`tools/code-map.mjs`, stage 1) since the stack is JS.
- Found: 3 of 144 tests fail on Windows (KI-1, KI-2). `npm ci` was run locally (node_modules was missing).
- Owner's NAS: UGREEN DXP2800, 2×3 TB HDD, 500 GB NVMe (HANDOFF said 2×2 TB — corrected by the owner); arrives 2026-11-11 without disks.

## Before 2026-11-10

Work log of the earlier sessions: the git history (Russian commit messages, `✅ Проверено Иваном: …` markers) and `HANDOFF.md` at commit `44ac16d`, sections 3 (done), 4 (plans) and 10 (how we worked).
