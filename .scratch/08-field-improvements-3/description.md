Status: in review

# Stage 8. Field improvements 3 — description

## Goal

Two wishes from field work, filed 2026-11-24, while the NAS is being checked:

- **Idea 008.** Termination in the rack is a separate phase. It is done for the whole rack at once, often long after the points themselves are finished. Today it counts in the plan colour like any other work after the pull, so a point with everything else done stays on the yellow → green gradient instead of turning dark green. On the plan the owner wants to see which points are finished in the field; the rack is tracked elsewhere.
- **Idea 009.** «🗺 План» always opens on the first drawing, fitted to the screen. After closing the plan to record a work, or after the phone closes the app, the owner has to find the drawing again, zoom in and pan back to the same spot.

The owner has no other wishes for this stage (asked 2026-11-24). When the stage is done, «Описание 4» follows if the NAS checks pass.

## What the owner will see at the end

Mockup (rough): `mockups/catalog-work.html`, with three screens: the catalog list, the work's edit window, and the plan colour before and after. Idea 009 adds no screen.

The two idea files hold the full behaviour, edge cases, owner check and tests: `docs/ideas/008-colour-without-rack-works.md`, `docs/ideas/009-plan-remembers-view.md`. This description takes both in as written, **except where the owner's decisions below change them** (marked «changed»).

### 1. Works that do not count in the plan colour (idea 008)

