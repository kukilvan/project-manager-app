# Idea 008: Works that do not count in the plan colour (rack termination)

Status: taken in — `.scratch/08-field-improvements-3/description.md`
Added: 2026-11-24

The description changed two things (owner, 2026-11-24): no work is unticked by default (no `HIV_DEV` rule), and the box is a project setting kept out of the shared pool.

## Why

Termination in the rack («хивут в шкафу», for both cat7 and 6005 cables) is always a separate phase, done for the whole rack at once, often long after the points themselves are finished. The owner records it as a work, but today it is one of the works after the pull (idea 006), so a point whose pull, keystone, install, check and shilut are all done stays on the gradient instead of turning dark green until the rack is terminated. On the plan the owner wants to see which points are finished in the field; the rack is tracked elsewhere.

## Scenario

1. The owner opens «📋 Справочники» → «Каталог работ» and taps «Подключение в шкафу» (or the project's own «Хивут в шкафу»).
2. In the edit window there is a checkbox «Учитывать в цвете точки на плане». For «Подключение в шкафу» it is already unticked; for every other work it is ticked. The owner unticks it for any other work they want ignored (for example their own rack-termination work) and presses «Сохранить».
3. On site the owner records works as before, the rack termination included; nothing changes in the report.
4. On «🗺 План» a point with the pull and every work except the rack termination done is dark green with the thick frame, the same as a fully finished point.
5. The gradient yellow → green counts only the ticked works: a point with 3 ticked works after the pull and 1 done is at the first step of 3, whatever the state of the rack termination.
6. A fresh «PDF с номерами» shows the same colours.
7. The point card, «🧾 Что осталось», the plan filter «Осталось: хивут» and the management sheets still show the rack termination as not done.

## Behaviour

- New checkbox in the work's edit window («Каталог работ», `src/app/views/settings.js`), after «Тип работы»: «Учитывать в цвете точки на плане», hint: «Снимите для работ, которые делаются отдельным этапом (например, подключение в шкафу): точка станет зелёной без них. В отчёте и таблицах работа остаётся.» English and Hebrew strings through `node scripts/i18n-build.mjs`.
- In the catalog list a work with the box unticked shows a short mark in its line, for example «· не в цвете плана».
- Colour of a point (`planColor`, `markColor` in `src/domain/plan.js`): every rule of idea 006 stays, computed over the point's tasks without the tasks of unticked works:
  - composite points: the tasks of unticked works are removed before the stages, `started`, `k / n` and `j / M` are counted;
  - a point all of whose works after the pull are unticked: pull done → dark green; pull unfinished → pink with circles;
  - an unticked work done before anything else (rack terminated, nothing pulled): the point counts as not started — grey or blue by the length;
  - the pull always counts (the box is not offered for works of type «Протяжка»: a work of that type ignores the field).
- Red (open problem, «Неисправна») is unchanged and still comes first.
- «PDF с номерами» (`numberedInput`) uses the same colours; its hash changes with the colours, so the nightly job re-renders the files whose colours changed.
- Legend under the plan: unchanged.

## What changes in existing behaviour

- A point with only unticked works left is dark green on the plan and in «PDF с номерами» instead of a gradient shade.
- The gradient step count of a point is smaller by its unticked works.
- Everything else that counts works (the point card, «Что осталось», plan stage filters, «Протяжки», management sheets and «Итоги по шкафам», reports) is unchanged.

## Data and external services

- One new optional field on catalog works: `planColour: false` when the box is unticked; absent means counted. The field travels with the work to and from the shared pool (catalog is a pool kind, `src/domain/pool.js`) and must be carried by stage 4's PocketBase storage.
- Default: the seed work «Подключение в шкафу» (`HIV_DEV`) gets `planColour: false` in new projects; in existing projects a work with id `HIV_DEV` and no field counts as unticked. Every other existing work counts until the owner unticks it.
- «PDF с номерами» on Drive: re-rendered by the nightly job only where colours changed.

## Edge cases

- No work unticked: colours exactly as today.
- Several unticked works on one point (rack termination of two cables): all ignored.
- A shared mark (pair, triple): each point's colour is computed with the rule, then the least finished point gives the mark colour (unchanged rule).
- Legacy points (status by type stages, not by tasks): the colour stays by stages; the box has no effect on them.
- The owner ticks the box again: the work counts again at once; no data is lost.
- Pool: a project work that differs from the pool only by `planColour` is shown as different by the pool comparison like any other field; the description decides whether that is wanted.

## Out of scope

- Management sheets, «Итоги по шкафам», reports and their percentages.
- The plan stage filters («Осталось: хивут» still lists points whose rack termination is open).
- Per-point or per-project overrides of the box (it belongs to the work).
- Legacy points without tasks.

## Decisions

- A checkbox on the work in «Каталог работ», not a fixed rule for rack termination — owner (the owner preferred choosing, if not hard; it is a small field).
- Only the plan colour and «PDF с номерами» — owner; sheets keep showing the rack so management sees it.
- «Подключение в шкафу» (`HIV_DEV`) unticked by default, others ticked — agent, so the owner's main case works with no setup.
- Field name `planColour`, absent = counted — agent: old works and the pool need no migration.
- The pull always counts — agent: idea 006's pink and circles depend on it.

## Owner check

On the phone, in the current project:
1. «Каталог работ» → «Подключение в шкафу»: the box «Учитывать в цвете точки на плане» is unticked; another work: ticked.
2. A point with everything done except the rack termination is dark green on the plan.
3. Untick the box on the project's own rack-termination work (if there is one): its points turn green the same way; tick it back — they return to the gradient.
4. The point card and «Что осталось» still show the rack termination as not done.
5. A fresh «PDF с номерами» has the same colours as the plan.

## Tests

- `planColor`: all works done except an unticked one → dark green, `full`; gradient `j / M` without the unticked works; only unticked works after the pull → dark green when pulled, pink with circles when the pull is unfinished; an unticked work done alone → not started (grey / blue); `HIV_DEV` without the field counts as unticked; a «Протяжка» work with `planColour: false` still counts; legacy point unchanged; red first.
- `markColor` with an unticked work on one point of a pair.
- `numberedInput` colours follow; `numberedHash` changes only when colours change.
- Catalog form: the box saves `planColour: false` and removes the field when ticked again.

## Open questions for the stage

- The exact name of the project's own rack-termination works in the owner's live catalog (the description checks the catalog and asks which to untick).
- Whether the pool comparison should ignore `planColour` (a per-project preference) or treat it as part of the work.
