Status: accepted

# Stage 3. Management sheets — spec

Built from `description.md` (accepted 2026-11-16) and its mockups. No ideas are filed for the stage. Words: `CONTEXT.md` («Management sheets», «Point type», «Rack»).

Code today: `src/domain/report.js` builds the sheets (`buildReport` → `{ title, sheets, hash, pointCount, colCount }`), `src/app/managers.js` turns them into Sheets API requests (`sheetRequests`, `rebuildSheets`, `syncTable`), `scripts/server-tables-lib.mjs` calls `syncTable` at night, `src/domain/export.js` reuses `buildReport` for Excel, `src/app/views/tables.js` holds the profile form.

## 1. Answers to the open questions

| # | Question | Answer |
|---|---|---|
| 1 | Update date and the hash | Written on every refresh (app button and night job), even when the data has not changed: it means "checked at". The date is not part of the hash. When the data is unchanged, one small write of the date cells only (§3.4). |
| 2 | Percent base on the rack sheet | Points of the rack whose type has the stage. No such point → «—». Percents are rounded down, so 100% appears only when every point is done (§4). |
| 3 | Points without a type or with a deleted type | One last section «ללא סוג» / «Без типа». |
| 4 | Layout «Каждый шкаф на отдельном листе» | Sections inside each rack's sheet (counts per sheet); one rack sheet for the whole file, last tab. |
| 5 | Filter and sort by managers | The basic filter stays, over the column header, sections and points. The «Для руководства» folder is shared view-only, and viewers' sorts and filters are temporary and only theirs, so they cannot scatter the sheet for others. An editor's sort scatters the sections until the next rebuild — `KNOWN_ISSUES.md` entry (§9). |
| 6 | Legend and section texts | §2.3, §2.4, §4.2; the owner checks the Hebrew live (§8.2). |
| 7 | Frozen rows | 7 with totals (5 without); the owner checks the height on the phone (§8.2). |
| 8 | Excel export | Unchanged: a flat list (no sections, no legend, no rack sheet); it is for work, sort and filter in Excel. |
| 9 | Storing the type order | A separate profile field `typeOrder` with the order of all types; `types` stays the filter (empty = all). New types join the end by name (§5.1). |
| 10 | Rack-sheet name clash | The rack sheet keeps its name; a rack sheet of «Каждый шкаф на отдельном листе» with the same name gets « (2)», as clashing rack names already do. |

## 2. Points sheet

