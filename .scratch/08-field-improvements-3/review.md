Status: accepted

# Stage 8. Field improvements 3 — review

## What was reviewed

- Commits `06e4960..47997ab` (from «Tickets 8: accepted» to «✅ Checked by owner: ticket 8.2»): tickets 01 (works not in the plan colour, idea 008) and 02 (the plan remembers the drawing, place and zoom, idea 009) of `.scratch/08-field-improvements-3/issues/`. The Next step line named `8089c4c^..HEAD`, which holds only ticket 02 and the owner's check of 01; the range above covers both tickets.
- Code: `src/domain/` (`plan.js`, `typelib.js`, `planmemory.js` new, `testplan.js`, `index.js`), `src/app/` (`testplan.js`, `views/settings.js`, `views/poolview.js`, `views/planmodal.js`, `views/planview.js`, `views/guide.js`), `src/i18n/`, the tests `plan`, `domain`, `planmemory` (new), `testplan`; docs: ADR 0018, `CONTEXT.md`, `PROJECT_CONTEXT.md`, `docs/history.md`, the code map.
- Against `.scratch/08-field-improvements-3/spec.md` (§§ 0–8 item by item, including the edge cases of § 5 and the texts of § 3), the tickets, `docs/coding-standards.md` (rules 1–13) and `CONTEXT.md`. Two passes: standards, then spec; plus the code-review skill at effort high on the same range (4 findings, below).

## Tests

- Start: 357/357 pass (Windows, Node 24). `npm run build` passes; `node tools/code-map.mjs --check` exit 0 (140 modules).
- End: 357/357 (one test extended, F4), build and code-map check pass.

## Verified by running

`?mem=1&memPlan=1` at 420 px in the browser pane (`npx vite preview` on the fresh build; the old service worker and caches cleared first), Russian UI:
- **Memory of one drawing.** «🗺 План», «＋» three times → after 0.5 s `pz.planView.<id>` = `{ last: "DR_test", views: { DR_test: { page 0, x 300, y 200, s 2.171 } } }`; closed and opened again → the plan opens zoomed in (FB/D-02 large), the record unchanged.
- **Two drawings.** Switched to «Test drawing 2» → fitted (s 0.643, `last` = `DR_test2`); «－» twice → s 0.286; back to «Test drawing» → its own s 2.171, `last` = `DR_test`.
- **Pan.** A drag on the sheet → the centre stored as x 346.1, y 223 at the same zoom.
- **Placing (after F1).** A card of FC/C-01 (no place) → «📍 Отметить на плане», closed without moving → the remembered view of «Test drawing» is still s 2.171 (before the fix the fitted view replaced it).
- **Resize (D11).** The pane from 420×860 to 700×500 with the plan open, then «＋» and «－» (zoom about the middle) → the stored centre is still x 346.1, y 223: the same spot stayed in the middle.
- No errors in the console.
- **Not verifiable here:** the iPhone (turning the phone, a restart after the phone killed the app — the test project gets a new id on every load), the live catalog and its rack-termination works, the nightly «PDF с номерами» on Drive, the administrator's inbox on real Firestore. Ticket 01 was checked by the owner on the phone; its colours, the box and the pool paths are covered by `tests/plan.test.js` and `tests/domain.test.js`, and this review changed none of them.

## Findings

- **F1** — Opening the plan through «📍 Отметить на плане» wiped the remembered place and zoom of that drawing: the fit of `viewer.start()` fired `onView`, and in the placing case nothing replaced it, so the fitted view was saved 0.5 s later. `planmodal.js`. **Fix now:** `show()` ignores `onView` until it has chosen the view (`settled`); then it queues the chosen view once, and for a plan opened for placing it queues the drawing's old stored entry (so `last` still moves to the drawing). Checked in the browser (above).

- **F2** — A remembered view on page 2 or later could be replaced by page 1 fitted: `restore()` loads the other page, and a render longer than 0.5 s let the timer write the fit of `start()`; if that render failed, the fit stayed stored. `planmodal.js`. **Fix now:** the same `settled` flag as F1 — nothing is saved while `show()` is still choosing the view.

- **F3** — `centre()` treated a viewer measured at 0×0 as measured: it returned the corner as the centre, so the next resize could shift the view by half the screen. `planview.js`. **Fix now:** `centre()` is `null` when the width or height is 0 (the spec's «no size», § 2.3).

- **F4** — `addBundleOps` (a pool type added to a project, through the point import from a file) wrote an item the project had deleted without `deleted: false`; project writes merge, so the item stayed deleted although the function promises to bring it back. Older than stage 8 (ticket 01 only changed the same line to `bare(x)`). `typelib.js`. **Fix now:** the op writes `{ ...bare(x), deleted: false }`, as `takeFromPoolOps` does; the pool-type test checks it.

No fix-round finding and no deferral.

Checked and left as they are:
- `colourInfo` is the only place the box acts; `markColor`, `progressOf` and `numberedInput` reach the colour only through `planColor`; the plan stage filter, `leftTasks`, the card, «Что осталось», the sheets and the reports keep the full task list (D2).
- Every pool path of § 1.5 copies through `bare()`: fingerprints, `changedFields` / `candidateChanges` / `changedParts`, `depsOf`, `bundleFrom`, `inboxCandidates`, `takeFromPoolOps`, `addBundleOps`, the wizard's `refs`, «📥 Заполнить пул из …», and the administrator's accept and edit (`bare(cand.item)`, parts through `bare()`).
- The box is hidden for «Протяжка» and in the pool administrator's forms (`pool: !!formTarget`); `prepare` adds no `planColour` there.
- A plan opened from a card's «📍 На чертеже» saves the point's place as the drawing's view (the focus counts as a move). The spec says this for «Найти точку» and «🚪 Двери»; the owner saw it on ticket 02 and it matches «the plan opens where the owner left it».
- `rememberView` drops entries of drawings no longer in the project on every save; two stacked plan windows read the key before each write (§ 5).
- `testplan.js` stays out of the live bundle (dynamic import in test mode only).

## Wishes for later stages

- The choice of the view in `planModal.show()` (opening point once, placing once, else remembered; then what is queued) is UI code checked only in the browser. If it grows again, move it into `src/domain/planmemory.js` as a pure function with tests.
- Stage 4 must carry `planColour` on project catalog works, never in the pool (already in `docs/project-spec.md` and the Next step line).
