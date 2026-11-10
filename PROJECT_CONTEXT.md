# Project context

Current state only; budget 20,000 bytes (`wc -c`). Details of finished work live in `docs/history.md`. Updated: 2026-11-10.

## Next step

«Спека 1» — spec of stage 1 «Code documentation» from `.scratch/01-code-docs/description.md`: header comment shape, the code-map tool and how its test grows across tickets, the built-site-unchanged check, finding leftover Russian comments, KI-1 and KI-2 fixes, ticket split. Model: Opus 5.5, effort high (`docs/models.md`).

Quick fixes «Правка: …» may come at any time; they do not change this step.

## State

- Version 1.2.0 live at https://kukilvan.github.io/project-manager-app/; everything up to commit `2966523` checked by the owner on the phone (branch `rollback-2026-11-09b`; rollback point before stage 1: `rollback-2026-11-10`, same code). No code in flight.
- Stage 1: description accepted 2026-11-10 — all Russian comments translated in this stage; tickets go live after the self-check without waiting for «Работает»; the owner checks once after the stage review.
- 2026-11-10: project moved onto this workflow (`docs/history.md`); `HANDOFF.md` split into these docs and removed (original at commit `44ac16d`).
- Tests: 144, 141 pass on the owner's Windows PC (KI-1, KI-2); all pass on the Linux deploy.
- The owner's NAS arrives 2026-11-11 without disks; its setup is a separate project. This app hands it requirements in stage 2.
- Open tails, status unconfirmed: possible management-sheet tweaks and a list of old Drive files to delete (stage 3); photos on points deferred by the owner.

## Stages

| # | Stage | Status | Sessions (est.) | Ideas |
|---|---|---|---|---|
| 1 | Code documentation | spec | 14 | — |
| 2 | What the app needs from the NAS | not started | 6 | — |
| 3 | Management sheets | not started | 8 | — |
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
- Known test failures on the owner's PC: KI-1 (2 i18n tests), KI-2 (open-rules test).
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
