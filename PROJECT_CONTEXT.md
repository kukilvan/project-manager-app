# Project context

Current state only; budget 20,000 bytes (`wc -c`). Details of finished work live in `docs/history.md`. Updated: 2026-11-24.

## Next step

«Тикет 8.2» — stage 8, field improvements 3: ticket `.scratch/08-field-improvements-3/issues/02-plan-remembers-view.md` (the plan remembers the drawing, place and zoom, idea 009; `planmemory.js`, `onView`, resize keeps the centre, «Test drawing 2»). Model: Sonnet 5.5, effort high (`docs/models.md`, medium ticket). Then «Ревью 8». The owner finishes the whole stage 8 first, while the NAS is being checked.

After «Ревью 8»: «Описание 4» — stage 4, PocketBase storage (`docs/project-spec.md`, stage 4). It starts only when the NAS acceptance checks A1–A7 and A10–A13 pass (`docs/nas-requirements.md`) and the owner says the NAS is reliable; until then only «Правка: …», «Вопрос: …» and «Идея: …» sessions. Model: Opus 5.5, effort high. The description pulls in KI-8, the review-6 wish for the shared-list rules (`.scratch/06-field-improvements/review.md`) and the carrying of `nameEn` on project and pool items (`.scratch/07-field-improvements-2/review.md`) and of `planColour` on project catalog works, never in the pool (idea 008, stage 8 description).

Quick fixes «Правка: …» may come at any time; they do not change this step.

## State

