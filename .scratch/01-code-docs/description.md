Status: in review

# Stage 1. Code documentation — description

## Goal

Every part of the code is described in English so a session finds what it needs without reading the code through. The owner asked for documentation of how everything works and what connects to what. The owner also chose to have **all** Russian comments translated in this stage, not gradually.

## What the owner will see at the end

No screens and no behaviour change: the site after the stage works exactly as before. What changes is in the repo:

- Every source module in `src/` and `scripts/` opens with an English header comment: the first sentence says what it holds (its line in the code map), the next ones what it talks to. Large modules (screens of 50–70 KB such as `points.js`, `planmodal.js`, `racks.js`, `doh.js`) add a short table of contents of their parts.
- Every test module opens with a comment saying what it checks.
- No Russian comments are left in the code and the config files (list under "In scope"). Russian **strings** stay: Russian is the source language of the UI.
- `docs/code-map.md`: the architecture section (storage and the repo, sync, offline, data paths, Google Drive and Sheets, server jobs, drawings) and the module list built by `tools/code-map.mjs`.
- `npm test` is green on the owner's Windows PC too (KI-1 and KI-2 fixed).

## Facts found while describing

- 127 modules in `src/` and `scripts/`; 124 already have a header comment, in Russian and not in the new shape. No header: `src/main.js`, `src/app/views/log.js`, `src/domain/index.js`.
- Russian comment lines: about 1,210 full-line and 150 trailing in `src/` and `scripts/`; 65 in `tests/`; 121 in `tools/tohnit/tohnit.py`; 20 in `src/style.css`; 15 in `firestore.rules` (plus the comment lines `openRules` inserts into `firestore.open.rules`); a few in `vite.config.js`, `tools/tohnit/build_skill.py` and the workflows.
- Code size to read: views ≈ 715 KB, app core with `main.js`, `edition.js`, `firebase.js`, `log.js`, i18n and tour ≈ 270 KB, domain ≈ 255 KB, drawings (`src/tohnit/`) with `scripts/` ≈ 150 KB.
- Test run on the owner's PC (2026-11-10): 144 tests, 141 pass; the 3 failures are exactly KI-1 (2) and KI-2 (1).
- KI-2 cause confirmed: git stores the rules with LF, the checkout has CRLF (`core.autocrlf=true`, no `.gitattributes`); `openRules` inserts its own lines joined with `\n`, so the generated text mixes CRLF and LF and differs from the CRLF `firestore.open.rules`.

## In scope

- `tools/code-map.mjs` and its test, behaviour as in `docs/formats.md`, "Code map"; the Run line of `CLAUDE.md`.
- English header comments for all modules in `src/` and `scripts/`; header comments for all test modules.
- Translation of every Russian comment in: `src/` (JS and `style.css`), `scripts/`, `tests/`, `tools/tohnit/*.py`, `vite.config.js`, `firestore.rules` and the lines `openRules` inserts (then `firestore.open.rules` is regenerated), `.github/workflows/*.yml`.
- A check that a comment-only change does not change the built site (see Decisions, 3).
- Architecture section of `docs/code-map.md`; its "Not code" list kept true.
- Fix KI-1 and KI-2.
- New coding-standards rule if the stage introduces one (e.g. "comments in English", "build unchanged by comment-only tickets").

## Out of scope

- Any change to behaviour, names of functions or variables, file layout, refactoring. A bug noticed while reading goes to `KNOWN_ISSUES.md`, not fixed in this stage.
- Russian string literals: UI source texts, error and toast messages, test names and assertion messages (they are strings, not comments; the spec confirms the list).
- `docs/` other than `code-map.md`, `coding-standards.md` (if a rule is added) and the KI entries; `README.md` and `ВОССТАНОВЛЕНИЕ.md` stay Russian (for people).
- A Russian explainer or diagram for the owner: not wanted (Decisions, 2).

## Pulled-in known issues and wishes

- **KI-1** — i18n tests import a Windows path without `file://`; fix with `pathToFileURL`.
- **KI-2** — open-rules test fails on a CRLF checkout; cause above. Options for the spec: `.gitattributes` with `eol=lf` for the rules files, or line-ending normalisation in `openRules` / the test.
- No earlier reviews; no ideas filed for the stage.

## Decisions taken with the owner

1. **All Russian comments are translated now**, not when a session touches the code. Why: the owner wants the whole code in one language at once; future sessions read English comments slightly cheaper. Cost: 3–4 more sessions than the plan.
2. **No separate explanation for the owner.** The documentation is for Claude's sessions, in English; no Russian page and no diagram are added for the owner.
3. **Checking.** Every ticket gets the full self-check (`docs/workflow.md`) and goes to `main` after it (ADR 0011), plus a check that the built site is the same as before the ticket (the spec defines it: Vite drops comments, so the built JS should match apart from the build stamp). The owner checks **once, after the whole stage** (after the review), or earlier if something looks wrong. So in this stage a ticket session does not wait for «Работает»: after the self-check and the deploy it sets the ticket to `accepted`, updates `PROJECT_CONTEXT.md` and `docs/history.md`, and gives the next step. The commit with `✅ Checked by owner: …` comes after the owner's single check.
4. **Rollback point before any file change.** Created in this session: branch `rollback-2026-11-10` at `172c588` (code identical to the owner-checked `2966523`; only docs differ); row added to `docs/rollback.md`.

## Open questions for the spec

- The code-map test cannot be strict while modules still lack an English header. How does it grow across tickets: a shrinking list of exceptions, a check only of the folders already done, or strict mode switched on by the last header ticket?
- "Built site unchanged": exactly what is compared (file names with content hashes in `dist/assets/`, the bundle text without the build stamp, the service worker precache list) and whether it is a script in `tools/` with a test or a self-check step only.
- How to tell a "Russian comment" mechanically for the final check: Cyrillic inside a comment, not inside a string or a template literal (templates with `${…}` and regexes make a naive search wrong).
- Whether test names and assertion messages stay Russian (proposed: yes, they are strings) and whether `tools/tohnit/SKILL.md` must be rebuilt after `tohnit.py` comments change (`build_skill.py`).
- Comments inside `firestore.rules` change the file the owner pastes into the Firebase console: the console copy then differs only in comments; does the owner need to paste it again (proposed: no)?
- Ticket split by reading volume, one session each, about 250–350 KB of code per ticket. Proposed: (1) code-map tool, build check, KI-1, KI-2; (2) domain; (3) app core with `main.js`, `edition.js`, `firebase.js`, `log.js`, i18n, tour; (4–6) views in three parts; (7) drawings (`src/tohnit/`), `scripts/`, `tools/tohnit/`, tests, config files; (8) architecture section and the strict code-map test. Then the review. Stage estimate: ≈ 14 sessions instead of 12.
