Status: accepted

# Stage 7. Field improvements 2 — review

## What was reviewed

- Commits `9b30097..77e7f13` (from «Tickets 7: accepted» to «✅ Checked by owner … ticket 7.7»): tickets 01 (test drawing), 02 (filter control and «Точки»), 03 (plan filters), 04 («Что осталось» and «Протяжки» filters), 05 (pickers), 06 («Что осталось» records several works), 07 (English names) of `.scratch/07-field-improvements-2/issues/`.
- Code: about 1,700 added lines in 48 files outside `.scratch/` — `src/domain/` (`filters.js`, `planfilters.js`, `testplan.js`, `ownnames.js`, `remaining.js`, `compose.js`), `src/app/` (`sharedfilters.js`, `testplan.js`, `cfgfilter.js`, `typegroups.js`, `shell.js`), the views (`multifilter.js`, `points.js`, `planmodal.js`, `doh.js`, `pullview.js`, `pointchooser.js`, `racks.js`, `settings.js`, `problems.js`, `shilutsettings.js`, `poolview.js`, `guide.js`), `src/i18n/` (`index.js`, `src/20-filters.json`, `not-ui.json`), `src/main.js`, `src/style.css`, the seven new or changed test files; docs: `CONTEXT.md`, `docs/coding-standards.md` (rule 13), `docs/project-spec.md`, `docs/workflow.md`, `PROJECT_CONTEXT.md`, `docs/history.md`.
- Against `.scratch/07-field-improvements-2/spec.md` (§§ 0–12 item by item, including the edge-case table of § 7 and the texts of § 8), the tickets, `docs/coding-standards.md` (rules 1–13) and `CONTEXT.md`. Two passes in this session: standards, then spec. No code-review skill run: the diff was read in full.

## Tests

- Start: 326/326 pass (Windows, Node 24). `npm run build` passes; `node tools/code-map.mjs --check` exit 0 (139 modules); `node tools/ru-comments.mjs` — 0 Russian comments in 181 files.
- End: the same; this review changed no code.

## Verified by running

