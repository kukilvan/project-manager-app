# Idea 001: Day off with a reason

Status: taken in by `.scratch/06-field-improvements/description.md`
Added: 2026-11-17

## Why

The owner keeps days in «Отчёты» and sums them in «Месяц». A day without work (holiday, sickness, no work on site) leaves a gap with no explanation; the owner wants to record it as a day off with its reason, so the month shows why the day is missing.

## Scenario

1. «Отчёты» → «Новый день» (the same form as today).
2. Turns on «Выходной».
3. Picks a reason from the list: «Личное», «Праздник», «Болезнь» and the other ready ones; or «Другое» and types their own text.
4. «Сохранить». The day appears in the list of days as «Выходной: <reason>»; it has no work entries and no daily report.
5. In «Месяц» the day is a line «выходной — <reason>» and is not counted as a working day.

## Behaviour

- Form «Новый день» / «День»: a switch «Выходной». When on: the helper fields hide; a field «Причина» (ready reasons + «Другое»); with «Другое» a text field «Своя причина». «Комментарий в конце отчёта» stays.
- Ready reasons, each with Russian and Hebrew (Hebrew written by the owner in the description or spec if they want their own words): «Личное», «Праздник», «Болезнь», «Шаббат», «Нет работы на объекте», «Погода», «Другое».
- Day list: «Выходной: Праздник» instead of the works count; a day off has no «Добавить запись» and no report text.
- «Месяц»: the day line reads «выходной — Праздник» (Hebrew month report: the Hebrew reason); working-day counts and sums skip it.
- One day per date stays: a date that already has a day (work or day off) opens it, as today.
- A day off can be turned back into a working day by switching «Выходной» off in its form.

## What changes in existing behaviour

- The day form gets the switch and the reason fields.
- `workdaysList` / month report: days off are shown as days off and excluded from the working-day count.
- Nothing changes for working days.

## Data and external services

- `days` documents get `off: true` and the reason (ready reason id or own text). No new collection, no external service.
- The ready reasons live in code (like units) unless the description decides on an editable list; the owner chose «list + own text».

## Edge cases

- Switching «Выходной» on for a day that already has entries: ask «В этом дне есть записи — сделать выходным? Записи останутся» or block; decided in the spec.
- Empty reason: allowed? The spec decides (suggestion: reason required, «Другое» needs text).
- Offline: like any day, saved on the device and synced later.
- Several projects: the day off belongs to the current project, like any day; «Месяц» shows it once.

## Out of scope

- Reminders about missing days, automatic Shabbat or holiday days.
- An editable reference list for day-off reasons (the owner chose ready list + own text).

## Decisions

- Visible in «Отчёты» and «Месяц», not sent as a daily report — owner.
- Reasons: ready list with «Личное», «Праздник», «Болезнь» and others, plus own text — owner.
- Stored as a flag on the day, not a separate collection — agent: a day off is still one date of the project, and «one day per date» keeps working.

## Owner check

On the iPhone: create a day off «Праздник» for yesterday, see «Выходной: Праздник» in «Отчёты»; open «Месяц» — the line «выходной — Праздник», working days one fewer; switch the day back to a working day.

## Tests

- `src/domain/month.js`: days off are listed with their reason and not counted; Russian and Hebrew texts.
- Day-off reason text for «Другое».

## Open questions for the stage

- Hebrew of the ready reasons (the owner's own words, if any).
- Block or warn when a day with entries becomes a day off.
