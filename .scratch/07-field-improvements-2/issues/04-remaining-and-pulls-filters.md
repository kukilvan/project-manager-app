Status: accepted
Complexity: medium
Blocked by: 02

# 04. «Что осталось» filters and «Протяжки» steps 1 and 3

The same filter control on «Что осталось» (works, racks, types, door configurations) and the pull screens. The record button keeps today's one-work behaviour; several works are ticket 06.

## Spec sections

§ 2.2 (filters and reset; record button as today), § 2.4, § 1.8 (rows «Что осталось», «Протяжки» step 1 and 3), § 1.4 (works matching), § 8 (strings «Работы: {}», «Этапы: {}» are already in ticket 02’s block; check none is missing).

## What to do

1. `remainingModal` (`src/app/views/…`, find it with `docs/code-map.md`): replace the works, rack, type and door-configuration drop-downs by `multiFilter`. Works: lines `<label> (<n>)`, pulls first as today, prefix «Работы», all-text «Все работы»; a point passes when it still waits for any ticked key (`leftTasks(point)` has a task with that key); the works filter does **not** use covering (D1): ticks stay as they are. Racks (shown when more than one rack value, with «Без шкафа»), types, door configurations: own sets, reset when the window opens (as today). «Протяжка: все» stays a drop-down.
2. The chips of every ticked work get today's outline; the line «Точек: N — фильтр по работе» shows while any work is ticked.
3. Record button: **unchanged** for now — keep today's behaviour for the first ticked work. Make it follow the new set in the least surprising way: with exactly one `w:` / `p:` key ticked it behaves as today; with none or several it is disabled with title «Сначала выберите работу в фильтре». (Ticket 06 replaces this by the table of § 4.1; leave a comment saying so.)
4. Reset button under the filter row (§ 1.8: works, racks, types, door configurations, «Протяжка: …» not «все»).
5. «Протяжки» step 1 (`src/app/views/pullview.js`): types, door configurations (when options exist), racks (with «Без шкафа» now), then «Только не протянутые» as today; own sets, reset when the pull opens; «☑ Все видимые (N)» uses the new matching; reset button under the row (also unticks «Только не протянутые»).
6. Step 3 «Метраж»: types of the chosen points (shown when more than one) as a several-value button; «▶ Следующая» and «Метраж: X из Y» use the set; the message «Все точки этого типа с метражом ✅ Выберите другой тип или сбросьте фильтр» stays; reset button when the set is not empty.
7. Remove the old single-value drop-downs and helpers where nothing else uses them; strings; `node scripts/i18n-build.mjs`; header comments; `node tools/code-map.mjs`.

## Done when

- «Что осталось»: two works ticked → the list shows points waiting for either; the count line and chips are right; one work ticked → «✅ Записать «…» (n)» works as before; none or two → disabled with the title.
- Racks / types / door-configuration buttons narrow the list; reset clears them and the works.
- «Протяжки» step 1: several types and racks at once; «☑ Все видимые» ticks exactly the shown points; step 3: several types, «▶ Следующая» goes through all of them.
- The grep check of ticket 02 no longer lists these screens.
- `npm test`, `npm run build`, `node tools/code-map.mjs --check` pass.

## Tests to add

Works matching through `leftTasks` keys with several ticked keys (any matches, empty passes all), in `tests/filters.test.js` or next to the existing «Что осталось» tests; step-3 «next unmeasured point» with a set of types if that logic is pure (extract it if it is not).

## Owner check

On the phone, after the site updates:
1. «🧾 Что осталось»: «Все работы» → tick two works: points waiting for either show; count line right.
2. Add a rack and a type: the list narrows; «✖ Сбросить фильтры» clears everything.
3. «Протяжки»: pick two types at once and two racks; «Все видимые» ticks them all.
4. «Метраж»: two types at once; «Следующая» walks through both.
