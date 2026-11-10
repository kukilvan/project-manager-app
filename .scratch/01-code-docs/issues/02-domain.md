Status: accepted
Complexity: medium
Blocked by: 01

# 02. Domain: headers and translation

English header comments and English comments for every file of `src/domain/` (≈ 253 KB). Only comments change.

## Spec sections

3 (header comments, `Contents` for modules of 30 KB or more), 4 (translating comments), 9 (`PENDING`), 10 (self-check).

## What to do

1. List the work: `node tools/ru-comments.mjs src/domain/`.
2. For each file in `src/domain/`: read it, write the header (first sentence ≤ 200 characters, what it talks to, a `Contents` list if the file is 30 KB or more), translate every Russian comment into English by meaning (spec 4: keep every fact — why, edge cases, dates, links to ADRs and KIs; shorten where the Russian repeats the code). `src/domain/index.js` gets the one-sentence re-export header.
3. Use the words of `CONTEXT.md` (project, point, journal row, daily report, drawing…).
4. A comment that is wrong about the code: write what the code really does and add a `KNOWN_ISSUES.md` entry if it looks like a bug. Never change code.
   Exception: `src/domain/openrules.js` has two Russian comment lines inside string literals (lines 9–10). They are strings, not comments: leave them, ticket 07 translates them together with `firestore.rules`.
5. Remove `src/domain/` from both `PENDING` lists (`tools/code-map.mjs`, `tools/ru-comments.mjs`).
6. Run `node tools/code-map.mjs` to refresh `docs/code-map.md`.

## Done when

- `node tools/ru-comments.mjs src/domain/` prints no Russian comment; `src/domain/` is gone from both `PENDING` lists.
- `node tools/code-map.mjs --check` exits 0; every `src/domain/` line of the map has a real English sentence.
- `node tools/same-code.mjs` exits 0: only comments changed, built site byte-identical.
- `npm test` and `npm run build` pass; the deploy of `main` succeeded.

## Tests to add

None: `tests/code-docs.test.js` already covers the stage rules, and shrinking `PENDING` makes it check this ticket's files.

## Stage self-check (spec section 10)

1. `npm test` — all pass.
2. `npm run build` passes.
3. `node tools/code-map.mjs --check` — exit 0; `node tools/ru-comments.mjs src/domain/` — none.
4. `node tools/same-code.mjs` — exit 0.
5. `git pull --rebase origin main`, push to `main`, `gh run list --workflow pages.yml --limit 1` → success.

Then mark the ticket `accepted`, update `PROJECT_CONTEXT.md` and `docs/history.md`, give the next step. No «Работает» question.

## Owner check

None for this ticket (the built site is byte-identical); the owner checks once after the stage review.
