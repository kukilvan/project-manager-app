# Idea 004: Plan colours by the share of works done

Status: planned — stage 6, taken in by its description
Added: 2026-11-17

## Why

On the plan many points that are only half done already have a green frame: the colour follows the furthest work reached (`statusColor` in `src/domain/plan.js` — a checked point is bright green even when shilut or part of the installation is missing), and the greens of «установлено не всё», «установлено» and «проверено» look alike when there are many points. The owner must tell at a glance which points are completely finished, which have one work left (often shilut), and which have only one work done.

## Scenario

1. The owner opens «🗺 План».
2. Finished points have a thick dark-green frame; unfinished ones go from yellow (little done) to green (almost done) in five clearly different steps.
3. Zoomed in, under each unfinished caption there are five small dots, one per work in the order протяжка, хивут, установка, проверка, шилют: filled — done, empty — not done. One empty dot at the end means only shilut is left.
4. To see what a work still waits for, the owner uses the filter by work on the plan (moved from «Что осталось»): e.g. only points still waiting for хивут.

## Behaviour

- Colour by the share of the point's works done (its own works by composition: a point with three works counts in thirds), not by the furthest work.
- Palette (the owner's choice «1. Жёлтый → зелёный», tuned on a real drawing in the description; no orange — orange is too close to the problem red):
  - 1 of 5 — `#fdd835`, 2 of 5 — `#d4e157`, 3 of 5 — `#9ccc65`, 4 of 5 — `#43a047`, all done — `#1b5e20` with a thicker frame (3.5 instead of 2), no dots.
  - Points with fewer works map their share onto the same steps (spec: rounding).
  - Unchanged: grey «новая» and blue «померяно» for points with no work done; red for an open problem (idea 003) or «Неисправна».
- Dots: five dots (or as many as the point's works) under the caption or icon, shown only when zoomed in enough for tags (`big` in `src/app/views/planmodal.js`); filled dark green — done, empty — not done.
- Plan filter by work: the filter «Что осталось» has (by work, rack, type, pull) comes to the plan; points not matching go pale, as other plan filters do.
- Legend of the plan and of «PDF с номерами» updated with the new steps; «PDF с номерами» uses the same colours (and dots if readable at print size — the spec decides).

## What changes in existing behaviour

- `STATUS_COLORS` / `statusColor` (shared by the app and the server's «PDF с номерами»): colour from progress instead of the status word.
- Points that are «Проверена» but missing shilut stop being full green.
- The «PDF с номерами» files change colour: their fingerprint changes, so the nightly job re-renders them once.
- Point statuses themselves (texts, management sheet statuses) do not change — only plan colours.

## Data and external services

- None new: progress comes from the existing composition and journal (`composedInfo` stage stats in `src/domain/compose.js`; legacy points through `pointInfo`).

## Edge cases

- A point type without stages (no works): grey as today.
- Legacy points (not composed): their works are counted from their type's stages.
- A re-check after «Не работает»: red until checked again.
- Many points on one mark (pair, triple): one tag; dots of the mark — the spec decides (e.g. the least finished point's).
- Pale yellow on a white drawing may be hard to see: check on the owner's real drawing in the description and darken slightly if needed (no orange).

## Out of scope

- Purple, blue and other hue families for stages (the owner wants yellow → green).
- Changing the management sheet's row colours (stage 3 decided them).

## Decisions

- Variant B: colour steps + dots for what is done — owner, after two rounds of stands (variants A–H).
- Palette 1, yellow → green without orange — owner.
- Plan filter: move the «Что осталось» filter onto the plan — owner.
- Colour by share of works, not by the furthest work — agent: this is what makes half-done points stop looking finished.

## Owner check

On the plan of «Мегасон»: a checked point without shilut is no longer dark green and shows one empty dot at the end; a fully done point has the thick dark-green frame; the filter «ждёт Шилют» leaves only those points bright; «PDF с номерами» shows the same colours.

## Tests

- Progress colour for: 1..5 of 5, 1..3 of 3, all done, no works, problem / «Неисправна» over progress, legacy point.
- `numberedHash` changes when colours change.

## Open questions for the stage

- Final shades after a look at a real drawing in the browser (mockup with the owner's drawing in the description).
- Dots in «PDF с номерами»: readable at print size or not.
