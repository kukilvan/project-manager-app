# Project context

Current state only; budget 20,000 bytes (`wc -c`). Details of finished work live in `docs/history.md`. Updated: 2026-11-16.

## Next step

«Ревью 3» — the whole stage 3 against its spec and `docs/coding-standards.md` (`.scratch/03-management-sheets/review.md`); the last ticket (3.4) is accepted. Model: Opus 5.5, effort high (`docs/models.md`, review of a 4-ticket stage).

Quick fixes «Правка: …» may come at any time; they do not change this step.

## State

- Version 1.2.0 live at https://kukilvan.github.io/project-manager-app/; everything up to commit `2966523` checked by the owner on the phone (branch `rollback-2026-11-09b`; rollback point before stage 1: `rollback-2026-11-10`, same code). Ticket 1.1 (tools, KI-1, KI-2) live 2026-11-10, commit `036d628`; ticket 1.2 (`src/domain/`) live 2026-11-10, commit `464c2a3`; ticket 1.3 (app core) live 2026-11-10, commit `e5a5f8f`; ticket 1.4 (views 1) live 2026-11-10, commit `634ed75`; ticket 1.5 (views 2) live 2026-11-15, commit `f74dd93`; ticket 1.6 (views 3) live 2026-11-15, commit `2bb81c2`; ticket 1.7 (drawings, scripts, config) live 2026-11-15, commit `4017aa2`; ticket 1.8 (tests and Python tools) live 2026-11-15, commit `d7b0e7e`; ticket 1.9 (architecture, strict checks) live 2026-11-15, commit `cc52459`; the built site byte-identical to the checked one each time (ticket 1.7: apart from the comment text of the open rules the setup wizard copies; tickets 1.8 and 1.9 changed no built file).
- Stage 2 done 2026-11-15: «Ревью 2» accepted (15 findings, all fixed; no fix round). Output: `docs/nas-requirements.md` (the NAS document, version `11f01e9`: requirements R-…, checks A1–A14), ADR 0013 and 0014, `tools/nas-check.mjs` (checks A1–A9) with `tests/nas-check.test.js`. Checked on a local PocketBase 0.40.6 and the document's Dockerfile in Docker; not yet through a real Cloudflare Tunnel (the NAS project's first run of the tool). The site did not change. Details: `docs/history.md`.
- Stage 1 done 2026-11-15: «Ревью 1» accepted (16 findings: 15 fixed, KI-3 deferred; no fix round), the owner checked the stage on the phone (spec 12).
- Stage 1: description, spec and slicing accepted 2026-11-10 — all Russian comments translated in this stage; 9 tickets in `.scratch/01-code-docs/issues/` (01 tools, 02 domain, 03 app core, 04–06 views, 07 drawings/scripts/config, 08 tests and Python, 09 architecture and strict checks); every ticket proves «only comments changed, built site byte-identical» with `tools/same-code.mjs` (ticket 01) and goes live without waiting for «Работает»; the owner checks once after the stage review.
- 2026-11-10: project moved onto this workflow (`docs/history.md`); `HANDOFF.md` split into these docs and removed (original at commit `44ac16d`).
- Tests: 210, all pass on the owner's Windows PC and on the Linux deploy.
- Stage 1: baseline 1,751 Russian comments in 144 files, 0 left; every one of the 127 modules in `docs/code-map.md` has an English header; the map has its architecture section; `PENDING` is gone, so `tools/code-map.mjs` and `tools/ru-comments.mjs` (and `tests/code-docs.test.js`) are strict; `tools/tohnit/__pycache__` is no longer tracked.
- The owner's NAS arrives 2026-11-11 without disks; its setup is a separate project, which builds from `docs/nas-requirements.md` (the owner gives it the GitHub link and says when the version line changes).
- Ticket 3.1 live 2026-11-16 (points sheet look: legend, update stamp in E2 written on every refresh, no pink, thin borders, header frame, `STYLE_V` 4), checked by the owner on the phone; the new Sheets requests were also checked on a real test spreadsheet (accepted by the API). Tests: 198, all pass.
- Ticket 3.2 live 2026-11-16 (sections by point type: `typeOrderOf`, `pointsCountText`, section rows with thick frame and 28 px height, «Без типа» last, `defaultTables` writes `sections` and `rackSheet`, Excel export flat), checked by the owner on the PC and the phone. Tests: 206, all pass. The grey strip under the frozen rows on the PC and the grey area right of the last column on the phone are Google Sheets display, not a table fault.
- Ticket 3.3 live 2026-11-16 (rack sheet «Итоги по шкафам»: `rackSheetOf`, percents rounded down, merged two-level header, frozen column A, progress colours from dark yellow `#E6B422` to green `#C6E5C9` (0 and «—» white), navy block frames through the header, teal `#12A3A3` lines between racks, names centred, `STYLE_V` 7), checked by the owner on the phone and the PC. Tests: 210, all pass. Not checked against a real response before the owner's run: `mergeCells`, `PERCENT` format, `DOTTED`/`SOLID_MEDIUM` borders, `frozenColumnCount` — accepted by Google on the owner's file.
- Ticket 3.4 live 2026-11-16 (profile form: point types with ▲▼ and `typeOrder`, ticks for sections and the rack sheet, guide line, glossary, KI-4), checked by the owner on the phone. Tests: 210, all pass.
- Stage 3 slicing accepted 2026-11-16: four tickets in `.scratch/03-management-sheets/issues/` (01 points sheet look and stamp — medium; 02 sections by type — medium; 03 rack sheet — medium; 04 profile form, guide, glossary — simple). Sections and the rack sheet are on for every profile once tickets 02/03 are live; the ticks to turn them off come with 04.
- Stage 3 description accepted 2026-11-16 (`.scratch/03-management-sheets/description.md`, mockups in `mockups/`): it also holds the list of old Drive files for the owner to delete (AppSheet is no longer needed). Photos on points deferred by the owner. Spec 3 accepted 2026-11-16 (`spec.md`): answers to the ten open questions, profile fields `sections`, `rackSheet`, `typeOrder` (no migration), date written on every refresh; ticket 01 may check the new Sheets requests on a test spreadsheet if the owner allows it.

