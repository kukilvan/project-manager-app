Status: in review
Complexity: complex
Blocked by: 02

# 03. Problems on points

A shared list of problems (a name in Russian and Hebrew, point types, ready descriptions) and marks on points: mark and solve in bulk, the «Проблемы» block of the point card, the filter and red line in «Точки», the line on «Проект». Marks live in the project subcollection `problemMarks` (ADR 0017). Idea 003. The sheet column is ticket 04, the plan red is ticket 05.

## Spec sections

§3.1–3.6, §3.8, §3.9 (strings), §8 rows «A problem deleted while open on points», «A ready description fixed later», «A ready description removed», «Problem for door types, selection mixes…», «The same problem marked twice on a point», «Two members mark the same problem offline», «Points merged, the removed one had an open problem», «A point deleted with open problems», «Mass mark on 750 points offline», §9 (`problems.js`, `merge.js`), §10 (the guide lines).

## What to do

1. `src/domain/problems.js` (new, pure): `problemFits`, `openProblemsOf`, `marksOf`, `problemsForPoints`, `markOps`, `solveOps`, `problemLabel`, `problemCounts`, `EXAMPLE_PROBLEMS` (the four of §3.1), plugged into the seeding of `src/app/shared.js` for `pool_problems` (§2.4: only when the collection has no document at all on the server). Language of names as §3.2; own text as written.
2. Data: `problemMarks` in `COLLECTIONS` (listeners, history, rollback, delta reads); `buildContext` builds `ctx.problems` (the pool map from `src/app/shared.js` of ticket 02, deleted included) and `ctx.marksByPoint`. Hebrew names for the Hebrew name translator in `shell.js`. History label «Проблема на точке».
3. `src/domain/merge.js`: the point merge moves open marks to the kept point and solves a duplicate problem with the user's name (§3.2).
4. Reference screen «⚠ Проблемы» (§3.3): rows, «N открыто», the form with type ticks and the descriptions rows (✕ soft-deletes), validation messages, administrator-only delete with its confirmation; the sub line on the reference-list row (the line of ticket 02's §2.5 pattern).
5. Marking (§3.4): «⚠ Проблема» and «✔ Решено» in the selection bars of «Точки», of the plan and of the rack screen; the two forms with their rules (fits every selected point and the hint; the empty-list message; own Hebrew text with the Cyrillic check; one `repo.save`; the selection stays).
6. Point card block (§3.5): open marks red-bordered with «✔ Решено», solved marks grey, the button.
7. «Точки» filter and red line under the label (§3.6); the «Проект» line «⚠ Открытых проблем: M (точек: N) — показать» opening «Точки» with the filter. (Plan and PDF red: ticket 05.)
8. Strings of §3.9; the two guide lines of §3.8; `node scripts/i18n-build.mjs`.
9. Header comments; `node tools/code-map.mjs`.

## Done when

- In `?mem=1`: the four examples exist after the seed; a mixed selection of doors and cameras offers only problems that fit both, with the hint; 5 points marked at once, 2 with own Hebrew; a Cyrillic own text is refused; marking again replaces the open mark; «Решено» closes the chosen problem or all and the point card shows it grey with who and when.
- «Точки» filter and red line, the «Проект» line and its jump work; merging two points moves the open mark.
- A deleted problem or description still shows on its marks and is not offered.
- `npm test`, `npm run build`, `node tools/code-map.mjs --check` pass.

## Tests to add

Spec §9 `problems.js` and `merge.js` lines: `problemFits` (empty types, id, group), `problemsForPoints` on a mixed selection, `markOps` (new, re-mark updates, solved then marked → new), `solveOps` (one problem, all, duplicates closed), `openProblemsOf` dedup, `problemLabel` (ru, he, own text, no description, deleted problem and description), `problemCounts`; merge moves open marks and solves a duplicate; `buildContext` builds `marksByPoint` with the order of §3.2.

## Owner check

On the phone, after the site updates:
1. Ещё → «Выпадающие списки» → «Проблемы»: the four examples (Магнит индикация, Замок, Кабель, Доступ). Add a problem of your own with two ready descriptions and «Для типов точек» ticked for one type.
2. «Точки»: select 5 doors → «⚠ Проблема» → «Магнит индикация», description «Не просверлены двери» → save. Toast «Проблема отмечена. Точек: 5».
3. Select 2 of them again → «⚠ Проблема» → the same problem, «✍️ Своё описание», type Hebrew text (a Russian letter must be refused).
4. The 5 points have a red line «⚠ Магнит индикация» in the list; the filter «⚠ С проблемами (5)» shows exactly them; on «Проект» the red line «⚠ Открытых проблем: …» jumps to the filtered list.
5. Open one point: block «Проблемы» with the red mark, who and when; tap «✔ Решено» — it turns grey with «решено: …».
6. Select 3 points → «✔ Решено» → «Все открытые» → toast «Решено. Отметок: 3».
7. Mixed selection of a door and a camera: «Магнит индикация» is not offered, the hint is shown.
Wrong looks like: a problem that does not fit still offered, a solved mark vanishing from the card, the counts not matching.
