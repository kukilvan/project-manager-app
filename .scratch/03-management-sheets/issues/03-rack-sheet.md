Status: in review
Complexity: medium
Blocked by: 01

# 03. Rack sheet «Итоги по шкафам»

The management file gets a last tab with per-rack progress: total points, and for the four stages (pulled, terminated, installed, tested) a count and a percent, plus partly installed and faults, and a total row. On by default for every profile (the tick comes with ticket 04). Ticket 02 is live before this one, so both `report.js` and `managers.js` are in the state it leaves.

## Spec sections

§3.1 (`rackSheetOf`, `kind: 'racks'`), §3.2, §3.3, §4, §6 (`mergeCells`, percent format, `frozenColumnCount`), §7 (rows «No points pass the filters» for the rack sheet, «Rack named like the rack sheet», «Stage done for a point whose type lacks the stage», «199 of 200 done», «Point with an unknown type», «Both ticks off» for the rack-sheet part, «perCabinet with sections»), §8.1 items 5 (rack-sheet part), 6, 7 (tick changes hash), 8 (rack-sheet part), 13.

## What to do

1. `src/domain/report.js`: `rackSheetOf` and its rows (§4.1–4.3): racks in natural order (`localeCompare` with `numeric: true`), «Без шкафа» last; total points; for each stage the base (points whose type has the stage — a composite point's `info.stages`, else the type's `stages`; unknown type → every stage), done counted only inside the base, percent ⌊done × 100 / base⌋ / 100 as a number; base 0 → «—» in count and percent; partly installed and faults by the same tests as the totals row; total row from summed done and base; no filtered points → header and a total row with 0 and «—». Texts of §4.2 (reuse `T.sum`).
2. `buildReport`: the rack sheet is the last sheet when `table.rackSheet !== false`; its title/tab name «התקדמות לפי ארון» / «Итоги по шкафам»; with `perCabinet`, a rack sheet with the same name gets « (2)» and the rack sheet keeps its name (§1 row 10); the sheet is in `sheets`, so it is in the hash.
3. `src/app/managers.js`: `sheetRequests` picks the points or rack format by `kind`. Rack format (§4.4): header rows 4–5 with merges (A4:A5, B4:B5, K4:K5, L4:L5 and each stage pair), colours `#1F3B5C` / `#2E5481`, white text; thin `#D0D4D9` borders, centred cells, bold rack names; total row bold on `#E8EEF5` with a thick `#1F3B5C` top border; a stage at 100% (done = base > 0) green `#C6E5C9` on both its cells, nowhere else; percent cells format `0%`; widths A 110, B 95, count 70, percent 60, K 110, L 85; frozen rows 1–5 and `frozenColumnCount: 1`; no highlight rules, no filter. `rebuildSheets` handles `frozenCols`, the merges, and the stamp cell E2 of the rack sheet as in ticket 01.
4. Header comments of the changed modules; `node tools/code-map.mjs`.

## Done when

- The refreshed file has the rack sheet as its last tab; its numbers equal a hand count for a rack; 199 of 200 shows 99% and is not green; a stage nobody of the rack has shows «—».
- A profile with `rackSheet: false` (set by hand in the test) builds without the sheet.
- The date E2 is on the rack sheet too, and the date-only write of ticket 01 covers it.
- `npm test`, `npm run build`, `node tools/code-map.mjs --check` pass; self-check in `?mem=1`: the stub requests contain the merges, `frozenColumnCount: 1` and the percent format.

## Tests to add

`tests/domain.test.js`, as §8.1:
- item 5 (rack-sheet part): the rack sheet is last; a rack named like it becomes «… (2)»;
- item 6: counts, percents rounded down (a 199-of-200 case), «—» for a stage no point of the rack has, a stray done row outside the base not counted, «Без шкафа» last, natural rack order, total row sums and percents, filters respected, `rackSheet: false` → no sheet;
- item 7: turning `rackSheet` changes the hash;
- item 8 (rack-sheet part): merges, percent format, green only on full stages, `frozenColumnCount: 1`;
- item 13: existing tests that count sheets are updated.

## Owner check

On the phone, after the site updates:
1. «🔄 Обновить таблицу для руководства», open the file, go to the last tab «התקדמות לפי ארון» / «Итоги по шкафам».
2. Pick one rack and count by hand its points on the points sheet (all, pulled, installed, tested): the numbers match; percents match too.
3. Only stages done at 100% are green; the last row is the total of all racks.
4. The header is in two levels (stage name over «кол-во · %»); column A (rack) stays in place when scrolling sideways.
5. Date «Обновлено» is in row 2 of this tab as well.
