Status: accepted
Complexity: medium
Blocked by: 01

# 02. Sections by point type

The points sheet groups points by type: a framed heading row Â«<type> â€” <count>Â» before each group, two empty rows between groups, Â«Ð‘ÐµÐ· Ñ‚Ð¸Ð¿Ð°Â» last, in the order of the profile's `typeOrder`. On by default for every profile (there is no tick to switch it off until ticket 04).

## Spec sections

Â§2.4, Â§2.5 (section frames, order of format requests), Â§3.6, Â§5.1, Â§7 (rows Â«A type ticked in `types` but no pointsÂ», Â«New type added after `typeOrder` was savedÂ», Â«Type deleted while in `typeOrder`Â», Â«Profile filtered to one typeÂ», Â«Â«perCabinetÂ» with sectionsÂ», Â«Both ticks offÂ» for the sections part), Â§8.1 items 3, 4, 5 (sections part), 8 (section frames), 11, 12, 13.

## What to do

1. `src/domain/report.js`:
   - `typeOrderOf(table, ctx)` (Â§5.1): ids of `typeOrder` that still exist in `ctx.types`, in that order, then the rest sorted by id (`localeCompare('ru', { numeric: true })`). Deleted types in `typeOrder` are skipped, not removed.
   - Grouping in `sheetOf` when `table.sections !== false`: groups by `typeOrderOf`, Â«Ð‘ÐµÐ· Ñ‚Ð¸Ð¿Ð°Â» last (no `typeId` and deleted types); inside a group `comparePoints`; a type with no points on the sheet gets no section.
   - Section rows `<name> â€” <count>` (Â§2.4: Hebrew `nameHe` else id, Russian id; Hebrew and Russian plural forms; Â«×œ×œ× ×¡×•×’Â» / Â«Ð‘ÐµÐ· Ñ‚Ð¸Ð¿Ð°Â»); two empty rows between groups, none before the first and after the last. Fill `sectionRows`, `pointRuns` (one run per group) and `rowColors` (`''` on section and empty rows) â€” the fields ticket 01 laid down.
   - Tick off (`sections: false`): no section rows, no empty rows, today's order, one run.
   - With `perCabinet`, sections are built per rack sheet with that sheet's own counts.
   - `defaultTables()` writes `sections: true` (and `rackSheet: true`, used by ticket 03).
2. `src/app/managers.js` `sheetRequests`: section rows â€” white, bold, size 12, text `#1F3B5C`, height 28 px (`updateDimensionProperties`, `ROWS`), thick `#1F3B5C` frame around the row from A to the last profile column, no inner vertical lines, alignment cleared to the default (Â§2.4); no merges. Format order: point-row borders, then section frames, then the header frame (Â§2.5). The basic filter now runs from the header to the last row.
3. `src/domain/export.js`: `exportSheets` builds with `sections: false, rackSheet: false` (Â§3.6).
4. Header comments of the changed modules; `node tools/code-map.mjs`.

## Done when

- A refresh of the main table gives sections in the profile's type order with correct counts, two empty rows between them, Â«Ð‘ÐµÐ· Ñ‚Ð¸Ð¿Ð°Â» last when there are such points.
- With `sections: false` the sheet is as after ticket 01.
- The Excel export is unchanged (no section rows).
- `npm test`, `npm run build`, `node tools/code-map.mjs --check` pass; self-check in `?mem=1`: the stub requests contain the section frames and row heights.

## Tests to add

`tests/domain.test.js`, as Â§8.1:
- item 3: order by `typeOrder`, unlisted types after it by name, Â«Ð‘ÐµÐ· Ñ‚Ð¸Ð¿Ð°Â» last (no type and a deleted type); section texts in Hebrew and Russian with the plural forms 1, 2, 5, 21, 12; two empty rows between groups, none first or last; `rowColors` `''` on section and empty rows;
- item 4: tick off â†’ today's order, no section rows;
- item 5 (sections part): `perCabinet` â€” sections per sheet with their own counts;
- item 8 (this ticket's part): `updateBorders` thick on section rows, alignment cleared, order of the border requests;
- item 11: `exportSheets` Â«Ð¢Ð¾Ñ‡ÐºÐ¸Â» rows unchanged;
- item 12: `typeOrderOf` with missing, partial and stale `typeOrder`; `defaultTables()` has the ticks;
- item 13: the existing tests updated where a section row may now come first.

## Owner check

On the phone, after the site updates:
1. Â«ðŸ”„ ÐžÐ±Ð½Ð¾Ð²Ð¸Ñ‚ÑŒ Ñ‚Ð°Ð±Ð»Ð¸Ñ†Ñƒ Ð´Ð»Ñ Ñ€ÑƒÐºÐ¾Ð²Ð¾Ð´ÑÑ‚Ð²Ð°Â», open the file.
2. Points are in sections by type, each section row reads Â«<Ñ‚Ð¸Ð¿> â€” <Ñ‡Ð¸ÑÐ»Ð¾ Ñ‚Ð¾Ñ‡ÐµÐº>Â» (Hebrew sheet: the Hebrew type name and Â«N × ×§×•×“×•×ªÂ» / Â«× ×§×•×“×” ××—×ªÂ»), in a dark thick frame; the text runs over the empty cells and does not look broken in Hebrew (right to left).
3. Two empty rows between sections; points without a type (if any) are in the last section Â«×œ×œ× ×¡×•×’Â» / Â«Ð‘ÐµÐ· Ñ‚Ð¸Ð¿Ð°Â».
4. Count a section by hand: the number matches.
5. Filter and sort in the Google Sheets app still work for you (sorting as editor scatters the sections until the next rebuild â€” it is expected, recorded in ticket 04).
