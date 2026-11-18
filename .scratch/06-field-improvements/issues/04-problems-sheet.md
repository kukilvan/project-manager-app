Status: accepted
Complexity: medium
Blocked by: 03

# 04. Problems in the management sheet

The management sheet gets the column «Проблема» / «בעיה», a red row for a point with an open problem and a 7th legend cell. The sheet style version goes up so every sheet is rebuilt once. Idea 003, the sheet part.

## Spec sections

§3.7, §7 (Google Sheets, nightly job rows), §9 (`report.js`).

## What to do

1. `src/domain/report.js`: the column `{ id: 'problem', ru: 'Проблема', he: 'בעיה', w: 260 }` after «Причина задержки» in `COLUMNS`; the cell (open problems of the point, one per line, oldest first, `problemLabel` in the sheet's language, solved hidden); the row colour `#E57373` over any status colour on the informational columns (stage and status cells keep their rules); the legend cell G «Есть проблема» / «יש בעיה»; both default profiles get the column (`t_main` after «checked», `t_ext` after «delay»); `STYLE_V` 7 → 8.
2. `src/app/managers.js` `sheetRequests`: `wrapStrategy: 'WRAP'` on the problem cells; the legend range A–G. Check that the legend, the filter range and the frozen header still use the right last column.
3. Profile form («Таблицы для руководства»): the column appears among the ticks (saved profiles are not changed — the owner ticks it).
4. Nightly job (`scripts/server-tables.mjs` and its lib): `problemMarks` added to `NEED`, `pool_problems` read once per run and passed with `shared`; `changedSince` already covers the pool collections from ticket 02 — add `problemMarks`. The Excel export reuses `buildReport` (no change beyond the profile).
5. Header comments; `node tools/code-map.mjs`.

## Done when

- A refresh in `?mem=1` (stub requests) holds the column, the wrap request, the red row colour and the 7th legend cell; solved problems are not in the cell.
- A saved profile without the tick is unchanged; a project without a profile gets the column.
- `STYLE_V` 8 changes the sheet hash, so every sheet rebuilds once.
- `npm test`, `npm run build`, `node tools/code-map.mjs --check` pass.

## Tests to add

Spec §9 `report.js` line: the problem column (several lines, solved hidden, Hebrew and Russian sheets), row colour `#E57373` over the status colour, the 7th legend cell, the hash changes with `STYLE_V` 8, default profiles have the column, `wrapStrategy` request; the server lib builds the same output with the `shared` argument and `problemMarks`.

## Owner check

On the phone or the PC, after the site updates:
1. Ещё → «Таблицы для руководства» → your profile → tick the new column «Проблема» → save.
2. «🔄 Обновить таблицу для руководства», open the file (it is rebuilt once because of the new style).
3. The column «Проблема» (Hebrew sheet: «בעיה») shows the open problem of each marked point, one per line; the whole row of that point is a stronger red than «Неисправность».
4. The legend has a new seventh cell «Есть проблема» / «יש בעיה» in that red.
5. Solve one problem in the app, refresh: the cell is empty and the row colour goes back to the status colour.
6. Next morning: the sheet refreshed by the nightly job also has them (unverified by the agent).
Wrong looks like: the text cut off in a narrow cell, a Hebrew sheet with Russian problem names, the legend broken.