Applies to every points sheet of every profile (layout «one» — the sheet «סטטוס» / «Статус»; layout «perCabinet» — each rack's sheet), Hebrew (right to left) and Russian.

### 2.1 Rows from the top

With «Итоги сверху» on (row numbers 1-based, as the manager sees them):

| Row | Content |
|---|---|
| 1 | Title, as now («סטטוס התקדמות נקודות» / «Статус выполнения точек») |
| 2 | Project name in A2, as now; update date in E2 (§2.2) |
| 3 | Totals header, unchanged |
| 4 | Totals values, unchanged (counts only) |
| 5 | Colour legend (§2.3) — was empty |
| 6 | Empty |
| 7 | Column header |
| 8… | Points, with sections when on (§2.4) |

With «Итоги сверху» off: 1 title, 2 project and date, 3 legend, 4 empty, 5 column header. Frozen rows = up to and including the column header (7 or 5).

### 2.2 Update date

- Cell E2 (fifth column) on every points sheet and the rack sheet. Fixed, so the date-only write knows where it goes; the sheet already has at least 7 columns (the totals use 7). A2's project name overflows into B2–D2, which stay empty.
- Text (a string, written `RAW`): `עודכן: DD/MM/YYYY HH:MM` / `Обновлено: DD/MM/YYYY HH:MM`, 24-hour, Israel time (`Asia/Jerusalem`, summer time included). Example: the run at 2026-11-16 00:00 UTC → «עודכן: 16/11/2026 02:00»; 2026-07-01 00:00 UTC → «… 01/07/2026 03:00».
- The time is the moment of the refresh (`now`), the same on all sheets of one file.
- Look: normal weight, grey `#5F6368`, default alignment.
- New pure helper `stampText(date, lang)` in `src/domain/managers.js` (Intl `formatToParts` with `timeZone: 'Asia/Jerusalem'`, `hourCycle: 'h23'`; works in browsers and Node 22).

### 2.3 Colour legend

Six cells A–F of the legend row, each with its background and a thin `#C4C8CC` frame, text centred, wrap on (the row grows if a text does not fit; nothing is cut):

| Colour | Hebrew | Russian |
|---|---|---|
| green `#C6E5C9` | בוצע | Выполнено |
| yellow `#FFF2B3` | בתהליך | В работе |
| orange `#FFE0B2` | בוצע חלקית | Частично |
| red `#F4B6B6` | תקלה | Неисправность |
| grey `#EFEFEF`, text `#8C8C8C` | — לא רלוונטי לסוג | — не относится к типу |
| white | ריק — טרם בוצע | Пусто — ещё не сделано |

Always A–F, also when the profile has fewer than 6 columns. The legend is shown in every profile, independent of the two new ticks. It sits above the column header, so the highlight rules (which start under the header) never touch it.

### 2.4 Sections by point type (tick «Разделы по типам точек», on by default)

- Points are grouped by type; groups follow the profile's type order (§5.1); «Без типа» last. Inside a group, points keep today's order (`comparePoints`). A type with no points on this sheet gets no section.
- «Без типа» holds points with no `typeId` and points whose type is no longer in the project's types (deleted). Their «Тип» cell shows what it shows today.
- Before each group, a section row: in column A only, `<type name> — <count>`:
  - type name: Hebrew sheet — the type's `nameHe` (as written in the pool, often singular: «מצלמה»), else its id; Russian sheet — the id (the Russian name), as in the «Тип» column;
  - count, Hebrew: 1 → «נקודה אחת», otherwise «N נקודות»; Russian: «1 точка», «2 точки», «5 точек», «21 точка», «12 точек» (usual plural rule: n%10 = 1 and n%100 ≠ 11 → «точка»; n%10 in 2–4 and n%100 not in 12–14 → «точки»; else «точек»);
  - no-type section: «ללא סוג — …» / «Без типа — …».
- Two empty rows between the last point of a group and the next section row; none between the column header and the first section, none after the last group.
- Section row look: white, bold, font size 12, text `#1F3B5C`, row height 28 px, a thick (`SOLID_THICK`) `#1F3B5C` frame around the whole row (columns A to the last column of the profile), no vertical lines inside. Its alignment is cleared to the default (start of the line), so the text runs over the empty cells of the row in both directions of writing — the same way the title in row 1 does today. Cells are not merged: merged cells would block sorting and the filter.
- The section count is the points of that group on that sheet (with «perCabinet» — on that rack's sheet).
- Tick off: no section rows and no empty rows between groups; points in today's order.

### 2.5 Colours and borders

- A stage not done yet stays white: the conditional rule «empty stage cell → pink» (`kind: 'blank'`) is removed; `COLORS.pink` goes. The other rules stay (date → green, «—» → grey, partial → orange; status and check-result rules unchanged).
- The point row keeps its status colour on the information columns (`ROW_COLOR`), unchanged. Section and empty rows get no colour.
- Thin borders: every block of consecutive point rows (each group; without sections — all points) gets thin solid `#D0D4D9` borders on all cell sides. Empty rows between groups get no borders of their own.
- Column header: background `#1F3B5C` and white bold text unchanged; a thick `#1F3B5C` outer frame like the section rows; thin `#8FA3BA` lines between its cells.
- Order of format requests: point-row borders, then section frames, then the header frame (later borders win on shared edges).

### 2.6 Unchanged

Totals rows, title, column widths, date format `dd/mm/yyyy`, values only (no formulas in cells), the basic filter (now from the header to the last row, sections included), file name, links.

## 3. Build, write, hash

### 3.1 Sheet object

`sheetOf` (points) and the new `rackSheetOf` return, besides today's fields:

- `stamp: { row: 1, col: 4, text }` — kept out of `rows` (so out of the hash) and written by `rebuildSheets` together with the rows;
- `frozenRows`, `frozenCols` (points: header row + 1 and 0; rack sheet: 5 and 1);
- points sheet: `legendRow`, `sectionRows` (row indexes), `pointRuns` (`[first, end)` row ranges of consecutive point rows), `rowColors` aligned to every row under the header (`''` for section and empty rows);
- rack sheet: `kind: 'racks'` and what its format needs (§4.3).

`sheetRequests` keeps one entry point and picks the points or rack format by `kind`.

### 3.2 `buildReport(project, ctx, table, { nameOf, now })`

- `now` defaults to `new Date()`; tests pass a fixed date.
- Sheets: the points sheet(s) as today, then the rack sheet when `table.rackSheet !== false`.
- `sections` on when `table.sections !== false`; rack sheet on when `table.rackSheet !== false` (existing profiles have neither field → both on).
- `STYLE_V` 3 → 4: every sheet is rebuilt once on its next refresh after the deploy.
- `hash` as today over the sheets (titles, direction, rows, column ids, row colours) — the rack sheet is included by being in `sheets`; the stamp is not.
- `pointCount` — points that pass the filters (unchanged); `colCount` — the profile's columns (unchanged).

### 3.3 `rebuildSheets`

As today (add new sheets, delete old ones, format, write values), plus: `frozenColumnCount` from `frozenCols`; merges of the rack header; the stamp cell of each sheet goes into the same values write (`'<title>'!E2`).

### 3.4 `syncTable(api, project, ctx, table, { …, now })`

- Data changed (or `force`): `rebuildSheets`, as today.
- Data unchanged: one `api.write` with the stamp cells of all sheets (`'<title>'!E2` → `[[text]]`), then the rename check as today. The message stays «Таблица «…»: данные не менялись, она актуальна»; `changed: false`.
- The stamp-only write fails (for example an editor renamed a tab, so the range does not parse): rebuild the file instead (`rebuildSheets`, new hash, `changed: true`). If the rebuild also fails, the error is reported as today (with `e.patch`).
- `managersfolder.js` and `views/project.js` call it without `now` (the current time).

### 3.5 Night job

`updateProjectTables(api, project, data, now)` passes its `now` to `syncTable`, so the stamp equals the job's start time. The report line stays «без изменений» / «обновлена (точек N)».

### 3.6 Excel export

`exportSheets` builds with `sections: false, rackSheet: false` and keeps taking the rows from the column header down (`rows.slice(headerRow)`), so the legend and the stamp do not reach Excel. The «Точки» sheet of the export is the same as today.

## 4. Sheet «Progress by rack»

### 4.1 Rows

Tab name and title: «התקדמות לפי ארון» / «Итоги по шкафам». Last tab of the file.

| Row | Content |
|---|---|
| 1 | Title |
| 2 | Project name in A2, update date in E2 (§2.2) |
| 3 | Empty |
| 4–5 | Two-level header (§4.2) |
| 6… | One row per rack |
| last | Total row |

Columns (12): rack · total points · pulled (count, %) · terminated (count, %) · installed (count, %) · tested (count, %) · partly installed · faults. The four stages are those of the totals row; shilut is not included (it is not in the totals either).

### 4.2 Texts

| Cell | Hebrew | Russian |
|---|---|---|
| A4 | ארון | Шкаф |
| B4 | סה״כ נקודות | Всего точек |
| C4, E4, G4, I4 (over two columns) | הושחל · חווט · הותקן · נבדק | Протянуто · Захивучено · Установлено · Проверено |
| row 5 under each stage | כמות · % | Кол-во · % |
| K4 | הותקן חלקית | Установлено частично |
| L4 | תקלות | Неисправно |
| rack without a rack | ללא ארון | Без шкафа |
| total row, A | סה״כ | Итого |

The header texts reuse the totals texts (`T.sum`).

### 4.3 Values

- Points: the same filtered list as the points sheets (the profile's racks, types and statuses). Racks: natural order (`localeCompare` with `numeric: true`, as the profile form sorts them), «Без шкафа» last. A rack with no filtered points has no row.
- Total points: the rack's points.
- For each stage S: base = the rack's points whose type has S (the same test that writes «—» in the points sheet: a composite point's `info.stages`, else the type's `stages`; an unknown type counts as having every stage). Done = points in the base with S done: pulled — `info.pulled`; terminated — `info.hived`; installed — `info.install === 'Установлено'`; tested — `info.checked`. A point outside the base is never counted as done (a stray journal row cannot give more than 100%).
- Percent = ⌊done × 100 / base⌋ / 100, written as a number with format `0%` (so 199 of 200 shows 99%, never 100%). Base 0 → «—» in both the count and the percent cell.
- Partly installed: `info.install` starts with «Установлено »; faults: status «Неисправна» — the same tests as the totals row.
- Total row: sums of the racks; its percents from the summed done and base.
- No filtered points at all: header and a total row with 0 and «—».

### 4.4 Look

- Header rows 4–5: background `#1F3B5C` (row 5 cells under the stages `#2E5481`, normal weight), white text, centred; merged: A4:A5, B4:B5, K4:K5, L4:L5 and each stage's pair in row 4.
- Rack names bold. All table cells: thin `#D0D4D9` borders, centred.
- Total row: bold, background `#E8EEF5`, thick `#1F3B5C` top border.
- Only a stage done at 100% (done = base > 0) is coloured: both its count and percent cells green `#C6E5C9` — rack rows and the total row. No other colour, no highlight rules, no filter.
- Frozen: rows 1–5 and column A. Widths: A 110, B 95, count 70, percent 60, K 110, L 85 px.

Changed in ticket 3.3 by the owner on browser mockups (`docs/history.md`, 2026-11-16) and live in this form: header level 1 `#3C6EA5` with white bold text, level 2 `#DCE6F2` with navy text; every stage with done > 0 gets a progress colour on both its cells, a blend from dark yellow `#E6B422` (1%) to the green `#C6E5C9` (100%), 0 and «—» white; rack names bold and centred on `#EEF1F5`; the blocks (rack + total points, each stage, partly installed + faults) framed in navy (`SOLID_MEDIUM`) from the top of the header to the total row, a dotted line between a stage's count and percent, teal `#12A3A3` lines between racks, a thick navy outer frame and top of the total row; row heights 34 / 24 / 30 / 34 px. The code: `rackSheetRequests` in `src/app/managers.js`.

## 5. Profile and form

### 5.1 Data (`project.tables[]`)

| Field | Type | Absent means | Meaning |
|---|---|---|---|
| `sections` | boolean | `true` | Sections by point type |
| `rackSheet` | boolean | `true` | Add the rack sheet |
| `typeOrder` | string[] (type ids) | by name | Order of the point types for sections and the form |

- No migration: existing profiles get both on through the defaults; `defaultTables()` writes `sections: true, rackSheet: true`.
- `typeOrderOf(table, ctx)` in `report.js` (used by the build and the form): the ids of `typeOrder` that still exist in `ctx.types`, in that order, then the remaining types sorted by id (`localeCompare('ru', { numeric: true })`). Deleted types in `typeOrder` are skipped, not removed.
- `types` (the filter) is unchanged: an empty list = all types. Its order no longer matters.
- Firestore rules do not check `tables` fields: nothing to change there.

### 5.2 Form «Таблица «…»» (`tableForm` in `src/app/views/tables.js`)

- The field «Типы точек» becomes a list with a tick and ▲▼ per type (the same widget look as «Столбцы»), a «Все» row on top (ticking it clears the ticks, as today), types in `typeOrderOf` order. Label «Типы точек (порядок разделов стрелками)», hint «Ничего не отмечено — все типы. Разделы в таблице идут в этом порядке.»
- On «Сохранить»: `typeOrder` = the whole list as ordered; `types` = the ticked ones.
- Two new ticks right after «Итоги сверху (всего, протянуто, захивучено…)»:
  - «Разделы по типам точек», hint «Перед точками каждого типа — строка с его названием и числом точек»;
  - «Лист „Итоги по шкафам“», hint «Отдельный лист: сколько точек каждого шкафа протянуто, установлено, проверено, в процентах».
  Both ticked for a new profile and for a profile without the fields.
- The preview line stays «Будет точек: N, столбцов: M, листов: K» and counts the rack sheet.
- The profile card on the screen is unchanged.

### 5.3 New UI strings

Into `src/i18n/src/09-wizard-tables.json`, then `node scripts/i18n-build.mjs`:

| Russian | English | Hebrew |
|---|---|---|
| Типы точек (порядок разделов стрелками) | Point types (section order with arrows) | סוגי נקודות (סדר המקטעים בחצים) |
| Ничего не отмечено — все типы. Разделы в таблице идут в этом порядке. | Nothing ticked — all types. Sections in the sheet follow this order. | לא סומן דבר — כל הסוגים. המקטעים בטבלה מופיעים בסדר הזה. |
| Разделы по типам точек | Sections by point type | מקטעים לפי סוג נקודה |
| Перед точками каждого типа — строка с его названием и числом точек | Before the points of each type — a row with its name and number of points | לפני הנקודות של כל סוג — שורה עם שמו ומספר הנקודות |
| Лист „Итоги по шкафам“ | “Progress by cabinet” sheet | גיליון „התקדמות לפי ארון” |
| Отдельный лист: сколько точек каждого шкафа протянуто, установлено, проверено, в процентах | A separate sheet: how many points of each cabinet are pulled, installed and tested, in percent | גיליון נפרד: כמה נקודות בכל ארון הושחלו, הותקנו ונבדקו, באחוזים |

(The app's English says «cabinet» for a rack, as in «Cabinets & labels».)

### 5.4 Guide line

In `src/app/views/guide.js`, section `data`, after the line about «🔄 Обновить таблицу для руководства», one line (into the guide dictionary with its translations):

- RU: «• В таблице для руководства точки идут разделами по типам (порядок — стрелками в списке «Типы точек» формы таблицы), есть лист «Итоги по шкафам» с процентами, а во второй строке — «Обновлено»: время последнего обновления, ночью или кнопкой. Разделы и лист выключаются галочками в форме таблицы.»
- EN: «• In the management sheet the points come in sections by type (the order is set with the arrows in the «Point types» list of the sheet's form), there is a «Progress by cabinet» sheet with percentages, and the second row shows «Updated»: the time of the last refresh, at night or by the button. Sections and the sheet are turned off with ticks in the sheet's form.»
- HE: «• בטבלה להנהלה הנקודות מסודרות במקטעים לפי סוג (הסדר נקבע בחצים ברשימת «סוגי נקודות» בטופס הטבלה), יש גיליון «התקדמות לפי ארון» עם אחוזים, ובשורה השנייה מופיע «עודכן»: זמן העדכון האחרון, בלילה או בכפתור. את המקטעים ואת הגיליון אפשר לכבות בתיבות הסימון בטופס הטבלה.»

## 6. External services

- Google Sheets API `spreadsheets.batchUpdate` and `values.batchUpdate` (`valueInputOption: RAW`), as today, through `realApi` (app) and the server's own `api` (`scripts/server-tables.mjs`). No new endpoints, scopes or quotas.
- New request kinds: `updateBorders` (styles `SOLID`, `SOLID_THICK`, `NONE`), `mergeCells` (`MERGE_ALL`), `updateDimensionProperties` for `ROWS` (section height), `gridProperties.frozenColumnCount`, `numberFormat { type: 'PERCENT', pattern: '0%' }`. All are standard Sheets API v4 fields; not yet sent by this app.
- Not checked against a real response in this spec (it would mean creating a file on the owner's Drive). Ticket 01 checks its requests on a real test spreadsheet if the owner allows the session to create one through the Google Sheets connector (the owner deletes it afterwards); otherwise the first real run is the owner's «Обновить». `batchUpdate` is all-or-nothing: an invalid request fails the whole batch before anything changes, the old sheets stay and the app shows the error — the live sheet cannot be half-broken.
- Volume: a rebuild is still one `batchUpdate` and one values write per file. The date adds one values write per file per refresh when the data is unchanged (a few per night, far under the 60 writes per minute limit).
- Files change every night now (the date), so Drive shows a fresh «last modified» on them — expected.

## 7. Edge cases

| Case | Expected |
|---|---|
| No points pass the filters | Points sheet: title, project and date, totals (zeros), legend, header, no sections. Rack sheet: header and a total row with 0 and «—». |
| A type ticked in `types` but no points of it | No section for it. |
| New type added to the pool after `typeOrder` was saved | Its section comes after the ordered types, by name; in the form it shows at the end of the list. |
| Type deleted while in `typeOrder` | Skipped in the order; its points go to «Без типа». |
| Profile filtered to one type | One section (when the tick is on). |
| «perCabinet» with sections | Each rack sheet has its own sections and counts; one rack sheet at the end. |
| Rack named «Итоги по шкафам» / «התקדמות לפי ארון» with «perCabinet» | That rack's sheet becomes «… (2)»; the rack sheet keeps the name. |
| Profile with fewer than 5 columns | Date still in E2, legend still A–F (outside the table columns). |
| Data unchanged, an editor renamed a tab | Date-only write fails → full rebuild (§3.4). |
| Data unchanged, file deleted or no access | As today: the app's message or the server's «не видит файл» error in the profile. |
| An editor sorted the points sheet | Sections scatter until the next rebuild (data change or style version) — known issue (§9). Viewers' sorts are their own and temporary. |
| Stage done for a point whose type lacks the stage | Shown «—» in the points sheet (as today); not counted on the rack sheet. |
| 199 of 200 done | 99%, not green. |
| Point with an unknown type on the rack sheet | Counted in every stage's base. |
| Both ticks off | Points sheet as today apart from the legend, date, no pink, borders; one sheet (or rack sheets). |
| Excel export | Unchanged (§3.6). |
| Summer and winter time | Date in Israel time with the right offset (+3 / +2). |

## 8. Tests

### 8.1 Automated (`tests/domain.test.js`, node:test, existing `reportData` fixture extended)

1. `stampText`: 2026-11-16T00:00Z → «עודכן: 16/11/2026 02:00» and «Обновлено: 16/11/2026 02:00»; 2026-07-01T00:00Z → «… 01/07/2026 03:00».
2. Row layout with and without totals: legend texts in row 5 (or 3), empty row, header at index 6 (or 4); `frozenRows` 7 (or 5); `stamp` `{ row: 1, col: 4 }`, not in `rows`.
3. Sections: order by `typeOrder`, unlisted types after it by name, «Без типа» last (no type and a deleted type); section texts in Hebrew and Russian with the plural forms (1, 2, 5, 21, 12); two empty rows between groups, none before the first and after the last; `rowColors` `''` on section and empty rows.
4. Sections tick off: points in today's order, no section rows.
5. `perCabinet` with sections: sections per sheet with their own counts; rack sheet last; a rack named like the rack sheet becomes «… (2)».
6. Rack sheet: counts, percents rounded down (a 199-of-200 case), «—» for a stage no point of the rack has, a stray done row outside the base not counted, «Без шкафа» last, natural rack order, total row sums and percents, filters respected, `rackSheet: false` → no sheet.
7. Hash: the same data with a different `now` → the same hash; `STYLE_V` part of it; turning a tick changes it.
8. `sheetRequests` (stub): no `blank` rule and no pink; `updateBorders` thick on section rows and the header; section rows' alignment cleared; rack sheet merges, percent format, green only on full stages, `frozenColumnCount: 1`.
9. `syncTable` (stub api): unchanged data → exactly one `write` with the stamp ranges of all sheets and no `batch`; a failing stamp write → `batch` + `write` and `changed: true`.
10. Night job: `updateProjectTables` passes its `now` — the written stamp text matches it.
11. Export: `exportSheets` «Точки» rows are unchanged (no legend, no sections).
12. Profile: `typeOrderOf` with missing, partial and stale `typeOrder`; `defaultTables()` has both ticks.
13. Existing tests keep passing; where they read `rows[3]` for totals or `headerRow + 1` for the first point they are updated to the new layout (a section row may now come first).

### 8.2 Owner checks live (per ticket, on the iPhone and in the browser)

- After «🔄 Обновить» of the main table: sections with their counts and frame; two empty rows between them; the legend; «עודכן: …» with the current Israel time; stage cells not done are white; thin borders; the header frame. Hebrew texts of the legend and sections read right (the owner corrects them if not).
- Frozen 7 rows are not too tall in the Google Sheets app on the phone.
- The rack sheet: numbers match the points sheet for one rack counted by hand; only full stages green.
- The next morning: the date shows the night run time (02:00 or 03:00) though nothing changed.
- The profile form: arrows move types, the sheet's sections follow after «Обновить»; ticks turn sections and the rack sheet off and on.
- What only the owner can see: real Sheets rendering (RTL overflow of the section text, thick borders), the phone app, the night job.

## 9. Docs to update

- `CONTEXT.md`, under «Management sheets»: **Section** (code: `sectionRows`; UI: «Разделы по типам точек») — a heading row before the points of one type with its name and count. **Rack sheet** (UI: «Итоги по шкафам», Hebrew «התקדמות לפי ארון») — per-rack progress sheet in the same file. **Update stamp** (code: `stamp`) — «עודכן: …» in E2, the time of the last refresh, written even when the data is unchanged.
- `KNOWN_ISSUES.md`: new entry — an editor's sort of the points sheet scatters section and empty rows until the next rebuild (data change); viewers are not affected. Workaround: change anything or wait for a data change; not fixed because a forced rebuild on every press would cost a full rewrite.
- `docs/code-map.md`: rebuilt by the tool from header comments (`report.js`, `managers.js` header updated for sections, legend, stamp and the rack sheet).
- In-app guide: §5.4.
- No new ADR: the stamp-every-refresh rule is small and lives here and in `CONTEXT.md`; ADR 0009 (values only, built from scratch, server refresh) still holds.
- `docs/project-spec.md`: no change of later stages.

## 10. Proposed tickets

| # | Ticket | Spec | Complexity | Blocked by |
|---|---|---|---|---|
| 01 | Points sheet look: legend, empty row, update stamp (`stampText`, stamp out of the hash, date-only write with rebuild fallback, `now` through the night job), no pink, thin borders, header frame, `frozenRows`, `STYLE_V` 4; real-sheet check of the new requests if the owner allows | §2.1–2.3, 2.5, 2.6, 3.1–3.5, 6 | medium | — |
| 02 | Sections by type: grouping, `typeOrderOf`, «Без типа», section rows and their format, «perCabinet», export flags, `defaultTables` ticks, `sections` default | §2.4, 3.6, 5.1 | medium | 01 |
| 03 | Rack sheet: `rackSheetOf`, values and percents, format, merges, frozen column, name clash, `rackSheet` default | §4, 3.2, 3.3 | medium | 01 |
| 04 | Profile form: type list with arrows and `typeOrder`, two ticks, translations, guide line; `CONTEXT.md` terms and the known issue | §5.2–5.4, 9 | simple | 02, 03 |

02 and 03 both touch `report.js` and `managers.js`: one after the other, not in parallel. Each ticket goes live and is checked by the owner on its own (ADR 0011); with 01 alone the sheet already gets the legend, the date and less pink.
