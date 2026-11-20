Status: accepted
Complexity: medium
Blocked by: —

# 01. Test drawing `?mem=1&memPlan=1`

A project «Test drawing» with a generated one-page PDF and points at every progress stage, so every later ticket of stage 7 (and later stages) can walk the plan in the browser pane without building a PDF by hand.

## Spec sections

§ 6 (all), D11, § 11 (docs of § 6.1), the tests line for `tests/testplan.test.js` in § 10.

## What to do

1. `src/domain/testplan.js` (pure, no DOM, no network):
   - `testPlanPdf()` → `Uint8Array` of a one-page PDF, 600 × 400 pt: Helvetica 9 pt captions (`BT /F1 9 Tf x y Td (label) Tj ET`), grey lines for a few rooms, a cross-reference table with correct byte offsets, a correct `/Length` of the content stream.
   - `testPlanData()` → `{ drawing, points, journal, marks, unlinked, hidden }` with ids and positions `pos: { sheet: 'test-plan.pdf', page: 0, x, y: 400 − pdfY, w, h, text: label }`; `w` / `h` from the caption width at 9 pt.
   - The points of § 6.3, every row: FA/C-01…05, FA/W-01 (open problem «Кабель»), FA/B-01-02, FB/K-01 (6005 pulled, cat7 not), FB/D-01 (door configuration «ЭМ», the standard one of `doorcfg.js`), FB/D-02, FB/G-01, FB/C-10 + FB/C-11 (one shared mark), G-02 (no rack), FC/C-01 and FC/C-02 (no position on the drawing). Plus the unlinked caption «X-99» and the hidden mark «X-98», both printed on the PDF.
   - Progress through journal edit rows `edit_<pointId>_<workId>` = `{ pointId, editDate, editWorkId, editCableId?, entryId: null, deleted: false }` (works: `PR_PTS`, `HIV_KEY`, `HIV_DEV`, `INS_CAM`, `CHK_FLUKE`, `SHL`, `INS_GALAI`; length 25 m for FA/C-02 as the existing length record does it — check how `pointInfo` reads length).
   - Positions are yours to choose: captions do not overlap and stay at least 20 pt from the page edges.
2. `src/app/testplan.js`: `startTestPlan()` — `createProject` (name «Test drawing», Latin so the coverage test sees no new Russian), `setCurrentProject`, `cachePut(drawing.id, bytes)` (the device copy `pz-drawings`), the drawing entry on the project (`drawings: [{ id: 'DR_test', name: 'test-plan.pdf', title: 'Test drawing', pages: [{ w: 600, h: 400 }], size, addedAt, addedBy }]`, `unlinked`, `hidden`), the points, the journal edit rows, the problem marks. When the shared problems list has no «Кабель» problem yet, write the example problems to the pool first.
3. `src/main.js`: with `?mem=1&memPlan=1`, after the test sign-in import `src/app/testplan.js` **dynamically** (separate chunk, so the live bundle does not load it), call `startTestPlan()`, open «Точки». Without `memPlan` test mode is unchanged; without `mem` the flag does nothing.
4. Docs: `docs/workflow.md` test-mode paragraph gets «`&memPlan=1` adds a project with a ready drawing and points at every progress stage (spec 7 § 6)»; in `PROJECT_CONTEXT.md` the gotcha «`?mem=1` has no drawing …» is replaced by the flag; `CONTEXT.md` gets the term **Test drawing** (code: `src/domain/testplan.js`, `?mem=1&memPlan=1`).
5. Header comments of both modules; `node tools/code-map.mjs`.

## Done when

- `http://localhost:4176/project-manager-app/?mem=1&memPlan=1` (after «Не напоминать») opens «Точки» of the project «Test drawing»; «🗺 План» shows the drawing with every row of § 6.3 looking as the «Plan look» column says (default frame, pink, gradient early / later, thick dark green, red, pull circles, one shared frame for FB/C-10 and FB/C-11).
- «❔ Не размеченые (1)» and «🙈 Скрытые (1)» appear in the plan's type filter; FC/C-01 and FC/C-02 are listed in «Точки» and not on the plan.
- `?mem=1` alone behaves as before; the production build bundle does not contain `testplan` in the main chunk (check the build output).
- `npm test`, `npm run build`, `node tools/code-map.mjs --check` pass; the coverage test sees no new untranslated string.

## Tests to add

`tests/testplan.test.js` (§ 10): the PDF starts with `%PDF-`; every xref offset points at `N 0 obj`; the `/Length` of the content stream is right; every point of `testPlanData()` with a position lies inside the page; labels are unique; every progress state of § 6.3 is present (pink, early and late gradient, dark green, red, pull circles, shared mark, no rack, not on the drawing, unlinked, hidden) — assert through `planColor` / `markColor` where they apply.

## Owner check

Nothing for the phone: this ticket is a tool for checking the next ones. The owner may run `npx vite preview --port 4176` after a build and open the address above in the browser on the PC to look at the test drawing.
