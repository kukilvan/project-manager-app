# Idea 007: Several values in every point filter, «Сбросить фильтры», shared filters of «Точки» and «План»

Status: taken in — `.scratch/07-field-improvements-2/description.md`
Added: 2026-11-20

## Why

Every point filter today is a drop-down with one value: one rack, one type, one door configuration, one work. On site the owner often needs two racks and three point types at once (for example racks FA and FC, cameras, readers and Wi-Fi) and has to go through them one by one. Clearing the filters also means going back through each drop-down and picking «Все …» again.

## Scenario

1. The owner opens «Точки». Under the search line there are filter buttons: «Все шкафы ▾», «Все типы ▾», «Все конфигурации дверей ▾», …
2. They tap «Все шкафы ▾». A window «Шкафы» opens with a checkbox line per rack and its point count («Шкаф FA (212)», «Шкаф FB (95)», «Без шкафа (4)»), and buttons «Отметить все», «Снять все», «Готово».
3. They tick FA and FC, press «Готово». The button now reads «Шкафы: FA, FC ▾» and the list shows the points of both racks.
4. They tap «Все типы ▾», tick «Камера», «Считыватель», «Wi-Fi». The list shows the points of racks FA or FC whose type is one of the three.
5. Under the filters a button «✖ Сбросить фильтры» has appeared.
6. They open «🗺 План». The plan has the same racks and types ticked and shows only those points.
7. They press «✖ Сбросить фильтры» on the plan. All points show again on the plan, and back in «Точки» the filters are cleared too.
8. In «🧾 Что осталось» they tick two works in «Работы» («Хивут» and «Установка») and tick five points. The button reads «✅ Записать выбранные работы (5)». It opens the «Несколько работ» window with those five points and both works already ticked; they check it and press «Сохранить всё». Each work becomes its own entry in today's report, on the points that still wait for it.

## Behaviour

**Screens** (every point filter of the app):

| Screen | Code | Filters that become several-value | Stay single |
|---|---|---|---|
| «Точки» | `meterView`, `src/app/views/points.js` | racks, types, door configurations, problems | «План: все / Нет на плане / На плане» |
| «Что осталось» | `remainingModal`, `src/app/views/points.js` | works, racks, types, door configurations | «Протяжка: все / Только протянутые / Ещё не протянутые» |
| «План» | `planModal`, `src/app/views/planmodal.js` | types, racks, door configurations, the stage filter («Осталось», «Работа», «Проблемы») | — |
| «Протяжки», step 1 and step 3 «Метраж» | `src/app/views/pullview.js` | types, door configurations, racks; step 3: types | checkbox «Только не протянутые» |
| Choosing points for a work in the day report («Добавить работу», «Несколько работ») | `pointsPicker` in `src/app/views/doh.js` | racks, types, door configurations | — |
| Choosing a point for a mark on the plan | `choosePoint`, `src/app/views/pointchooser.js` | types, racks | checkbox «только без места на чертеже» |
| Placing points into a rack panel | `src/app/views/racks.js` | types | — |

**The filter button.** Nothing ticked: the filter is off, all points pass, and the button shows today's first option text («Все шкафы», «Все типы», «Все конфигурации дверей», «Все работы», «Все этапы», «Проблемы: все»). One or two values ticked: their names («Шкафы: FA, FC»), with long names cut off by an ellipsis. Three or more: the count («Типы: 3»). If every value is ticked, the button counts as off and shows «Все …».

**The window.** Its title is the filter name («Шкафы», «Типы», «Конфигурации дверей», «Работы», «Этапы», «Проблемы»). It has one checkbox line per value, with the point count wherever today's option has one, then «Отметить все», «Снять все», «Готово». The ticks apply when the window closes, whether by «Готово», a tap outside or back. The list scrolls when there are many values.

**Logic.** Values of one filter add up: rack FA **or** FC. Different filters narrow each other: rack (FA or FC) **and** type (camera, reader or Wi-Fi). On the plan the stage filter keeps today's way of showing a match: matching points stay bright and the others dim. With several values a point is bright when it matches any of them.