`?mem=1&memPlan=1` at 420 px in the browser pane (`npx vite preview` on the fresh build; the old service worker cleared first), Russian UI unless said otherwise:
- **«Точки».** «Все шкафы» window lists «Шкаф FA 7», «Шкаф FB 6», «Шкаф FC 2», «Без шкафа 1»; FA and FB ticked → the button «Шкафы: FA, FB» (highlighted), 13 points; types «Галай» and «Камера» added → «Типы: Галай, Камера», 8 points; «✖ Сбросить фильтры» visible; «Готово» twice changes nothing.
- **Plan.** Opens with the same racks and types ticked; its types window adds the modes «❔ Не размеченые» and «🙈 Скрытые» with counts; the stage window has the three sections «Осталось» (7 lines, no counts), «Работа» (with counts, pulls first) and «Проблемы» («⚠ С проблемами» and «Проблема: Кабель»); «Осталось: хивут» and «Осталось: шилют» ticked → the button «Этапы: Осталось: хивут, Осталось: шилют», matching points stay bright. «✖ Сбросить фильтры» on the plan clears the plan's and «Точки»'s buttons together and hides both reset buttons.
- **D2.** FC ticked in «Точки», plan opened: the rack button «Шкафы: FC» (highlighted), the window ends with the greyed ticked line «FC — нет на этом чертеже», and «Под фильтры на этом чертеже точек нет» shows under the reset button.
- **Focus point.** Shared type «Галай» ticked, card of FA/C-01 → «📍 На чертеже»: FA/C-01 is drawn with its frame and the focus frame while the other cameras (FA/C-03, FA/C-05) have no frames; the filters stay.
- **Modes.** Ticking «❔ Не размеченые» in the plan's types window unticks «Галай»; the button reads «❔ Не размеченые», «Точки» shows «Все типы».
- **«Что осталось».** Works window with 19 lines and counts. Only «Протяжка cat7» + FB/K-01: the button «✅ Записать «Протяжка cat7» (1)», the form opens with «Протяжка записывается только для кабеля cat7»; «Сохранить» → one entry `Протяжка | PR_PTS | cat7 | FB_K_01`, no 6005 (D3). Changing the work type to «Хивут» and back to «Протяжка» does not bring the line back. «Протяжка cat7» + «Хивут кистона» on FA/C-01, FA/C-02, FB/K-01 → «✅ Записать выбранные работы (3)»; «Несколько работ» opens with the three points, «Протяжка по точкам — только cat7» and «Хивут кистона» ticked; «Сохранить всё» → «Записей добавлено: 2»: Хивут on 3 points, Протяжка cat7 on 2 (FB/K-01 already had cat7). On a fresh start with no day: «Хивут кистона» + «Шилют» on all shown points → one day «2026-11-21 · сам · сам» and two entries (10 and 11 points) appear together.
- **«Протяжки».** Step 1: «Все типы», «Все конфигурации дверей», «Все шкафы» as buttons; types «Галай», «Камера» → «☑ Все видимые (9)», rack FA added → 5, the reset button shows; step 3: the types button (Галай 2, Камера 7), «Метраж: 0 из 2» with «Галай» ticked, the reset back to «0 из 9».
- **English and Hebrew.** English: «All cabinets», «Cabinets: FA, FB», «Types: 4», window lines «Cabinet FA», «No cabinet», «Tick all / Clear all / Done», «✖ Reset filters». Hebrew: the page is RTL, «ארונות: FA, FB», «סימון הכול / ניקוי הכול / סיום», «✖ איפוס מסננים».
- **Not verifiable here:** the iPhone and its real keyboard and taps; real Firestore (listeners are synchronous in `?mem=1`, so races are reasoned from the code: see the checked items); the «Название (English)» forms in the browser (covered by `tests/catalog-en.test.js` and the owner's check of ticket 7.7); the point-for-a-mark dialog, the panel dialog and the picker's own windows (checked by the owner on ticket 7.5; the picker's rendering was seen inside «Несколько работ»).

## Findings

- **F1** — `KNOWN_ISSUES.md` KI-7 was still «open» with its catalog-names half fixed by ticket 7.7 (spec § 11 asked to close that half after the review). **Fix now:** the index row and the entry say the catalog names are fixed (test «every built-in name reads in English with no Cyrillic letters», `tests/catalog-en.test.js`, 2026-11-21, stage 7); the sentences-built-from-parts half stays open.

- **F2** — `docs/project-spec.md`, stage 4 «Data added by stage 7» said `nameEn` is on «catalog items of the shared pool» only. Spec 7 § 9 puts it on works, point types, devices and cables of the project too (the forms write it into the project first) and on shared problems; stage 4's description pulls this line in, so a PocketBase schema built from it would miss the project fields. **Fix now:** the line names the five kinds, project and pool, and points at spec 7 § 9 (the stage 7 Data line was already corrected by ticket 7.7).

No fix-round finding and no deferral: nothing in the code or the running app disagreed with the spec in a way that needs design or tickets.

Checked and left as they are:
- Spec § 7 names the missing rack line «Шкаф FC — нет на этом чертеже»; the window shows «FC — нет на этом чертеже» (the string `{} — нет на этом чертеже` of § 8 with the rack's name as the button shows it, § 1.1). One reading of the spec, same meaning; the spec table is not edited.
- Spec § 3 says the plan's `onClose` calls `ui.render()`; the code refreshes the rendered «Точки» tab in place through the change listener of `sharedfilters.js` (ticket 7.2's design, written down in `docs/history.md` under ticket 7.3). The result is the same (seen when the plan reset cleared «Точки»'s buttons); a tab that is not on screen is drawn from the shared sets when it is next opened.
- Spec § 10 names `remainingPreset(tickedKeys, pointIds, catalog)`; the code takes `ctx` because the pull work must apply to points through `workUsesPoints` (history, ticket 7.6). Tested for every case of the list.
- Batch saving: the day-screen path of «Несколько работ» (no preset) now also writes all entries in one `repo.save` instead of one save per entry; the entry shape and the order of `syncJournal` are unchanged, and each entry is still saved with its own id, so history and rollback are the same.
- «Отметить все» in the plan's window drops a missing shared value from the working copy (it ticks the plain lines of this drawing); «Снять все» clears it too. The spec does not say; both are safe (the set only gets smaller) and the owner can see the result in the button.
- The «Этапы» button reads «Этапы: Осталось: хивут, Осталось: шилют» (spec § 1.1 names stage values by their line text); long, but cut by «…» at 190 px.
- `testplan.js` and `memPlan` stay out of the live bundle: `src/main.js` imports `src/app/testplan.js` dynamically, only in test mode.
- Rule 13's test (`tests/filter-control.test.js`) has an empty allow-list; `wizard.js` is the one exception (catalog types, not points) and is named in the rule text.

## Wishes for later stages

- While the plan is open, every filter change there refills the whole «Точки» list behind it (the in-place listener). Invisible at the sizes seen so far; if a project with thousands of points feels slow, the listener should mark the tab stale instead and redraw it on close.
- A DOM test of `multifilter.js` (button text, ticking, closing by ✕) would need a DOM library the repo does not use; today only the pure rules are tested and the window is checked in the browser pane.
- Stage 4 must carry `nameEn` through PocketBase for the five kinds, project and pool (`docs/project-spec.md`, stage 4, line corrected in F2); its description pulls the line in.
