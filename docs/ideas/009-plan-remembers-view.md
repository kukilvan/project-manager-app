# Idea 009: The plan remembers the drawing, place and zoom

Status: taken in — `.scratch/08-field-improvements-3/description.md`
Added: 2026-11-24

## Why

Every time «🗺 План» is opened, the app shows the first drawing of the project fitted to the screen (`draw()` in `src/app/views/planmodal.js` falls back to `list[0]`, `createViewer` starts with `fit()`). The owner works on one area of one drawing for hours; after closing the plan to record a work, or after the phone kills the app, they have to find the drawing in the list, zoom in and pan back to the same spot. While the app stays alive in the background with the plan open it looks right, because nothing was closed; any real close loses it.

## Scenario

1. The owner opens «🗺 План», picks drawing «Этаж 2», zooms in on the north corridor.
2. They close the plan (or go to «Точки», record a work, or the phone kills the app overnight).
3. They open the app the next morning: it starts on its usual screen, as today.
4. They press «🗺 План»: drawing «Этаж 2» opens, the same page, centred on the north corridor at the same zoom.
5. They switch to «Этаж 1» in the drawing list: it opens where they last looked at «Этаж 1» (or fitted, if never opened on this phone). Back to «Этаж 2»: the north corridor again.
6. From a point card they press «📍 На чертеже»: the plan opens on that point as today; after that the plan remembers this place.

## Behaviour

- Remembered per device and per project, for each drawing: the page, the drawing point at the centre of the screen and the zoom; plus the last drawing opened.
- Saved in the device's `localStorage` under `pz.planView.<projectId>`: `{ last: <drawingId>, views: { <drawingId>: { page, x, y, s } } }`. Written after each pan, zoom, page change or drawing change (debounced, about 0.5 s after the movement stops) and when the plan closes.
- Opening «🗺 План» with no point: the last drawing; its remembered page, centre and zoom. Nothing remembered (new phone, new project): the first drawing fitted, as today.
- Opening with a point («📍 На чертеже», «📍» in the drawing hub) or for placing («📍 Отметить на плане»): the point or floor wins, as today; the new place is then remembered.
- Switching drawings in the list: each drawing opens at its own remembered view, else fitted.
- «⤢ Весь лист» still fits the page; the fitted view is then remembered.
- The centre and zoom are restored, not the screen corner: on a screen of another size or after the phone is turned, the same spot is in the middle.
- The app's start screen does not change; the plan is not opened by itself.
- Filters, the selection, tools and the focus frame are not remembered (filters keep idea 007's in-memory sharing).

## What changes in existing behaviour

- «🗺 План» opens on the last drawing and place instead of the first drawing fitted.
- Switching back to a drawing returns to its place instead of fitting it.

## Data and external services

- One new device key `pz.planView.<projectId>` (add to the list of device keys in `PROJECT_CONTEXT.md`). Not synced: nothing in Firestore or on Drive, no effect on stage 4's storage.
- Size: a few numbers per drawing.

## Edge cases

- The remembered drawing was deleted or the project has no drawings: the first drawing fitted, or the «Чертежей пока нет» message as today; stale entries are dropped on the next save.
- A drawing replaced with a new file (same drawing id): the view is kept if the page exists, clamped to the page; otherwise fitted.
- The remembered page no longer exists (fewer pages): page 1 fitted.
- Absurd stored values (zoom outside the viewer's 0.05–20, broken JSON, storage blocked): ignored, fitted as today; the app never fails on this key.
- Test mode `?mem=1`: works the same way (the test drawing has a fixed id).
- Another project: its own key; switching projects never mixes views.
- Another user on the same phone (shared device): views follow the project, not the user; acceptable.

## Out of scope

- Opening the plan by itself at app start.
- Remembering filters, selection, tools or layer settings (layers already have `pz.layers.<id>`).
- Syncing the view between devices.

## Decisions

- After a restart the app starts as usual; the plan remembers its drawing and place when opened — owner.
- Each drawing keeps its own place — owner.
- Stored on the device in `localStorage`, per project — agent: offline-first, nothing to sync, same pattern as `pz.layers.<id>`.
- A jump to a point wins over the remembered place — agent: the owner asked to see that point.
- Restore the centre and zoom rather than the corner — agent: survives rotation and window size changes.

## Owner check

On the phone, in the current project with several drawings:
1. Open «🗺 План», pick a drawing other than the first, zoom in somewhere. Close the plan, open it: same drawing, same place.
2. Switch to another drawing, zoom elsewhere, switch back: the first place again.
3. Close the app completely (swipe it away), open it, press «🗺 План»: same drawing and place.
4. From a point card «📍 На чертеже»: the plan shows that point.
5. Turn the phone: the same spot stays in the middle.

## Tests

- A pure helper (domain module) for the stored record: read with broken JSON / missing / out-of-range values → null; write keeps one entry per drawing and drops deleted drawings; choosing the drawing to open (point > placeFor > remembered last > first).
- Converting a view `{ s, ox, oy }` to `{ x, y, s }` at the screen centre and back, for two screen sizes.

## Open questions for the stage

- Whether `?mem=1` should use a separate key prefix so test runs do not overwrite the real project's view (different project ids make it unlikely; the description decides).
