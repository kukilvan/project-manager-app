Status: in review
Complexity: medium
Blocked by: 05, 07

# 08. Plan colours by works, pink for pulled, thinner phone frames, focus frame

A point that is only pulled is pink `#E99AC4` whatever its type; works after the pull move the colour evenly from yellow to green; an unfinished pull shows circles per cable; phone frames ×0.75; the magenta focus frame goes away after an action on the point. Idea 006 (`docs/ideas/006-plan-colours-by-works.md`), added after slicing; it changes what ticket 05 built.

## Spec sections

Idea 006 (all sections; it stands in for a spec section). Replaces the colour rules and the legend of spec §4.1 and §4.3; §4.2 (stage dots) stays dropped — only the pull circles of idea 006 come back. §4.4 (plan filter) is unchanged.

## What to do

1. `src/domain/plan.js`: `planColor` by the rules of idea 006 "Behaviour" — works after the pull (`j`, `M`), pink, the OKLab gradient `#fdd835` → `#2e9e45` at `t = (j − 1) / (M − 1)` (a small pure helper, hex out), dark green and red unchanged; return `pull: { done, total }` when the pull is unfinished. `PLAN_PALETTE` gets `pink` and the two gradient ends instead of `steps`; `PLAN_LEGEND` in the new order with a gradient entry and the circles line. `markColor` ranks by unfinished pull first, then `j / M`.
2. Check that `pullDone` / `pullTotal` count cables (a `6005×3` line is three) for composite and legacy points; if a pull task holds `qty 3` as one task, count by cables for the circles.
3. Plan view (`src/app/views/planmodal.js`): the pull circles under the tag (only with `big`, not on red points, room kept by the tag placement); the legend strip with a CSS gradient for «работы после протяжки»; on a touch device every point frame ×0.75 (tag 2 → 1.5, full ×1.75 on top, mark outline 2 / 1.5 → 1.5 / 1.1); a computer with a mouse unchanged.
4. Focus frame: clear `focusId` when the plan comes back after an action on the focused point started from the plan (card, add work, problem, length, rack, edit) and on a tap on an empty spot; jumps from other screens keep it until then. Selection untouched.
5. «PDF с номерами» (`numberedInput`, both legends): the new colours and legend, no circles; `numberedHash` changes.
6. Strings for the legend (Russian, English, Hebrew); `node scripts/i18n-build.mjs`; the coverage test of ticket 07 passes. The guide line about plan colours (ticket 05, §4.5) updated.
7. `CONTEXT.md` «Progress colour» entry; header comments; `node tools/code-map.mjs`.

## Done when

- In `?mem=1`: pulled-only points of different types have the same pink; one work after the pull gives yellow, all works dark green with the thick frame, the shades between evenly spaced for 2, 4 and 10 works; a partial pull shows circles when zoomed in; red over everything.
- Phone width (touch emulation): frames ×0.75; mouse: unchanged.
- The focus frame disappears after opening the point's card and coming back, and after a tap on an empty spot.
- A generated «PDF с номерами» has the new colours and legend, no circles; two builds of an unchanged project give the same hash.
- `npm test`, `npm run build`, `node tools/code-map.mjs --check` pass.

## Tests to add

The list in idea 006 "Tests": `planColor` cases (pink for different `M`, exact gradient hex for `M` = 2, 4, 10, `M = 1`, partial pull with and without works, all works with the pull unfinished, no pull stage, red, grey / blue, legacy), `markColor` ranking, `numberedInput` colours and hash, `PLAN_LEGEND` order. Ticket 05's tests for the four steps are replaced, not kept.

## Owner check

On the phone, after the site updates:
1. On the plan, FC/C-55 and FC/D-04.2 (only pulled) are the same pink.
2. Add a work to a pulled point: it turns yellow; more works move it to green; the last one — thick dark green.
3. A point with part of its cables pulled: zoom in — pink circles under it, filled for the pulled cables.
4. Frames on the phone are thinner; on the computer as before.
5. Tap a point, open its card, close it — the magenta frame is gone; tap a point, then an empty spot — gone too.
6. The legend under the plan matches; a fresh «PDF с номерами» has the same colours.