## Stages

| # | Stage | Status | Sessions (est.) | Ideas |
|---|---|---|---|---|
| 1 | Code documentation | done | 14 | — |
| 2 | What the app needs from the NAS | done | 6 | — |
| 3 | Management sheets | review | 8 | — |
| 4 | PocketBase storage (when the owner trusts the NAS) | not started | 16 | — |
| 5 | Move to the NAS | not started | 10 | — |

Status values: not started · description · spec · tickets k/n · review · fix round k · done. Ideas: numbers of `docs/ideas/` files filed for the stage.

## Environment

- Owner's PC: Windows 11, PowerShell, Git 2.55, Node.js 24 (`C:\Program Files\nodejs`; not on the Git Bash PATH — use PowerShell or add it), Python 3.12, `gh` signed in as `kukilvan`. `core.autocrlf=true`. Project folder `E:\LocalAI\Bionic\project-manager-app`. CI uses Node 22.
- Repo `kukilvan/project-manager-app` (public). Deploy: push to `main` → `pages.yml` → GitHub Pages.
- Firebase (owner): project `polevoy-zhurnal`, Firestore `(default)`, Authentication → Google, Spark plan (ADR 0002). Web config is not in code: it lives on each device (`pm.connection`) and in the connect link.
- Google OAuth: per-database Client ID in `pm.connection.clientId`; shared public client `DEFAULT_CLIENT_ID` in `src/edition.js`; allowed origins in Google Cloud Console and Firebase → Authorized domains.
- GitHub Actions secrets (names only): `FIREBASE_SERVICE_ACCOUNT` (service account JSON for server jobs), `BACKUP_REPO_TOKEN` (private `kukilvan/polevoy-backups`). `GH_TOKEN` in jobs is the built-in `github.token`.
- Device `localStorage` keys: `pm.connection`, `pm.mode` (`local`), `pm.localUser`, `pm.authCached`, `pm.admin.<projectId>`, `pm.lang`; `pz.sync.*` sync marks; `pz.reads`, `pz.writes` daily counters; `pz.layers.<id>`, `pz.theme`, `pz.currentProject.*`, `pz_gtoken` (Google token); `pz.log.v1` event log.
- Known test failures on the owner's PC: none (KI-1 and KI-2 fixed in ticket 1.1).
- Owner's documents outside GitHub, in the claude.ai project «Менеджер проектов»: old plans, the AppSheet functional description, the old Apps Script, reference point files by drawings.

## Gotchas

- The pool bot may commit to `main` on Mondays 09:00 UTC («Стартовый набор: обновлён из общего пула»): `git pull --rebase` before pushing.
- In `?mem=1` listeners are synchronous: real Firestore races (e.g. an old project snapshot dropping a new drawing) do not reproduce — reason them out in the code.
- PDF captions: two labels may be one text run (`FC/B09-10 FC/B11-12`); `splitLabelRuns` in `src/tohnit/engine.js` splits them.
- `RANGE` in `src/domain/merge.js` counts by the last digits (`B05-06` → 2), limits 1–8, else cables-by-label is not applied.
- Double-tap zoom on iPhone is stopped by three measures: `touch-action: manipulation`, `src/app/nodoubletap.js`, no text selection on touch screens; plus `maximum-scale=1`.
- iPhone keyboard covers inputs: modals follow `visualViewport` (`src/app/keyboard.js`).
- In Playwright the tour pops up first: press «Не напоминать».
- Owner's PDF edits (replacing captions in the same font and color) are one-off, outside the app, with pymupdf: strings replaced in the content stream (Type0 Identity-H fonts, codes from ToUnicode, Tm adjusted when length changes); results go to the owner as files.