- Version 1.2.0 live at https://kukilvan.github.io/project-manager-app/; everything up to commit `2966523` checked by the owner on the phone (branch `rollback-2026-11-09b`; rollback point before stage 1: `rollback-2026-11-10`, same code). Ticket 1.1 (tools, KI-1, KI-2) live 2026-11-10, commit `036d628`; ticket 1.2 (`src/domain/`) live 2026-11-10, commit `464c2a3`; ticket 1.3 (app core) live 2026-11-10, commit `e5a5f8f`; ticket 1.4 (views 1) live 2026-11-10, commit `634ed75`; ticket 1.5 (views 2) live 2026-11-15, commit `f74dd93`; ticket 1.6 (views 3) live 2026-11-15, commit `2bb81c2`; ticket 1.7 (drawings, scripts, config) live 2026-11-15, commit `4017aa2`; ticket 1.8 (tests and Python tools) live 2026-11-15, commit `d7b0e7e`; ticket 1.9 (architecture, strict checks) live 2026-11-15, commit `cc52459`; the built site byte-identical to the checked one each time (ticket 1.7: apart from the comment text of the open rules the setup wizard copies; tickets 1.8 and 1.9 changed no built file).
- Stage 2 done 2026-11-15: «Ревью 2» accepted (15 findings, all fixed; no fix round). Output: `docs/nas-requirements.md` (the NAS document, version `11f01e9`: requirements R-…, checks A1–A14), ADR 0013 and 0014, `tools/nas-check.mjs` (checks A1–A9) with `tests/nas-check.test.js`. Checked on a local PocketBase 0.40.6 and the document's Dockerfile in Docker; not yet through a real Cloudflare Tunnel (the NAS project's first run of the tool). The site did not change. Details: `docs/history.md`.
- Stage 1 done 2026-11-15: «Ревью 1» accepted (16 findings: 15 fixed, KI-3 deferred; no fix round), the owner checked the stage on the phone (spec 12).
- Stage 1: description, spec and slicing accepted 2026-11-10 — all Russian comments translated in this stage; 9 tickets in `.scratch/01-code-docs/issues/` (01 tools, 02 domain, 03 app core, 04–06 views, 07 drawings/scripts/config, 08 tests and Python, 09 architecture and strict checks); every ticket proves «only comments changed, built site byte-identical» with `tools/same-code.mjs` (ticket 01) and goes live without waiting for «Работает»; the owner checks once after the stage review.
- 2026-11-10: project moved onto this workflow (`docs/history.md`); `HANDOFF.md` split into these docs and removed (original at commit `44ac16d`).
- Stage 7 done 2026-11-21: «Ревью 7» accepted (2 findings, both fixed now; no fix round). Field improvements 2, idea 007 in 7 tickets, each checked by the owner on the phone: the test drawing `?mem=1&memPlan=1` (`src/domain/testplan.js`); several-value point filters with «✖ Сбросить фильтры» on every screen (`src/domain/filters.js`, `src/app/views/multifilter.js`, coding-standards rule 13); rack, type and door-configuration filters shared by «Точки» and «План» (`src/app/sharedfilters.js`), plan stages, modes, missing values and focus point (`src/domain/planfilters.js`); «Что осталось» recording several works through «Несколько работ» in one save, a pull only for the ticked cables (`remainingPreset`); English names of catalog items (`nameEn`, own names first, KI-7 catalog half fixed, KI-7 stays open for sentences built from parts). Details: `docs/history.md`.
- Stage 8 description accepted 2026-11-24 (`.scratch/08-field-improvements-3/description.md`, mockup `mockups/catalog-work.html`): ideas 008 and 009 as written, except no work unticked by default (no `HIV_DEV` rule) and the box «Учитывать в цвете точки на плане» is a project setting kept out of the shared pool; no other owner wishes. ≈ 3 tickets.
- Stage 8 spec accepted 2026-11-24 (`.scratch/08-field-improvements-3/spec.md`): 2 tickets. Idea 008: a work counts in the plan colour unless `planColour === false` (a «Протяжка» work always counts), dropped in one place inside `planColor`; `bare()` drops project-only fields (`PROJECT_ONLY`), so the box never reaches the pool; ADR 0018 comes with ticket 01. Idea 009: `src/domain/planmemory.js`, the viewer keeps the centre on resize; the test drawing gets FA/C-06 and «Test drawing 2».
- Stage 8 slicing accepted 2026-11-24: 2 tickets in `.scratch/08-field-improvements-3/issues/` (01 works not in the plan colour, 02 the plan remembers the view), independent, 01 first (both touch `src/domain/testplan.js`); each goes live before the owner checks it.
- Ticket 8.1 live and checked by the owner 2026-11-24: works not in the plan colour (`planColour`, `PROJECT_ONLY` in `bare()`, ADR 0018, FA/C-06 in the test drawing). Deploys of 2026-11-23/24 had failed on five untranslated starter-pool names; fixed in the same push.
- Tests: 340, all pass on the owner's Windows PC and on the Linux deploy.
- Stage 1: baseline 1,751 Russian comments in 144 files, 0 left; every one of the 127 modules in `docs/code-map.md` has an English header; the map has its architecture section; `PENDING` is gone, so `tools/code-map.mjs` and `tools/ru-comments.mjs` (and `tests/code-docs.test.js`) are strict; `tools/tohnit/__pycache__` is no longer tracked.
- The owner's NAS arrives 2026-11-11 without disks; its setup is a separate project, which builds from `docs/nas-requirements.md` (the owner gives it the GitHub link and says when the version line changes).
- Stage 3 done 2026-11-16: «Ревью 3» accepted (6 findings, all fixed; no fix round). Management sheets: legend, update stamp «Обновлено» in E2 written on every refresh (date-only write when the data is unchanged), no pink, thin borders, sections by point type in the profile's `typeOrder`, the last tab «Итоги по шкафам» (percents rounded down, progress colours), profile ticks for sections and the rack sheet, KI-4; `STYLE_V` 7. Checked by the owner on the phone and the PC ticket by ticket; the Sheets requests were accepted by Google on the owner's file. Not checked against a real response: a profile with no points (review F1, guarded). Details: `docs/history.md`.
- Stage 6 done 2026-11-19: «Ревью 6» accepted (5 findings: 4 fixed, KI-8 deferred; no fix round). Field improvements, ideas 001–006 in 8 tickets, each checked by the owner on the phone: day off with a reason (KI-5); shared delay reasons, culprits and problems in the pool (ADR 0016, KI-6; the owner published the rules 2026-11-18); problems on points in the subcollection `problemMarks` (ADR 0017), red on the plan and in the management sheet (column «Проблема», `STYLE_V` 8); plan colours by works after the pull (idea 006: pink, OKLab gradient, pull circles; `NUMBERED_V` 4 after the review); the English and Hebrew UI translated with a coverage test (rule 12, KI-7). Details: `docs/history.md`.

## Stages