**Special lines.**
- The group line «▸ Все: Дверь (типов: N)» in a type filter ticks or unticks every type of the group at once.
- «⚠ С проблемами (N)» in the problems filter of «Точки» means any open problem. Ticking it unticks the single problems, and ticking a single problem unticks it.
- «❔ Не размеченые» and «🙈 Скрытые» in the plan's type filter are modes, not types. Ticking one unticks every type and the other mode, and ticking a type unticks the modes.

**«✖ Сбросить фильтры».** A button under the filters of every screen above, shown only while something is active: any filter set (several-value or single-value), a checkbox away from its default, or search text. It clears all filters of that screen and its search line. It brings the single-value filters and checkboxes back to their defaults: «Только не протянутые» unticked, «только без места на чертеже» ticked as it opens today. It does not touch the points ticked for an action (the selection), apart from what each screen already does today when its filters change. The plan's «найти точку» field jumps to a point and is not a filter, so it stays.

**Shared filters of «Точки» and «План».** The rack, type and door-configuration filters are one set for both screens while the app is open, per project. A tick in «Точки» shows on the plan and the other way round. «Сбросить фильтры» on either screen clears them on both. The plan no longer opens with empty filters. The plan's stage filter, and the problems and «План: …» filters of «Точки», stay per screen. Switching to another project clears the shared filters.

**«Что осталось», the record button.**
- No work ticked: «✅ Записать работу», disabled, hint «Сначала выберите работу в фильтре» (as today).
- One work ticked: as today, «✅ Записать «<work>» (N)» opens the one-work form with the work and the points.
- Two or more works ticked: «✅ Записать выбранные работы (N)» opens «Несколько работ» (`batchForm` in `src/app/views/doh.js`) with the ticked points and those works already ticked. The owner reviews and presses «Сохранить всё». Each work is its own entry and goes only on the points that still wait for it, as «Несколько работ» does today.
- Works that cannot be recorded from here today (stage-only keys `s:…` of legacy points) are left out of the form, with a short note.

New UI strings are translated into English and Hebrew in the same tickets (`docs/coding-standards.md`, rule 12). The in-app guide (`src/app/views/guide.js`) gets lines on several values, «Сбросить фильтры», the shared filters and recording several works from «Что осталось».

## What changes in existing behaviour

- Every point filter drop-down listed above becomes a button with a checkbox window.
- «План» opens with the racks, types and door configurations last chosen in «Точки» or on the plan, not with empty filters.
- The plan's stage filter, the «Что осталось» works filter and the «Точки» problems filter take several values (any of them matches).
- The «Что осталось» record button can record several works through «Несколько работ».
- «Без шкафа» appears in every rack filter where such points exist (today the plan and «Протяжки» lists leave it out), so a shared value carries over.
- «Проект» → «⚠ Открытых проблем … — показать» still sets «Точки» to only «⚠ С проблемами». It clears the other filters as today, the shared ones included.
- The two-value filters and the checkboxes work as today.

## Data and external services

None. Filters live in memory only and are not saved to the device or to Firestore. Nothing new for stage 4's PocketBase storage, no Google services, no cost.

## Edge cases

- A ticked value disappears (a rack emptied, a work done on every point, a problem solved): it is dropped from the ticks without a message, as today.
- A shared value missing on this screen (rack FC is not on this drawing): it stays in the set for «Точки», but the plan's window does not show it. If none of the ticked values exists on the drawing, the plan shows no points, with the line «Под фильтры на этом чертеже точек нет» and «✖ Сбросить фильтры» visible.
- The plan is opened to show one point («📍 На чертеже» from the card, or a jump from elsewhere) that the shared filters hide: that point is still drawn with its focus frame. It disappears with the frame (idea 006 rules), and the filters are not changed.
- Nothing matches on a list screen: «Ничего не найдено» as today, with «✖ Сбросить фильтры» just above it.
- Many values (20+ types, 15 racks): the window scrolls, and the button shows the count.
- The same value ticked twice, or «Отметить все» pressed twice: no change.
- No network: nothing changes, since it is all on the device.
- Two works in «Что осталось» where a ticked point waits for only one of them: that point gets only that work (the «Несколько работ» rule).

## Out of scope

