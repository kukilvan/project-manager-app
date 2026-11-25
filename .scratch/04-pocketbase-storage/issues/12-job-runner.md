Status: in review
Complexity: medium
Blocked by: 11, 03

# 12. The job runner `nas-jobs.mjs`

One program for the NAS agent: the daily backup (export, git push, cleanup, the zip on the owner's Drive), the management sheets and rack tables, and the catch-up at container start. Packed into `nas-jobs.zip`.

## Spec sections

§ 5.1 (all), § 4 (`nas-jobs.zip`), § 8 (the Drive zip's name), § 10 (edge case 32), § 12 (term «Job runner»). Slicing notes under § 13 apply.

## What to do

1. `scripts/nas-jobs.mjs <command>` with `backup`, `tables`, `catch-up` (§ 5.1 table). `backup`: the export of ticket 11 into a clone of `polevoy-backups`, commit and push; then the cleanup; then the zip of the newest export to the owner's Drive file «Автокопия данных (обновляется каждые 2 дня).zip» through the existing Drive-upload logic of `scripts/server-drive-backup.mjs` and `scripts/zip-lib.mjs` (ticket 03). The file's name is **not** changed (§ 8: it was shared with the service account; renaming is not needed). `tables`: the nightly management sheets, rack tables and «PDF с номерами» (`server-tables-lib.mjs` unchanged) reading PocketBase. `catch-up`: runs `backup` when its last success in `state.json` is older than 24 h or missing.
2. Configuration as in § 5.1: `PB_URL` (default `http://pocketbase:8090`), `PB_JOBS_EMAIL`; secrets as **files** in `PM_SECRETS` (default `/run/secrets`): `pb_jobs_password`, `google_service_account.json`, `github_token`; `PM_STATE` (default `/data`) for the clone and `state.json` (`{backup: {ok, at, error}, tables: {...}}`); `BACKUP_REPO` (default `kukilvan/polevoy-backups`). The GitHub token goes to git through an environment variable and a credential helper, never in a URL that could be printed; no secret is ever logged (a test greps the output).
3. Exit code 0 on success and 1 on any failure with a one-line reason; `state.json` is written either way. The job needs Node 22, `git` and the network only (no `npm install` on the NAS).
4. `nas-jobs.zip` (`scripts/nas-pack.mjs`): the contents the runner needs — `scripts/`, the `src/` modules it imports, `package.json`, `node_modules/` with `google-auth-library` and `mupdf` only. A test unpacks the zip into a temporary folder and starts `node scripts/nas-jobs.mjs --help` there with no other files.
5. Self-check without Google or GitHub: a local `pb-dev up --empty` with a synthetic project; `BACKUP_REPO` pointing to a local bare repository (the runner takes a remote URL override for tests: `BACKUP_REMOTE`), the Drive and Sheets calls behind small functions that the test replaces; `state.json` after a success and after a forced failure; `catch-up` runs `backup` only when due.
6. Docs: `CONTEXT.md` term «Job runner»; header comments; `node tools/code-map.mjs`.

## Done when

- Against a local PocketBase and a local bare git repository: `backup` commits one folder, pushes, runs the cleanup (`DRY_RUN` honoured) and builds the Drive zip (stubbed upload); `tables` runs on the synthetic project with stubbed Google calls; `state.json` says ok or the reason; exit codes 0 and 1.
- No secret appears in the output or in `state.json`; a missing secret file gives a one-line reason.
- The unpacked `nas-jobs.zip` runs `--help` alone.
- `npm test`, `npm run build`, `node tools/code-map.mjs --check` pass.

## Tests to add

`tests/nas-jobs.test.js`: argument handling, configuration defaults, `state.json` shapes, `catch-up` due logic, the credential helper never putting the token into a printed URL, the unpacked-zip start. Real-server run with ticket 02's helper and a local bare repository.

## Owner check

Nothing on the site changes. The NAS project runs the runner at its stage 13 (when the owner says); until then the session's report states what was proven locally and what only the NAS shows (GitHub and Google calls with the real files).
