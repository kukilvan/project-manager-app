Status: accepted

# Stage 3. Management sheets — review

## What was reviewed

- Commits `1a50462..a27b68d` (from «Tickets 3: accepted» to «Ticket 3.4 accepted»): tickets 01 (points sheet look and update stamp), 02 (sections by point type), 03 (rack sheet «Итоги по шкафам»), 04 (profile form, guide, glossary, KI-4) of `.scratch/03-management-sheets/issues/`.
- Code: `src/domain/report.js`, `src/domain/managers.js`, `src/domain/export.js`, `src/app/managers.js`, `src/app/views/tables.js`, `src/app/views/guide.js`, `scripts/server-tables-lib.mjs`, the i18n sources, `tests/domain.test.js`; docs: `CONTEXT.md`, `KNOWN_ISSUES.md`, `docs/code-map.md`, the tickets.
- Against `.scratch/03-management-sheets/spec.md`, the tickets, `docs/coding-standards.md` and `CONTEXT.md`. Two passes in this session: standards (rules 1–11, glossary words, comments, budgets) and spec (§1–9 item by item against the code, the tests and the running app). No code-review skill run: the stage diff is small (about 300 lines of code), read in full.

## Tests

- Start: 210/210 pass (Windows, Node 24).
- End: 212/212 pass (two new tests: no empty range in the rack sheet requests when no point passes the filters; the rack order does not depend on the device language). One assertion of the rack-sheet request test follows the new order of the row-height requests.
- `npm run build` passes; `node tools/code-map.mjs --check` exit 0; `node tools/ru-comments.mjs` — 0 Russian comments.

## Verified by running

- `?mem=1` at 420 px (`npx vite preview --port 4176`), a test project with cameras, a detector, a point without a type, racks 1A, 2B and none:
  - «New sheet» form: both ticks on; «Типы точек» list with «Все», ticks and ▲▼; a profile without the fields opens with both ticks on.
  - The main profile: ▲ moved «Камера» from the end to the top, «Сохранить» stored `typeOrder` with «Камера» first and `types` empty; the preview read «… листов: 2».
  - «🔄 Обновить» (stub Google): `create`, `sheetsOf`, one `batch`, one `write`. Points sheet rows exactly as spec §2.1 (title, project, totals, legend in Hebrew, empty row, header), sections «מצלמה — 4 נקודות», «גלאי — נקודה אחת», «ללא סוג — נקודה אחת» in the stored order with two empty rows between; frozen rows 7, rack sheet last with frozen rows 5 and one frozen column, merges 8; stamp «עודכן: DD/MM/YYYY HH:MM» written to `'סטטוס'!E2` and `'התקדמות לפי ארון'!E2`.
  - A second «Обновить» with nothing changed: `fileInfo` and one `write` of the two E2 cells only, the message «данные не менялись, она актуальна».
  - After the fixes (service worker and cache cleared, so the new build ran): the «Расширенная» profile filtered to «Неисправна» (no such points) builds a rack sheet with only the total row and no empty row range; racks «A1», «Щ1», «10», «2» come out «2, 10, Щ1, A1» — the order of the profile form and of the project screen.
- A scratchpad script built every default profile × both layouts × totals on/off, for no points and for one point, and scanned all `sheetRequests` ranges: the only empty range was F1's.
- Not verifiable here: real Google rendering, the Google Sheets app on the phone, the night job on GitHub Actions, and whether Google really rejects F1's empty row range (the fix is safe either way).

## Findings

- **F1** — `src/app/managers.js`, `rackSheetRequests`: with no point passing the profile's filters (a new project, or a «Неисправна only» profile — the form's own example — on a day with no faults) the rack sheet has no rack rows, and the row-height request for them had an empty range (`startIndex` = `endIndex` = 5). `batchUpdate` is all-or-nothing, so if Google rejects it the whole refresh fails, every night. **Fix now:** the height request is sent only when there are rack rows; a test checks that no request of an empty rack sheet has an empty range.
- **F2** — `src/domain/report.js`, `rackSheetOf`: racks were sorted with the device's language (`localeCompare(…, undefined, …)`), unlike the profile form and the rest of `src/domain/` (`'ru'`). Node checked: Russian collation puts «Щ1» before «A1», English after. The night job (English) and a phone in Russian or Hebrew could order racks with Cyrillic and Latin names differently, so the hash would differ and each refresh would rewrite the whole file and flip the rack order. Spec §4.3 asks for the form's order. **Fix now:** `'ru'`, with a test.
- **F3** — `.scratch/03-management-sheets/issues/02-sections-by-type.md`: ticket 3.2's status edit saved the file with broken encoding (every «», —, § and Cyrillic letter garbled, e.g. «Ð‘ÐµÐ· Ñ‚Ð¸Ð¿Ð°»). **Fix now:** the text restored from the accepted slicing (`1a50462`), status `accepted`.
- **F4** — `KNOWN_ISSUES.md`, KI-4: said viewers «cannot sort the shared file»; spec §1 row 5 says they can, but the sort is temporary and only theirs. **Fix now:** wording.
- **F5** — Spec §4.4 still described the first rack-sheet look (green only at 100%, header `#1F3B5C` / `#2E5481`, no frames), while the owner chose another look in ticket 3.3 (progress colours from dark yellow to green, navy block frames through the header, teal lines between racks, centred names) and accepted it live. **Fix now:** a note under §4.4 with the live look and where it is coded.
- **F6** — `PROJECT_CONTEXT.md`, State: one line per ticket 3.1–3.4 and the stage-3 slicing, spec and description lines hold details that `docs/history.md` has. **Fix now:** folded into one stage-3 line when the stage closes (at «Коммит»).

Checked and left as they are:
- `progressColor` (a colour blend) lives in `src/app/managers.js`, not `src/domain/`: it is presentation of the sheet, not a calculation of statuses or sums (standard 4), and it is tested.
- The type list in the form is ordered by the type's id (the Russian name), so in the English or Hebrew interface the translated names look unsorted: spec §5.1 orders by id, the sheets use the same order.
- `typesOf` and `typeList` (the form's save step) stay in the view: a few lines, the ticket allowed it without a domain helper.
- No `STYLE_V` bump for F1 and F2: neither changes the look; F2 changes the rack order only where it differed, and then the hash changes by itself.
- With «Каждый шкаф на отдельном листе» the rack tabs keep the order of the points (only «Без шкафа» last), as before this stage.

No fix-round finding: the stage closes with this review. Nothing deferred to `KNOWN_ISSUES.md`.

## Wishes for later stages

- **Owner, after this review goes live:** the next morning, open the management file — the date in row 2 shows the night run, the rack sheet's order of racks is the same as in the app.
- **Stage 4 (PocketBase):** the night job moves to the NAS; its `now` and the `'ru'` sorting must stay, so the phone and the server keep giving one hash. Run the Sheets requests of an empty profile against real Google once (F1 was not checked against a real response).
- **Later:** if managers ask for it, a «Шкафы по порядку» option for the rack tabs of «Каждый шкаф на отдельном листе» (today they follow the points).
