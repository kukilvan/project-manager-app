Status: accepted
Complexity: complex
Blocked by: 02

# 11. Job sources and the export

The server jobs read their data through a source: Firestore as today (GitHub Actions) or PocketBase (the NAS). The export format is the same, so the weekly starter-pool job, the restore tool and the owner's backups keep working. Firebase jobs run exactly as before.

## Spec sections

§ 5.2, § 5.3, § 2.3 (`itemPatches`), § 11 (export and cleanup on PocketBase), § 10 (edge case 22). Slicing notes under § 13 apply.

## What to do

1. Read the current jobs first: `scripts/server-backup.mjs`, `server-backup-lib.mjs`, `server-cleanup.mjs`, `server-tables.mjs`, `server-tables-lib.mjs`, `server-drive-backup.mjs`, `server-restore.mjs`, `starter-from-backup.mjs`, and the workflows `server-backup.yml`, `server-tables.yml`, `export-pool.yml`; list in the report every place that reads or writes Firestore.
2. `scripts/fs-source.mjs`: today's Firestore reads and writes behind one interface (list projects, a project's records and history, the common data, write project fields, delete for cleanup, `applyDrawingPatches` / `applyPatches` as item patches). `firebase-admin` is imported only here and only when `PM_SOURCE` is not `pocketbase` (default Firestore), so the NAS agent needs no `firebase-admin`.
3. `scripts/pb-source.mjs`: the same interface over HTTP as the `jobs` superuser (no SDK): lists projects, reads records and history by pages of 1,000, the common data, writes project fields through `POST /api/pm/save` (superuser, `deep`, `itemPatches` — the read-then-write of the Firestore jobs becomes one request; with no `tables` list yet the job writes the whole list as before), deletes records for cleanup.
4. `server-backup.mjs`, `server-cleanup.mjs`, `server-tables.mjs` keep their names, arguments and Firestore behaviour and take a source (`PM_SOURCE=pocketbase|firestore`). The export is today's folder format with a PocketBase record mapped through `src/domain/pbread.js`: `<name> (полная).json` (`polevoy-full-1`, `project` = `{id: key, ...data}`, records with `history` among them, each with `updatedAtServer: {"_seconds","_nanoseconds"}` from `updated`, and `"source": "pocketbase"`), `<name> (импорт).json` (`buildBackup` unchanged), the common file (`pool_<kind>`, `pool_inbox`, `allowed` as `{id: email, email, at}`, `meta` with `admin`, `prefs` as `{uid, id: 'main', data}`), `ИТОГ.json`; 15 folders kept; every run is a full read; `serverBackupAt` written into each project as today.
5. Cleanup on PocketBase (§ 5.3): the same rules as `server-cleanup.mjs`; at most 5,000 per collection per run; `DRY_RUN=1` only reports.
6. Header comments; `node tools/code-map.mjs`. Do not change the workflows except what the new import structure needs; `npm i --no-save firebase-admin@13 google-auth-library@9` in them stays.

## Done when

- The existing job tests (`tests/server-backup.test.js` and others) pass unchanged; a test with a fake Firestore source proves the Firestore path gives the same files as before for the same input (compare with the current output on a fixture).
- Against a real PocketBase (`pb-dev up --empty` and the route): a synthetic project written through the route is exported; the export equals what the Firestore export of the same data would be (ignoring `source`); `itemPatches` apply; cleanup deletes what the rules say and `DRY_RUN=1` deletes nothing.
- `npm test`, `npm run build` (the site is byte-identical: the jobs are not part of it), `node tools/code-map.mjs --check` pass.

## Tests to add

`tests/pbread.test.js` (the export shape: `updatedAtServer` timestamps, `source`, `allowed` and `prefs` shapes); `tests/server-backup.test.js` additions for the source switch; `tests/pb-*.test.js` for the real-server export round trip and cleanup (ticket 02's helper).

## Owner check

Nothing visible on the site. The next Firebase backup and the night management sheets must run as before: the session pushes to `main`; the owner looks at the next scheduled run in GitHub → Actions → «Server backup» (green) — or the session starts it by hand with the owner's OK (`gh workflow run server-backup.yml`). Wrong: a red run — send the link.
