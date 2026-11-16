Status: in review
Complexity: simple
Blocked by: 02, 03

# 04. Profile form, guide and glossary

The sheet profile form gets the type list with arrows (the order of sections) and two ticks (sections, rack sheet); translations, the guide line, the glossary terms and the known issue about sorting.

## Spec sections

§5.2, §5.3, §5.4, §9 (`CONTEXT.md`, `KNOWN_ISSUES.md`), §8.2 (the profile-form check).

## What to do

1. `src/app/views/tables.js` (`tableForm`): the field «Типы точек» becomes a list with a tick and ▲▼ per type (same widget look as «Столбцы»), a «Все» row on top (ticking it clears the ticks), in `typeOrderOf` order; label and hint as §5.2. On «Сохранить»: `typeOrder` = the whole ordered list, `types` = the ticked ones. Two ticks right after «Итоги сверху …»: «Разделы по типам точек» (`sections`) and «Лист „Итоги по шкафам“» (`rackSheet`), both on for a new profile and for a profile without the fields. The preview line «Будет точек: N, столбцов: M, листов: K» counts the rack sheet. The profile card on the screen stays unchanged.
2. New UI strings of §5.3 into `src/i18n/src/09-wizard-tables.json`, then `node scripts/i18n-build.mjs`.
3. `src/app/views/guide.js`, section `data`: the line of §5.4 (RU, EN, HE) after the line about «🔄 Обновить таблицу для руководства».
4. `CONTEXT.md`, under «Management sheets»: **Section**, **Rack sheet**, **Update stamp** (§9).
5. `KNOWN_ISSUES.md`: a new entry and index line — an editor's sort of the points sheet scatters section and empty rows until the next rebuild; viewers are not affected; workaround and why not fixed as §9.
6. Header comments of the changed modules; `node tools/code-map.mjs`.

## Done when

- In the form the arrows move a type and the order is kept after «Сохранить» and reopening; the ticks turn sections and the rack sheet off and on in the built file after a refresh.
- A profile saved before this ticket opens with both ticks on and all types in name order.
- The three new strings and the guide line exist in Russian, English and Hebrew; `tests/` for i18n pass.
- `npm test`, `npm run build`, `node tools/code-map.mjs --check` pass; self-check in `?mem=1` at 420 px: the form on the phone, arrows and ticks.

## Tests to add

- A pure helper for the form's save step (types list → `typeOrder` and `types`) in `src/domain/`, with a test, if the logic is more than a few lines; the form itself has no automated test (the project has no UI tests).
- The existing i18n test covers the new strings.

## Owner check

On the phone:
1. Project → «Таблицы» → open the profile → «Типы точек»: move one type up with ▲, press «Сохранить», «🔄 Обновить таблицу для руководства»: that type's section moved in the file.
2. Untick «Разделы по типам точек», save, refresh: no section rows, points in one block. Tick it again: sections are back.
3. Untick «Лист „Итоги по шкафам“», save, refresh: the last tab is gone (it is removed from the file). Tick it again: it returns.
4. ☰ → «Как пользоваться приложением» → раздел про данные: the new line about sections and the rack sheet reads right in Russian (and Hebrew, if you switch the language).
