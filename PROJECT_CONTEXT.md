# Project context

Current state only; budget 20,000 bytes (`wc -c`). Details of finished work live in `docs/history.md`. Updated: 2026-11-19.

## Next step

«Тикет 6.7» — ticket 07 «Translations 2: the rest and the coverage test» of stage 6 (`.scratch/06-field-improvements/issues/07-translations-rest.md`, medium; note on the guide prefixes «• » / «# » added at 6.6). Model: Sonnet 5.5, effort high (`docs/models.md`). It is the last ticket (01–06 done); «Ревью 6» follows. The owner finishes the whole stage 6 first, while the NAS is being checked.

After «Ревью 6»: «Описание 4» — stage 4, PocketBase storage (`docs/project-spec.md`, stage 4). It starts only when the NAS acceptance checks A1–A7 and A10–A13 pass (`docs/nas-requirements.md`) and the owner says the NAS is reliable; until then only «Правка: …», «Вопрос: …» and «Идея: …» sessions. Model: Opus 5.5, effort high.

Quick fixes «Правка: …» may come at any time; they do not change this step.

## State

- Version 1.2.0 live at https://kukilvan.github.io/project-manager-app/; everything up to commit `2966523` checked by the owner on the phone (branch `rollback-2026-11-09b`; rollback point before stage 1: `rollback-2026-11-10`, same code). Ticket 1.1 (tools, KI-1, KI-2) live 2026-11-10, commit `036d628`; ticket 1.2 (`src/domain/`) live 2026-11-10, commit `464c2a3`; ticket 1.3 (app core) live 2026-11-10, commit `e5a5f8f`; ticket 1.4 (views 1) live 2026-11-10, commit `634ed75`; ticket 1.5 (views 2) live 2026-11-15, commit `f74dd93`; ticket 1.6 (views 3) live 2026-11-15, commit `2bb81c2`; ticket 1.7 (drawings, scripts, config) live 2026-11-15, commit `4017aa2`; ticket 1.8 (tests and Python tools) live 2026-11-15, commit `d7b0e7e`; ticket 1.9 (architecture, strict checks) live 2026-11-15, commit `cc52459`; the built site byte-identical to the checked one each time (ticket 1.7: apart from the comment text of the open rules the setup wizard copies; tickets 1.8 and 1.9 changed no built file).
- Stage 2 done 2026-11-15: «Ревью 2» accepted (15 findings, all fixed; no fix round). Output: `docs/nas-requirements.md` (the NAS document, version `11f01e9`: requirements R-…, checks A1–A14), ADR 0013 and 0014, `tools/nas-check.mjs` (checks A1–A9) with `tests/nas-check.test.js`. Checked on a local PocketBase 0.40.6 and the document's Dockerfile in Docker; not yet through a real Cloudflare Tunnel (the NAS project's first run of the tool). The site did not change. Details: `docs/history.md`.
- Stage 1 done 2026-11-15: «Ревью 1» accepted (16 findings: 15 fixed, KI-3 deferred; no fix round), the owner checked the stage on the phone (spec 12).
- Stage 1: description, spec and slicing accepted 2026-11-10 — all Russian comments translated in this stage; 9 tickets in `.scratch/01-code-docs/issues/` (01 tools, 02 domain, 03 app core, 04–06 views, 07 drawings/scripts/config, 08 tests and Python, 09 architecture and strict checks); every ticket proves «only comments changed, built site byte-identical» with `tools/same-code.mjs` (ticket 01) and goes live without waiting for «Работает»; the owner checks once after the stage review.
- 2026-11-10: project moved onto this workflow (`docs/history.md`); `HANDOFF.md` split into these docs and removed (original at commit `44ac16d`).
- Tests: 212, all pass on the owner's Windows PC and on the Linux deploy.
- Stage 1: baseline 1,751 Russian comments in 144 files, 0 left; every one of the 127 modules in `docs/code-map.md` has an English header; the map has its architecture section; `PENDING` is gone, so `tools/code-map.mjs` and `tools/ru-comments.mjs` (and `tests/code-docs.test.js`) are strict; `tools/tohnit/__pycache__` is no longer tracked.
- The owner's NAS arrives 2026-11-11 without disks; its setup is a separate project, which builds from `docs/nas-requirements.md` (the owner gives it the GitHub link and says when the version line changes).
- Stage 3 done 2026-11-16: «Ревью 3» accepted (6 findings, all fixed; no fix round). Management sheets: legend, update stamp «Обновлено» in E2 written on every refresh (date-only write when the data is unchanged), no pink, thin borders, sections by point type in the profile's `typeOrder`, the last tab «Итоги по шкафам» (percents rounded down, progress colours), profile ticks for sections and the rack sheet, KI-4; `STYLE_V` 7. Checked by the owner on the phone and the PC ticket by ticket; the Sheets requests were accepted by Google on the owner's file. Not checked against a real response: a profile with no points (review F1, guarded). Details: `docs/history.md`.
- Stage 6: description accepted 2026-11-17 (`.scratch/06-field-improvements/description.md`, 4 mockups): ideas 001–005 in that order; owner added: day off blocked on a date with a working day in another project, culprits shared too (ADR 0016 replaces 0015 in the spec), point types per problem, open-problems counter on «Проект»; colour by stages, not single works. Spec accepted 2026-11-17 (`spec.md`): answers to the 14 open questions; shared lists read straight from the pool, old project lists merged once per project (ADR 0016 replaces 0015); problem marks in the project subcollection `problemMarks` (ADR 0017); palette «Жёлтые чуть темнее»; ticket 02 needs the owner to publish the new `firestore.rules` before its code reaches `main`.