- Remembering filters after the app is closed.
- Shared filters for other screens («Что осталось», «Протяжки», the pickers): each keeps its own filters, reset when it opens as today.
- The member filter of «Откат записей» (rollback works per member) and the problem choice in «✔ Решено» (an action, not a filter).
- Filters in the management sheets (Google Sheets).
- The type-group filter of the setup wizard's catalog (`src/app/views/wizard.js`): it filters catalog types, not points.

## Decisions

- Every point filter, not «Откат записей» — owner.
- A button with the chosen values that opens a checkbox window, not chips and not the system list — owner.
- «Сбросить фильтры» clears the filters and the search line, not the ticked points — owner.
- The button shows only when something is active — owner.
- «Что осталось» with several works records them all — owner. It does so through the existing «Несколько работ» form with the points and works pre-ticked — agent, so the owner sees what will be written before saving and no new form is needed.
- Shared filters for «Точки» and «План» while the app is open — owner. Only racks, types and door configurations are shared, cleared on project switch — agent: those are the filters both screens have, and racks differ per project.
- Stage 7, now, before stage 4 — owner.
- One value = **or**, different filters = **and** — agent: the usual meaning of ticks in a filter.
- Two-value filters and checkboxes stay single — agent: ticking both values equals «все».
- Plan modes «Не размеченые» / «Скрытые» exclusive with types — agent: they show marks without points, which cannot mix with point types.
- Ticks apply when the window closes — agent: the window covers the list, and a tap outside should not lose ticks.
- All values ticked counts as off — agent: the button and the reset follow what the owner sees.
- «Без шкафа» in every rack filter that has such points — agent: shared values carry over between screens.
- A point the plan was opened to show is drawn even if filtered out — agent: the owner asked to see it, and the filters are kept.

## Owner check

On the phone, in the current project:
1. «Точки»: tap «Все шкафы», tick two racks, «Готово». The button shows both names and the list has both racks only.
2. Tick three types: the list keeps only those types within those racks. «✖ Сбросить фильтры» is visible.
3. «🗺 План»: the same racks and types are ticked, and only those points show.
4. «✖ Сбросить фильтры» on the plan: all points come back. Back in «Точки» the filters and the search line are empty and the reset button is gone.
5. Plan: tick two lines in «Все этапы» (for example «Осталось: хивут» and «Осталось: шилют»). Points waiting for either one are bright.
6. «🧾 Что осталось»: tick two works and a few points, then «✅ Записать выбранные работы». The «Несколько работ» window opens with them. Save, and both works are in today's report on the right points.
7. «Протяжки», «Добавить работу» → points, placing points into a rack: several types can be ticked, and «Сбросить фильтры» clears them.
8. English and Hebrew: the buttons and windows are translated, and in Hebrew they read right to left.

## Tests

- Matching with sets: racks incl. «Без шкафа»; types with group lines; door configurations incl. «Без запирания» / «Без конфигурации»; problems with «⚠ С проблемами»; the plan's stage filter with several values (any matches); an empty set and an all-ticked set pass every point.
- Exclusive lines: the plan modes against types, «⚠ С проблемами» against single problems.
- The button text: none, one, two, three or more, all ticked; long names.
- Shared filters: a change on one screen is seen on the other; project switch clears them; a value missing on the drawing is kept.
- «Сбросить фильтры»: what is active, what is cleared, defaults of the checkboxes.
- «Что осталось»: the preset handed to «Несколько работ» for two works (points, works, `s:` keys left out).
- The translation coverage test passes with the new strings.

## Open questions for the stage

- How «Несколько работ» records a pull of one cable (`p:<cable>` keys of «Что осталось»): `batchForm` lists catalog works, not cables. Check it and decide in the spec.
- One filter control for all seven screens (a shared module) and where the pure matching logic lives (`src/domain/`, so `node:test` covers it). Decide in the spec.
- Exact Russian, English and Hebrew texts of the buttons, windows and hints, and how many characters fit on the button at 420 px.
- Whether the plan's rack filter should keep FC ticked but greyed in the window when FC is not on this drawing, instead of hiding it. Decide in the spec with the owner's check in mind.
- Other wishes of the owner for stage 7: the description asks.
