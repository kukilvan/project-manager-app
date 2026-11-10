Status: in review
Complexity: complex
Blocked by: —

# 01. Tools: code map, Russian comments, same-code; KI-1, KI-2; docs

The foundation of the stage: three tools and their test, the two known test failures fixed, the docs that name them. No source module is touched except `tests/i18n.test.js`. Every later ticket depends on this one.

## Spec sections

2 (what a comment is), 5 (`tools/code-map.mjs`), 6 (`tools/ru-comments.mjs`, `tools/same-code.mjs`, commands), 7 (KI-1, KI-2), 8 (tests), 9 (`PENDING` lists), 10 (self-check), 13 (docs).

## What to do

1. **`tools/ru-comments.mjs`** — section 6.1: `commentsOf(path, text)` by file type (acorn `onComment` for JS; CSS, Python, YAML and rules scanners as in section 2, including the `print(__doc__)` exception), `isRussian` (Cyrillic after removing `«…»` spans), `scanScope(root)`, exported `PENDING`, the CLI with exit codes. A JS file acorn cannot parse is a problem, never skipped. Header comment in English, same shape as section 3.
2. **`tools/code-map.mjs`** — section 5: `listModules`, `headerOf`, `firstSentence`, `buildList`, `renderMap`, `checkMap`, exported `PENDING`, CLI (`--check`). Comparison ignores `\r`; the file keeps its own line ending.
3. **`tools/same-code.mjs`** — section 6.2: check 1 (per-file code: acorn token streams, text without comments for the other types, exported `sameCode(path, a, b)`), check 2 (the base tree in a `git worktree` with a `node_modules` junction, both built through the Vite API with a fixed `__BUILD__` and a temp `outDir`, byte-for-byte comparison, cleanup also after a failure and of a stale worktree of the previous crash). `firestore.open.rules` of the working tree is copied into the base only when check 1 found it comment-only. `--no-build` skips check 2. Exit codes 0/1/2.
4. **Fill both `PENDING` lists** with every path of the section 9 table (tickets 02–08): `src/domain/`, `src/app/`, `src/main.js`, `src/edition.js`, `src/firebase.js`, `src/log.js`, `src/i18n/`, the 41 view files one by one (`src/app/views/<name>.js`), `src/tohnit/`, `scripts/`, `src/style.css`, `vite.config.js`, `firestore.rules`, `firestore.open.rules`, `.github/workflows/`, `tests/`, `tools/tohnit/`. Check that no file of the scope is left out: with the lists full, both tools must exit 0 on the repo as it is.
5. **`docs/code-map.md`** — create it with the hand-written parts as placeholders (architecture: «written in ticket 09»; the "Not code" part: `.gitattributes`, the tools of this stage and the other files that are not code) and the markers `<!-- code-map:start … -->` … `<!-- code-map:end -->`; run `node tools/code-map.mjs` to fill the list (every module reads `(no English header yet)` for now).
6. **KI-1** — `tests/i18n.test.js` imports `pathToFileURL(file).href` (`node:url`) instead of the path (section 7). `KNOWN_ISSUES.md`: entry marked fixed with the test names.
7. **KI-2** — new `.gitattributes` with the two `eol=lf` lines (section 7); delete the two rules files and `git checkout -- firestore.rules firestore.open.rules` so the working copy turns LF. `KNOWN_ISSUES.md`: entry marked fixed. `PROJECT_CONTEXT.md`: known test failures — none (State and Environment).
8. **Docs of section 13 that belong to this ticket:** `docs/coding-standards.md` (rule 3 "Checked" names the test and `node tools/code-map.mjs --check`; new rules 10 «Comments are in English» and 11 «A comment-only change keeps the built site identical»); `CLAUDE.md` "Run" (two lines, within its 60-line and 6,000-byte budget); `CONTEXT.md` new section "Development" (Header comment, Code map, Same-code check).
9. **Tests** — `tests/code-docs.test.js` (below). Its own header is the first comment of the file.
10. Run the stage self-check (below). Run `tools/same-code.mjs` on this ticket's own diff and read its list: only the expected exceptions may appear (the three tools, `tests/code-docs.test.js`, `tests/i18n.test.js`, `.gitattributes`); the built site must stay byte-identical.

## Done when

- `npm test`: every test passes on the owner's PC (no known failures left) and on Linux.
- `node tools/code-map.mjs --check` exits 0; `node tools/ru-comments.mjs` exits 0 and prints the real count of Russian comments (about 1,565 in the whole scope) — the baseline for the other tickets.
- `node tools/same-code.mjs` exits 0 with both checks passing, the only listed changes being the expected exceptions.
- The deploy of `main` succeeded.
- KI-1 and KI-2 are fixed in `KNOWN_ISSUES.md`; the docs of step 8 are updated.

## Tests to add

`tests/code-docs.test.js`, offline, no build (spec section 8):
- unit cases for `firstSentence`, `headerOf`, `renderMap`, `commentsOf`, `isRussian`, `sameCode` exactly as listed there;
- repo cases: `checkMap(root)` has no problems and the map is not stale; every Russian comment of the scope is in a `PENDING` path; every `tests/*.test.js` starts with a comment (pending while `tests/` is in `PENDING`); every `PENDING` entry of both tools still matches at least one file.

## Stage self-check (spec section 10)

1. `npm test` — all pass.
2. `npm run build` passes.
3. `node tools/code-map.mjs --check` — exit 0; `node tools/ru-comments.mjs <this ticket's paths>` — none.
4. `node tools/same-code.mjs` — exit 0; read the changed-file list.
5. Push to `main` (`git pull --rebase origin main` first), `gh run list --workflow pages.yml --limit 1` → success.

Then mark the ticket `accepted`, update `PROJECT_CONTEXT.md` (Stages: tickets 1/9; Next step «Тикет 1.2») and `docs/history.md`. No «Работает» question: the owner checks once after the stage review.

## Owner check

None for this ticket: no behaviour changes, the site's files stay byte-identical (the owner's one check of the stage comes after the review, spec section 12).
