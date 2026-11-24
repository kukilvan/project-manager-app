Status: open
Complexity: medium
Blocked by: —

# 02. The plan remembers the drawing, place and zoom (idea 009)

«🗺 План» opens on the last drawing shown and, for each drawing, at the place and zoom the owner left it, even after the phone killed the app. A point's «📍 На чертеже» and «📍 Отметить на плане» still show their point. Turning the phone keeps the same spot in the middle.

Independent of ticket 01; it comes second only because both touch `src/domain/testplan.js`.

## Spec sections

§ 0 (D8–D12), § 2 (all), § 3 (the «План (чертёж)» guide line), § 4 (device key), § 5 (edge cases of idea 009), § 6 (tests of ticket 2 and the self-check), § 7 (docs of ticket 2), § 8 (owner check 02).

## What to do

1. New pure module `src/domain/planmemory.js` (§ 2.2): `parsePlanMemory`, `viewFor`, `rememberView`, `drawingToOpen`, `centreOf`, `cornerOf`, exactly as specified (validation limits, clamping, rounding to 0.1 and 0.001, order of D9, `centreOf` / `cornerOf` inverse). Export from `src/domain/index.js`; header comment.
2. `src/app/views/planview.js`, `createViewer` (§ 2.3): option `onView()` called after a pan, pinch, wheel, «＋» / «－», `fit` («⤢ Весь лист»), the fit after a page loads and `focus`, not by `draw`; `api.centre()` (`null` while no size or no page); `api.restore({ page, x, y, s })` = `focus(x, y, page, s)` with `s` clamped to 0.05–20; on resize keep the centre point and zoom (take the centre with the old size, set `ox`, `oy` by `cornerOf` after re-measuring), for every caller of `createViewer`. Callers without `onView` behave as today apart from the resize rule.
3. `src/app/views/planmodal.js` (§ 2.4): read `pz.planView.<projectId>`; open the drawing by `drawingToOpen` (placing point's floor match kept as `placeId`); in `show(d)` after `viewer.start()`: first show of the opening point's drawing → `focus(point)` once; else first show of a plan opened for placing → stays fitted; else `viewFor(...)` → `restore`, none → fitted (D10). `onView` keeps `viewer.centre()` as pending and (re)starts a 500 ms timer; the timer, the close of the plan window and `visibilitychange` → `hidden` write it (read the key again, `rememberView(..., current.id, pending, live drawing ids)`, write); the listener is removed on close; every storage read and write inside `try`, errors ignored. «Найти точку» and «🚪 Двери» keep focusing their point. Layers keep `pz.layers.<id>`; nothing else is remembered.
4. `src/domain/testplan.js` (D12): a second drawing **«Test drawing 2»** — the same generated PDF under its own file name, no points — in `?mem=1&memPlan=1`.
5. Guide line of «План (чертёж)» (§ 3) in Russian, English and Hebrew; `node scripts/i18n-build.mjs`. No other new string.
6. Docs (§ 7): header comments of `planmemory.js`, `planview.js`, `planmodal.js`, `testplan.js`; `node tools/code-map.mjs`. `PROJECT_CONTEXT.md` and `CONTEXT.md` already cover the device key and «Plan view memory».
7. Self-check (§ 6, Ticket 2) and the push to `main` as the workflow says.

## Done when

In `?mem=1&memPlan=1` at 420 px, after «Не напоминать»:
- «🗺 План», zoom in on a corner, close, open → the same place and zoom.
- Switch to «Test drawing 2», zoom elsewhere, switch back → the first place; each drawing has its own.
- «⤢ Весь лист», close, open → fitted.
- A point card's «📍 На чертеже» → that point (zoom 2.5 as today); «📍 Отметить на плане» opens fitted.
- Resize the browser pane → the same spot stays in the middle at the same zoom.
- `localStorage['pz.planView.<id>']` holds `last` and both drawings; broken JSON in the key does not break the plan; a project with no drawings still says «Чертежей пока нет» and writes nothing.
- `npm test`, `npm run build`, `node tools/code-map.mjs --check` pass.

## Tests to add

From § 6:
- `tests/planmemory.test.js` (new): `parsePlanMemory` with broken JSON, a non-object, a bad `last`, `s` out of range (0.01, 25, `NaN`), a negative or fractional page → dropped; `viewFor` with a missing entry, a page beyond `pages`, clamping of `x`, `y`; `rememberView` keeps one entry per drawing, sets `last`, drops ids not in `liveIds`, rounds; `drawingToOpen` order (each level wins over the next, ids not in the list skipped, empty list → `null`); `centreOf` / `cornerOf` round trip for 420×700 and 1280×800, and the same centre gives different corners for the two sizes.
- `tests/testplan.test.js`: the second drawing entry.

## Owner check

On the phone, a project with several drawings, after the site updates (idea 009's checks):
1. Open «🗺 План», another drawing, zoom in and move; close and open again → the same drawing, place and zoom.
2. Two drawings keep their own places when you switch between them.
3. Swipe the app away, open it, «🗺 План» → the same drawing and place.
4. A point card's «📍 На чертеже» → that point, as before.
5. Turn the phone while the plan is open → the same spot stays in the middle.
