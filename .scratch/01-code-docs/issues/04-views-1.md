Status: in review
Complexity: medium
Blocked by: 01

# 04. Views 1 — points, racks, pulls, doors

English headers and comments for 12 files of `src/app/views/` (≈ 234 KB). Only comments change.

## Spec sections

3, 4, 9, 10.

## Files

`src/app/views/` — `points`, `racks`, `pullview`, `racktable`, `pointmerge`, `pointsfile`, `pointchooser`, `cablespick`, `doorchips`, `doorcfgview`, `ownworks`, `latinfix` (each `.js`).

## What to do

1. List the work: `node tools/ru-comments.mjs` with these 12 paths.
2. For each file: read it, write the header (first sentence ≤ 200 characters; what it talks to — `store.js`, `repo`, `src/domain` modules; a `Contents` list for the files of 30 KB or more: `points.js`, `racks.js`, `pullview.js`), translate every Russian comment by meaning (spec 4).
3. Words of `CONTEXT.md`. Wrong comments: say what the code does, add a `KNOWN_ISSUES.md` entry if it looks like a bug. Never change code.
4. Remove these 12 paths from both `PENDING` lists (one entry per file).
5. `node tools/code-map.mjs` to refresh `docs/code-map.md`.

## Done when

- `node tools/ru-comments.mjs <the 12 files>` prints none; the entries are gone from both `PENDING` lists.
- `node tools/code-map.mjs --check` exits 0; each file has a real English sentence in the map.
- `node tools/same-code.mjs` exits 0 (only comments changed, built site byte-identical).
- `npm test` and `npm run build` pass; the deploy of `main` succeeded.

## Tests to add

None (see ticket 02).

## Stage self-check (spec section 10)

1. `npm test` — all pass.
2. `npm run build` passes.
3. `node tools/code-map.mjs --check` — exit 0; `node tools/ru-comments.mjs <the 12 files>` — none.
4. `node tools/same-code.mjs` — exit 0.
5. `git pull --rebase origin main`, push to `main`, `gh run list --workflow pages.yml --limit 1` → success.

Then mark the ticket `accepted`, update `PROJECT_CONTEXT.md` and `docs/history.md`, give the next step. No «Работает» question.

## Owner check

None for this ticket; the owner checks once after the stage review.