| # | Stage | Status | Sessions (est.) | Ideas |
|---|---|---|---|---|
| 1 | Code documentation | done | 14 | — |
| 2 | What the app needs from the NAS | done | 6 | — |
| 3 | Management sheets | done | 8 | — |
| 4 | PocketBase storage (when the owner trusts the NAS) | not started | 16 | — |
| 5 | Move to the NAS | not started | 10 | — |
| 6 | Field improvements (now, before stage 4) | done | 15 | 001, 002, 003, 004, 005, 006 |
| 7 | Field improvements 2 (now, before stage 4) | done | 11 | 007 |
| 8 | Field improvements 3 (now, before stage 4) | tickets 1/2 | 6 | 008, 009 |

Status values: not started · description · spec · tickets k/n · review · fix round k · done. Ideas: numbers of `docs/ideas/` files filed for the stage.

## Environment

- Owner's PC: Windows 11, PowerShell, Git 2.55, Node.js 24 (`C:\Program Files\nodejs`; not on the Git Bash PATH — use PowerShell or add it), Python 3.12, `gh` signed in as `kukilvan`. `core.autocrlf=true`. Project folder `E:\LocalAI\Bionic\project-manager-app`. CI uses Node 22.
- Repo `kukilvan/project-manager-app` (public). Deploy: push to `main` → `pages.yml` → GitHub Pages.
- Firebase (owner): project `polevoy-zhurnal`, Firestore `(default)`, Authentication → Google, Spark plan (ADR 0002). Web config is not in code: it lives on each device (`pm.connection`) and in the connect link.
- Google OAuth: per-database Client ID in `pm.connection.clientId`; shared public client `DEFAULT_CLIENT_ID` in `src/edition.js`; allowed origins in Google Cloud Console and Firebase → Authorized domains.
- GitHub Actions secrets (names only): `FIREBASE_SERVICE_ACCOUNT` (service account JSON for server jobs), `BACKUP_REPO_TOKEN` (private `kukilvan/polevoy-backups`). `GH_TOKEN` in jobs is the built-in `github.token`.
- Device `localStorage` keys: `pm.connection`, `pm.mode` (`local`), `pm.localUser`, `pm.authCached`, `pm.admin.<projectId>`, `pm.lang`; `pz.sync.*` sync marks; `pz.reads`, `pz.writes` daily counters; `pz.layers.<id>`, `pz.planView.<projectId>` (plan view memory, from stage 8), `pz.theme`, `pz.currentProject.*`, `pz_gtoken` (Google token); `pz.log.v1` event log.
- Known test failures on the owner's PC: none (KI-1 and KI-2 fixed in ticket 1.1).
- Owner's documents outside GitHub, in the claude.ai project «Менеджер проектов»: old plans, the AppSheet functional description, the old Apps Script, reference point files by drawings.

## Gotchas

- The pool bot may commit to `main` on Mondays 09:00 UTC («Стартовый набор: обновлён из общего пула»): `git pull --rebase` before pushing.
- In `?mem=1` listeners are synchronous: real Firestore races (e.g. an old project snapshot dropping a new drawing) do not reproduce — reason them out in the code.
- `?mem=1&memPlan=1` opens the project «Test drawing»: a generated one-page PDF (`src/domain/testplan.js`) with 16 points at every plan look, one unlinked and one hidden caption, a problem mark and an «ЭМ» door; `?mem=1` alone has no drawing. The button «🔀 Одинаковые точки в разном виде: 1 — объединить» (FB/C-10 and FB/C-11 on one mark) is expected.
- PDF captions: two labels may be one text run (`FC/B09-10 FC/B11-12`); `splitLabelRuns` in `src/tohnit/engine.js` splits them.
- `RANGE` in `src/domain/merge.js` counts by the last digits (`B05-06` → 2), limits 1–8, else cables-by-label is not applied.
- Double-tap zoom on iPhone is stopped by three measures: `touch-action: manipulation`, `src/app/nodoubletap.js`, no text selection on touch screens; plus `maximum-scale=1`.
- iPhone keyboard covers inputs: modals follow `visualViewport` (`src/app/keyboard.js`).
- In Playwright the tour pops up first: press «Не напоминать».
- Browser pane after a rebuild: the service worker may still serve the previous build (check the `index-*.js` name against `dist/assets/`); unregister it and clear caches (`navigator.serviceWorker.getRegistrations()`, `caches.keys()`), then reload.
- Owner's PDF edits (replacing captions in the same font and color) are one-off, outside the app, with pymupdf: strings replaced in the content stream (Type0 Identity-H fonts, codes from ToUnicode, Tm adjusted when length changes); results go to the owner as files.
