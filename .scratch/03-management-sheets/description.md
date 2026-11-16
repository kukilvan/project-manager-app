Status: accepted

# Stage 3. Management sheets — description

## Goal

Management likes the management sheets but says they are hard to read: 700+ rows of one list, no sign of what kind of point a row is, no sign of how fresh the data is, and most of the sheet is pink. The owner's boss asked for a heading line before each kind of point. The sheet is a reporting document, so it must stay sober: readability goes up without making it colourful. Next to it, management gets a sheet with the progress of each rack.

Second goal: Google Drive still holds files from the AppSheet era and early tries. Below is the list for the owner to delete by hand; sessions never delete from Drive.

## What the owner will see at the end

Mockups (rough, made-up project and labels): `mockups/status-sheet.html`, `mockups/progress-by-rack.html`, `mockups/table-profile-form.html`.

1. **Sections by point type.** In the points sheet, the points are grouped by type. Before each group there is a section row with the type's name and its number of points («בקרה — 120 נקודות», in a Russian sheet «Контроллер — 120 точек»). The section row is white with large bold dark-blue text and a thick dark-blue frame around the whole row. Two empty rows separate the last point of a type from the next section row. Sections come in the order the profile sets (decision 4).
2. **Update date.** Row 2, next to the project name: «עודכן: 16/11/2026 02:00» (Israel time), in a Russian sheet «Обновлено: …».
3. **Colour legend.** The empty row under the totals becomes a legend: one cell per colour with its meaning (done, in progress, partly done, fault, «—» not used by this type, empty — not done yet). One empty row follows it, then the column header. The column header stays dark blue; it gets the same thick dark-blue outer frame as the section rows (thin light lines between its cells stay), so their edges line up.
4. **Less pink.** A stage not done yet stays white (now pink). The row of a point keeps the colour of its status, as now. Thin light-grey cell borders make rows easier to follow.
5. **Totals row unchanged.** Counts only, no percents (percents live on the rack sheet).
6. **New sheet «Progress by rack»** («התקדמות לפי ארון», in a Russian sheet «Итоги по шкафам») in the same file: one row per rack and a total row; for each stage the count and the percent of the rack's points; partly installed and faults as counts. Only a stage done at 100% is green, nothing else is coloured. The profile's filters (racks, types, statuses) apply to it too.
7. **Profile form** («Таблицы для руководства» → table → «Изменить»): two new ticks, «Разделы по типам точек» and «Лист „Итоги по шкафам“», both on by default, also for existing profiles; the point types list gets ↑↓ arrows like the columns list, and its order is the order of the sections.
8. All of this in every profile (main, «Расширенная» and any other), switched by the two ticks. The nightly server refresh builds the same sheets. After the deploy every sheet is rebuilt on its next refresh; links stay the same.
9. **The list of old Drive files** (below) — ready now, nothing to build.

## Facts found while describing

- The main sheet of «Мегасон Бэйт Шемеш» today: 742 points, 8 columns (point, type, rack, cable, installed, checked, status, shilut), 6 frozen rows (title, project, totals header, totals, empty row, column header); 112 points pulled, so most stage cells are empty and pink.
- The sheet is built in `src/domain/report.js` (`buildReport`) and written by `src/app/managers.js`; the nightly job (`scripts/server-tables-lib.mjs`) reuses both, so one change serves the app and the server. The layout version `STYLE_V` is part of the data hash: raising it rebuilds every sheet once.
- Every refresh deletes and re-adds the sheets: a filter or sort a manager set by hand is lost each time. This is not new.
- When the data has not changed, the refresh skips writing (hash). A date that must show "checked last night" needs a write even then (open question 1).
- Types have no order the owner can set: Settings lists them alphabetically by the Russian name; the profile form lists them in load order.
- The Excel export (`src/domain/export.js`) reuses `report.js`.
- Mobile Google Sheets shows Hebrew left-to-right (ADR 0009) — a Google app quirk, not fixable.

## In scope

- Sections by type with an empty row between them; update date; legend row and the empty row after it; no pink for not-done stages; thin borders — in the points sheet(s), Hebrew and Russian.
- The «Progress by rack» sheet.
- Profile fields: sections tick, rack-sheet tick, order of point types; defaults for existing profiles.
- The same build in the app's «Обновить» and the nightly server job.
- The in-app guide line for the new ticks; English and Hebrew for the new UI strings.
- The list of old Drive files (this file).

## Out of scope

- The rack and label sheet «תכנון ארונות ושילוט» — the owner has no remarks.
- Percents in the totals row (owner: not needed).
- Colouring only the status and stage cells (owner: keep the whole row coloured).
- Ordering point types in Settings — the order lives in each profile.
- Deleting anything on Drive.
- AppSheet itself (the app on appsheet.com) — the owner turns it off there.

## Pulled-in known issues and wishes