- Ticket 6.1 (day off) live and accepted 2026-11-17: `src/domain/dayoff.js`, day form checks, «Отчёты» and «Месяц» lines, recording block on a day-off date; KI-5.
- Ticket 6.2 (shared delay reasons and culprits) live and accepted 2026-11-18: the owner published the new `firestore.rules` (three `pool_*` blocks) first; `src/domain/shared.js`, `src/app/shared.js` (merge, seeding of reasons and culprits; `SHARED_DEFAULTS` waits for the example problems of ticket 03), pool writes from «Выпадающие списки», backup / import / nightly job with `shared`; KI-6.
- Ticket 6.3 (problems on points) live and accepted 2026-11-18: `src/domain/problems.js`, `src/app/views/problems.js`, project subcollection `problemMarks` (in `COLLECTIONS`, history, backup and import), the four example problems seeded into an empty `pool_problems`, selection-bar buttons in «Точки», plan and rack, point card block, «Точки» filter and red line, «Проект» line, point merge moves open marks. Plan red: ticket 05. Tests: 240.
- Ticket 6.4 (problems in the management sheet) live and accepted 2026-11-18: column «Проблема» / «בעיה» (`src/domain/report.js`, open problems one per line, oldest first), row colour `PROBLEM_COLOR` `#E57373`, legend cell G, summary counter «С проблемами» / «עם בעיות» (points with an open problem; added after the owner's check), default profiles have the column (saved ones need the tick), `STYLE_V` 8, wrap request in `managers.js`, the nightly job reads `problemMarks`. Tests: 252.
- Ticket 6.5 (plan colours by progress) live and accepted 2026-11-18: `planColor` / `markColor` / `PLAN_LEGEND` and the plan filter in `src/domain/plan.js`, `leftTasks` in `src/domain/remaining.js`, plan legend and grouped stage filter («Осталось» with «шилют», «Работа», «Проблемы»), «PDF с номерами» colours, thicker finished frames and new legends (every file re-rendered once). Owner's changes at the check: no stage dots at all; plan lines ×2 on a computer with a mouse. Tests: 263.
- Ticket 6.6 (guide translations) live and accepted 2026-11-19: the guide checked on screen in English and Hebrew; 15 lines had dictionary keys with the «• » / «# » prefix that `body()` of `guide.js` strips, so they showed Russian — keys fixed; quoted button names aligned with the buttons; Latin point-code runs isolated in Hebrew. Plan legend and filter not walked on screen (no drawing in `?mem=1`).

## Stages

| # | Stage | Status | Sessions (est.) | Ideas |
|---|---|---|---|---|
| 1 | Code documentation | done | 14 | — |
| 2 | What the app needs from the NAS | done | 6 | — |
| 3 | Management sheets | done | 8 | — |
| 4 | PocketBase storage (when the owner trusts the NAS) | not started | 16 | — |
| 5 | Move to the NAS | not started | 10 | — |
| 6 | Field improvements (now, before stage 4) | tickets 6/7 | 14 | 001, 002, 003, 004, 005 |

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
