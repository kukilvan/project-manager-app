Status: in review
Complexity: medium
Blocked by: —

# 01. Day off

A day of a project can be marked «🌴 Выходной» with a reason. A day off has no entries and no report; it shows in «Отчёты» and «Месяц» as a line and is not a working day. Blocked against a working day of another project on the same date, and the other way round. Idea 001.

## Spec sections

§1 (all), §8 rows «Day off and a working day on one date…», «Two projects with a day off…», «Day off of a project that is archived later», «Day off on a one-off project», «Today is a day off and «Шилют поклеен» is tapped in a rack», §9 (`dayoff.js`, `month.js`), §10 (`KNOWN_ISSUES.md` line of this ticket).

## What to do

1. `src/domain/dayoff.js` (new, pure): the seven reasons (`DAY_OFF_REASONS`, ru and he), `dayOffText(day, lang)`, `dayConflict(days, projects, { date, projectId, dayId, off })` as §1.2 (deleted days and archived projects ignored; the same project ignored).
2. Day form («Новый день» / «День»): the fields and visibility of §1.2, the save checks 1–6 in that order, the message windows and toasts as written. A saved day off does not move `project.lastWorkDate`. Switching back writes `off: false, offReason: null, offText: null`; helper fields are not touched while off.
3. «Отчёты»: the day-list line, the day screen of a day off with its hint and two buttons, the delete confirmation, «📝 Сегодня» on a day-off date (§1.3). Find the existing screens with the code map; do not move them.
4. The recording paths (`addWorkForPoints`, `addWorkForPoint`, `markShilutForPoints`): the block and the two messages of §1.3; `markShilutForPoints` returns `{ made: 0, blocked: true }`, and every caller (point card, plan, racks, «Что осталось», pulls) shows nothing more when `blocked`.
5. `month.js` and the month screen (§1.4): `workdaysList` / `workdaysReport` day-off block and `offCount`, «Дней: N · выходных: M», sums and `downtimeByCulprit` skip days off, `monthReportRu` / `monthReportHe` lines with the comment, `doh(day)` of a day off, the Excel row in `export.js`. Check every other consumer of a day for an empty-report crash: backup, import, server tables (`scripts/server-tables.mjs`), the daily-report screen, search.
6. Strings of §1.6 into `src/i18n/src/*.json`, then `node scripts/i18n-build.mjs`. The guide line of §1.5 in `src/app/views/guide.js`.
7. `KNOWN_ISSUES.md`: a working day and a day off on one date after offline edits on two devices (§8) — index line and entry.
8. Header comments of changed and new modules; `node tools/code-map.mjs`.

## Done when

- In `?mem=1`: a day off with a ready reason and with «Другое» saves; each failing check of §1.2 shows its own message and leaves the form open; switching back to working restores the helper fields.
- «Отчёты» and «Месяц» read as §1.3 and §1.4; the month texts have the day-off lines; «📝 Сегодня» and the recording buttons on a day-off date show the message and write nothing.
- No code path prints an empty report for a day off.
- `npm test`, `npm run build`, `node tools/code-map.mjs --check` pass.

## Tests to add

Spec §9, the `dayoff.js` and `month.js` lines: reasons in ru and he, the `other` text, `dayConflict` (other project working, other project off, same project ignored, deleted days ignored); day-off block and order in `workdaysReport`, `count` and `offCount`, two projects with one date shown once, sums and `downtimeByCulprit` skip days off, `monthReportRu` and `monthReportHe` lines with the comment, `doh` of a day off, the Excel row; `markShilutForPoints` on a day off returns `blocked` and writes nothing.

## Owner check

On the phone, after the site updates:
1. «Отчёты» → «Новый день», yesterday's date, turn on «🌴 Выходной» — the helper and object fields disappear. Press «Сохранить» with no reason: «Выберите причину выходного». Choose «Праздник», save.
2. The day shows in the list as «🌴 Выходной: Праздник». Open it: the hint and the two buttons, no «Добавить работу».
3. «Месяц»: the line «<дата> — выходной — Праздник», «Дней: N · выходных: 1»; the working-day count did not grow.
4. «Выходной» with «Другое»: the field «Своя причина» appears; empty — «Впишите свою причину».
5. Tap «📝 Сегодня» after making today a day off, then try «➕ Добавить работу» from a point card: the message about the day off, nothing written.
6. A date that has a working day in another project: make it a day off in this one — «Нельзя сделать выходным». The same date as a working day when it is a day off elsewhere — «Эта дата — выходной».
7. «✏️ Изменить день» → turn off «🌴 Выходной» → the day is a working day again with its helper.
Wrong looks like: a day off counted in «Дней», an empty report, a crash on «Месяц».
