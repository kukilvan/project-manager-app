# Project Manager (Менеджер проектов)

Offline-first PWA for low-voltage installers in Israel: project points, drawings, cable pulls, racks and labels, daily reports in Russian and Hebrew, Google Sheets for management.

## Rules

- Talk to the owner in Russian. Everything new in the repo — docs, code comments, commit messages — is English. Old Russian comments are translated when a session edits that code. App UI: Russian (source), English, Hebrew (RTL).
- **Golden rule (ADR 0011):** code reaches `main` only after the full self-check (`docs/workflow.md`); every push to `main` deploys the live site, and the owner checks there. Stage docs (description, spec, tickets, review) reach `main` only after the owner's «Коммит».
- The owner starts a session with «дальше» (do the Next step of `PROJECT_CONTEXT.md`) or «Правка: …» (quick fix, `docs/workflow.md`). Read `docs/workflow.md` first in every session.
- Never print secrets (service account JSON, tokens, Firebase configs of users) — in replies, logs or commands.
- Never commit work data, customer drawings, the owner's backups or keys: the repo is public (ADR 0005). Keep such files in the scratchpad.
- Never delete anything on the owner's Google Drive or in Firebase yourself; give the owner a list.
- Before a risky change (data migration, mass edit of points, drawing versions) tell the owner how to back up (☰ → Данные → Резервная копия на Диск) and offer a rollback branch (`docs/rollback.md`).
- Every bug or rare failure not fixed now goes to `KNOWN_ISSUES.md` in the same session.
- Code, docs and messages use the words of `CONTEXT.md`.

## Run

Owner's shell: PowerShell, in the project folder. Node.js 22+.

- Install dependencies: `npm ci`
- Tests: `npm test` (node:test)
- Build: `npm run build` (output `dist/`)
- Start locally: `npx vite preview --port 4176` after a build, open `http://localhost:4176/project-manager-app/?mem=1` (test mode, `docs/workflow.md`); stop: Ctrl+C in that window
- Dev server with reload: `npm run dev`
- Translations after adding UI strings: `node scripts/i18n-build.mjs`
- Code map: `node tools/code-map.mjs` (check only: `--check`)
- Only comments changed: `node tools/same-code.mjs`
- Deploy: push to `main`; watch it: `gh run list --workflow pages.yml --limit 1`

## Agent skills

- Issue tracker: local markdown in `.scratch/<stage>/`; formats in `docs/formats.md`.
- Domain docs: single context — `CONTEXT.md` and `docs/adr/`.
- Drawing parsing for Claude: `tools/tohnit/` (skill «разбор тохнита»).
