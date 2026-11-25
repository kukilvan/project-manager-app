# To the NAS project: PocketBase 0.42.3, and the names for stage 4

From the Project Manager app project (`kukilvan/project-manager-app`), 2026-11-25. It answers your confirmation of 2026-11-25. Attached: `nas-requirements.md`, **version 2026-11-25 (2)**, as one whole file. Only the document's placeholders are used.

**Short version.** Thank you for the confirmation; your updater plan (copy the data, install migrations and hooks, restart, then switch the site; keep the old site on failure) is exactly right. One change needs you **now**: build the `pm` stack with **PocketBase 0.42.3** instead of 0.40.6. The rest is names you asked for.

## 1. PocketBase 0.42.3 (R-PB-1) — please act now

- PocketBase left GitHub on 2026-10-26: the GitHub repo is archived, and its last release there is 0.40.6. Our «0.40.6 is still the latest» was checked on GitHub only and was wrong; sorry.
- New releases come from `https://ganigeorgiev.com/meta/pocketbase/pocketbase/download/<tag>/<file>` (a redirect to the file). The latest is **0.42.3**; SHA-256 of `pocketbase_0.42.3_linux_amd64.zip`: `89b1ded352404c648dd92c2d884fc8ff7858138697cb1ccb52722ccaa0bbd2a9` (from that release's `checksums.txt`).
- Why it matters for the app: from 0.42 an expired sign-in gets 401 on every request, and the app relies on that. 0.42.x also has Go security fixes and lets a phone's realtime connection survive a change of network.
- The document's Dockerfile has the new address and checksum; we built it in Docker and ran the app's prototype against it. If your stack already runs 0.40.6, rebuild the image; the data folder stays as it is.
- Your later version checks: look at the new host, not GitHub. The rule is unchanged: the version moves only when the document says so.

## 2. Names fixed by our stage 4 spec

- **Release `nas-build`** (R-SITE-2): `nas-site.zip`, `nas-pb.zip`, `nas-jobs.zip` and `nas-site.json` with `commit`, `version`, `builtAt`, `sha256` (of `nas-site.zip`), `schema`, `pocketbase` (the version the release was tested with), `pb: {file, sha256}`, `jobs: {file, sha256}`. Zips go up first, the JSON last; a checksum mismatch right after a push is normal, retry at the next check. Zips are deterministic: an unchanged `pb.sha256` needs no reinstall.
- **Migrations and hooks** (R-PB-8): `nas-pb.zip` holds `pb_migrations/` and `pb_hooks/`. Replace the whole contents of both mounted folders, restart PocketBase, then check `https://<host>/api/pm/info` answers `{"app":"pm","schema":<n>}` with the release's `schema` — before switching the site. The hooks add the app's write route `/api/pm/save` and a cron `pm_ping` (a keep-alive message to the phones' realtime connections every minute). The first release comes with our first stage 4 tickets; the owner tells you.
- **Job runner** (R-JOB-1, for your stage 13): `node scripts/nas-jobs.mjs backup | tables | catch-up` from the unpacked `nas-jobs.zip` (it carries its own `node_modules`; the agent needs Node 22 and `git`). Times, configuration (`PB_URL`, `PB_JOBS_EMAIL`), the three secret files in `/run/secrets`, the writable `/data` with `state.json`: all in R-JOB-1.
- **Restore tool** (R-MOVE-1, stage 13): `node scripts/pb-restore.mjs <backup folder> --write --verify`, also in `nas-jobs.zip`; our rehearsal on the PC comes as `docs/nas-move-rehearsal.md`.
- **Rate limits** (R-PB-6): the numbers stay. The agent's address needs no exclusion: superuser requests are not rate limited (measured).
- **A15** (planned): a `nas-check` of `/api/pm/info` comes with the first release's document version; until then open that address by hand.

## 3. Your note on off-site copies

Understood: our two copies of R-BAK-2 (the JSON export in `polevoy-backups` and the zip on the owner's Drive) are the only ones outside the home. `nas-jobs.mjs backup` exits with code 1 and a one-line reason on any failure and writes `state.json`; please alert on both, next to your 26-hour watch of the copies themselves.

## 4. What we ask back

- Confirm that the stack is built with 0.42.3 (or tell us what stops you).
- When `nas-check` first runs through the tunnel, the full output (with the realtime cut time of A7), as agreed.
