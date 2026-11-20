Status: in review

# Stage 7. Field improvements 2 — description

## Goal

On site the owner often needs several values of one filter at once: two racks and three point types, two works still to do. Today every point filter is a drop-down with one value, so they go through the values one by one, pick «Все …» again in each drop-down to clear them, and pick the same filters again on the plan. Idea 007 (filed 2026-11-20) fixes this across the app. The owner added two smaller things to the stage while it was being described:

- the English UI shows Russian names for built-in catalog items («Камера», «Замок»). That is KI-7, the catalog part;
- a test drawing in test mode, so every plan change can be checked on screen without building a PDF by hand. This is the review-6 wish.

The stage runs now, before stage 4, while the NAS is being checked. When it is done, «Описание 4» follows if the NAS checks pass.

## What the owner will see at the end

Mockup (rough, made-up labels): `mockups/filters.html`, with nine screens. Idea 007 (`docs/ideas/007-multi-choice-filters.md`) holds the full behaviour: the table of screens, the special lines, the edge cases and the owner check. This description takes all of it in as written. Below are the scenarios, plus what the description adds or decides.

### 1. Several values in every point filter (idea 007)

1. Every point filter is now a button: «Точки», «Что осталось», «План», «Протяжки» steps 1 and 3, the points picker of «Добавить работу» / «Несколько работ», choosing a point for a plan mark, and placing points into a rack panel. The filters with two values stay drop-downs and checkboxes: «План: все / Нет на плане / На плане», «Протяжка: все / …», «Только не протянутые», «только без места на чертеже».
2. A tap on the button opens a window titled with the filter's name («Шкафы», «Типы», «Конфигурации дверей», «Работы», «Этапы», «Проблемы»). It has one checkbox line per value with its point count, and «Отметить все», «Снять все», «Готово». The ticks apply when the window closes («Готово», a tap outside, back).
3. The button shows «Все …» when nothing is ticked or everything is ticked. With one or two values it shows their names («Шкафы: FA, FC»), with three or more the count («Типы: 3»).
4. Values of one filter add up (FA **or** FC), and different filters narrow each other (racks **and** types). On the plan the stage filter keeps dimming: a point is bright when it waits for any ticked stage.
5. Special lines: the type group line «▸ Все: Дверь (типов: N)» ticks the whole group. «⚠ С проблемами» is exclusive with single problems. The plan modes «❔ Не размеченые» / «🙈 Скрытые» are exclusive with types and with each other.
6. «Без шкафа» appears in every rack filter where such points exist.

### 2. «✖ Сбросить фильтры» (idea 007)

Under the filters of each of these screens, shown only while something is active: a filter, a checkbox away from its default, or search text. It clears that screen's filters and search line and puts checkboxes back to their defaults. Points ticked for an action stay ticked.

### 3. Shared filters of «Точки» and «План» (idea 007)

The rack, type and door-configuration filters are one set for both screens while the app is open, per project. The plan opens with what was chosen in «Точки», and the other way round. A reset on either screen clears both. Switching to another project clears them. If none of the ticked values is on the current drawing, the plan shows «Под фильтры на этом чертеже точек нет» with the reset button. A point the plan was opened to show (from the card, or a jump from elsewhere) is drawn with its focus frame even if the filters hide it.

### 4. «Что осталось» records several works (idea 007)

With two or more works ticked, the button reads «✅ Записать выбранные работы (N)». It opens «Несколько работ» with the ticked points and works already ticked, and the owner checks them and presses «Сохранить всё». Each work becomes its own entry in today's report and goes only on the points that still wait for it. One work works as today. No work ticked: the button is disabled with «Сначала выберите работу в фильтре».