- `KNOWN_ISSUES.md`: the only open entry, KI-3 (same-code runs), is about tools, not this stage.
- «Ревью 2» wishes are for the NAS project and stage 4; none fits here.
- Open tail from `PROJECT_CONTEXT.md` («possible management-sheet tweaks and a list of old Drive files») — this stage.

## Decisions taken with the owner

1. **Sections by type, rack sheet, legend, update date, less pink** — asked by the owner's boss and the owner (2026-11-16); management asked for more readability.
2. **No percents in the totals row** — the rack sheet carries the progress.
3. **The whole row keeps its status colour** — the owner chose the current look over colouring only status cells; the sheet must not get more colourful.
4. **Section order:** the owner wants the order of the types list but cannot set it today. Proposal in this description: the profile's point-types list gets ↑↓ arrows (as the columns list has), and the sections follow it; with no type ticked (all types) the order is still the list's order. The owner confirms or changes this at «Коммит».
5. **In every profile, with ticks**, both on by default.
6. **Spacing and look of sections** (owner's remarks on the mockup, chosen from several variants): one empty row after the legend, two empty rows between sections; the section row white with large bold dark-blue text in a thick dark-blue frame; the column header in the same frame, its colour unchanged.
7. **AppSheet is not needed** — its files go into the delete list.
8. **The rack sheet «תכנון ארונות ושילוט» stays as it is.**

## Old files on Google Drive — for the owner to delete

Found 2026-11-16 by a read-only search of the owner's Drive. No links here (public repo); the session gave the links in chat.

**Delete — replaced by the app's sheets:**
1. «Статус объекта — для руководства» — My Drive root, 2026-10-02. The old template with formulas; its cells show `#ERROR!`.
2. «סטטוס נקודות – מגה אור – Megason» — My Drive root, 2026-10-17. An early sheet built on the old template, with copies of the data sheets (Проекты, Точки, Журнал, Типы точек, Конфигурации). The app's sheets live in «Менеджер проектов → <project> → Для руководства».

**Delete — AppSheet (owner: not needed):**
3. «Полевой журнал — данные приложения» — My Drive root. The AppSheet data sheet. **It changed on 2026-11-16 at 18:35 UTC**: something (AppSheet or an old Apps Script trigger) still writes to it or someone edited it. Before deleting: turn the AppSheet app off on appsheet.com and, if wanted, download a copy (File → Download → Microsoft Excel). The app's own data does not depend on it (imported long ago; backups every 2 days).
4. «Полевой журнал — данные приложения (резерв v1.0, чистая)» — My Drive root, 2026-10-03. A copy of the same.
5. Folder «appsheet» — My Drive root, made by AppSheet (inside: `data/…/empty.txt`).

**Owner decides:**
6. «Mega Or – Megason – Расширенная» — «Менеджер проектов → Mega Or», last updated 2026-10-10, not refreshed since. Not needed → delete the file and the «Расширенная» profile of that project in the app (otherwise «Обновить» makes a new file).
7. «polevoy-zhurnal-v1.0.zip» and «polevoy-backups-main.zip» — «Менеджер проектов», 2026-10-23. Hand-made archives of version 1.0 and of the backups; the same is in git (`release-*` branches) and in the private backups repo.
8. «תכנון ארונות תקשורת - בית שמש.xlsx» four times and «… (1).xlsx» — My Drive root, 2026-11-03…12. Not the app's files (downloads); keeping the newest is enough.

**Nothing to do:** five old sheets are already in the Drive trash (among them «ШАБЛОН — статус для руководства (не удалять)» and two test sheets «סטטוס נקודות – тестовый…»); Google empties the trash after 30 days. Do not delete in «Менеджер проектов» anything else: drawings, backups, «Инструкции» (the guide points to those files) and the «Для руководства» folders are in use.

## Open questions for the spec

1. **Update date and the hash.** Write the date cell on every refresh (one small write even when the data is unchanged, so it reads "checked at"), or show the time of the last data change? Proposal: every refresh, app and server.
2. **Percent base on the rack sheet:** points whose type has the stage (so 100% is reachable), with «—» when no point of the rack has it.
3. **Points without a type or with a deleted type:** a last section «ללא סוג» / «Без типа».
4. **«Каждый шкаф на отдельном листе» layout:** sections inside each rack sheet; one rack-progress sheet for the file.
5. **Filter and sort by managers:** the basic filter stays; section and empty rows hide under a status filter and scatter under a sort. Keep the filter, or limit it?
6. **Legend and section texts** in Hebrew and Russian; the owner checks the Hebrew (as with the status captions in `report.js`).
7. **Frozen rows:** 7 instead of 6 (title, project and date, totals header, totals, legend, empty row, column header) — check it is not too tall on the phone in the Google Sheets app.
8. **Excel export:** keep it as now, or give it the sections too.
9. **Storing the type order** when no type is ticked (all types): a separate order list in the profile, or the ticked list with all types.
10. **Rack-sheet name clash:** with «Каждый шкаф на отдельном листе», a rack named like the progress sheet — make names unique, as rack names already are.
