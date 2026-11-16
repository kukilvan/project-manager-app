# History

Dated details of every accepted step, newest first. Read only when a session needs a past detail.

## 2026-11-16 — Spec 3: management sheets («Спека 3»)

- `.scratch/03-management-sheets/spec.md`: points sheet rows (title, project and update stamp in E2, totals, legend A–F, empty row, header; 7 or 5 frozen rows), sections by type (column A only, not merged, default alignment so the text overflows; thick `#1F3B5C` frame; «Без типа» last for no or deleted type; Russian plural, «נקודה אחת»), no pink rule, thin borders per point block, header frame; the rack sheet (12 columns, percent base = points whose type has the stage, rounded down, «—» for base 0, green only at 100%, frozen column A); `buildReport(…, { now })`, stamp out of the hash, date-only write on unchanged data with a rebuild fallback, `STYLE_V` 4; profile fields `sections`, `rackSheet` (absent = on) and `typeOrder` (`typeOrderOf`: listed, then by name); form strings with English and Hebrew; a guide line.
- Open questions answered: date on every refresh; the basic filter stays (viewers' sorts are their own; an editor's sort → a known issue in ticket 04); Excel export unchanged; one rack sheet for «perCabinet»; rack-sheet name kept, the clashing rack sheet gets « (2)».
- New Sheets requests (`updateBorders`, `mergeCells`, row height, frozen column, percent format) not checked against a real response: ticket 01 checks them on a test spreadsheet if the owner allows; `batchUpdate` is all-or-nothing, so a bad request leaves the old sheet. Four tickets proposed (01 look and stamp, 02 sections, 03 rack sheet, 04 form and guide).

## 2026-11-16 — Description 3: management sheets («Описание 3»)

- `.scratch/03-management-sheets/description.md` and mockups `status-sheet.html`, `progress-by-rack.html`, `table-profile-form.html`. Owner's and management's remarks: points grouped by type with a section row (name and count; white, large bold dark-blue text, thick dark-blue frame), two empty rows between sections; the column header keeps its colour and gets the same outer frame; update date on row 2; a legend row then one empty row (7 frozen rows); a not-done stage stays white instead of pink; thin borders; the whole row keeps its status colour; no percents in the totals row; a new sheet «Progress by rack» (counts and percents, green only at 100%). Both new parts in every profile, by two ticks on by default; the section order by ↑↓ arrows on the profile's types list (proposed, accepted at «Коммит»). The rack and label sheet stays as it is.
- Old Drive files listed by a read-only search for the owner to delete: the old template sheet, an early template-based sheet, the AppSheet data sheet (it changed on 2026-11-16, so AppSheet goes off first), its copy and the «appsheet» folder; three groups for the owner to decide. Nothing deleted by the session.
- Ten open questions for the spec (date write on unchanged data, percent base, points without a type, per-rack layout, the filter, texts, frozen rows, Excel export, storing the type order, sheet-name clash).

## 2026-11-15 — Review 2: stage 2 closed («Ревью 2»)

- `.scratch/02-nas-requirements/review.md`: the whole stage (`2deeaa5..20d6edf`) against the spec and coding standards, two parallel passes, then runs on a real PocketBase 0.40.6 (Windows binary) and on the NAS document's Dockerfile and Compose example built in Docker (downloads allowed by the owner; all removed from the scratchpad and Docker at the end).
- 15 findings, all fixed now, no fix round: the WAF rule and A3b also cover the superuser collection's id `pbc_3142635823` (a wrong password gets 400, a right one 403, so the id path was a password oracle); `PB_ENCRYPTION_KEY` exactly 32 characters (another length: PocketBase exits, restart loop); the first-superuser command with `--encryptionEnv`; password sign-in off does not stop sign-up through the records API (stage 4 sets the `users` rules, in `docs/project-spec.md`); A8 needs 200 on the second answer, A9 SKIPs only for 404 or the HTML fallback; the cleanup row names history; project-spec stage 4 points to R-ids instead of repeating numbers; settings count as musts; test host allow list as spec § 6; the document test resolves its path from the file; tool naming; `docs/formats.md` allows `accepted (planned, stages …)`; PROJECT_CONTEXT state folded.
- Checked: backup into the separately mounted folder and a restore work in the container; `auth-refresh` is not counted by `*:auth`. Not checked: anything through a real Cloudflare Tunnel. Tests 191 → 192. NAS document version `11f01e9`.

## 2026-11-15 — Ticket 2.2: the NAS check tool («Тикет 2.2»)

