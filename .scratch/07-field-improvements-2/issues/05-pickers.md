Status: in review
Complexity: simple
Blocked by: 02

# 05. Pickers: points picker, point for a mark, placing into a panel

The three small pickers move to the shared filter control; the last single-value drop-downs for point filters go.

## Spec sections

§ 2.5, § 2.6, § 2.7, § 1.8 (rows «points picker», «choosing a point for a mark», «placing points into a panel»), § 11 (the coding-standards check must now find nothing).

## What to do

1. Points picker (`pointsPicker`, `src/app/views/doh.js`): racks (when more than one value, as today), types, door configurations as `multiFilter` buttons; search; reset button under the row; «Все показанные» ticks the shown points as today; own sets, reset when the picker opens.
2. Choosing a point for a mark (`choosePoint`, `src/app/views/pointchooser.js`): types and racks (with «Без шкафа» now) as buttons; search; «Только точки без места на чертеже» ticked when it opens, as today; reset button under the checkbox (clears sets and search, ticks the checkbox again). `choosePoint({ typeId })` opens with that type ticked, so the reset button shows at once; the reset unticks it.
3. Placing points into a panel (`placeModal`, `src/app/views/racks.js`): types as a button (plain types, no group lines); it opens with nothing ticked (today a single type was preselected); «Отметить все» of the dialog ticks the shown points as today; reset button under the row.
4. Remove the old drop-downs and unused single-value helpers (`typeMatch`, `typeFilterValid`, `cfgMatch`, `cfgFilterValid` where nothing else uses them; spec § 1.6). Run the grep check of the coding-standards rule and empty its allow-list: it must find nothing in `src/app/views/` outside `multifilter.js`.
5. Strings (reuse; add any missing), `node scripts/i18n-build.mjs`, header comments, `node tools/code-map.mjs`.

## Done when

- «Добавить работу» → «Выбрать точки…»: several racks and types at once, the reset clears them and the search; «Все показанные» works.
- A mark's «Выбрать точку»: racks and types as buttons; the checkbox and reset behave as described; a call with `typeId` opens with that type ticked.
- «➕ Поставить точки в панель»: several types can be ticked; nothing preselected.
- The grep check of the coding-standards rule is clean. `npm test`, `npm run build`, `node tools/code-map.mjs --check` pass.

## Tests to add

None beyond the existing suite if the logic stays in `src/domain/filters.js` (tested in ticket 02); if a screen keeps its own matching code, extract it and cover it.

## Owner check

On the phone, after the site updates:
1. «Добавить работу» → «Выбрать точки…»: pick two racks and two types; «Сбросить фильтры» clears them.
2. «➕ Поставить точки в панель»: several types can be ticked at once.
3. On the plan, add a mark and choose a point: types and racks are buttons with several values.
