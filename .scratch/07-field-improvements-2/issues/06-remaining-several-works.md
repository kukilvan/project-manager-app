Status: accepted
Complexity: complex
Blocked by: 04

# 06. «Что осталось» records several works; pull by ticked cables

Several works ticked in «Что осталось» are recorded in one go through «Несколько работ»; a pull is recorded only for the ticked cables, in the one-work path too (D3, a found bug: «✅ Записать «Протяжка cat7»» also records 6005 today).

## Spec sections

§ 0 (D3), § 4 (all), § 7 (rows on «Что осталось» and «Несколько работ»), § 8 (strings of § 4 and guide line 4), § 9 (entries).

## What to do

1. Pure `remainingPreset(tickedKeys, pointIds, catalog)` → `{ mode: 'one' | 'many' | 'none', workIds, pullCables, left: [labels of s: keys] }` (§ 4.1); `<pull work>` = the first active catalog work of type «Протяжка» that applies to points (`workUsesPoints`), never «Протяжка без точек». Put it in a domain module; header comment.
2. The record button of `remainingModal` by the table of § 4.1 (disabled cases with title «Сначала выберите работу в фильтре»; «✅ Записать «<label>» (n)»; «✅ Записать выбранные работы (n)»); toast «Не записываются отсюда (старые точки): …» when `s:` keys are ticked besides recordable ones; `todayBlocked()` first; the window closes, the form opens 60 ms later. Replace the interim logic of ticket 04.
3. One work (§ 4.2): `w:` as today; `p:<cable>` → `addWorkForPoints(ids, { workType: 'Протяжка', workId: <pull work>, cableId, onlyCables: [cable] })`. In `entryForm`, `preset.onlyCables` keeps only the pull groups (`pullGroups`) of those cables (old points: the main cable), shows the line «Протяжка записывается только для кабеля {}» under «Точки», and when no group is left shows the toast «Уже протянуто: …» and keeps the form open. Changing the work type away from «Протяжка» drops the limit.
4. Several works (§ 4.3): `addWorksForPoints(pointIds, { workIds, pullCables })` in `src/app/views/doh.js` — finds today's day or makes `{ id, date: today, helper, helperHe, _new: true }` and opens `batchForm(day, preset)`. `batchForm` starts with `preset.pointIds` in the picker and `preset.workIds` ticked (only those that apply to the points); with `pullCables` the pull line reads «<work> — только <cable>, <cable>». «Сохранить всё»: each ticked work as today (pull → `pullGroups` limited by `pullCables`; other works → only points that still wait, `workApplicable`); a work with no points writes nothing; **one** `repo.save` — the day first when `day._new` (`{ date, helper: day.helper || 'сам', helperHe: day.helperHe || 'сам' }` exactly as `entryForm`), then the entries; then `syncJournal` per entry, `bumpLastWork(day.date)`, toast «Записей добавлено: N»; nothing to write → «Записей добавлено: 0» and no day created. From a day screen (no preset) it behaves as today.
5. § 4.4: an entry written for one cable by `batchForm` is `{ dayId, workType: 'Протяжка', workId, pointIds, cableId, result: undefined }`; check against the one-work form's entry (the form's extra fields are `null` after `clean()` in `src/app/repo.js`) so the report line, the point status and journal rows come out the same.
6. Guide line 4 in the «Что осталось» section; strings of § 8 for this ticket; `node scripts/i18n-build.mjs`; header comments; `node tools/code-map.mjs`.

## Done when

In `?mem=1&memPlan=1` at 420 px, with the entries seen in «Отчёты»:
- Two `w:` works ticked + points → «Несколько работ» opens with them; «Сохранить всё» writes both on the right points in one save; a point waiting for only one of them gets only that one.
- «Протяжка cat7» + «Протяжка 6005»: one pull line «… — только cat7, 6005», one entry per cable.
- Only «Протяжка cat7» on FB/K-01 (6005 done, cat7 left): one entry cat7; the point's other cables untouched. A door with only 6005 left is not in the list.
- Unticking a point in the picker writes only the remaining ones; no day yet today → the day is created in the same save; all works already done → «Записей добавлено: 0», no day created.
- Today is a day off → forms do not open, today's message shows.
- Only `s:` keys → button disabled; `s:` + two `w:` → toast about the `s:` labels on opening.
- `npm test`, `npm run build`, `node tools/code-map.mjs --check` pass.

## Tests to add

From § 10: `remainingPreset` for one `w:`, one `p:`, two `w:`, `p:` + `w:`, two `p:`, only `s:`, `s:` + two `w:`; the pull limit — `pullGroups` filtered by `onlyCables` on a point with 6005 done and cat7 left, on a point with both left, old points by the main cable; entries alike — the entry of «Несколько работ» for one cable and of the one-work form give the same `entryLine` and `pointInfo` after `syncJournal` (domain level, small ctx).

## Owner check

On the phone, after the site updates:
1. «🧾 Что осталось»: tick two works and a few points → «✅ Записать выбранные работы»: «Несколько работ» opens with them; «Сохранить всё»: both works are in today's report on the right points.
2. Tick only «Протяжка cat7» on a point that also has 6005 → record: only cat7 is pulled, 6005 still «осталось».
3. Tick «Протяжка cat7» and «Протяжка 6005» together: one line «только cat7, 6005», two entries.
