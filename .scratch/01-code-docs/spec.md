Status: accepted

# Stage 1. Code documentation — spec

Built from `description.md` (accepted 2026-11-10). No ideas filed for the stage. Facts below were checked on the owner's PC on 2026-11-10 (Node 24, Git Bash and PowerShell).

## 1. Checked facts

- **The build is deterministic once the build stamp is fixed.** Two `vite build` runs with `__BUILD__` set to the same string gave byte-identical `dist/` trees (all 25 files, hashed names included).
- **Comments do not reach the build.** Adding comments to `src/domain/merge.js`, `src/tohnit/worker.js`, `src/app/views/points.js`, `src/style.css` and changing one in `vite.config.js` left `dist/` byte-identical. No `/*!`, `@license` or `@preserve` comments exist in `src/` or `scripts/`.
- **One comment file does reach the build:** `firestore.open.rules` is imported as text (`src/app/setup.js`, `?raw`) and copied by «📋 Скопировать правила» in the setup wizard. Translating the comments of `firestore.rules` (and the comment lines `openRules` inserts) changes that text, so the setup chunk changes. `src/domain/openrules.js` itself is not in the bundle.
- **Pasted rules are checked by a probe read** (`meta/probe`, `src/domain/fbcheck.js`), never by comparing text: databases with the old Russian-commented rules keep working; nobody pastes the rules again.
- **acorn** (already a dev dependency, used by `scripts/i18n-extract.mjs`) parses all 141 JS files of `src/`, `scripts/`, `tests/` and `vite.config.js` as ES modules; it finds 1,565 comment tokens with Cyrillic.
- **No header comment:** `src/main.js`, `src/app/views/log.js`, `src/domain/index.js`; 9 of 13 test files; `vite.config.js`. All other modules have a Russian one.
- **Tests on the owner's PC:** 144, 141 pass; failures exactly KI-1 (2) and KI-2 (1).
- **KI-2 fix checked:** `.gitattributes` with `eol=lf` for both rules files, then a fresh checkout of the two files → `tests/domain.test.js` 48/48 pass.
- **KI-1 reproduced by hand:** `import()` of an absolute Windows path fails with `ERR_UNSUPPORTED_ESM_URL_SCHEME`; a `file://` URL works.
- **`tools/tohnit/SKILL.md`** is built by `build_skill.py` from `skill_head.md` and `library.md` only; `tohnit.py` is not inside it, so changing its comments needs no rebuild.
- **`tohnit.py` prints its module docstring** as usage help (`print(__doc__)`, line 1463); the other 25 docstrings are never printed.
- **`tools/tohnit/__pycache__/tohnit.cpython-313.pyc` is tracked by git** although `.gitignore` lists `__pycache__/`.
- **Line endings:** `core.autocrlf=true` and no `.gitattributes`, so every text file is checked out with CRLF on the owner's PC and with LF on the Linux deploy. Any tool that compares a generated text with a file on disk must ignore CR (the KI-2 trap).

## 2. What a comment is, and what "Russian" means

**Comment** — by file type:

| Files | Comment |
|---|---|
| `*.js`, `*.mjs` | what acorn reports through `onComment` (line and block comments; never strings, template literals or regexes) |
| `*.css` | `/* … */` outside quoted strings |
| `*.py` | `#` to end of line outside strings; a triple-quoted string that starts a logical line (docstring). Exception: the first docstring of a file that contains `print(__doc__)` is usage help — a string, not a comment |
| `*.yml` | `#` at the start of a line or after whitespace, outside quotes; shell comments inside `run: \|` blocks count |
| `firestore.rules`, `firestore.open.rules` | `//` to end of line |

**Russian comment** — a comment with a Cyrillic letter (U+0400–U+04FF) after removing every `«…»` span. Guillemets quote UI text or data: `// the «Точки» tab`, `// a «Дверь» point` are allowed. A whole Russian sentence in guillemets is a review finding, not a way around the rule.

**Stays Russian (strings, not comments):** UI source texts, toast and error messages, event-log lines (always Russian, `CONTEXT.md`), test names and assertion messages, the usage help of `tohnit.py`, Russian data in tests, i18n JSON.

## 3. Header comments

### Source modules (`src/**/*.js`, `scripts/*.mjs`)

The header is the leading comment block: after an optional `#!` line and blank lines, either consecutive `//` lines or one `/* … */` block (leading ` * ` stripped). Nothing but blank lines may come before it. Its first paragraph runs to the first empty comment line.

