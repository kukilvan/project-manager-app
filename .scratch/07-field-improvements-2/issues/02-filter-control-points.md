Status: in review
Complexity: complex
Blocked by: 01

# 02. Filter control, matching rules and «Точки»

The core of idea 007: one button-and-window control for several-value filters, its pure rules, the shared filter store, and the first screen that uses all of it — «Точки» — with «✖ Сбросить фильтры».

## Spec sections

§ 0 (D1, D7, D8, D9, D10), § 1 (all), § 2.1, § 3 (store and «Точки» side), § 8 (filter strings and guide lines 1–2), § 11 (coding-standards rule), § 7 (rows on ticking, groups, problems, project switch).

## What to do

1. `src/domain/filters.js` (pure): `toggleValue`, `tickAll`, `clearAll`, `isOff`, `normalize`, `prune`, `buttonText`, `anyOf`, `groupState`, with the option shape `{ value, text, count?, kind: 'plain' | 'group' | 'any' | 'mode' | 'head', members? }` — all rules of §§ 1.1–1.6 (group lines, «⚠ С проблемами» against single problems, plan modes against types, D1 covering only for racks and types, missing shared values named last).
2. Matching with sets, in the domain helpers: racks (`set.has(point.cabinet || '__none')`), types, door configurations (`cfgSetMatch(set, point)` in `src/app/cfgfilter.js`, any value matches by today's `cfgMatch`), problems (`__any` or ids). `src/app/typegroups.js` gains `typeOptions(typeIds, countOf)` with `kind: 'group'` and `members`.
3. `src/app/views/multifilter.js`: `multiFilter({...})` → `{ el, refresh() }` and `resetButton({ active, onReset })` → `{ el, refresh() }` exactly as § 1.7. Button: `max-width: 190px`, one line, «…» by CSS, the arrow «▾» a separate element, class `on` when active. Window: `openModal`, 22 px checkboxes, counts at the far end, scroll inside `max-height: 55vh`, «Отметить все» / «Снять все» / «Готово»; the ticks are applied once on close by any way (`onClose`); `onChange` only when the set changed. Look: the mockups in `.scratch/07-field-improvements-2/mockups/`.
4. `src/app/sharedfilters.js`: in-memory `{ pid, cab, type, cfg }`, `sharedFilters()`, `setShared(key, set)`, `clearShared()`, change listeners; another `pid` clears (§ 3). A pure part kept testable.
5. «Точки» (`meterView`, `src/app/views/points.js`): replace the rack, type and door-configuration drop-downs and the problems drop-down by `multiFilter` buttons (order as today; door configurations and problems shown under today's conditions; «План: …» drop-down stays); racks, types, door configurations read and write the shared sets; problems and «План: …» stay module-level; counts are points of the whole project; prune the shared sets of vanished values here (and only here); the reset button under the row (§ 1.8 table, row «Точки»); `showProblemPoints()` as in § 2.1; the tab re-renders when a shared set changes elsewhere (listener, § 3) — the plan side arrives in ticket 03, keep the hook ready.
6. Coding-standards rule «point filters use `multiFilter` (`src/app/views/multifilter.js`); no new single-value drop-downs for point filters», with its check (grep for `h('option', { value: '' }, 'Все типы'` and the other «all» texts in `src/app/views/` outside `multifilter.js`); `docs/coding-standards.md`. Tickets 03–05 convert the other screens, so the check starts as an allow-list of the files still to convert (plan, «Что осталось», pull view, the three pickers); each of those tickets removes its files from the list, and ticket 05 leaves it empty.
7. Strings of § 8 for this ticket (button prefixes «Шкафы: {}» … «Проблемы: {}», «✖ Сбросить фильтры»; «{} — нет на этом чертеже» and the empty-plan line belong to ticket 03) and guide lines 1–2 in the section of «Точки» (`src/app/views/guide.js`) in three languages; `node scripts/i18n-build.mjs`.
8. `CONTEXT.md`: check that «Point filter» and «Shared filters» exist as § 11 says; header comments; `node tools/code-map.mjs`.

## Done when

- In `?mem=1&memPlan=1` «Точки»: «Все шкафы» → tick FA and FB → «Готово» → the button reads «Шкафы: FA, FB» and the list shows those racks only; three types → «Типы: 3»; the reset button appears and clears filters and search.
- All racks ticked and «Готово» → button «Все шкафы», not highlighted, stored empty. All door configurations ticked → kept («Двери: N»).
- A group line with one of three members ticked shows unticked; a tap ticks all; «⚠ С проблемами» and single problems exclude each other.
- «Проект» → «⚠ Открытых проблем … — показать» works with the new problems filter.
- Another project chosen → shared sets empty; search, problems and «План: …» kept.
- A window closes by «Готово», ✕, and a tap outside (phone width); pressing «Готово» twice changes nothing.
- English and Hebrew: texts translated, windows right to left in Hebrew.
- The coding-standards check passes with its allow-list.
- `npm test`, `npm run build`, `node tools/code-map.mjs --check` pass.

## Tests to add

`tests/filters.test.js` (§ 10): `toggleValue` (plain, group with partial members, «⚠ С проблемами» against singles both ways, modes against types and each other), `tickAll` / `clearAll`, `isOff` and `normalize` (covering vs not, D1), `prune`, `buttonText` (none, 1, 2, 3+, covering full, missing names last), `anyOf` (empty set passes all). Matching tests for racks with `__none`, types, door configurations («⚠ Без запирания», «Без конфигурации», ids), problems `__any` and ids. Shared filters: a change through `setShared` is seen by a second reader; another `pid` clears; the plan path does not prune a missing value (test the pure part or drive the module with a stub `currentProject`).

## Owner check

On the phone, after the site updates:
1. «Точки»: «Все шкафы» → tick two racks → «Готово»: the button shows both names, the list shows both racks only.
2. «Все типы» → tick three types: only those types within those racks; «✖ Сбросить фильтры» is visible.
3. Tick every rack: the button goes back to «Все шкафы».
4. «✖ Сбросить фильтры»: filters and search are empty, the reset button is gone.
5. Problems: tick two problems → points with either show.
