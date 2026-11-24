Status: open
Complexity: medium
Blocked by: —

# 01. Works not in the plan colour (idea 008)

A work can be unticked «Учитывать в цвете точки на плане»: the plan, shared marks and «PDF с номерами» then colour the point without it (a point with everything else done is dark green), while the card, «Что осталось», reports and sheets keep the work. The box is a project setting and never reaches the shared pool.

## Spec sections

§ 0 (D1–D7, D12, D13), § 1 (all), § 3 (the three strings and the guide line of «Справочники»), § 4 (data), § 5 (edge cases of idea 008), § 6 (tests of ticket 1 and the self-check), § 7 (docs of ticket 1), § 8 (owner check 01).

## What to do

1. `src/domain/plan.js` (§ 1.1, § 1.2):
   - `inPlanColour(work)`: `true` for a missing work, a «Протяжка» work, or `planColour !== false`.
   - `colourInfo(info, ctx)` (internal): legacy point → `info` as is; composite → keep tasks with `stage === 'Протяжка'` or `inPlanColour(ctx.catalog.get(t.workId))`; nothing dropped → the same `info`; else a copy `{ ...info, tasks, stageStats, stages }` with `stageStats` recounted per `STAGES` and `stages` = those with `total > 0`. Never mutates the cached `info`.
   - `planColor`: `const info = colourInfo(infoFn(point, ctx), ctx)`; the rest unchanged. Check that `markColor`, `progressOf` and `numberedInput` reach the colour only through `planColor`.
   - `planColourPatch(ticked, existing, workType)` → `{}` for «Протяжка», `{ planColour: false }` when unticked, `{ planColour: true }` when ticked on a work that had `false`, else `{}`.
   - Export what the app needs from `src/domain/index.js`.
2. `src/domain/typelib.js`: `PROJECT_ONLY = ['planColour']`; `bare()` drops `META` and `PROJECT_ONLY`. Walk every path of § 1.5 (`poolHash`, `deepHash`, `changedFields`, `fieldChanges`, `candidateChanges`, `changedParts`, `depsOf`, `bundleFrom`, `inboxCandidates`, `takeFromPoolOps`, `addBundleOps`, the wizard's `refs`, «📥 Заполнить пул из …» in `poolview.js`) and confirm each goes through `bare()`; fix any that does not. The administrator's «➕ В общий пул» and «✏️ Изменить и добавить» write `bare(cand.item)` and the parts through `bare()`.
3. `src/app/views/settings.js`, `REFS.catalog` (§ 1.2, § 1.3):
   - the checkbox «Учитывать в цвете точки на плане» with its hint, right after «Тип работы»; hidden for type «Протяжка» (shows and hides as the type changes, like «Может входить в набор двери») and in the pool administrator's forms;
   - `toForm`: ticked unless `planColour === false`; `defaults`: ticked; on save merge `planColourPatch(...)` into the data; the pool forms add no `planColour`;
   - the list line: « · не в цвете плана» at the end of the second line, after « · скрыта», for `planColour === false` works that are not «Протяжка».
4. `src/domain/testplan.js` (D12, the part for this ticket): a point **FA/C-06** with everything done except «Подключение в шкафу» (`HIV_DEV`), one caption more, inside the page, no overlap. (The second drawing of D12 belongs to ticket 02.)
5. Texts (§ 3): the three UI strings and the «Справочники» guide line in Russian, English and Hebrew; `node scripts/i18n-build.mjs`.
6. Docs (§ 7): `CONTEXT.md` — «Not in the plan colour» extended; ADR `docs/adr/0018-project-only-fields-stay-out-of-the-pool.md` (D3, D4: `PROJECT_ONLY` in `bare()`, absent = default, merge keeps the project's value, in the shape of the earlier ADRs); header comments of `plan.js`, `typelib.js`, `testplan.js` and `settings.js` if its first sentence changes; `node tools/code-map.mjs`.
7. Self-check (§ 6, Ticket 1) and the push to `main` as the workflow says.

## Done when

In `?mem=1&memPlan=1` at 420 px, after «Не напоминать»:
- FA/C-06 is a light-green gradient shade; «Каталог работ» → «Подключение в шкафу»: the box is ticked. Untick, «Сохранить»: the list line ends « · не в цвете плана».
- «🗺 План»: FA/C-06 is dark green with the thick frame; FA/C-05 still dark green; FA/C-04 unchanged.
- FA/C-06's card and «🧾 Что осталось» still list «Подключение в шкафу».
- A «Протяжка» work has no box; tick back → FA/C-06 returns to its shade.
- English and Hebrew show the translated box, hint and mark.
- A work differing from the pool only by the box gives no inbox candidate and no `planColour` in anything sent to or taken from the pool.
- No work unticked: colours and `numberedHash` exactly as before.
- `npm test`, `npm run build`, `node tools/code-map.mjs --check` pass.

## Tests to add

From § 6:
- `tests/plan.test.js`: `inPlanColour` (missing, absent / `true` / `false`, «Протяжка» with `false`); `planColor` (all done but an unticked work → dark green, `full`, width 1.75; gradient `j / M` without the unticked work; only unticked works after the pull → dark green when pulled, pink with `pull` circles when not; an unticked work done alone → grey, blue with a length; an all-unticked «Хивут» stage leaves `stages`; red first; legacy point unchanged; no work unticked → the same result as before for the existing cases; the cached `info` is not modified); `markColor` of a pair (one point with only an unticked work open, the other pink → pink); `numberedInput` / `numberedHash` change for a drawing with an affected point and not for one without; `planColourPatch` four cases.
- `tests/domain.test.js`, pool section: `bare` drops `planColour`; `poolHash` equal with and without `planColour: false`; `inboxCandidates` has no candidate (nor a type candidate through that work) for a work differing only by the box; `changedFields` / `candidateChanges` show no line; `takeFromPoolOps` and `addBundleOps` write no `planColour` and leave an existing project work untouched; `depsOf` and `bundleFrom` carry none.
- `tests/testplan.test.js`: FA/C-06 (caption inside the page, no overlap; gradient with every work ticked, dark green `full` with `HIV_DEV` unticked).

## Owner check

On the phone, after the site updates (spec § 8):
1. «📋 Справочники» → «Каталог работ» → the rack-termination work («Хивут в шкафа бакары» or the project's own): the box «Учитывать в цвете точки на плане» is ticked. Untick it, «Сохранить»: the list line ends « · не в цвете плана».
2. A work of type «Протяжка»: no box.
3. «🗺 План»: a point with everything done except the rack termination is dark green with the thick frame.
4. Its card and «🧾 Что осталось» still show the rack termination as not done.
5. «📄 Скачать PDF с номерами»: the same colours as the plan.
6. As pool administrator: «🗂 Общий пул» in «Каталог работ» shows nothing new from projects for this work.
7. Tick the box back on one work: its points return to the gradient; untick it again if that is how the project is run.
