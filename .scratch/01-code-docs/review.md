Status: accepted

# Stage 1. Code documentation — review

## What was reviewed

- Commits `0fa2436..48ceeed` (from «Slicing 1: accepted» to «Ticket 1.9: accepted»), 176 files: tickets 01–09 of `.scratch/01-code-docs/issues/`.
- Against `.scratch/01-code-docs/spec.md`, the tickets, `docs/coding-standards.md`, `CONTEXT.md` and the document budgets of `docs/workflow.md`.
- Two passes, run in parallel by the code-review skill: standards (rules, glossary, budgets, code smells in the three tools) and spec (sections 2–13, translation fidelity on 15 files across tickets 02–08, 10 architecture claims checked against the code).

## Tests

- Start: 159/159 pass (Windows, Node 24).
- End: 160/160 pass (one new test: the scope of `tools/ru-comments.mjs`; three new cases in existing tests).

## Verified by running

- `npm run build` passes; `node tools/code-map.mjs --check` exit 0 (127 modules); `node tools/ru-comments.mjs` — 0 Russian comments in 154 files, exit 0.
- **The whole stage at once:** `node tools/same-code.mjs 0fa2436 --expect tools/ --expect tests/code-docs.test.js --expect tests/i18n.test.js --expect src/domain/openrules.js` — exit 0: every other code file (src, scripts, tests, Python, CSS, rules, workflows, `vite.config.js`) is comment-only, the built site is byte-identical (28 files, the new `firestore.open.rules` in both). The expected changes read by hand: `openrules.js` — exactly the two translated comment literals; `tests/i18n.test.js` — the KI-1 import; the tools and their test. Run again at the end with the stricter token compare of F14: exit 0.
- The built setup chunk carries the English comment lines of the open rules (`dist/assets/setup-*.js`), the one intended change of the site.
- Spec 11, crashed run: a stale worktree with a `node_modules` junction left in `<OS temp>/pm-same-code` → the next run removed it, passed, and the project's `node_modules` stayed whole.
- The owner's check of spec 12, walked in `?mem=1` at 420 px: a project, three points made by «Группа новых точек», today's daily report in Russian and Hebrew, ☰ → «Настройки» → «🔄 Обновить приложение (версия 1.2.0, сборка …)»; no console errors.
- This session's own changes: `node tools/same-code.mjs --expect tools/ru-comments.mjs --expect tools/same-code.mjs --expect tests/code-docs.test.js` — exit 0, everything else comment-only, built site byte-identical.

## Findings

- **F1** — Rule 11 of `docs/coding-standards.md` said "the built site is never excused", while `same-code` copies a comment-only `firestore.open.rules` into the base build (spec 6.2), so the wizard's rules text changes with check 2 still passing. **Fix now:** rule 11 names this one exception and says to read it in check 1.
- **F2** — `src/app/views/pullview.js` (38 KB): its Contents list had 3 lines; spec 3 asks for 4–12. **Fix now:** split into 4 lines.
- **F3** — `src/domain/index.js`: the second header sentence began with a lowercase file name, so `firstSentence` joined it to the first and the map line held two sentences (spec 3: a re-export module gets one sentence). **Fix now:** reworded; the map line is one sentence.
- **F4** — `tests/merge.test.js`, `tests/ownworks.test.js`, `tests/sheetfit.test.js`: the first comment did not name the modules covered (spec 3). **Fix now.**
- **F5** — Wrong tool comments: the header of `tools/ru-comments.mjs` said `code-map.mjs` reuses its scanners and path matching (it takes only the Cyrillic check); the comment of `checkMap` left `built` out of the return shape. **Fix now.**
- **F6** — `docs/code-map.md`, "Sync": said `src/domain/sync.js` decides the daily limits and counters; the read limit and both counters live in `src/app/repo.js`, `sync.js` holds the write limit. **Fix now.**
- **F7** — `docs/code-map.md`, "Not code": "they extend their own schedule" — only `server-backup.yml` and `server-tables.yml` re-enable themselves; `export-pool.yml` does not, `pages.yml` has no schedule. **Fix now.**
- **F8** — `docs/code-map.md`, "Not code": `tools/tohnit/PROMPT.md` and `ОПИСАНИЕ_ДЛЯ_ИИ.md` were not listed (ticket 09: "every other file that is not a module"). **Fix now.**
- **F9** — `docs/code-map.md`, "Data paths", repeated the journal-row id formats that `CONTEXT.md` holds ("each fact has one home"). **Fix now:** a pointer to «Journal row».
- **F10** — Comments not in the words of `CONTEXT.md`: trade words transliterated in `tests/domain.test.js` (galai, bakar, hivut, avizar, siur → detector, controller, termination, door accessory, «Сиюр»); "read saving", "saving mode" in `src/app/repo.js` and the map heading (→ delta read); `tools/tohnit/tohnit.py:1041` did not read as English. **Fix now.**
- **F11** — Spelling drift in comments: colour/color, catalogue/catalog, metres/meters (70 British forms; `CONTEXT.md` uses catalog and meters; a search for one form misses the other). **Fix now:** a script changed them inside comment ranges only (none outside comments), `same-code` proves it; rule 10 now names the words of `CONTEXT.md` and American spelling.
- **F12** — `tools/ru-comments.mjs` read `src/**/*.{js,css}` and `scripts/*.mjs`, while the code map lists `*.js` and `*.mjs` in both folders and their subfolders: a future `src/x.mjs` or `scripts/sub/x.js` would be in the map but never checked for Russian comments. **Fix now:** the scope reads `src/` and `scripts/` like the code map; new test «scopeFiles — every code-map module is in the scope».
- **F13** — YAML scanner: an apostrophe inside a word (`echo don't # …`) opened a quote and hid the comment after it (both passes found it; no such line today). **Fix now:** a quote opens only where a value or word starts; test case added.
- **F14** — `same-code` compared parsed token values, so `String.raw` with `\x41` and with `A` counted as the same code; check 2 catches that only in bundled code, not in `scripts/`, `tests/` or `tools/`. **Fix now:** tokens compare by source text (carriage returns dropped); test case added; the whole stage passes the stricter compare.
- **F15** — Spec 8 asks for "a sentence over 200 characters (problem)"; the test checked only `entryOf().tooLong`, not the `buildList` problem. **Fix now:** case added to the `buildList` test.
- **F16** — `same-code` check 2 always uses one temp folder and clears it first (spec 11, for crash cleanup), so two runs at the same time break each other. **Defer `KI-3`:** rare (one step per session), the run only fails and is repeated.

