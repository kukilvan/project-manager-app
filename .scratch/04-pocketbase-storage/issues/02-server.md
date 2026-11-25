Status: in review
Complexity: complex
Blocked by: 01

# 02. The server: collections, write route, keep-alive, the local runner

The PocketBase side of the app: migration 1, the hook with the write route, the local runner `tools/pb-dev.mjs`, and server tests that run against a real PocketBase on the PC and always in CI.

## Spec sections

§ 1 (the facts the tests rely on: re-check them against the downloaded binary), § 2.1, § 2.4 (the route), § 2.5, § 2.6, § 2.7, § 10 (edge cases 2, 9, 17, 18, 29), § 11 (against a real PocketBase), § 12 (rule 14, `.gitignore`, `CLAUDE.md` Run, `docs/workflow.md`, term «Write route»). Slicing notes under § 13 apply.

## What to do

1. `tools/pb-dev.mjs` (header comment; Node only, no new dependency):
   - `fetch`: PocketBase **0.42.3** for the platform (`linux_amd64`, `windows_amd64`; anything else → a clear message) from `https://ganigeorgiev.com/meta/pocketbase/pocketbase/download/v0.42.3/pocketbase_0.42.3_<os>_<arch>.zip` into `.cache/pocketbase/0.42.3/`; the SHA-256 of the zip is checked against the two values of § 1 (a mismatch deletes the file and fails); unpack with a few lines over `zlib`;
   - `up [--empty] [--port N] [--serve <dir>]`: a data folder under `.cache/pb-dev/`, the repo's `pb/pb_migrations` and `pb/pb_hooks`, a superuser, password sign-in switched on **for this local instance only**, fixed test users with a fixed password written in the tool (local, bound to 127.0.0.1), `--serve dist-nas` as `pb_public`; waits until `/api/health` answers; remembers the process;
   - `down`; and exported functions (`startPocketBase`, `stopPocketBase`) for tests, which start their own instance on a free port.
2. `pb/pb_migrations/1764000001_pm_schema_1.js`: the collections of § 2.1 with fields, indexes, `maxSize`, list/view rules, create/update/delete `null`, and the `users` rules. It never touches Settings or the `users` auth options (NAS document, "Who sets what") and never deletes app data.
3. `pb/pb_hooks/pm.pb.js`: `const PM_SCHEMA = 1;`; `POST /api/pm/save` (auth required, ≤ 500 ops and 4 MB; `require(`${__hooks}/pm/pbwrite.js`)` **inside** the handler; one `$app.runInTransaction`; the PocketBase store for `runSave`; own JSON answers 200 / 409 / 422 / 426 as § 2.4 — the error is caught and answered by the route, not thrown to PocketBase; `invites` kept in step; `members` from `memberUids`); `GET /api/pm/info` (public; `admin` with a user token); `POST /api/pm/admin` (transaction, the first caller wins); `cronAdd("pm_ping", "* * * * *")` sending `{"t": <ms>}` as event `pm_ping` to subscribed clients.
4. CI (`.github/workflows/pages.yml`, job `build`): cache `.cache/pocketbase` by version, `node tools/pb-dev.mjs fetch`, and `PB_TESTS_REQUIRED=1` for the `npm test` step, so a missing binary fails there; on the owner's PC the server tests are skipped with a message when the binary is absent.
5. Docs: `docs/coding-standards.md` rule 14 (users write to PocketBase only through the write route; the collections' write rules stay `null`; checked by the migration test); `CLAUDE.md` Run: `node tools/pb-dev.mjs fetch|up|down` (stay inside 60 lines and 6,000 bytes); `docs/workflow.md` Self-check: one short paragraph for NAS tickets (build `npm run build:nas`, `pb-dev up`, the browser pane at 420 px, two tabs as two users, "offline" = `pb-dev down`); `.gitignore`: `.cache/`; `CONTEXT.md` term «Write route».
6. Header comments; `node tools/code-map.mjs`. `tools/nas-check.mjs` runs against `pb-dev up` and A1, A4, A7 pass (A5 and A6 fail only because the local instance allows passwords and any origin, as in § 1).

## Done when

- `node tools/pb-dev.mjs up --empty` starts a server on which the migration applies without errors; `down` stops it.
- Tests against the real server: every app collection has `null` write rules; a guest cannot create a user; every rule row of § 2.4 through `POST /api/pm/save` (member, invitee, non-member, admin, allowed, superuser); a refused op rolls back the whole request and answers the right `index`; the same request sent twice is harmless; 409 and 426; `invites` follow `invitedEmails`; a realtime event after a save reaches members and no one else; two first `POST /api/pm/admin` calls at once get the same e-mail; a 400-op request runs in about a second; a 2.2 MB JSON value answers `invalid`; the generated copy of `pbwrite.js` loads in the real engine; `PM_SCHEMA` equals `PB_SCHEMA`; the keep-alive event arrives within 70 s.
- After the push the deploy log shows the PocketBase tests as run, not skipped.
- `npm test`, `npm run build`, `node tools/code-map.mjs --check` pass; the built site is the same as before.

## Tests to add

`tests/pb-server.test.js` (and a helper file for starting a server; the helper's name must not end in `.test.js`): the list above. `PB_SCHEMA === PM_SCHEMA` and a check that the hook calls `require` only inside handlers belong to the same file.

## Owner check

Nothing on the site changes. The session's report names the count of server tests that ran, and the deploy log shows them.
