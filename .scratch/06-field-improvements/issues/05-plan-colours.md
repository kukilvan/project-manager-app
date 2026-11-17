Status: accepted
Complexity: complex
Blocked by: 03

# 05. Plan colours by progress

The colour of a point on the plan and in «PDF с номерами» shows how many of its stages are done (yellow → green, dark thick green when finished, blue measured, grey new, red problem or «Неисправна»), with stage dots under the tag and a new «Осталось» filter. Idea 004.

## Spec sections

§4 (all), §8 rows «A composite point whose type has no works», «A checked point without shilut», «Re-check after «Не работает»», «A pair on one mark…», «A legacy point type without `stages`», §9 (`plan.js`), §10 (guide line of §4.5).

## What to do

1. `src/domain/plan.js`: `planColor(point, ctx)` → `{ color, done, full, width }` by the rules and the table of §4.1 (palette «Жёлтые чуть темнее»), stages of composite and legacy points, the shared-mark rule; `PLAN_LEGEND` replaces `STATUS_COLORS` for the plan and both PDF legends. `statusColor` stays for its other users (check them: sheet, racks).
2. Plan view: the colour, the frame width ×1.75 for a full point, the stage dots of §4.2 (only with `big`, only started and unfinished and not red; the tag placement keeps room), the new legend line of §4.3.
3. `src/domain/remaining.js` (new): `leftTasks(point, ctx, info)` moved from `views/points.js` (`leftTasksOf`); «Что осталось» and the point card use it from there; behaviour unchanged.
4. Plan filter (§4.4): groups «Осталось» (with the new «Осталось: шилют»), «Работа» (works with N > 0), «Проблемы» (only when the drawing has open problems, from ticket 03); points not matching go pale.
5. «PDF с номерами»: `numberedInput` takes `planColor` and the thicker frame for a full point, the two legends of §4.3 (Russian first line and Hebrew), no dots; `numberedHash` changes with the colours. The nightly job renders them once more; it already reads `problemMarks` (ticket 04) — check that `scripts/` builds the context with the marks so red is right.
6. Strings of §4.6; the guide line of §4.5; `node scripts/i18n-build.mjs`.
7. Header comments; `node tools/code-map.mjs`.

## Done when

- In `?mem=1` on a project with points at every stage: colours and thick frame match the table of §4.1; dots appear when zoomed in; a pair mark follows the least finished point; a point with a problem or «Неисправна» is red over any progress.
- The plan filter offers the three groups with counts and pales the rest.
- A generated «PDF с номерами» has the new colours and legend; two builds of an unchanged project give the same hash.
- `npm test`, `npm run build`, `node tools/code-map.mjs --check` pass.

## Tests to add

Spec §9 `plan.js` line: `planColor` for 1–4 of 5, 1–3 of 4, 1–2 of 3, 1 of 2, all done (full, width), none (grey and blue by the length), part of the cables pulled (step 1), open problem and «Неисправна» over any progress, a legacy point by the type's stages, a type without `stages`, the palette hex values; `numberedInput` colours; `numberedHash` changes with the new colours; the shared-mark rule. `leftTasks` gives the same result as the old function on the existing fixtures.

## Owner check

On the phone, after the site updates (a project with real work is best):
1. Open a plan: new points grey, measured blue, started ones yellow to green, a finished point dark green with a thick frame, a point with an open problem red.
2. Zoom in: small circles under the tag — filled for a done stage, empty for not done, in the order протяжка, хивут, установка, проверка, шилют.
3. The legend line explains the colours and the circles.
4. The filter: «Осталось: шилют», a concrete work from the group «Работа» with a number, «⚠ С проблемами (N)» — matching points stay bright, the others go pale.
5. «PDF с номерами» for a drawing: the colours and the legend. (The nightly job re-renders them; or refresh by hand.)
Wrong looks like: a finished point not dark green, circles on a grey point, the counts in the filter not matching the list in «Что осталось».