Shape:

```js
// Points screen: the point form, the batch generator, the point card with history and the «Точки» tab.
// Reads state from store.js and writes through repo.save; statuses and composition come from src/domain.
//
// Contents:
// - pointForm() — add and edit one point
// - generatorModal() — create points in a batch by a label pattern
// - pointCard() — one point: tasks, devices, history
// - pointsTab() — the list with filters and search
```

- **First sentence** — what the module holds, in English, at most 200 characters, ideally under 120. It becomes the module's line in the code map.
- **Next sentences** of the first paragraph — what it talks to: the modules, storage (repo, IndexedDB, `localStorage` keys), external services (Firestore, Drive, Sheets, MuPDF) and who calls it, where that is not obvious from the imports.
- **Contents** — modules of 30 KB or more (today `points.js`, `planmodal.js`, `guide.js`, `racks.js`, views `doh.js`, `pullview.js`, `repo.js`, `tohnitview.js`, `settings.js`): one line per part, the function name and what it does. A part is a group of functions behind one screen or one job, 4–12 lines in all.
- Words of `CONTEXT.md` (project, point, journal row, daily report, drawing…), not their listed synonyms.
- A pure re-export module (`src/domain/index.js`) gets one sentence: what it re-exports and why.

### Test modules (`tests/*.test.js`)

The first comment says what the file checks and which modules it covers: `// Checks the daily report (src/domain/doh.js): totals, Hebrew text, per-point quantities.` Not in the code map.

### `tools/` and `vite.config.js`

Tools of this stage start with an English header in the same shape; `vite.config.js` gets one (what it configures). Not in the code map (`docs/formats.md`: `src/` and `scripts/` only).

## 4. Translating comments

- Translate the meaning, not word by word; shorten where the Russian repeats the code. Keep every fact (why, edge cases, dates, links to ADRs and KIs).
- A comment that is wrong about the code: write what the code really does and add a `KNOWN_ISSUES.md` entry if the difference looks like a bug. Never change code in this stage.
- No new comments beyond headers and contents, except a short one where a translated comment needs it to make sense.
- Only comments change: no code, no whitespace inside code lines, no reformatting. A block comment that spans lines is translated as a block comment that spans lines (a line break inside a block comment can matter for automatic semicolon insertion).
- `firestore.rules`: comments translated; then `firestore.open.rules` is regenerated (command in 6.3), never edited by hand.
- Workflows (`.github/workflows/*.yml`): comments only; `name:` values are strings and stay.

## 5. Code map — `tools/code-map.mjs`

Behaviour as in `docs/formats.md`, "Code map", plus:

- **Modules:** every `*.js` and `*.mjs` under `src/` and `scripts/` on disk (untracked new files count), paths with `/`, sorted by plain string order.
- **First sentence:** first paragraph joined into one line (single spaces); the sentence ends at `.`, `!` or `?` that is followed by the end of the paragraph, or by whitespace and then a character that is not a lowercase letter or digit. `e.g.`, `i.e.`, `vs.` and `cf.` never end it. So `merge.js`, `1.2`, `src/app/` and `Opens a.b. then` do not end a sentence; `Holds X. Talks to Y` ends after `X.`.
- **English header:** the sentence has no Cyrillic outside `«…»`.
- **Line:** `` - `src/app/repo.js` — <sentence> ``. A module with no header or no English header: `` - `src/app/repo.js` — (no English header yet) ``.
- **Writing:** replaces the text between the line starting `<!-- code-map:start` and the line `<!-- code-map:end -->`. Markers missing → error, exit 2, nothing written. Comparison ignores `\r`; the file is written with the line ending it already uses.
- **`PENDING`** (exported array in the tool): paths still waiting for their ticket. An entry ending in `/` matches the files directly in that folder (not subfolders); any other entry matches one file.
- **Problems:** a module without an English header and not pending; a sentence over 200 characters (pending or not).
- **CLI:** `node tools/code-map.mjs` writes the map, prints `code map: <n> modules, <k> pending` and every problem, exits 1 if there is a problem. `--check` writes nothing and exits 1 if the map is stale or there is a problem.
- **Exports** for the test: `listModules(root)`, `headerOf(text)`, `firstSentence(paragraph)`, `buildList(root)`, `renderMap(mapText, list)`, `checkMap(root)` → `{ stale, problems }`, `PENDING`.

## 6. Russian comments and "same code" — `tools/ru-comments.mjs`, `tools/same-code.mjs`