1. «📋 Справочники» → «Каталог работ» → tap a work. The edit window has a new box «Учитывать в цвете точки на плане», after «Тип работы», with the hint from the idea.
2. **Changed (owner's decision 1):** the box is ticked on every work, the rack termination included. No work is unticked by default, and nothing is special about `HIV_DEV`: the owner unticks the rack termination works by hand in each project. (The live name of `HIV_DEV` is «Хивут в шкафа бакары», from the shared pool; «Подключение в шкафу» is its name in the built-in starter set.)
3. Works of type «Протяжка» have no box: the pull always counts.
4. In the catalog list, a work with the box unticked shows « · не в цвете плана» at the end of its second line.
5. On «🗺 План» and in a fresh «PDF с номерами», the colour of a point is computed as in idea 006, but over the point's works without the unticked ones. A point with the pull and every counted work done is dark green with the thick frame. The gradient counts only the counted works. A point whose only done work is an unticked one counts as not started (grey or blue). An open problem or «Неисправна» is still red first.
6. Nothing else changes: the point card, «🧾 Что осталось», the plan filter «Осталось: хивут», «Протяжки», the reports, the management sheets and «Итоги по шкафам» still show the unticked work as not done.
7. Doors: often their only «Хивут» work is the rack termination. With it unticked, a door is dark green once its pull, install, check and shilut are done.
8. The nightly job re-renders, once, each «PDF с номерами» on Drive whose colours changed.

**Changed (owner's decision 2): the box is a setting of the project, not part of the work in the shared pool.**
- The pool does not store or carry `planColour`. Sending a work to the pool leaves the box out. A project work that differs from the pool only by the box is not shown as different, and the pool comparison lists no «В цвете плана» line.
- Taking a work from the pool, or an update of a work from the pool, never changes the box of that work in the project. A work new to the project arrives ticked.
- A colleague's project has its own boxes.

### 2. The plan remembers the drawing, place and zoom (idea 009)

1. The owner opens «🗺 План», picks a drawing, zooms in on a corridor, and closes the plan. The next time the plan opens it shows the same drawing, page, centre and zoom. This holds after a restart of the app or the phone too.
2. Each drawing keeps its own place. Switching drawings in the list opens each one where it was last looked at; a drawing never opened on this phone opens fitted, as today.
3. A jump to a point («📍 На чертеже», «📍» in the drawing hub) and placing a point («📍 Отметить на плане») still win over the remembered place. The new place is then remembered.
4. «⤢ Весь лист» fits the page as today; the fitted view is then remembered.
5. The centre and zoom are restored, not the screen corner, so the same spot stays in the middle after the phone is turned.
6. The app still starts on its usual screen; the plan never opens by itself. Filters, the selection, tools and the focus frame are not remembered.
7. Stored on the phone only (`pz.planView.<projectId>` in the browser's storage), per project, not synced.

## In scope

- Idea 008 as written, with the two changes above: no default, and the box kept out of the pool.
- Idea 009 as written.
- English and Hebrew for the new strings (the box, its hint, the list mark), the in-app guide (a line in «Каталог работ» about the box, a line about the plan remembering its place), and the device key added to the list in `PROJECT_CONTEXT.md`.

## Out of scope

- A default unticked work, or any special rule for `HIV_DEV` (owner's decision 1).
- The box in the shared pool, or a per-point override.
- Management sheets, «Итоги по шкафам», reports, the plan stage filters, the point card: unchanged.
- Legacy points (status by type stages, not by tasks): the box has no effect on them.
- Opening the plan by itself at app start; remembering filters, the selection or tools; syncing the plan view between devices.

## Pulled-in known issues and review wishes

- No open `KNOWN_ISSUES.md` entry fits this stage. KI-3 (tooling), KI-4 (sheets sort), KI-5 and KI-6 (offline races in other areas), KI-7 (stays a per-ticket rule: `tr()` on each part of a built sentence, rule 12) and KI-8 (stage 4) stay where they are.
- Review 7's wishes: the plan refilling «Точки» behind it, and a DOM test of `multifilter.js`, do not fit; the third is for stage 4. Review 6's wishes are done or belong to stage 4.
- For stage 4 (recorded in `docs/project-spec.md`): the storage must carry `planColour` on **project** catalog works. The pool has no such field.

## Decisions taken with the owner

1. **No work is unticked by default** (owner, 2026-11-24): «можешь ничего не снимать по умолчанию, я сделаю это вручную». This replaces the idea's agent decision to untick `HIV_DEV` in new projects and treat it as unticked in old ones. Reason: the owner picks per project, and the special case is gone.
2. **The box is a project setting, not part of the shared work** (owner, 2026-11-24). This answers the idea's open question about the pool. Reason: what counts in the colour is how one project is run; a colleague's project may track the rack differently.
3. **No other wishes for stage 8** (owner, 2026-11-24).
4. **Test mode uses the same key** `pz.planView.<projectId>` (agent; the idea's open question). The test projects have their own ids, so they never touch a real project's view. A test run in the browser pane only writes the pane's own storage.

## Open questions for the spec

- **Keeping the box out of the pool:** `bare()` in `src/domain/typelib.js` is used for the pool hash, the comparison, the bundle and the writes. Decide where `planColour` is removed (`bare()` itself, or a pool-only strip), and that taking a work from the pool writes with merge or carries the project's `planColour` over, so the box is never lost. Check every pool path: `inboxCandidates`, `changedFields`, `fieldChanges`, `changedParts`, the starter set, the point import from the pool (`src/domain/pointsimport.js`), and a new project from the pool.
- **`createProject` from the starter set:** works arrive ticked. Confirm nothing copies the box from another project.
- **Where the tasks of unticked works are dropped** for the colour: one helper in `src/domain/plan.js` used by `planColor`, `markColor`, `progressOf` and `numberedInput`, so the plan, the shared marks and the PDF agree. A point whose only works after the pull are unticked must follow idea 006's pull rules (dark green when pulled, pink with circles when the pull is unfinished).
- **The «Хивут» stage of a composite point** when all its «Хивут» tasks are unticked: the stage leaves the list for the colour (no empty stage that never completes).
- **Plan view (idea 009):** where in `planmodal.js` / `planview.js` the view is read and written (debounce ≈ 0.5 s, on close), the conversion `{ s, ox, oy }` ↔ `{ x, y, s }` at the screen centre, clamping to the viewer's zoom 0.05–20 and to the page, and the order of choice: point > place > remembered last > first.
- **Ticket split:** about 3 tickets. Idea 008's colour rule (domain and tests); idea 008's box, list mark, pool handling and translations; idea 009. Each one can be checked on its own with `?mem=1&memPlan=1`.
