Status: accepted
Complexity: complex
Blocked by: 11

# 13. The restore tool and the way back

`scripts/pb-restore.mjs` loads a full backup (from Firebase or from PocketBase) into an empty PocketBase: users, projects, records, history, shared lists, with the same ids and a count check and a read-back comparison. `server-restore.mjs` learns the way back from a PocketBase export to Firebase.

## Spec sections

§ 6 (all), § 1 (superuser batches; linking by e-mail), § 10 (edge cases 20, 21), § 11 (the restore tests, fixtures), § 12 (`ВОССТАНОВЛЕНИЕ.md`, term «Restore tool»). Slicing notes under § 13 apply.

## What to do

1. `node scripts/pb-restore.mjs <backup folder> [--write] [--resume] [--admin <e-mail>] [--verify]` with `PB_URL`, `PB_SUPERUSER_EMAIL` and the password in the file `PB_SUPERUSER_PASSWORD_FILE` (never on the command line, never printed). The folder is a `polevoy-backups` folder or the unpacked Drive zip, from Firebase or from PocketBase (`"source": "pocketbase"` in the export of ticket 11).
2. **Plan** (always): counts per target collection; users from each project's `memberUids` / `memberEmails` pairs and `removedMembers`, names from `memberNames`; prefs owners through the same map; the administrator from `meta/admin` else `--admin` (required then); uids that cannot be mapped (kept as they are, with a warning); key collisions.
3. **Write** (`--write`): refuses when the server already has projects unless `--resume` (skips every record that already exists). Users are created with their e-mail (`verified: true`, `emailVisibility: false`, a random 32-character password nobody knows, `name`); the uid mapping replaces every string value and object key exactly equal to a mapped old uid in every document, and inbox keys starting with `<old uid>_`; creates projects (`key`, `data`, `members` from the mapped `memberUids`), records (`key` = the document's `id`), history (`at`), pool (`kind` from `pool_<kind>`), inbox, allowed, admin, prefs, `invites` from `invitedEmails`; drops `updatedAtServer` from `data`; superuser batches of 500 through `/api/batch`, one after another; a 429 waits 2 s and retries.
4. **Count check** (per collection and per project against the plan; a ✓/✗ table; exit 1 on any difference) and **`--verify`** (reads everything back, maps ids back, compares every document with the backup ignoring `updatedAtServer`; exit 1 on any difference). Each step prints its time (for the rehearsal).
5. `scripts/server-restore.mjs`: recognises a PocketBase export (`"source": "pocketbase"`), maps PocketBase ids to Firebase uids by e-mail (the export's member pairs, then `admin.auth().getUserByEmail`), writes `updatedAtServer` as the server time (so the phones' delta reads see every document), and writes into a non-empty database only with `--force`. Its current behaviour for Firebase backups is unchanged.
6. `tests/fixtures/`: a small synthetic backup (two projects, three users, one removed member, an invitation, shared lists, an inbox entry, a Hebrew text, an author uid in no member list) — **no real names or e-mails**.
7. Docs: `ВОССТАНОВЛЕНИЕ.md` (Russian, plain words: restoring onto the NAS with this tool; the way back); `CONTEXT.md` term «Restore tool»; header comments; `node tools/code-map.mjs`.

## Done when

- The plan part on the fixture (no server): counts, the user map, uid replacement in values, keys and inbox prefixes, collisions, the administrator rule.
- Against a real PocketBase: plan → write → counts → `--verify` all pass on the fixture; `--resume` after a run cut in the middle (kill it) finishes without duplicates; an OAuth2 sign-in with a fake OIDC provider whose e-mail belongs to a restored user returns **that** user (same id, `isNew: false`; the setup of § 1).
- Export → restore round trip on PocketBase equals the input (ticket 11's export, this ticket's restore).
- `server-restore.mjs` on a PocketBase export of the fixture, against the Firestore emulator or its existing fake in the tests, writes the documents with Firebase uids and refuses a non-empty database without `--force`.
- `npm test`, `npm run build`, `node tools/code-map.mjs --check` pass.

## Tests to add

`tests/pb-restore.test.js` (plan part, no server); real-server tests in `tests/pb-*.test.js` (ticket 02's helper): write, count check, `--verify`, `--resume`, linking by e-mail; a `server-restore` test for the PocketBase export.

## Owner check

Nothing on the site changes. The owner reads the new `ВОССТАНОВЛЕНИЕ.md` section once; the real restore is the rehearsal (ticket 14) and the move day.
