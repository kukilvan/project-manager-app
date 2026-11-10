Status: open
Complexity: medium
Blocked by: 01

# 07. Drawings, scripts, config

English headers and comments for `src/tohnit/`, `scripts/`, `src/style.css`, `vite.config.js`, the Firestore rules files and the workflows (≈ 160 KB). Only comments change, with one real text change: the comment lines inside `firestore.open.rules` (and the two string literals in `src/domain/openrules.js` that generate them), which the setup wizard copies.

## Spec sections

3, 4, 6.3, 9, 10, 11 (the rules edge cases).

## What to do

1. List the work: `node tools/ru-comments.mjs src/tohnit/ scripts/ src/style.css vite.config.js firestore.rules firestore.open.rules .github/workflows/`.
2. `src/tohnit/` and `scripts/*.mjs`: header (first sentence ≤ 200 characters; what it talks to — MuPDF, the worker, the engine; scripts say what they are run for and when) and translation by meaning (spec 4). `vite.config.js` gets a header (what it configures). Header of `scripts/` modules is in the code map; `vite.config.js` is not.
3. `src/style.css`: translate the `/* … */` comments; no rule or whitespace inside rules changes.
4. `.github/workflows/*.yml`: comments only (`#`, also inside `run: |` blocks); `name:` values and every string stay.
5. `firestore.rules`: translate the `//` comments. Then regenerate `firestore.open.rules`, never by hand (spec 6.3):

   ```text
   node --input-type=module -e "import fs from 'node:fs'; import { openRules } from './src/domain/openrules.js'; fs.writeFileSync('firestore.open.rules', openRules(fs.readFileSync('firestore.rules', 'utf8')))"
   ```

   `src/domain/openrules.js` inserts two Russian comment lines (lines 9–10 there) into the generated rules; in that file they are string literals, so ticket 02 leaves them. Translate those two literals here, before regenerating: it is the one allowed change of a string in this stage, and it only changes comment text inside the rules the wizard copies (spec 11). `openrules.js` is not in the bundle, so the built site changes only through `firestore.open.rules`. `same-code` check 1 will list `src/domain/openrules.js` as changed: read that it is exactly these two literals. Check that the open-rules test in `tests/domain.test.js` passes (it may compare the generated text; update its expected comment lines if it holds them).
6. Remove from both `PENDING` lists: `src/tohnit/`, `scripts/`, `src/style.css`, `vite.config.js`, `firestore.rules`, `firestore.open.rules`, `.github/workflows/`.
7. `node tools/code-map.mjs` to refresh `docs/code-map.md`.

## Done when

- `node tools/ru-comments.mjs <the paths above>` prints none; the entries are gone from both `PENDING` lists.
- `node tools/code-map.mjs --check` exits 0; every module of `src/tohnit/` and `scripts/` has a real English sentence in the map.
- `node tools/same-code.mjs`: the only expected report beyond comment-only files is `src/domain/openrules.js` (two translated string literals, read and confirmed); the rules files are comment-only; the built site differs from the base only in the setup chunk that carries the open rules text (spec 6.2, 11), nothing else.
- `npm test` and `npm run build` pass; the deploy of `main` succeeded.

## Tests to add

None new. The existing open-rules test in `tests/domain.test.js` must pass with the regenerated file (LF, thanks to `.gitattributes` from ticket 01).

## Stage self-check (spec section 10)

1. `npm test` — all pass.
2. `npm run build` passes.
3. `node tools/code-map.mjs --check` — exit 0; `node tools/ru-comments.mjs <the paths above>` — none.
4. `node tools/same-code.mjs` — read the report: the exceptions above only.
5. `git pull --rebase origin main`, push to `main`, `gh run list --workflow pages.yml --limit 1` → success.

Then mark the ticket `accepted`, update `PROJECT_CONTEXT.md` and `docs/history.md`, give the next step. No «Работает» question.

## Owner check

None for this ticket. Databases already set up need nothing (the rules are checked by a probe read, spec 1); the owner checks once after the stage review.
