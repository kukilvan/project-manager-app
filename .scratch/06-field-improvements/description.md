Status: in review

# Stage 6. Field improvements — description

## Goal

The owner filed five wishes from field work on 2026-11-17 (ideas 001–005). They make day-to-day work on site and the picture for management more honest:

- a day without work gets a reason instead of a silent gap in the month;
- the reference lists the owner retypes in every project become one list per database;
- a concrete trouble on a point («these 5 doors are not drilled») is recorded, shows red and is closed with history;
- the plan stops showing half-done points as finished;
- the English and Hebrew UI stop showing Russian, and new features cannot ship untranslated.

The stage runs now, before stage 4, while the NAS is being checked. Its ideas are built in this order: 001, 002, 003, 004, 005 (005 last, so it covers the new strings of the others).

## What the owner will see at the end

Mockups (rough, made-up projects and labels): `mockups/day-off.html`, `mockups/reference-lists.html`, `mockups/problems-on-points.html`, `mockups/plan-colours.html`.

### 1. Day off (idea 001)

1. «Отчёты» → «Новый день» (or an existing day) has a switch «🌴 Выходной». When on, the helper fields hide and a reason is picked: «Личное», «Праздник», «Болезнь», «Шаббат», «Нет работы на объекте», «Погода», «Другое»; «Другое» opens «Своя причина». «Комментарий в конце отчёта» stays.
2. The list of days shows «🌴 Выходной: Праздник» instead of the number of entries; a day off has no «Добавить запись» and no report text.
3. «Месяц»: the line «15.11.2026 — выходной — Праздник» among the working days; «Дней: N» and the month sums (hours, quantities, pulls) skip it. The Hebrew month report says «יום חופש — חג».
4. A date that already has a working day **in another project** cannot become a day off: «Нельзя сделать выходным: 15.11.2026 уже есть рабочий день в проекте «…». Сначала удалите тот день или выберите другую дату.» (owner's decision 2).
5. Switching «Выходной» off turns it back into a working day.

### 2. Shared reference lists (idea 002, plus culprits)

1. Ещё → Справочники: «Причины задержки точек» and «Виновники простоя» are each one list for all projects of the database, marked «· общий», with the hint «🔗 Общий список для всех проектов этой базы. Удаляет только администратор.»
2. Any member adds and edits; only the pool administrator deletes (the rule of door configurations). The usage count stays per project.
3. On the first start after the update, the lists of all projects merge once into the shared one; points and day entries keep their reason and culprit (both refer by name).
4. Both lists already reach the daily report (the delay of an entry: reason and culprit) and «Месяц» (downtime by culprit): those keep working from the shared lists.

### 3. Problems on points (idea 003)

1. Ещё → Справочники → «⚠ Проблемы» (shared, like the lists above): a problem has a Russian and a Hebrew name, the point types it is for (empty — all types; owner's decision 4) and ready descriptions, each Russian and Hebrew. Four example problems come with the app and can be deleted (below).
2. Marking: select points in «Точки», on the plan or in a rack → «⚠ Проблема» (also on the point card) → a problem (only those for the selected points' types) → a ready description or «✍️ Своё описание» in Hebrew («Только иврит — так попадёт в таблицу для руководства»).
3. Point card: block «Проблемы» — open ones on top (problem, description, who and when) with «✔ Решено»; solved ones below in grey with who and when solved. Mass «✔ Решено» on selected points.
4. A point with an open problem is red on the plan and in «PDF с номерами», whatever its progress; filters «⚠ С проблемами» and «Проблема: <name>» in «Точки» and on the plan; the points list shows «⚠ <problem>».
5. «Проект»: under the readiness bars «⚠ Открытых проблем: 7 — показать», opening «Точки» with the filter; no line when there are none (owner's decision 4).
6. Management sheet: a profile column «Проблема» / «בעיה» with «<problem>: <description>» in Hebrew (several on separate lines), the row red, the legend line «יש בעיה» / «Есть проблема»; solved problems are not shown. `STYLE_V` +1, so every sheet is rebuilt once. The nightly server job builds the same.

### 4. Plan colours by progress (idea 004)

1. Points not finished go from yellow to green in four steps by the share of their stages done; a finished point has a thick dark-green frame. Grey «новая», blue «померяно» and red (open problem or «Неисправна») stay.
2. Zoomed in, under each started, unfinished point: one dot per stage it has, in the order протяжка, хивут, установка, проверка, шилют — filled when done. One empty dot at the end = only shilut is left.
3. Plan filter «Ждёт: <stage>» with shilut added; the points not waiting go pale.
4. The plan legend and «PDF с номерами» use the same colours. Every «PDF с номерами» is re-rendered once by the nightly job (its fingerprint changes).
5. The mockup `mockups/plan-colours.html` has «📄 Подложить свой чертёж»: the owner opens it on the PC, picks a real drawing (picture or PDF) and sees the colours on it; the file stays in the browser, nothing is uploaded, nothing reaches the repo. A second palette «Жёлтые чуть темнее» is there for comparison.

### 5. Everything translated (idea 005)

1. In English and Hebrew no Russian is left on screen except the event log and the user's own data (reference names, notes).
2. `npm test` fails when a Russian UI string has no English or Hebrew entry and is not on the «not UI» list, so the deploy stops.
3. A new rule in `docs/coding-standards.md` and a line in the ticket and quick-fix steps of `docs/workflow.md`: each session translates its own new strings.

## Facts found while describing

- Delay reasons are used in **two** places: on a point (`point.delayReasonId`, the management sheet column «Причина задержки») and in a day entry (`entry.delayReason` with `entry.delayCulprit`, in the daily report and in «Месяц» → downtime by culprit). Both refer by name (the id is the Russian name).
- Delay reasons, culprits and units are per-project collections today; backup (`src/app/backup.js`) and import (`src/app/views/import.js`) carry them per project. The shared lists change both.
- Door configurations already have the pattern the shared lists follow (`src/app/doorpool.js`: pool collection, any member writes, admin deletes), but projects keep copies of door configurations; whether the shared lists need copies is the spec's choice (ADR 0015).
- «Месяц» → «Рабочие дни» is built over **all** projects (`workdaysList` in `src/domain/month.js`), while «one day per date» is checked inside one project (`src/app/views/doh.js`). Hence decision 2.
- The month report (Russian and Hebrew) glues the daily reports of all the month's days; a day off must not print an empty report there.
- The plan **already** filters «Осталось: длина / протяжка / дотянуть / хивут / установка / проверка», by rack and by type (`STAGE_FILTERS` in `src/app/views/planmodal.js`). Missing: shilut. «Что осталось» filters by concrete work (e.g. termination at the point vs in the rack) and by pull; whether the plan gets that too is open question 9.
- Plan colours come from the status word (`statusColor` in `src/domain/plan.js`), shared with the server's «PDF с номерами» (`src/tohnit/numbered.js`); the legend of both is built from `STATUS_COLORS`.
- Dictionary gap measured 2026-11-17: 284 of 2,783 Russian strings, 166 of them in the guide (`src/app/views/guide.js`, whose header says its texts go through the same dictionary).
- The owner's drawings are customer data: no mockup with a real drawing goes into the repo (ADR 0005).

## In scope

- Idea 001: day-off switch, reasons, list line, «Месяц» line and counts, Hebrew month report, the block for a date with a working day in another project.
- Idea 002 and culprits: shared «Причины задержки точек» and «Виновники простоя», one-time merge, admin-only delete, backup and import, starter pool, Firestore rules and the derived open rules.
- Idea 003: «Проблемы» reference list with point types and ready descriptions, example problems, marking one and many, point card block, «Решено» with history, red on the plan and in «PDF с номерами», filters, the «Проект» counter, the management sheet column, row colour and legend (app and nightly job).
- Idea 004: progress colours, dots, the plan stage filter with shilut, legends, «PDF с номерами».
- Idea 005: translations of everything left, the «not UI» list, the test, the coding standard and the workflow line.
- In-app guide lines for every new behaviour; English and Hebrew for every new string.
- Notes for stage 4: the new data (day-off fields, shared pool collections, problem marks) must be carried by PocketBase storage.

## Out of scope

- Units stay per project.
- Hiding a shared item in one project only (owner, idea 002).
- Problems in the daily report, photos on problems, automatic translation (owner, idea 003).
- Reminders about missing days; automatic Shabbat or holiday days (idea 001).
- An editable list of day-off reasons (owner chose a ready list + own text).
- Other hue families for the plan; the management sheet's row colours apart from the problem red (idea 004).
- English names for reference lists; the event log stays Russian (idea 005).

## Pulled-in known issues and wishes

- `KNOWN_ISSUES.md`: KI-3 (same-code runs) is about tools; KI-4 (an editor's sort scatters section rows) touches the management sheet but this stage does not change sorting — both stay open, not taken.
- «Ревью 3» wishes: the night-job and empty-profile ones are for stage 4; «Шкафы по порядку» for the rack tabs is «if managers ask» — not taken.

## Decisions taken with the owner

1. **Ideas 001–005 as filed** (2026-11-17), in that order — owner. The decisions recorded in each idea file stand.
2. **Day off on a date with a working day in another project: blocked**, with a message naming that project — owner (2026-11-17). Reason: «Месяц» counts days over all projects, and a date must not be both working and off.
3. **Culprits («Виновники простоя») become a shared list too**, the same way as delay reasons — owner. ADR 0015 covers delay reasons and problems only; the spec writes ADR 0016, which replaces it and adds culprits.
4. **Problems get two additions:** point types per problem (empty — all types; the mark form offers only matching ones) and the «Открытых проблем: N» counter on «Проект» — owner.
5. **Colour by stages, not by single works** — agent, the owner confirms at «Коммит»: the share is counted over the point's stages (протяжка, хивут, установка, проверка, шилют, only those its type has); a stage is done when all its works are done. A point with two cables would otherwise have 8–10 works and steps that don't match the five dots.
6. **Hebrew of ready texts** — the session proposes, the owner checks at «Коммит» (owner: no own words now):

| Russian | Hebrew |
|---|---|
| Выходной | יום חופש |
| Личное | אישי |
| Праздник | חג |
| Болезнь | מחלה |
| Шаббат | שבת |
| Нет работы на объекте | אין עבודה באתר |
| Погода | מזג אוויר |
| Другое | אחר |
| Магнит индикация (Дверь) → Не просверлены двери | מגנט חיווי → הדלתות לא קדוחות |
| Замок (Дверь) → Нет питания на замке | מנעול → אין מתח במנעול |
| Кабель → Кабель повреждён; Кабель не дотянут | כבל → כבל פגום; הכבל לא הושחל עד הסוף |
| Доступ → Нет доступа в помещение | גישה → אין גישה לחדר |
| Проблема / Есть проблема (sheet) | בעיה / יש בעיה |

## Open questions for the spec

1. **Day off with entries:** switching «Выходной» on for a day that has entries — block, or ask and keep the entries hidden? Suggestion: block («Сначала удалите записи»), simplest to read in «Месяц».
2. **Day-off reason:** required; «Другое» requires text (suggestion). Stored as a ready-reason id or own text.
3. **Shared lists and copies:** projects keep copies (like door configurations) or read the pool directly; how points and entries show a deleted item (by name, as today).
4. **The merge:** where it runs (first start of any member, once per database), what decides "once", conflicting Hebrew to the event log; on-device mode.
5. **Problem marks storage:** on the point document or a separate collection — cheap mass marks on ~750 points, readable history, offline; Firestore rules and the derived open rules.
6. **Ready description edited later:** open marks refer to it (a typo fix reaches the sheet — suggestion) or keep the old text; description required or optional (suggestion: optional).
7. **Problem types on mixed selection:** points of several types selected — offer problems valid for all of them, or for any (suggestion: for all, plus the «all types» ones).
8. **Rounding of the progress share** for points with 2–4 stages onto the four steps; legacy (not composed) points through their type's stages; a mark shared by several points (pair, triple) — which point's dots.
9. **Plan filter by concrete work and by pull** (as «Что осталось») in addition to stages — needed, or stages + shilut are enough?
10. **Dots in «PDF с номерами»:** readable at print size or not.
11. **Final palette** after the owner's look at a real drawing in `mockups/plan-colours.html`.
12. **The «not UI» list:** its form (a list file or a mark in code) and its first content, decided while translating.
13. **Red row colour** in the management sheet for an open problem: the same as «Неисправна» or its own shade; legend wording.
14. **Stage 4 note:** list the new collections and fields for the PocketBase spec in `docs/project-spec.md`, stage 4.
