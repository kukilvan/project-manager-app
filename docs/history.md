# History

Dated details of every accepted step, newest first. Read only when a session needs a past detail.

## 2026-11-10 — Stage 1 slicing («Тикеты 1»)

- Nine tickets in `.scratch/01-code-docs/issues/` accepted (01 tools, 02 domain, 03 app core, 04–06 views, 07 drawings/scripts/config, 08 tests and Python, 09 architecture and strict checks). Branch `claude/s01-tickets`. Ticket files stay `open` until their own sessions.
- Found while slicing: the two Russian comment lines inserted by `src/domain/openrules.js` are string literals, so ticket 07 translates them (a string change); `same-code` check 1 lists `openrules.js` as an expected exception and the build differs only in the setup chunk with the open rules text. Noted in spec section 11, tickets 02 and 07.

## 2026-11-10 — Stage 1 spec («Спека 1»)

- `.scratch/01-code-docs/spec.md` accepted. Branch `claude/s01-spec`.
- Checked on the owner's PC: with a fixed `__BUILD__` two builds are byte-identical, and comment edits in JS, CSS and `vite.config.js` leave `dist/` byte-identical; the only comment text in the bundle is `firestore.open.rules` (wizard copy button, `?raw`); pasted rules are checked by the `meta/probe` read, so no re-paste after translation. acorn parses all 141 JS files (1,565 Cyrillic comment tokens). KI-2 fix by `.gitattributes` `eol=lf` verified (domain tests 48/48). `SKILL.md` does not include `tohnit.py`; `tohnit.py` prints its module docstring as usage help (stays Russian). A `.pyc` under `tools/tohnit/__pycache__/` is tracked (untracked in ticket 08).
- Decided: Cyrillic in a comment allowed only inside «…» (UI text, data); test names, assertion messages, event-log lines stay Russian; `PENDING` lists in `tools/code-map.mjs` and `tools/ru-comments.mjs` shrink per ticket, ticket 09 removes them; new `tools/same-code.mjs` (token-level code comparison of changed files + byte comparison of both builds via a git worktree) replaces the browser walk in this stage's self-check; header shape with a Contents list for modules ≥ 30 KB; coding standards 10 (comments in English) and 11 (comment-only change keeps the build identical).
- Tickets: 9 instead of the description's 8 — tests and the Python tool split out (simple), architecture section last; estimate stays ≈ 14 sessions.

## 2026-11-10 — Stage 1 description («Описание 1»)

- `.scratch/01-code-docs/description.md` accepted. Branch `claude/s01-description`.
- Owner's decisions: translate all Russian comments now (code, tests, `style.css`, `firestore.rules`, `tools/tohnit/`, workflows), not gradually (+3–4 sessions, stage ≈ 14); no Russian explainer or diagram for the owner; every ticket gets the self-check plus a built-site-unchanged check and goes live, the owner checks once after the stage review; rollback point before any file change.
- Rollback branch `rollback-2026-11-10` at `172c588` created and pushed (code identical to `2966523`).
- Found: 124 of 127 modules have a Russian header (missing: `src/main.js`, `src/app/views/log.js`, `src/domain/index.js`); ~1,360 Russian comment lines in `src/` and `scripts/`; 4 of 13 test modules have a header. KI-2 cause confirmed (CRLF checkout vs `\n`-joined lines inserted by `openRules`); `docs/project-spec.md` Stage 1 updated.
- Proposed for the spec (owner: no objection): `firestore.rules` comment changes need no re-paste into the Firebase console.

## 2026-11-10 — Adoption onto the workflow («Перенос на схему»)

- The project (version 1.2.0, ~368 commits, last owner-checked commit `2966523`) moved onto the stage workflow. Branch `claude/adopt-workflow`.
- `HANDOFF.md` (47 KB, Russian, the hand-off from the claude.ai project sessions) was split into: `docs/project-spec.md` (purpose, users, done, plans → stages), `CONTEXT.md` (glossary), `docs/adr/0001`–`0012` (decisions), `docs/code-map.md` (architecture), `PROJECT_CONTEXT.md` (environment, keys by name, gotchas), `docs/coding-standards.md` (rules from gotchas and the work order), `docs/workflow.md` (work order with the owner, quick fixes), `docs/rollback.md` (branches). The full original is at commit `44ac16d`. `README.md` and `ВОССТАНОВЛЕНИЕ.md` stay as they were (Russian, for people); README got a docs line.
- Owner's answers: quick fixes as a separate one-session lane; code goes to `main` after the self-check and the owner checks live, as before (ADR 0011); NAS setup is a separate project, this app writes its requirements (stage 2); management sheets remarks come in stage 3's description; PocketBase when the owner trusts the NAS — a full copy tested in parallel for several days, then possibly main (ADR 0012); the owner wants the whole code documented — stage 1, detailed.
- Decided alone: new docs, comments and commit messages in English (cheaper to read every session); `✅ Checked by owner: …` replaces `✅ Проверено Иваном: …`; drawing catalog growth and photos stay "later"; code map script in Node (`tools/code-map.mjs`, stage 1) since the stack is JS.
- Found: 3 of 144 tests fail on Windows (KI-1, KI-2). `npm ci` was run locally (node_modules was missing).
- Owner's NAS: UGREEN DXP2800, 2×3 TB HDD, 500 GB NVMe (HANDOFF said 2×2 TB — corrected by the owner); arrives 2026-11-11 without disks.

## Before 2026-11-10

Work log of the earlier sessions: the git history (Russian commit messages, `✅ Проверено Иваном: …` markers) and `HANDOFF.md` at commit `44ac16d`, sections 3 (done), 4 (plans) and 10 (how we worked).
