Status: open
Complexity: medium
Blocked by: 01

# 06. Views 3 — reports, project, settings, pool, Google, history

English headers and comments for the last 18 files of `src/app/views/` (≈ 239 KB). Only comments change. After this ticket and tickets 04 and 05, the whole folder `src/app/views/` is clean.

## Spec sections

3, 4, 9, 10.

## Files

`src/app/views/` — `doh`, `settings`, `wizard`, `catalogview`, `project`, `poolview`, `shilutsettings`, `managersfolder`, `tables`, `todos`, `sheetslist`, `history`, `manualsview`, `members`, `journal`, `projects`, `month`, `log` (each `.js`).

## What to do

1. List the work: `node tools/ru-comments.mjs` with these 18 paths.
2. For each file: read it, write the header (first sentence ≤ 200 characters; what it talks to — Firestore, Google Drive and Sheets, `localStorage` keys, `store.js`, `repo`; a `Contents` list for the files of 30 KB or more: `doh.js`, `settings.js`), translate every Russian comment by meaning (spec 4). `log.js` has no header today: write one. The event log lines it shows are Russian strings and stay.
3. `setup wizard` texts and the daily report's Russian and Hebrew texts are strings, not comments: unchanged.
4. Words of `CONTEXT.md` (daily report, journal row, pool…). Wrong comments: say what the code does, add a `KNOWN_ISSUES.md` entry if it looks like a bug. Never change code.
5. Remove these 18 paths from both `PENDING` lists (one entry per file).
6. `node tools/code-map.mjs` to refresh `docs/code-map.md`.

## Done when

- `node tools/ru-comments.mjs <the 18 files>` prints none; the entries are gone from both `PENDING` lists; no `src/app/views/` entry is left in them.
- `node tools/code-map.mjs --check` exits 0; each file has a real English sentence in the map.
- `node tools/same-code.mjs` exits 0 (only comments changed, built site byte-identical).
- `npm test` and `npm run build` pass; the deploy of `main` succeeded.

## Tests to add

None (see ticket 02).

## Stage self-check (spec section 10)

1. `npm test` — all pass.
2. `npm run build` passes.
3. `node tools/code-map.mjs --check` — exit 0; `node tools/ru-comments.mjs <the 18 files>` — none.
4. `node tools/same-code.mjs` — exit 0.
5. `git pull --rebase origin main`, push to `main`, `gh run list --workflow pages.yml --limit 1` → success.

Then mark the ticket `accepted`, update `PROJECT_CONTEXT.md` and `docs/history.md`, give the next step. No «Работает» question.

## Owner check

None for this ticket; the owner checks once after the stage review.
