Status: open
Complexity: medium
Blocked by: 01

# 03. App core: headers and translation

English headers and comments for `src/app/*.js` (files directly in the folder, not `views/`), `src/main.js`, `src/edition.js`, `src/firebase.js`, `src/log.js` and `src/i18n/` (≈ 239 KB). Only comments change.

## Spec sections

3, 4, 9, 10.

## What to do

1. List the work: `node tools/ru-comments.mjs src/app/ src/main.js src/edition.js src/firebase.js src/log.js src/i18n/`.
2. For each file: read it, write the header (first sentence ≤ 200 characters; say what it talks to — storage, `localStorage` keys, Firestore, Drive, Sheets, who calls it; `Contents` for files of 30 KB or more, e.g. `repo.js`), translate every Russian comment by meaning (spec 4). `src/main.js` has no header today: write one.
3. `src/i18n/`: the JS files only. The JSON files (`en.json`, `he.json`, `src/*.json`) are strings, not comments, and stay as they are.
4. Words of `CONTEXT.md`. Wrong comments: say what the code does, add a `KNOWN_ISSUES.md` entry if it looks like a bug. Never change code.
5. Remove from both `PENDING` lists: `src/app/`, `src/main.js`, `src/edition.js`, `src/firebase.js`, `src/log.js`, `src/i18n/`.
6. `node tools/code-map.mjs` to refresh `docs/code-map.md`.

## Done when

- `node tools/ru-comments.mjs` on the paths above prints none; the six entries are gone from both `PENDING` lists.
- `node tools/code-map.mjs --check` exits 0; every module of these paths has a real English sentence in the map.
- `node tools/same-code.mjs` exits 0 (only comments changed, built site byte-identical).
- `npm test` and `npm run build` pass; the deploy of `main` succeeded.

## Tests to add

None (see ticket 02).

## Stage self-check (spec section 10)

1. `npm test` — all pass.
2. `npm run build` passes.
3. `node tools/code-map.mjs --check` — exit 0; `node tools/ru-comments.mjs <the paths above>` — none.
4. `node tools/same-code.mjs` — exit 0.
5. `git pull --rebase origin main`, push to `main`, `gh run list --workflow pages.yml --limit 1` → success.

Then mark the ticket `accepted`, update `PROJECT_CONTEXT.md` and `docs/history.md`, give the next step. No «Работает» question.

## Owner check

None for this ticket; the owner checks once after the stage review.