- `tools/nas-check.mjs`: A1–A9 and the realtime cut time (A7, A7i); `parseArgs`, `judgeA1…A9`, `checkRealtime`, `runChecks` (takes a `fetch` function), `main`; no file read or written, no dependency. `tests/nas-check.test.js`: 31 tests (stubbed responses, a stubbed realtime stream, the CLI, the NAS document check). `CLAUDE.md` Run line and the `docs/code-map.md` tools line. Tests 160 → 191.
- Beyond the spec: A8 and A9 also SKIP when `sw.js` or the manifest come back as an HTML page with 200 (PocketBase's fallback page before the site is there), not only on 404; `--quick` prints no A7i line; a `--hold` below or equal to 0 is a usage error.
- Self-check on a local PocketBase 0.40.6 (SHA-256 matched `checksums.txt`; the first start of the downloaded binary was stopped by the auto-mode classifier, the owner allowed it in chat): batch off/on flips A4, password sign-in and a dummy Google provider flip A5 (the text names the part), `--origins *` vs a custom origin flips A6, a stopped server gives exit 2. Binary and data removed from the scratchpad. Node's `fetch` checked to return 3xx with `redirect: 'manual'` and to send an `Origin` header.
- Live at `3470fb3`; owner checked `--help`. Next: «Ревью 2».

## 2026-11-15 — Ticket 2.1: the NAS document («Тикет 2.1»)

- `docs/nas-requirements.md` (24,391 bytes): sections 1–12 as spec 2 § 3; 32 requirement ids with phases; a Dockerfile (Alpine 3.22, release zip with SHA-256 re-checked against `checksums.txt`) and a Compose example (`pocketbase`, `cloudflared` 2026.11.0, secrets in `.env`); acceptance checks A1–A14 exactly as spec § 3.10. Added beyond the spec: the placeholder `<docker-subnet>` (superuser IPs need the Docker network's subnet, and the document may hold no real IP); a note that PocketBase also accepts a collection id in the URL, so the WAF rule on `_superusers` is only the outer layer and the superuser IP list is what holds; a "should" that helpers be test users while the OAuth consent screen is in Testing.
- ADR 0014 (D1–D4 with rejected options); `docs/project-spec.md` stage 2 output, stage 4 PocketBase facts and the rate-limit note, start condition A1–A7 and A10–A13, stage 5 contents; `CONTEXT.md`: NAS copy, NAS document, NAS check.
- Version line names commit `a528881` (the content commit); live in `main` at `00aa606`. The push to `main` was first stopped by the auto-mode classifier; the owner approved it in chat. Owner checked the GitHub link.

## 2026-11-15 — Stage 2 slicing («Тикеты 2»)

- Two tickets in `.scratch/02-nas-requirements/issues/` accepted: 01 the NAS document, ADR 0014, project spec and `CONTEXT.md` (complex, Opus 5.5); 02 `tools/nas-check.mjs`, `tests/nas-check.test.js` with the document check, code map and `CLAUDE.md` lines (medium, blocked by 01). Branch `claude/s02-tickets`. Ticket files stay `open` until their own sessions.
- Ticket 01 has no test of its own: the document check lives in ticket 02, so 01 checks size, ids and placeholders by hand. Ticket 02's self-check runs the tool against a local PocketBase 0.40.6 kept in the scratchpad.

## 2026-11-15 — Spec 2: NAS requirements («Спека 2»)

- `.scratch/02-nas-requirements/spec.md`: facts checked on a local PocketBase 0.40.6 (official release, checksum matched, run in the scratchpad), Cloudflare docs, the 2026-11-15 server backup and the owner's Drive. Key facts: batch off by default (50 requests, 3 s), one batch = one transaction; ids with `/`, space or `.` are rejected even with a wide pattern; JSON value ≤ 1 MB; `updated` is server time and works as the delta mark; realtime has no keep-alive, PocketBase closes an idle stream after 300 s and Cloudflare cuts it after ≈ 125 s; password sign-up open by default, token 5 days; the default rate limits count every request inside a batch (a batch of > 20 creates fails); superuser IP list honours `CF-Connecting-IP`; static files have no `Cache-Control`, so Cloudflare would keep `sw.js` 2 hours. Data: 15,827 documents, 18.4 MB JSON, history 87 %; PDFs on Drive ≈ 34 MB.
- Decisions D1–D10: one hostname served by PocketBase (site in `pb_public`, `/api/`, `/_/`); the NAS pulls builds from a public GitHub release `nas-build` (stage 5); server jobs of the NAS copy in an agent container on the NAS, `export-pool.yml` stays on GitHub; no Cloudflare Access, WAF blocks `/_/` and the superuser login; realtime may drop — stage 4 reconnects and delta-reads; drawings stay on Drive; data on the HDD mirror; PocketBase pinned. Exact settings as requirement ids (R-PB, R-SITE, R-NET, R-AUTH, R-GOOG, R-JOB, R-BAK, R-DATA, R-POW), acceptance checks A1–A14.
- Proposed tickets: 01 the NAS document + ADR 0014 + project spec and glossary (complex); 02 `tools/nas-check.mjs` with tests and the document check (medium). Owner accepted; the NAS project has decided nothing yet.

## 2026-11-15 — Description 2: NAS requirements («Описание 2»)

- `.scratch/02-nas-requirements/description.md`: stage 2 writes `docs/nas-requirements.md` (11 parts: PocketBase, site on the NAS, Cloudflare Tunnel, sign-in and Google, server jobs, backups, data volume, power and network, acceptance checks, open questions); no code change. Facts: latest backup 2026-11-13 — two projects, ≈ 15,000 documents, full JSON ≈ 18 MB.
- Owner's decisions: the site moves to the NAS too (new address, icons reinstalled; GitHub Pages stays for everyone else); the copy is used by the owner and the helpers, so public HTTPS without a VPN app; Cloudflare Tunnel to the owner's own domain (≈ 40 ₪ a year); document in English, no Russian summary. Recorded as ADR 0013; `docs/project-spec.md` stage 2 points to the description.
- Open for the spec: one address or two subdomains, build delivery to the NAS, where server jobs run, Cloudflare Access, PocketBase checks on a real instance, drawings size, a `tools/nas-check.mjs` acceptance tool.

## 2026-11-15 — Review 1: stage 1 closed («Ревью 1»)

- `.scratch/01-code-docs/review.md`: the whole stage (`0fa2436..48ceeed`) against the spec and coding standards, two parallel passes; `same-code` over the whole stage exit 0 (only comments changed, built site byte-identical); owner check walked in `?mem=1`, then done by the owner on the phone.
- 16 findings, 15 fixed now: pullview Contents, `src/domain/index.js` header, three test headers, glossary words and American spelling in comments (rule 10 now says so), code-map facts (sync limits, workflow schedules, tohnit files, journal ids by pointer), rule 11 names the open-rules exception; tools: `ru-comments` scope matches the code map, YAML apostrophe, `same-code` compares token source text. KI-3 (two same-code runs at once) deferred. 160 tests.

## 2026-11-15 — Ticket 1.9: architecture section and strict checks («Тикет 1.9»)

- `docs/code-map.md`: the hand-written architecture written from the code and module headers — start, storage and the repo, sync and read saving, offline, data paths, Google Drive and Sheets, server jobs, drawings; the "Not code" list checked against `git ls-files` (added `package.json`, `package-lock.json`, `tests/`, `.gitignore`, the `tools/tohnit/` sources). Hand-written part 8,927 bytes, whole file ≈ 30 KB: the ticket's "≤ 10,000 bytes for the whole file" cannot hold with a built list of ≈ 21 KB, so the spec 13 limit (the architecture section) was kept — left to «Ревью 1».
- `tools/code-map.mjs`, `tools/ru-comments.mjs`: both `PENDING` arrays and every pending path deleted; a module without an English header, or any Russian comment, is always a problem (exit 1). `isPending` became `inPaths(file, list)` — still used for CLI folder arguments and for `--expect`, so `tools/same-code.mjs` follows the rename (two identifiers; a fourth expected exception beyond the ticket's three). The placeholder line now reads `(no English header)`.
- `tests/code-docs.test.js`: pending cases and the stale-entry case dropped; new cases for strict `buildList` (a temp folder) and `inPaths`; 159 tests. `docs/coding-standards.md` rules 3 and 10 say how the strict checks work; `CLAUDE.md` and `CONTEXT.md` already matched.
- Proof: `node tools/same-code.mjs --expect tools/code-map.mjs --expect tools/ru-comments.mjs --expect tests/code-docs.test.js --expect tools/same-code.mjs` — exit 0, built site byte-identical (28 files); `code-map --check` and `ru-comments` (whole scope, 154 files) exit 0; deploy of `main` succeeded (commit `cc52459`).

## 2026-11-15 — Ticket 1.8: tests and Python tools documented («Тикет 1.8»)

- All 14 `tests/*.test.js` start with an English comment saying what they check and which modules they cover (9 got one, 3 were translated); the 276 Russian comments of `tests/` and `tools/tohnit/` are translated. Test names, assertion messages and Russian test data stay (strings).
- `tools/tohnit/tohnit.py`: English header comment after the shebang, English comments and docstrings; the module docstring stays Russian on purpose (printed as usage help by `print(__doc__)`), as do the Russian output texts and the Russian type names in the data. `build_skill.py` translated; `SKILL.md` needs no rebuild.
- `git rm --cached tools/tohnit/__pycache__` (already in `.gitignore`); the `tests/` and `tools/tohnit/` entries are gone from the `ru-comments` `PENDING`, so the stage test now checks every test file.
- Proof: `node tools/same-code.mjs --expect tools/ru-comments.mjs` — all other changed files comment-only, built site byte-identical (28 files); 158/158 tests; `code-map --check` exit 0; 0 Russian comments; deploy of `main` succeeded (commit `d7b0e7e`).

## 2026-11-15 — Ticket 1.7: drawings, scripts, config documented («Тикет 1.7»)

- The 9 modules of `src/tohnit/` and the 12 of `scripts/` have an English header (first sentence = the code-map line; `vite.config.js` got one too, outside the map) and every Russian comment is translated: `src/style.css`, `vite.config.js`, `firestore.rules`, the three workflows with comments. The entries are removed from both `PENDING` lists. Commit `4017aa2`, branch `claude/s01-ticket-07`; deploy of `main` succeeded.
- The one real text change: the two comment literals of `src/domain/openrules.js` are translated and `firestore.open.rules` regenerated from `firestore.rules` (never by hand), so the setup chunk of the built site carries English comments in the rules the wizard copies. Databases already set up need nothing (probe check, spec 1). `same-code` check 1 listed `openrules.js` as expected (read: exactly the two literals); check 2 passed with the new open rules copied into the base build.
- Proof: `node tools/same-code.mjs --expect src/domain/openrules.js --expect tools/code-map.mjs --expect tools/ru-comments.mjs` — every other file comment-only; 158/158 tests; `code-map --check` exit 0; 0 Russian comments in the ticket's paths.
- Found: `scripts/export-pool.mjs` says «run by hand» while the weekly workflow runs `starter-from-backup.mjs`; the header now says so. A stale comment, not a bug: no `KNOWN_ISSUES.md` entry.

## 2026-11-15 — Ticket 1.6: views 3 documented («Тикет 1.6»)

- The last 18 files of `src/app/views/` (`doh`, `settings`, `wizard`, `catalogview`, `project`, `poolview`, `shilutsettings`, `managersfolder`, `tables`, `todos`, `sheetslist`, `history`, `manualsview`, `members`, `journal`, `projects`, `month`, `log`) have an English header (first sentence = the code-map line; `doh.js` and `settings.js` also a Contents list; `log.js` had none before) and all 164 Russian comments translated; their entries removed from both `PENDING` lists, so `src/app/views/` is clean. Commit `2bb81c2`, branch `claude/s01-ticket-06`; deploy of `main` succeeded.
- Proof: `node tools/same-code.mjs --expect tools/code-map.mjs --expect tools/ru-comments.mjs` — code identical without comments (the two tools differ only by the removed `PENDING` entries), built site byte-identical (28 files); 158/158 tests; `code-map --check` exit 0.
- Found: the old header of `settings.js` promised an «installation binding» that the tab does not hold; the new header says what the code does. A stale comment, not a bug: no `KNOWN_ISSUES.md` entry.

## 2026-11-15 — Ticket 1.5: views 2 documented («Тикет 1.5»)

- 11 files of `src/app/views/` (`planmodal`, `tohnitview`, `planversion`, `planpick`, `planlink`, `planview`, `planassign`, `plannumbers`, `pdfpick`, `import`, `guide`) have an English header (first sentence = the code-map line; `planmodal.js`, `tohnitview.js`, `guide.js` also a Contents list, `planversion.js` a short one) and all 150 Russian comments translated; their entries removed from both `PENDING` lists. Commit `f74dd93`, branch `claude/s01-ticket-05`; deploy of `main` succeeded.
- Proof: `node tools/same-code.mjs --expect tools/code-map.mjs --expect tools/ru-comments.mjs` — code identical without comments (the two tools differ only by the removed `PENDING` entries), built site byte-identical (28 files); 158/158 tests; `code-map --check` exit 0. `guide.js` texts are UI strings and stayed as they were.
- Found: nothing wrong; no `KNOWN_ISSUES.md` entry.

## 2026-11-10 — Ticket 1.4: views 1 documented («Тикет 1.4»)

- 12 files of `src/app/views/` (`points`, `racks`, `pullview`, `racktable`, `pointmerge`, `pointsfile`, `pointchooser`, `cablespick`, `doorchips`, `doorcfgview`, `ownworks`, `latinfix`) have an English header (first sentence = the code-map line; `points.js`, `racks.js`, `pullview.js` also a Contents list) and all 139 Russian comments translated; their entries removed from both `PENDING` lists. Commit `634ed75`, branch `claude/s01-ticket-04`; deploy of `main` succeeded.
- Proof: `node tools/same-code.mjs --expect tools/code-map.mjs --expect tools/ru-comments.mjs` — code identical without comments (the two tools differ only by the removed `PENDING` entries), built site byte-identical (28 files); 158/158 tests; `code-map --check` exit 0.
- Found: the old header of `latinfix.js` promised a «search of names typed in the wrong layout», but the file only holds the shortcut list and its dialog (`fixLatin`, `fixCabinet`, `needsFix` are imported and silenced with `void`, never used); the new header says what the code does. A stale comment, not a bug: no `KNOWN_ISSUES.md` entry.

## 2026-11-10 — Ticket 1.3: app core documented («Тикет 1.3»)

- All 35 modules of `src/app/` (with `tour/`), `src/main.js` (no header before), `src/edition.js`, `src/firebase.js`, `src/log.js` and `src/i18n/index.js` have an English header (first sentence = the code-map line; `repo.js` also a Contents list) and every Russian comment translated (359 comments); the seven entries removed from both `PENDING` lists. Commit `e5a5f8f`, branch `claude/s01-ticket-03`; deploy of `main` succeeded.
- Proof: `node tools/same-code.mjs --expect tools/code-map.mjs --expect tools/ru-comments.mjs` — code identical without comments (the two tools differ only by the removed `PENDING` entries), built site byte-identical (28 files); 158/158 tests; `code-map --check` exit 0. The JSON dictionaries of `src/i18n/` untouched.
- Comments that no longer matched the code were rewritten to say what it does (no bug found, no `KNOWN_ISSUES.md` entry): `drawings.js` named an old Drive folder (files now sit in the project's «Чертежи» folder), `shell.js` called the pending-send badge «⏳ N» (it shows «⬆ N»), `store.js` has two comments on one line (the second belongs to `nav`, kept in place), the first of two comments above the Drive placement in `managers.js` was older than the code under it. Cyrillic examples inside comments are in «…» (e.g. «С108» in `repo.js`).

## 2026-11-10 — Ticket 1.2: `src/domain/` documented («Тикет 1.2»)

- All 30 modules of `src/domain/` have an English header comment (first sentence = the module's line in `docs/code-map.md`) and every Russian comment translated (409 comments); `src/domain/` removed from both `PENDING` lists. Commit `464c2a3`, branch `claude/s01-ticket-02`.
- Proof: `node tools/same-code.mjs --expect tools/ --expect tests/code-docs.test.js` — code identical without comments, built site byte-identical (28 files); 158/158 tests.
- Fix beyond the ticket: `tools/same-code.mjs` no longer counts a line break before the *first* token of a file (a header added above `src/domain/index.js`, which had no comment, was flagged as a code change; the first token has no statement before it); one test case added in `tests/code-docs.test.js`.
- Left as is: the two Russian strings of `src/domain/openrules.js` (ticket 07). Misplaced comments kept in place and made true: the «U|порт» line above `hasShilut` in `shilutsheet.js` describes `portsOf`; the rename comment above `replaced` in `points.js` now says what that helper does. No bug found, no `KNOWN_ISSUES.md` entry.

## 2026-11-10 — Ticket 1.1: tools, KI-1, KI-2 («Тикет 1.1»)

- New `tools/code-map.mjs` (module list of `docs/code-map.md`, `--check`), `tools/ru-comments.mjs` (Russian comments; `PENDING` per ticket), `tools/same-code.mjs` (per-file code compare + byte-for-byte build compare in a git worktree with a `node_modules` junction); `tests/code-docs.test.js` (14 tests). Commit `036d628`, branch `claude/s01-ticket-01`.
- Decisions beyond the spec: `same-code --expect <path>` names intended code changes (the expected exceptions of spec 10 could not exit 0 otherwise; spec 6.2 and tickets 07, 09 updated); JS token compare also records whether a line break precedes each token (ASI); the base worktree gets the working tree's `.gitattributes` before checkout, otherwise KI-2 line endings made the setup chunk differ on Windows; `src/app/tour/` was missing from the spec table — added to both `PENDING` lists and to ticket 03.
- Baseline: 1,751 Russian comments in 144 files (the spec's 1,565 counted JS only, guillemets included). KI-1 and KI-2 fixed; tests 158/158 on Windows. The `tests/i18n.test.js` header translated.
- Coding standards 3 (checked), 10 (comments in English), 11 (same-code check); `CLAUDE.md` Run; `CONTEXT.md` Development.

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
