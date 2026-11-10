Status: open
Complexity: simple
Blocked by: 01

# 08. Tests and Python tools

Header comments and English comments for `tests/*.js` (13 test files; 9 have no header) and `tools/tohnit/*.py`; the tracked `__pycache__` is removed from git. These files are translated from the `ru-comments` list, not read through.

## Spec sections

2, 3 (test modules, tools), 4, 9, 10, 13 (`__pycache__`).

## What to do

1. List the work: `node tools/ru-comments.mjs tests/ tools/tohnit/`.
2. `tests/*.test.js`: the first comment says what the file checks and which modules it covers (spec 3: `// Checks the daily report (src/domain/doh.js): totals, Hebrew text, per-point quantities.`); translate the Russian comments. Test names, assertion messages and Russian test data stay (strings).
3. `tools/tohnit/*.py`: English header and translated comments and docstrings. Exception: the module docstring of `tohnit.py` is printed as usage help by `print(__doc__)` — a string, not a comment: leave it Russian. The other docstrings are comments and are translated. `SKILL.md` is built from `skill_head.md` and `library.md` only, so no rebuild is needed (spec 1).
4. Untrack the compiled file: `git rm -r --cached tools/tohnit/__pycache__` (`.gitignore` already lists `__pycache__/`). The local folder may stay.
5. Remove `tests/` and `tools/tohnit/` from the `ru-comments` `PENDING` (and from the code-map list if present). The test «every `tests/*.test.js` starts with a comment» becomes active.
6. `node tools/code-map.mjs --check` (the map does not list tests or tools; it must stay in order).

## Done when

- `node tools/ru-comments.mjs tests/ tools/tohnit/` prints none; the two entries are gone from `PENDING`.
- Every `tests/*.test.js` starts with a comment saying what it checks.
- `git ls-files tools/tohnit/__pycache__` prints nothing.
- `node tools/same-code.mjs` exits 0 (only comments changed, built site byte-identical; the list shows the `.pyc` removal as a change of a non-code file).
- `npm test` and `npm run build` pass; the deploy of `main` succeeded.

## Tests to add

None (the stage test already covers these files once `PENDING` shrinks).

## Stage self-check (spec section 10)

1. `npm test` — all pass.
2. `npm run build` passes.
3. `node tools/code-map.mjs --check` — exit 0; `node tools/ru-comments.mjs tests/ tools/tohnit/` — none.
4. `node tools/same-code.mjs` — exit 0.
5. `git pull --rebase origin main`, push to `main`, `gh run list --workflow pages.yml --limit 1` → success.

Then mark the ticket `accepted`, update `PROJECT_CONTEXT.md` and `docs/history.md`, give the next step. No «Работает» question.

## Owner check

None for this ticket; the owner checks once after the stage review.
