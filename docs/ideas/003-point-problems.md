# Idea 003: Problems on points

Status: planned — stage 6, taken in by its description
Added: 2026-11-17

## Why

«Причина задержки» says in general why a point is not done. The owner needs concrete problems: «these 5 doors have a problem with Магнит индикация — the doors are not drilled». Points with an open problem must stand out: red on the plan and in the management sheet, and easy to find in the points list.

## Scenario

1. Once: Ещё → Справочники → «Проблемы». The owner adds a problem («Магнит индикация», Hebrew name) and its ready descriptions («Не просверлены двери» + Hebrew). The list is shared by all projects (idea 002). A few examples come with the app; the owner may delete them.
2. On site: selects 5 doors (in «Точки», on the plan or in a rack) → the mass action «⚠ Проблема» → picks «Магнит индикация» → picks the ready description «Не просверлены двери» or types their own text in Hebrew → «Сохранить».
3. The 5 doors turn red on the plan; the filter «С проблемами» (and by a concrete problem) shows them in «Точки» and on the plan.
4. Next night the management sheet has the problem and its description in Hebrew in the column «בעיה»; the rows are red.
5. The doors get drilled: the owner selects them → «Решено». They lose the red; the point card keeps the problem in its history with who and when solved it.

## Behaviour

- Reference list «Проблемы»: each problem has a name in Russian and Hebrew and a list of ready descriptions, each in Russian and Hebrew. Add, edit, delete like other reference lists; deletion by the pool administrator only.
- Example problems (for the check, deletable), Hebrew to be confirmed in the spec: «Магнит индикация» → «Не просверлены двери»; «Замок» → «Нет питания на замке»; «Кабель» → «Кабель повреждён», «Кабель не дотянут»; «Доступ» → «Нет доступа в помещение».
- Marking: one point (point card, button «⚠ Проблема») or many (mass actions in «Точки», on the plan, in a rack). The form: problem (list) → description: a ready one (list of that problem) or own text. Own text is Hebrew only; the field says «Только иврит — так попадёт в таблицу для руководства».
- A point may have several open problems. Marking the same problem twice on a point: the description is replaced, not duplicated.
- Point card: a block «Проблемы» — open ones on top (problem, description, who and when), each with «Решено»; solved ones below in grey with who and when solved.
- «Решено»: one problem on one point, or mass — on selected points, a chosen problem (or all their problems).
- Plan and «PDF с номерами»: a point with an open problem is red (the same red as «Неисправна»), whatever its progress.
- Filters «С проблемами» and «Проблема: <name>» in «Точки» and on the plan; the points list shows a red mark with the problem's name.
- Management sheet: a new profile column «Проблема» / «בעיה»: «<problem>: <description>» in Hebrew, several separated by line breaks; a point row with an open problem is red; the legend gets a line «Есть проблема» / «יש בעיה». Solved problems are not shown.
- In the app's Russian UI the ready description shows in Russian; own text shows as written (Hebrew).

## What changes in existing behaviour

- «Причина задержки» stays as it is and does not make a point red.
- Plan colour: open problem → red overrides the progress colour (idea 004).
- Management sheet: a new optional column, a new row colour and legend line — `STYLE_V` +1 so existing files refresh.
- The daily report does not change.

## Data and external services

- The problems reference list in the shared pool (idea 002 mechanism).
- On points: a list of problem marks — problem id, description (ready description id or own Hebrew text), who and when marked, who and when solved. Exact shape in the spec (on the point document or a separate collection — whichever keeps mass marks cheap on ~750 points and history readable).
- Firestore rules for the new collection(s); the open-rules derivation follows; the starter pool carries the examples; stage 4 (PocketBase) must carry the new data — noted for its spec.
- Management sheets: the nightly server job builds the new column and colour too (`scripts/server-tables-lib.mjs` shares `src/domain/report.js`).

## Edge cases

- A problem deleted from the reference list while points still have it open: the point keeps showing its name and description; it can't be chosen for new marks.
- A ready description edited later: open marks show the new text (they refer to it) — or keep the old one; the spec decides (suggestion: refer, so a typo fix reaches the sheet).
- Own text empty: not allowed — a ready description or own text is required? Or a problem without description is fine? The spec decides (suggestion: description optional).
- Mass mark on hundreds of points: one batch, within the write limits; offline it waits and syncs.
- A point with a problem and «Неисправна» at once: red either way; the sheet shows both columns.
- A solved problem marked again later: a new open mark; the old one stays in history.

## Out of scope

- Problems in the daily report (owner: no).
- Photos on problems.
- Problems limited to certain point types (possible later; noted as an open question).
- Automatic translation of own text.

## Decisions

- Reference list: problem + ready descriptions, both Russian and Hebrew — owner.
- Several problems per point, «Решено» keeps history — owner.
- Red on the plan as a whole + filter with a concrete problem — owner.
- Management sheet: column + red row + legend line; solved not shown — owner.
- Own description: Hebrew only, with a hint in the field — owner.
- Not in the daily report — owner.
- Delay reasons stay separate — owner.
- Shared through the same pool mechanism as delay reasons (idea 002) — owner chose one list for both.

## Owner check

Add a problem with two ready descriptions; mark 5 doors from the plan with a ready description and 2 more with own Hebrew text; see them red on the plan and in «Точки» with the filter; refresh the management sheet — column «בעיה» and red rows; solve 3 — they lose the red and the card shows who and when solved.

## Tests

- `src/domain`: open problems of a point, marking twice, solving, mass operations (built write ops), the Hebrew cell text for the sheet, row colour and legend.
- Plan colour: an open problem gives red over any progress.
- Firestore rules for the new collection(s).

## Open questions for the stage

- Hebrew of the example problems and descriptions.
- Should a problem be offered only for some point types (e.g. «Магнит индикация» for doors)?
- Description required or optional.
- Should a project see a count of open problems on «Проект» (e.g. next to the readiness bars)?
