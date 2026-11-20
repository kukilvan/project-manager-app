Status: accepted
Complexity: complex
Blocked by: 02

# 03. Plan: shared filters, stages, modes, missing values, empty line, focus point

The plan joins the shared filters of «Точки» and gets several-value stages; a ticked value that is not on the drawing stays visible; the point in focus is never hidden by filters.

## Spec sections

§ 0 (D2, D7, D8), § 2.3, § 3 (plan side), § 1.3 (plan modes), § 1.5 (the plan never drops a shared value), § 1.8 (row «План»), § 7 (rows on the plan), § 8 (strings of D2 and the empty line, guide line 3).

## What to do

1. `planModal` (`src/app/views/planmodal.js`): filter row = «Найти точку или порт U38-05» (unchanged), types (group lines and the two modes), door configurations (when options exist), racks (when the drawing has racks or «Без шкафа» points), stages — all `multiFilter` buttons. Reset button under the row.
2. Racks: values of this drawing's points, «Без шкафа» included now; counts are points of this drawing. Types, racks, door configurations are the shared sets (read on every draw, written from the windows and the reset). Covering (D1) is computed against this drawing's values: all racks of the drawing ticked → rack filter off, button «Все шкафы».
3. D2: a shared value absent on this drawing stays ticked and shows greyed at the end of the window as «{} — нет на этом чертеже»; it can be unticked there; it counts in the button text (named last). The plan never prunes shared sets.
4. Stages: three sections «Осталось» (the seven `LEFT_FILTERS` lines, no counts), «Работа» (works waiting on this drawing's points, with counts, pulls first), «Проблемы» («⚠ С проблемами (N)» and «Проблема: <name> (N)», only when some point has an open problem). Section headings are not tickable; gone values are dropped silently; matching with `planFilterMatch` for any ticked value, empty set = all bright.
5. Modes «❔ Не размеченые» and «🙈 Скрытые»: plan-local, reset when the plan opens; ticking a mode clears every type (the shared type set too) and the other mode; ticking a type clears both modes (§ 1.3). Button text for a mode: the mode's name without count.
6. Empty result: when no point of the drawing passes the type, rack and door-configuration filters (and no mode is on), the muted 13 px line «Под фильтры на этом чертеже точек нет» under the reset button; the drawing stays visible.
7. Focus point: the point in focus (`focusId`: opened from «📍 На чертеже» or another jump, result of «Найти точку», the door of the «🚪 Двери» wizard, a review-list point) is drawn and tappable even when filters hide it (progress frame, tag, focus frame); it goes away with the focus frame (idea 006 rules); the filters do not change.
8. Re-render of «Точки» when the plan closes after a shared set changed (`onClose` → `ui.render()` while the tab is «Точки»), using the hook of ticket 02.
9. Reset on the plan (§ 1.8): shared sets (those not off on this drawing, or holding a missing value), stage set, a type mode; `sel` cleared as a type change clears it today; «Найти точку» untouched; shared sets cleared for «Точки» too.
10. Remove the drop-downs the plan used (type, rack, stage `<select>`s) and the old single-value helpers if nothing else uses them; guide line 3 and the strings; `node scripts/i18n-build.mjs`; header comments; `node tools/code-map.mjs`.

## Done when

In `?mem=1&memPlan=1` at 420 px:
- Racks and types ticked in «Точки» are ticked in «🗺 План» and only those points are bright/shown; changes made on the plan show in «Точки» after the plan closes; the plan's reset clears both.
- Tick rack FC (it has no points on the drawing): its line shows greyed «FC — нет на этом чертеже», the line «Под фильтры на этом чертеже точек нет» shows, the drawing stays; unticking FC brings points back.
- All racks of the drawing ticked → button «Все шкафы» (FC from «Точки» does not count as a rack of the drawing).
- Stages: «Осталось: хивут» + «Осталось: шилют» ticked → points waiting for either are bright, others grey; «Работа» and «Проблемы» sections; FA/W-01 reachable through «⚠ С проблемами».
- Mode «❔ Не размеченые (1)» clears the types; «Точки» shows all types afterwards.
- Plan opened from the card of a point hidden by the types: that point is drawn with the focus frame; after a tap on an empty spot it hides again.
- Hebrew: the windows read right to left.
- `npm test`, `npm run build`, `node tools/code-map.mjs --check` pass.

## Tests to add

Pure logic in `tests/filters.test.js` / a new `tests/planfilters.test.js`: plan stage matching with several values (any matches; empty = all); the rack options of a drawing with «Без шкафа»; covering against the drawing's values; a missing shared value kept by the plan path and named in `buttonText`; focus point visibility rule (if extracted to a pure function — extract it). The shared-filter tests of ticket 02 cover the store.

## Owner check

On the phone, after the site updates:
1. «Точки»: tick two racks and three types. «🗺 План»: the same racks and types are ticked; only those points show.
2. «✖ Сбросить фильтры» on the plan: all points back; in «Точки» filters and search are empty and the reset button is gone.
3. Plan: «Все этапы» → tick «Осталось: хивут» and «Осталось: шилют»: points waiting for either are bright.
4. Plan: tick a rack that has no points on this drawing: it stays in the list greyed with «нет на этом чертеже» and can be unticked.
5. Open a point's card from «Точки» while its type is filtered out: on the plan the point is shown with the frame.