No finding needs a fix round, so the review closes the stage.

### Considered, no change

- Ticket 09 asked for ≤ 10,000 bytes for the whole `docs/code-map.md`; with a built list of ≈ 21 KB that cannot hold. Spec 13 limits the hand-written part: 9,071 bytes after this review (whole file ≈ 30.6 KB). The ticket wording was a slicing slip.
- 75 of 127 first sentences are over the "ideally under 120" characters of spec 3 (`start.js` 198). "Ideally" is not a rule, and trimming them all would not bring the list near 10 KB — a wish below.
- `src/app/tour/topics.js`, `src/app/nodoubletap.js`: the second header sentence says why, not what the module talks to — spec 3 asks for collaborators only where the imports do not show them.
- The tools keep three directory walkers and two line-number helpers; after F12 their scopes agree, and merging them is a refactor without a need. `sameCode()` is a thin wrapper, but spec 8 asks for that export.
- `firstSentence('Holds X (see Y.) Talks…')` returns the whole paragraph; the 200-character check catches a long result. In CSS, Python and YAML an added blank line counts as a code change — the safe direction.
- The map names device keys (`pz.sync.*`, `pz.reads`, `pz_gtoken`) inside its flows while `PROJECT_CONTEXT.md` holds the list: they say where a flow keeps its data; the list keeps its one home.
- Beyond the letter of the spec, all recorded in `docs/history.md` or stricter than asked: the session-rename rule (`7c6a4ef`, a workflow change outside the stage); `isPending` → `inPaths` (a fourth expected exception of ticket 09); the "line break before" mark in the token compare; the base worktree getting `.gitattributes` (KI-2 parity); `ru-comments` exit 2 for a path outside the scope; the placeholder `(no English header)` instead of spec 5's `(… yet)` once the checks became strict. The accepted spec is not rewritten.
- Translation: 15 files compared Russian against English (domain, app core, views, drawings, config, rules, workflows, tests, `tohnit.py`): facts, dates and ADR/KI links kept, nothing invented, no new comments beyond headers. The stale comments found by tickets 1.3–1.7 were rewritten to match the code; none was a bug, so no `KNOWN_ISSUES.md` entry — as spec 4 says.

## Wishes for later stages

- When a session changes a module, it trims the module's first sentence toward 120 characters: the built list (≈ 21 KB) is read by every spec, ticket and review session.
- New comments follow rule 10 as it now reads: English, words of `CONTEXT.md`, American spelling.
- KI-3 is fixed the first time two sessions need `same-code` at once.