### 6.1 `tools/ru-comments.mjs`

- Scope: `src/**/*.{js,css}`, `scripts/*.mjs`, `tests/*.js`, `tools/**/*.{mjs,py}`, `vite.config.js`, `firestore.rules`, `firestore.open.rules`, `.github/workflows/*.yml`.
- `node tools/ru-comments.mjs [paths…]` prints `path:line: <comment, first 100 characters>` for every Russian comment (section 2) in the given files or the whole scope, then `<n> Russian comments in <k> files`; exit 1 if any is outside its own `PENDING` (same matching as 5). A ticket session uses it as the to-do list of its files.
- Exports: `commentsOf(path, text)` → `[{ line, text }]` (by file type, section 2), `isRussian(comment)`, `scanScope(root)`, `PENDING`.
- A JS file acorn cannot parse is reported as a problem (exit 1), never skipped.

### 6.2 `tools/same-code.mjs` — "only comments changed"

`node tools/same-code.mjs [base]`, base by default `git merge-base HEAD origin/main`. Two checks, both must pass (exit 0); the report says which failed and why.

1. **Per-file code.** For every file changed between base and the working tree (committed, staged, unstaged and untracked, from git): JS — acorn token streams without comments are equal (type and value of each token); CSS, Python, YAML, rules — text without comments (section 2), with line endings and trailing whitespace normalised, is equal. Other files (Markdown, JSON, `.gitattributes`, images) are listed as "not code, not compared". Added, deleted or renamed code files are listed as changes.
2. **Built site.** The base tree is checked out with `git worktree add --detach` into a temp folder with a `node_modules` junction to the project's own; the working tree's `firestore.open.rules` is copied into it **only when** check 1 found that file comment-only. Both trees are built through the Vite API with their own `vite.config.js`, `define.__BUILD__` fixed to the same string and `outDir` in a temp folder (`vite.config.js` is not changed). Every file of both outputs is compared byte for byte; the report lists missing, extra and different files. The worktree and temp folders are removed at the end, also after a failure. `--no-build` skips check 2 (for quick runs while working; the self-check always runs both).

Exit codes: 0 — same; 1 — code or built site differs; 2 — the tool could not run (git, build error).

### 6.3 Commands a ticket uses

- Regenerate open rules (PowerShell, project folder): `node --input-type=module -e "import fs from 'node:fs'; import { openRules } from './src/domain/openrules.js'; fs.writeFileSync('firestore.open.rules', openRules(fs.readFileSync('firestore.rules', 'utf8')))"`
- Code map: `node tools/code-map.mjs`; check only: `node tools/code-map.mjs --check`.
- Russian comments left in my files: `node tools/ru-comments.mjs <paths>`.
- Only comments changed: `node tools/same-code.mjs`.

## 7. Known issues fixed in ticket 01

- **KI-1:** `tests/i18n.test.js` imports `pathToFileURL(file).href` (from `node:url`) instead of the path. Entry → `fixed (test: i18n: английский, i18n: иврит pass on Windows)`.
- **KI-2:** new `.gitattributes`:

  ```text
  firestore.rules text eol=lf
  firestore.open.rules text eol=lf
  ```

  then the two files are deleted and checked out again (`git checkout -- firestore.rules firestore.open.rules`) so the working copy turns LF. The Linux deploy already builds with LF, so the site does not change. Entry → `fixed (test: правила открытой версии…)`. `PROJECT_CONTEXT.md`: known test failures — none.
- `.gitattributes` is listed in the "Not code" part of `docs/code-map.md`.

## 8. Tests — `tests/code-docs.test.js`

Header: checks the code map, header comments and the comment language. Offline, no build (coding standard 2).

Unit cases:
- `firstSentence`: `merge.js` and `1.2` inside; `e.g.` followed by a word; a sentence followed by a lowercase word (does not end); `!` and `?`; a paragraph without a final period (whole paragraph); a sentence over 200 characters (problem).
- `headerOf`: `//` block; `/* */` and `/** */` with ` * `; shebang first; an import before the comment (no header); a blank line between header lines in a `//` block (two paragraphs).
- `renderMap`: CRLF file → the CRLF kept, a stale list is replaced; missing markers → error.
- `commentsOf`: JS — Cyrillic in a string, a template literal with `${}` and a regex is not a comment, in `//` and `/* */` it is; CSS; Python — `#` inside a string, a docstring, the `print(__doc__)` exception; YAML — `#` inside quotes, `# comment` after a value; rules — trailing `//`.
- `isRussian`: `«Точки»` alone → no; `«Точки» таб` → yes; Hebrew → no.
- `same-code` per-file comparison (exported `sameCode(path, a, b)`): a changed comment → same; a changed string, an added token → different; CRLF vs LF → same.