**Pulls by cable (owner's decision 1):** the works filter of «Что осталось» lists the pull per cable («Протяжка cat7», «Протяжка 6005»). If only «Протяжка cat7» is ticked, only cat7 is recorded as pulled. The point's other cables stay «осталось». Today «Несколько работ» pulls every cable not yet pulled, so it learns to limit the pull to the ticked cables when it comes from «Что осталось». Opened from a day, it works as today.

**No day yet today:** if today has no day, it is created on «Сохранить всё», as «Добавить работу» already does. A day off today blocks recording, with the same message as today.

### 5. English names for catalog items (KI-7, owner's decision 3)

1. The English UI shows English names for the built-in catalog items: point types, works, devices, cables, door configurations, the example problems, rack colours and type groups («Camera», «Door — lock», «Lock», «Access», «default (green)»). Today these show in Russian.
2. Catalog items the owner or a colleague added themselves show their own English name when one is filled in. The reference-list editors get an optional field «Название (English)». Without it the Russian name shows, as today.
3. Existing databases need no migration step. An item with no English name of its own that matches a built-in item by its Russian name shows the built-in English name.
4. Russian and Hebrew screens, the daily report, the month report and the management sheets do not change. Those use the Russian and Hebrew names as before.

KI-7's other part, sentences built from parts that the coverage test cannot see, stays open. Each ticket keeps applying `tr()` per part (rule 12).

### 6. Test drawing in test mode (review-6 wish, owner's decision 2)

For sessions and the owner's checks on the PC only. `?mem=1&memPlan=1` opens test mode with a small ready drawing and points on it at every stage (new, measured, pulled, partly pulled, with works after the pull, finished, with a problem) in two or three racks and several types. Each plan ticket of this stage and later ones can then walk the plan on screen. The live site and real data are not affected: the drawing exists only in memory, in test mode.

## In scope

- Idea 007 in full, as written in its file, plus the pull-by-cable and no-day rules above.
- English names of catalog items (KI-7, catalog part), the optional English name field in the reference-list editors, the built-in English names in the starter pool and the seed.
- The test drawing `&memPlan=1`, built first so the plan tickets use it.
- New UI strings in English and Hebrew in the same tickets (rule 12). Lines in the in-app guide (`src/app/views/guide.js`) on several values, «Сбросить фильтры», the shared filters, recording several works, English names.

## Out of scope

- Everything idea 007 lists as out of scope: remembering filters after the app closes, shared filters for other screens, the member filter of «Откат записей», «✔ Решено», the management sheets' filters, the wizard catalog filter.
- KI-7's sentences built from parts (the test stays literal-based).
- English in the daily report, month report, «PDF с номерами» and management sheets: their languages are Russian and Hebrew.
- Translating names users typed in other places (project names, notes, problem descriptions).

## Pulled-in known issues and review wishes

- **KI-7** (catalog part): taken in, section 5. The entry's status changes to «fixed (catalog names)» when the stage is done, and the part about sentences built from parts stays open.
- **Review 6, «A test drawing for `?mem=1`»**: taken in, section 6.
- Not pulled in: KI-3 (tools), KI-4 (management sheets), KI-5 and KI-6 (offline races, rare), KI-8 (stays a quick fix when a colleague with their own database starts, and stage 4 handles the rules).

## Decisions taken with the owner

1. **Pulls by cable from «Что осталось» record only the ticked cables**, not every cable not yet pulled. Why: the owner ticks what was actually pulled today.
2. **The test drawing is part of stage 7.** Why: the stage changes the plan, and the last stage built a PDF by hand in three sessions.
3. **English names for catalog items are part of stage 7.** Why: the stage adds new filter windows full of catalog names, and in English they would show in Russian.
4. From idea 007 (owner, 2026-11-20): every point filter except «Откат записей»; a button that opens a checkbox window; the reset clears filters and search, not the selection, and shows only when something is active; «Что осталось» records several works; filters shared by «Точки» and «План» while the app is open; stage 7 now, before stage 4.
5. Agent's choices recorded in idea 007 («Decisions») stand: or/and logic, two-value filters stay single, exclusive special lines, ticks apply on close, all ticked = off, «Без шкафа» everywhere, the plan's focus point drawn through filters, only racks, types and door configurations are shared and cleared on project switch.
6. **English names fall back by the Russian name of a built-in item** (agent). Why: existing databases get English without a data migration, and the owner's own items keep working.

## Facts found while describing

- `remainingModal` (`src/app/views/points.js`) builds its works filter from the open tasks of each point. Pulls are keys `p:<cable>`, catalog works `w:<id>`, and stage-only legacy keys `s:…` cannot be recorded. Its record button opens the one-work form (`addWorkForPoints` → `entryForm`) with a preset.
- `batchForm` (`src/app/views/doh.js`) takes an existing `day`. For a pull it splits the points by cable with `pullGroups` and records every cable not yet pulled. It has no preset today.
- `addWorkForPoints` creates today's day on saving (`_new`). `batchForm` saves entries with `day.id` directly and does not create the day, so the spec must cover it.
- Filters are plain `<select>` elements built inline in each view, and there is no shared filter control yet. `typeMatch` / `cfgMatch` exist for single values.
- `openModal` stacks windows (each is appended to the root), so a filter window can open over «Что осталось».
- Catalog items carry `name` and `nameHe`, and point types use their Russian `id` as the name, with `nameHe`. There is no English field anywhere.

## Open questions for the spec

- From idea 007: one filter control for all seven screens and where the pure matching logic lives (`src/domain/`, covered by `node:test`). The exact Russian, English and Hebrew texts and how much fits on a button at 420 px. Whether a shared value missing on this drawing shows greyed in the plan's window or is hidden.
- How «Несколько работ» takes a preset (points, works, cables), and the day-creation path when today has no day yet. Check that a pull limited to the ticked cables writes the same entries as «Протяжка» of one cable in `entryForm`.
- What back does on iPhone with a filter window over another window: close only the top one.
- English names: the field name (`nameEn`), which editors get it (types, works, devices, cables, door configurations, problems), the built-in dictionary by Russian name (seed, starter pool, `problems.js`, colours in `rack.js`, type groups), and whether the coverage test checks that every built-in item has an English name. `nameEn` is a new optional field in the shared pool, so `docs/project-spec.md` stage 4 lists it among the data PocketBase must hold.
- The test drawing: the PDF built in code (no binary file in the repo) or a small vector file in `tests/`. The point set, so that every plan colour, a pull circle, a problem and «Без шкафа» appear. How the flag is documented in `docs/workflow.md` (test mode).
- Ticket order: test drawing first, then the filter control and matching logic, then the screens (list screens, plan with shared filters, pickers), then «Что осталось» → «Несколько работ», then English names, then the guide. About 7 sessions as estimated, possibly 8 with the two additions.
