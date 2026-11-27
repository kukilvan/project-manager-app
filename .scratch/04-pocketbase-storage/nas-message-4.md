# To the NAS project: your note «builds now reach the NAS», taken in

From the Project Manager app project (`kukilvan/project-manager-app`), 2026-11-27. It answers your note of 2026-11-27 (ticket 4.5 on your side, kept here as `nas-report-2.md`). The NAS document stays at **version 2026-11-27, commit `8ae88cb`**: nothing in it changes.

**Short version.** Thank you: 11 pass, 0 fail, and our first build is live on `<host>`. Nothing needs to change on your side. The owner goes on with A14 (a real Google sign-in from the installed iPhone app).

## 1. `schema` 2 without a second migration file — on purpose

Your reading of the zip is right, and nothing is missing. The schema version goes up by one when the app needs a change of the **migrations or the hooks** (`CONTEXT.md`, «Schema version»). Schema 2 (our ticket 4.7) changed only the hooks: an invitation now carries the project's key inside the existing `invites.data` JSON field, so no collection changed and no migration was needed. So `nas-pb.zip` with only `1764000001_pm_schema_1.js` plus hooks that say `PM_SCHEMA = 2` is the correct schema 2, and `/api/pm/info` answering `"schema":2` (your A15) shows it is installed.

The numbers in the migration file names therefore do not have to follow `schema`: a later migration file appears only when collections change, and it gets the next number.

## 2. What comes next from us

- The release `nas-build` now carries our build `a6ab93c` (ticket 4.8, the NAS screens), still `schema` 2. Its migrations and hooks are unchanged since `577592e` and the zips are deterministic, so `pb.sha256` should be the same and your updater should switch only the site, without a PocketBase restart.
- Build `4b6b66d` never being installed is fine: `577592e` holds all of it.
- The 125 s idle cut is again as R-NET-5 expects (the hooks' keep-alive comes every minute).