Repo cases:
- `checkMap(root)` has no problems and the map is not stale.
- every Russian comment in the scope is in a `PENDING` path.
- every `tests/*.test.js` starts with a comment (pending while `tests/` is in `PENDING` of `ru-comments`).
- every `PENDING` entry of both tools still matches at least one file (a stale entry fails, so lists only shrink honestly).

Existing suite: all 144 + new tests pass on Windows and Linux after ticket 01.

## 9. How `PENDING` shrinks

Ticket 01 fills both lists with every path below; each later ticket deletes its own entries and must leave its files clean. Ticket 09 deletes both empty lists and the "pending" code paths, so the map and comment checks are strict from then on.

| Ticket | Entries removed from `PENDING` (code map / Russian comments) |
|---|---|
| 02 domain | `src/domain/` |
| 03 app core | `src/app/`, `src/main.js`, `src/edition.js`, `src/firebase.js`, `src/log.js`, `src/i18n/` |
| 04 views 1 | `src/app/views/` files: `points racks pullview racktable pointmerge pointsfile pointchooser cablespick doorchips doorcfgview ownworks latinfix` |
| 05 views 2 | `planmodal tohnitview planversion planpick planlink planview planassign plannumbers pdfpick import guide` |
| 06 views 3 | `doh settings wizard catalogview project poolview shilutsettings managersfolder tables todos sheetslist history manualsview members journal projects month log` |
| 07 drawings, scripts, config | `src/tohnit/`, `scripts/`, `src/style.css`, `vite.config.js`, `firestore.rules`, `firestore.open.rules`, `.github/workflows/` |
| 08 tests and Python | `tests/`, `tools/tohnit/` |

Views are listed file by file (`src/app/views/<name>.js`) because the folder is split over three tickets.

## 10. Ticket self-check in this stage

Replaces step 3 of the self-check (`docs/workflow.md`) for this stage; steps 1, 2 and 4 stay.

1. `npm test` — all pass (no known failures after ticket 01).
2. `npm run build` passes.
3. `node tools/code-map.mjs --check` — exit 0; `node tools/ru-comments.mjs <the ticket's paths>` — none.
4. `node tools/same-code.mjs` — exit 0. Byte-identical output means the live site gets the same files, so there is nothing new to walk in the browser. Expected exceptions, checked by reading the list: ticket 01 (its tools, `tests/code-docs.test.js`, `tests/i18n.test.js`, `.gitattributes`); ticket 09 (the two tools, the test). In both the built site must still be byte-identical.
5. Deploy: push to `main`, `gh run list --workflow pages.yml --limit 1` → success.

After the deploy the ticket session marks the ticket `accepted`, updates `PROJECT_CONTEXT.md` and `docs/history.md`, and gives the next step (description, decision 3) — no «Работает» question. Each deploy changes only the build stamp; phones update silently.

## 11. Edge cases

- **A comment inside code that acorn sees as a string** (e.g. `//` inside a template literal of generated rules in `openrules.js`): it is a string in JS; its Russian is caught in `firestore.open.rules` instead, and translating it is part of ticket 07.
- **A Russian word that is a UI label** in a comment: guillemets, `// the «Отчёты» tab`.
- **A header that already starts with an English sentence but continues in Russian:** all Russian is translated; the code map only sees the first sentence, the comment check sees the rest.
- **A module added during the stage by a quick fix «Правка: …»:** it gets an English header at once (coding standard 3); `PENDING` never gains entries.
- **Commented-out code with Russian strings in it:** it is a comment, so the check flags it. Put the Russian strings in guillemets only if they already are; otherwise translate the strings inside the commented-out code (it does not run). Deleting dead commented-out code is out of scope.
- **The pool bot commits `src/data/starter-pool.json` to `main` mid-ticket:** not code, `same-code` lists it as "not compared"; the merge base moves only when the ticket rebases, and the self-check runs after the rebase.
- **The worktree or junction is left after a crash:** the next run removes a stale worktree of its own (`git worktree prune` and a fixed temp name under the OS temp folder) before creating a new one.
- **Template literal with CRLF in a file checked out on Windows:** JS normalises it to LF; both trees are checked out the same way, so the comparison is fair.
- **`firestore.rules` comment-only change:** `same-code` check 1 proves it; the build then compares with the new open rules copied into the base, so the only real change of the site — the comment text the wizard copies — is the one intended. Databases already set up need nothing (probe check, section 1).

