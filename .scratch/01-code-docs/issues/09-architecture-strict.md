Status: open
Complexity: complex
Blocked by: 02, 03, 04, 05, 06, 07, 08

# 09. Architecture section; strict checks

The last ticket: the hand-written architecture part of `docs/code-map.md`, written when every module has its English header, and the end of `PENDING`: the tools and the test become strict.

## Spec sections

5, 6, 9 (the last sentence), 10 (exceptions for ticket 09), 13.

## What to do

1. Check that tickets 02–08 are accepted and both `PENDING` lists are empty or hold nothing but entries nobody owns; if an entry is left, finish that file here.
2. **Architecture section of `docs/code-map.md`**, at most 10,000 bytes for the whole file (every spec, ticket and review session reads it). Written from the code and the module headers, no guessing: storage and the repo, sync, offline, data paths, Google Drive and Sheets, server jobs (`scripts/`, workflows), drawings (`src/tohnit/`, MuPDF). Each topic: where it lives (module names) and how data flows, in short paragraphs. Check the "Not code" part is true: `.gitattributes`, the tools of this stage and every other file that is not a module.
3. **Strict tools.** Delete both `PENDING` arrays and every "pending" code path from `tools/code-map.mjs` and `tools/ru-comments.mjs`: a module without an English header, a Russian comment, a test file without a first comment is now always a problem. Update the exports list, the tools' headers and `tests/code-docs.test.js` (drop the pending cases, keep "every Russian comment is a failure" and "checkMap has no problems").
4. Run `node tools/ru-comments.mjs` (whole scope) — none; `node tools/code-map.mjs` — the map has no `(no English header yet)` line.
5. `docs/coding-standards.md`, `CONTEXT.md`, `CLAUDE.md`: check that what ticket 01 wrote still matches the finished tools (the "Run" lines, rules 10 and 11).
6. Fix the problems the strict checks show as comment-only changes; anything that needs code goes to `KNOWN_ISSUES.md`, never into this stage.

## Done when

- Both tools have no `PENDING` and no pending code paths; `node tools/code-map.mjs --check` and `node tools/ru-comments.mjs` exit 0 on the whole repo.
- `docs/code-map.md` has the architecture section (≤ 10,000 bytes in all) and a full module list.
- `node tools/same-code.mjs --expect tools/code-map.mjs --expect tools/ru-comments.mjs --expect tests/code-docs.test.js` exits 0 (spec 6.2, `--expect` added in ticket 01); the changed-file list shows only the expected exceptions of spec 10: the two tools and the test; the built site is byte-identical.
- `npm test` and `npm run build` pass; the deploy of `main` succeeded.

## Tests to add

Update `tests/code-docs.test.js` as in step 3: the pending cases go, the strict repo cases stay.

## Stage self-check (spec section 10)

1. `npm test` — all pass.
2. `npm run build` passes.
3. `node tools/code-map.mjs --check` — exit 0; `node tools/ru-comments.mjs` (whole scope) — none.
4. `node tools/same-code.mjs` — exit 0; read the changed-file list.
5. `git pull --rebase origin main`, push to `main`, `gh run list --workflow pages.yml --limit 1` → success.

Then mark the ticket `accepted`, update `PROJECT_CONTEXT.md` (Stages: tickets 9/9; Next step «Ревью 1») and `docs/history.md`. No «Работает» question: the owner checks once after the stage review (spec section 12).

## Owner check

None for this ticket; the owner's one check of the stage (spec section 12) comes after the review.
