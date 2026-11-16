Status: in review
Complexity: medium
Blocked by: —

# 01. Points sheet look: legend, update stamp, borders

The management points sheet gets the colour legend, the «Обновлено» date in E2 (written on every refresh, even when the data is unchanged), white not-done cells (no pink), thin borders and a framed column header. No sections and no rack sheet yet (tickets 02 and 03); the build structures they need are laid down here.

## Spec sections

§2.1–2.3, §2.5 (without section frames), §2.6, §3.1–3.5, §6, §7 (rows «No points pass the filters», «Profile with fewer than 5 columns», «Data unchanged, an editor renamed a tab», «Summer and winter time»), §8.1 items 1, 2, 7, 8 (the points-sheet part), 9, 10, 13.

## What to do

1. `src/domain/managers.js`: pure `stampText(date, lang)` (§2.2: Intl `formatToParts`, `Asia/Jerusalem`, `hourCycle: 'h23'`, `עודכן:` / `Обновлено:`).
2. `src/domain/report.js`:
   - `buildReport(project, ctx, table, { nameOf, now })`; `now` defaults to `new Date()`; `STYLE_V` 3 → 4 (§3.2).
   - `sheetOf` rows from the top as §2.1 (title, project, totals, **legend**, empty row, header; without totals: title, project, legend, empty, header), the legend texts of §2.3 in Hebrew and Russian, always columns A–F.
   - New fields of the sheet object (§3.1): `stamp: { row: 1, col: 4, text }` kept out of `rows` and out of the hash; `frozenRows` (header row + 1); `legendRow`; `sectionRows` (empty for now); `pointRuns` (one run of all points for now); `rowColors` aligned to every row under the header. These are what ticket 02 fills with sections.
   - Remove the `blank` highlight rule and `COLORS.pink` (§2.5).
3. `src/app/managers.js`:
   - `sheetRequests`: legend cells (backgrounds, `#C4C8CC` frames, wrap, centred); thin `#D0D4D9` borders on every block of point rows (`pointRuns`); header thick `#1F3B5C` frame and thin `#8FA3BA` lines between header cells; `frozenRowCount` from `frozenRows`; stamp cell look (grey `#5F6368`, normal weight). Order: point-row borders, then the header frame (§2.5). New request kinds are listed in §6 (`updateBorders`: `SOLID`, `SOLID_THICK`, `NONE`).
   - `rebuildSheets`: write each sheet's stamp cell (`'<title>'!E2`, `RAW`) in the same values write (§3.3).
   - `syncTable(api, project, ctx, table, { …, now })`: data unchanged → one `api.write` with the stamp cells of all sheets, then the rename check; message and `changed: false` as today. A failing stamp write → full rebuild, new hash, `changed: true`; if that fails too, the error is reported as today (with `e.patch`) (§3.4).
4. `scripts/server-tables-lib.mjs`: `updateProjectTables(api, project, data, now)` passes `now` to `syncTable` (§3.5). `managersfolder.js` and `views/project.js` stay without `now`.
5. `src/domain/export.js`: `exportSheets` takes the rows from the column header down (`rows.slice(headerRow)`) so the legend and the stamp do not reach Excel (§3.6). The «Точки» sheet stays as today.
6. Update existing tests that read `rows[3]` or `headerRow + 1` to the new layout (§8.1 item 13).
7. Real-sheet check (§6): ask the owner, with `AskUserQuestion`, whether this session may create a test spreadsheet on their Drive through the Google Sheets connector. If yes: send the ticket's requests (`updateBorders`, `mergeCells` is not needed yet) to it, confirm the API accepts them and look at the result; tell the owner to delete the file afterwards (never delete it yourself). If no: say so in the owner check, the first real run is the owner's «🔄 Обновить таблицу для руководства».
8. Header comments of every module changed; `node tools/code-map.mjs`.

## Done when

- A refresh of a profile with totals gives rows 1–8 as §2.1; without totals as the second table of §2.1. The legend has six cells with the §2.3 texts.
- E2 holds «Обновлено: DD/MM/YYYY HH:MM» (or the Hebrew form) in Israel time on every points sheet; the same data refreshed twice keeps the same `hash` and only the stamp changes.
- Not-done stage cells are white; the other highlight rules are unchanged.
- `npm test` passes (192 tests plus the new ones), `npm run build` passes, `node tools/code-map.mjs --check` exits 0.
- Self-check of `docs/workflow.md` done in `?mem=1`: the stub Sheets API (`window.__gcalls`) shows the new requests; the page of the profile opens.

## Tests to add

`tests/domain.test.js` (existing `reportData` fixture), as §8.1:
- item 1: `stampText` for 2026-11-16T00:00Z and 2026-07-01T00:00Z, both languages;
- item 2: row layout with and without totals, `frozenRows` 7 or 5, `stamp` `{ row: 1, col: 4 }` not in `rows`;
- item 7: same data with a different `now` → same `hash`; `STYLE_V` part of it;
- item 8 (this ticket's part): no `blank` rule, no pink; header and legend requests;
- item 9: `syncTable` with a stub api — unchanged data → exactly one `write` with the stamp ranges and no `batch`; a failing stamp write → `batch` + `write`, `changed: true`;
- item 10: `updateProjectTables` passes its `now`: the written stamp text matches it.

## Owner check

On the phone, after the site updates:
1. Open the project → «Таблицы» (the management sheet profile) → «🔄 Обновить таблицу для руководства», then open the Google file.
2. Row 2 shows «Обновлено / עודכן: …» with the current Israel time; row 5 (or 3 without totals) is the colour legend with six cells; the column header sits in a dark frame.
3. Cells of stages not done are white (not pink); the points have thin borders; the first 7 rows stay on top when scrolling and are not too tall in the Google Sheets app.
4. Press the refresh again without changing anything: the time in row 2 changes, the table does not.
5. The next morning: the time shows the night run (02:00 or 03:00 Israel time) though nothing changed.
6. Hebrew texts of the legend read right (tell me what to correct).