## 12. What the owner checks (once, after the stage review)

On the iPhone, the app from the home screen icon:
1. ☰ → Настройки: the line «🔄 Обновить приложение (версия 1.2.0, сборка …)» shows a fresh date. If not, press it.
2. Open your project: points, plan with a drawing, «Отчёты» — today's report opens, nothing looks different.
3. Anything that looks or behaves differently from before the stage → «Есть замечания» with what and where.

Not checked by the owner: the code and the docs themselves — they are for Claude's sessions (decision 2).

## 13. Docs to update

- `docs/code-map.md` — module list built (ticket 01 creates it with placeholders, each ticket refreshes it); architecture section (ticket 09): storage and the repo, sync, offline, data paths, Google Drive and Sheets, server jobs, drawings; at most 10,000 bytes, because every spec, ticket and review session reads it. "Not code": add `.gitattributes` (01) and `tools/` tools of this stage (01); keep true (09).
- `docs/coding-standards.md` (ticket 01):
  - rule 3 — "Checked" names `tests/code-docs.test.js` and `node tools/code-map.mjs --check`;
  - new **10. Comments are in English** — Cyrillic in a comment only inside `«…»`; why: one language for every session reading the code; checked: `tests/code-docs.test.js` (`tools/ru-comments.mjs`);
  - new **11. A comment-only change keeps the built site identical** — run `node tools/same-code.mjs`; why: comment and doc changes then need no browser walk and cannot break the live site; checked: the tool in the self-check.
- `CLAUDE.md`, "Run" (ticket 01): `Code map: node tools/code-map.mjs (check only: --check)`; `Only comments changed: node tools/same-code.mjs`.
- `CONTEXT.md` (ticket 01), new section "Development": **Header comment** — the leading comment of a module; its first sentence is its code-map line. **Code map** — `docs/code-map.md`, built by `tools/code-map.mjs`. **Same-code check** — `tools/same-code.mjs`: only comments changed, built site byte-identical.
- `KNOWN_ISSUES.md`: KI-1 and KI-2 fixed (01); bugs noticed while reading — new entries in the ticket that finds them.
- `tools/tohnit/__pycache__/` untracked (`git rm -r --cached`, ticket 08).
- No new ADR: nothing here is hard to reverse.

## 14. Proposed tickets

Reading volume per ticket ≈ 230–260 KB of code (one session each). All tickets after 01 depend on 01; 02–08 do not depend on each other (one at a time, in this order); 09 needs 02–08.

| # | Ticket | Complexity | Blocked by | Covers |
|---|---|---|---|---|
| 01 | Tools: code map, Russian comments, same-code; KI-1, KI-2; docs of section 13 | complex | — | 2, 5–8, 10, 13 |
| 02 | Domain: headers and translation (`src/domain/`, 253 KB) | medium | 01 | 3, 4, 9 |
| 03 | App core: `src/app/*.js`, `main.js`, `edition.js`, `firebase.js`, `log.js`, `src/i18n/` (239 KB) | medium | 01 | 3, 4, 9 |
| 04 | Views 1 — points, racks, pulls, doors (12 files, 234 KB) | medium | 01 | 3, 4, 9 |
| 05 | Views 2 — plan, drawings, guide (11 files, 242 KB) | medium | 01 | 3, 4, 9 |
| 06 | Views 3 — reports, project, settings, pool, Google, history (18 files, 239 KB) | medium | 01 | 3, 4, 9 |
| 07 | Drawings `src/tohnit/`, `scripts/`, `style.css`, `vite.config.js`, rules, workflows (≈ 160 KB) | medium | 01 | 3, 4, 6.3, 9 |
| 08 | Tests (headers, comments by the `ru-comments` list) and `tools/tohnit/*.py`; untrack `__pycache__` | simple | 01 | 2, 3, 4, 9 |
| 09 | Architecture section of `docs/code-map.md`; delete `PENDING`, strict checks | complex | 02–08 | 5, 6, 9, 13 |

Changed against the description: 9 tickets, not 8 — tests and the Python tool get their own simple ticket (they are translated from the `ru-comments` list, not read through), and the architecture is written last, when every module has its English header. Stage estimate stays ≈ 14 sessions (description, spec, slicing, 9 tickets, review, one spare).
