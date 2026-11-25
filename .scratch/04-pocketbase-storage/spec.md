Status: accepted

# Stage 4. PocketBase storage — spec

Built from `description.md` (accepted 2026-11-25), ADR 0012–0014 and 0016–0019. No ideas are filed for the stage. Taken in: the NAS project's confirmation of 2026-11-25 (received through the owner, kept outside this repo): it has the NAS document `ae41367` and no change requests; it is building the `pm` stack with PocketBase 0.40.6 now; its site updater installs migrations by itself (copies PocketBase's data, unpacks migrations and hooks, restarts PocketBase, only then switches the site; on failure it keeps the old site and alerts); the move is its stage 13, on hold until the owner says; it keeps **no off-site copy of its own**, so the two copies of R-BAK-2 are the only ones.

New decisions: ADR 0020 (writes go through one server route; general collections) and ADR 0021 (the phone keeps a full local copy and a write queue).

## 0. Answers to the description's open questions

| Question | Decision | § |
|---|---|---|
| Collections | General ones: `projects`, `records` (all 17 project collections), `history`, `pool` (all pool lists), `inbox`, `allowed`, `admin`, `prefs`, `invites`. One realtime topic and one delta read cover a whole project. | 2.1 |
| Merging writes | On the server, in one write route `POST /api/pm/save` that copies Firestore's `merge: true`, `mergeFields` and `arrayUnion/arrayRemove`, checks the rules and writes all changes of a request in one transaction. Users cannot write through PocketBase's own record API at all. ADR 0018's older-build case holds: a key the write does not carry is kept. | 2.3, 2.4 |
| Offline layer | A new local copy in IndexedDB `pm-pb` (not `localdb.js`: that one notifies every listener on every write and has no queue), with a persistent write queue sent in chunks one after another. Sending is idempotent because every change is an upsert by the app's key and history entries are create-only. A rejected chunk names the bad change; its save goes to «⚠», the rest is sent. | 3.3–3.5 |
| `sync.js` | Keeps the delta margin, the Saturday full read, retention and `rejectReason` (with PocketBase texts). The Firestore read and write counters, «⬇ лимит» and «📈 Чтений базы» do not apply on the NAS copy. | 3.6 |
| Realtime | One SSE connection with the topics of § 3.5; a keep-alive message every 60 s from a server cron, so the ≈ 125 s idle cut of the tunnel does not happen; a delta read after every (re)connect anyway (PocketBase also ends every connection after 30 min). | 2.6, 3.5 |
| Sign-in | PocketBase's Google OAuth2, both flows: the popup («Войти через Google») and the manual code flow with a redirect back to `https://<host>/` («Войти (запасной способ)»). The token is refreshed at every online start. One sign-in for Drive too: technically possible, **declined** (§ 3.8). | 3.2 |
| Users | Restored users are created by the restore tool with their e-mail; Google sign-in links to them by e-mail (checked, § 1). On an empty server the first user who signs in becomes the administrator, as now. | 1, 6 |
| NAS copy detection | A build flag (`VITE_BACKEND=pocketbase`) in the NAS build. No probe: an offline start must not depend on the network. | 3.1 |
| Database version | `PB_SCHEMA` in the app, `schema` in `nas-site.json`, `GET /api/pm/info` on the server. A newer app on an older server shows the banner and holds sending; reading goes on. The NAS updater installs migrations before it switches the site (confirmed by the NAS project). | 2.7, 3.7 |
| Release | `nas-site.zip`, `nas-pb.zip`, `nas-jobs.zip` and `nas-site.json` in the release `nas-build`, from a new job in `pages.yml`. | 4 |
| Job scripts | One runner `scripts/nas-jobs.mjs` with the commands `backup`, `tables`, `catch-up`; a PocketBase source beside the Firestore one with the same output; secrets as files. | 5 |
| PocketBase version | **Moves to 0.42.3.** PocketBase left GitHub on 2026-10-26 (the repo is archived); 0.42.3 is the latest release on its new host. The app relies on 0.42's 401 for expired tokens. | 1, 9 |
| Tests | Pure logic always; the server part against a real PocketBase binary (fetched with its checksum; skipped locally when absent, always run in CI); the app in the browser pane against a local PocketBase; phones and Google by the owner. | 11 |
| Rehearsal | On the PC with the owner's newest backup in the scratchpad; counts, a full round-trip compare and the app's screens; written result `docs/nas-move-rehearsal.md`. | 7 |
| Switch-over instructions | `ПЕРЕЕЗД.md` (Russian, for the owner and helpers) and a section in the in-app guide; the old icon is emptied («⬆» gone) before the move and deleted after the check. | 8 |
| Ticket split | 14 tickets. | 13 |

## 1. Checked facts

PocketBase run locally on the owner's PC on 2026-11-25 in Docker (the NAS document's Dockerfile with the new download address), with a prototype migration and hook in the scratchpad (nothing of it is in the repo). The owner's backup of 2026-11-23 was read in the scratchpad for structure and counts only.

**Version and host**
- `github.com/pocketbase/pocketbase` and `github.com/pocketbase/js-sdk` were archived on 2026-10-26 («The repo has moved to https://ganigeorgiev.com/pocketbase/pocketbase»). The last GitHub release is 0.40.6; the NAS document's «0.40.6 is still the latest» was checked on GitHub only and is wrong.
- Latest release: **0.42.3** (2026-11-16). Download `https://ganigeorgiev.com/meta/pocketbase/pocketbase/download/v0.42.3/pocketbase_0.42.3_linux_amd64.zip` (redirects to the file), SHA-256 `89b1ded352404c648dd92c2d884fc8ff7858138697cb1ccb52722ccaa0bbd2a9` from that release's `checksums.txt`; Windows amd64 `c783fffb2ae6cf38e11d99eb995ea182c29f0a998f53a0d638111e687553c349`. The Dockerfile with this address and checksum builds.
- Changelog 0.40.6 → 0.42.3, what matters here: 0.42.0 rejects an unknown or expired `Authorization` token with **401 on any endpoint** (before, the request silently became a guest one); 0.42.3 lets one realtime client subscribe from different IPs (phones change networks); since 0.38.2 every realtime connection ends after 30 min; 0.40.x already moved to `encoding/json/v2`; Go 1.27.4 security fixes. No change to the collection or rule features this spec uses.
- JS SDK `pocketbase` **0.29.0** on npm (2026-11-11), 42 KB minified: realtime with endless reconnect, `PB_CONNECT` on every (re)connect, `authWithOAuth2Code`; 0.29 clears the auth store on a 401 unless `pb.autoClearAuthStore(false)`.

**Writes through a route** (`routerAdd` + `$app.runInTransaction` in `pb_hooks`)
- A route reads the JSON body (`e.requestInfo().body`), the user (`e.auth.id`, `e.auth.email()`), and saves records inside one transaction. Top-level variables of a hook file are **not** visible inside a handler; shared code is loaded with `require(`${__hooks}/…`)` inside the handler.
- An error thrown inside the transaction rolls back everything of the request: a project created by the first change was not saved when the second change was refused. Error details put into `ForbiddenError(msg, data)` are rewritten by PocketBase into validation errors, so the route catches the error and answers with its own JSON (`{"status":…, "code":…, "index":…}`) — checked.
- Deep merge of nested maps, top-level replace (`pos` lost its `icon`), `arrayUnion`/`arrayRemove`, the `members` relation set from `memberUids`: all as intended, in one request.
- 400 changes in one request (≈ 0.8 MB): 0.48 s as creates, 0.47 s as updates of the same records.
- A JSON value of 1.9 MB is saved, 2.2 MB is refused («The maximum allowed JSON size is 2097152 bytes») with `maxSize` 2,097,152.
- A route with `$apis.requireAuth()` accepts users and superusers; `e.hasSuperuserAuth()` tells them apart.

**Rules and reading**
- `project.members.id ?= @request.auth.id` on `records`: a non-member lists 0 records; a member sees them; realtime events reach only members (a non-member got 0 of 803 events).
- Exact invitations: an `invites` collection with `email = @request.auth.email:lower` (the `:lower` modifier works in rules). A user `n@…` did not see an invitation for `xn@…`. Firestore's `invitedEmails` array cannot be matched exactly by PocketBase rules (`~` is a substring match), which is why `invites` exists.
- `updated` (autodate) filter `updated > "<mark>"` returns exactly the records changed after the mark, sorted; `perPage=1000` returns 1,000; `skipTotal=1` skips the count.
- Records saved by the route produce realtime events (after the commit), including for the invitee once accepted.
- 401 with a bad token on a records list and on a custom route; no token on a list → 200 with the guest view (empty).

**Realtime keep-alive**: `cronAdd("pm_ping", "* * * * *", …)` with `$app.subscriptionsBroker().clients()`, `client.hasSubscription("pm_ping")` and `client.send(new SubscriptionMessage(…))` delivers a `pm_ping` event to subscribed clients (arrived 16 s after subscribing, at the next minute).

**Sign-in**
- `users.createRule = '@request.context = "oauth2"'`: a guest create through the records API → 400; an OAuth2 sign-in with a new e-mail creates the user (`meta.isNew: true`, name mapped).
- `GET /api/collections/users/auth-methods` is public; for Google it returns `authURL` (`…/o/oauth2/v2/auth?client_id=<Client ID>&code_challenge=…&response_type=code&scope=…userinfo.profile+…userinfo.email&state=…&redirect_uri=`), `state` and a 43-character `codeVerifier`. The app can take the Google Client ID from it.
- **Linking by e-mail**: with a fake OIDC provider on the PC, an OAuth2 sign-in whose e-mail belongs to a user created earlier by a superuser returned **that same user** (same id, `isNew: false`). So users created by the restore tool keep their ids when they first sign in with Google. The manual code exchange (`auth-with-oauth2` with `code`, `codeVerifier`, `redirectURL`) works end to end. Real Google pages and an installed iPhone app stay unverified (A14).
- The superuser collection id is still `pbc_3142635823` (R-NET-4, A3).

**Superuser batches (restore)**: 16 batches of 400 creates sent one after another: 6,400 records in 2.6 s, **no 429** (superuser requests are not rate limited). A batch with one bad request → 400 naming the request (`data.requests.<index>`), nothing saved.

**`tools/nas-check.mjs`** runs against 0.42.3 unchanged (A1, A4, A7 pass locally; A5 and A6 fail only because the local test server allows password sign-in and any origin).

**The owner's data** (backup 2026-11-23): two projects; 1,685 points; 11,858 history entries; ≈ 4,800 other project documents; common file: `meta` (one document `admin`), `allowed` 3, `pool_inbox` 77, pool lists 3–60 each, `prefs` 2. Three distinct Firebase uids (members and removed members). Every document has an `id`; no duplicate ids within a collection. Timestamps are stored as `{"_seconds":…,"_nanoseconds":…}`.

**Not checkable here**: real Google sign-in and both flows on an installed iPhone app (A14); the idle cut through the tunnel (A7 on the NAS); the NAS updater; Cloudflare caching (A8).

## 2. The server: data and the write route

### 2.1 Collections

All collections come from migrations in `pb/pb_migrations/` (§ 2.7). Every app collection has `created` and `updated` autodate fields. **Create, update and delete rules are `null` on every app collection**: users write only through the route (§ 2.4), superusers (the jobs and the restore tool) through the route or the record API.

| Collection | Fields | Indexes | List/view rule |
|---|---|---|---|
| `users` (existing) | PocketBase's; `name`, `avatar` mapped from Google | — | `id = @request.auth.id`; create `@request.context = "oauth2"`; update and delete `null` |
| `projects` | `key` text (the app's project id, ≤ 64), `members` relation → users (multiple), `data` json | unique `key`; `updated` | `members.id ?= @request.auth.id` |
| `records` | `project` relation (cascade delete), `coll` text (≤ 40), `key` text (the app's id, ≤ 400), `data` json | unique (`project`, `coll`, `key`); (`project`, `updated`); `updated` | `project.members.id ?= @request.auth.id` |
| `history` | `project` relation (cascade), `key` text, `at` number, `data` json | unique `key`; (`project`, `at`) | `project.members.id ?= @request.auth.id` |
| `pool` | `kind` text, `key` text, `data` json | unique (`kind`, `key`); `updated` | `@request.auth.id != ""` |
| `inbox` | `key` text, `data` json | unique `key`; `updated` | `@collection.admin.email ?= @request.auth.email:lower` |
| `allowed` | `email` text | unique `email` | `email = @request.auth.email:lower \|\| @collection.admin.email ?= @request.auth.email:lower` |
| `admin` | `slot` text (always `admin`), `email` text | unique `slot` | `@request.auth.id != ""` |
| `prefs` | `user` relation → users (cascade), `data` json | unique `user` | `user = @request.auth.id` |
| `invites` | `project` relation (cascade), `email` text, `data` json (`name`, `object`, `from`) | unique (`project`, `email`) | `email = @request.auth.email:lower` |

- `data` json fields: `maxSize` 2,097,152 (Firestore refuses documents over 1 MiB, so every document the app writes today fits with room); `invites.data` 65,536.
- `records.coll` takes any name matching `^[A-Za-z]{1,40}$`, so a new project collection of the app needs no migration. Today: the 17 of `COLLECTIONS` in `src/app/repo.js`.
- `pool.kind`: `types`, `devices`, `cables`, `catalog`, `manuals`, `doorcfg`, `delayReasons`, `culprits`, `problems`. A new kind needs a hooks change (the route knows each kind's rule) and a `schema` step.
- `invites` is an index the route keeps in step with `data.invitedEmails` of each project; nobody else writes it.
- PocketBase record ids are PocketBase's own random ids; the app's ids live in `key` (catalog ids are names with `/`, spaces and Cyrillic, which PocketBase ids reject).

### 2.2 Records ↔ the app's documents

- A project document in the app = `projects.data` (it carries `id`, `memberUids`, `memberEmails`, `invitedEmails`, `removedMembers`, `memberNames`, `createdBy` and the rest exactly as in Firestore). `members` is derived from `data.memberUids` by the route; the app never reads `members`.
- A project-collection document = `records.data`; `history` entries = `history.data`; a pool item = `pool.data`; an inbox entry = `{ ...inbox.data, key }`; personal settings = `prefs.data`.
- `updatedAtServer` is not stored in `data` on PocketBase: `updated` plays its part. Exports to the backup format write `updatedAtServer: {"_seconds", "_nanoseconds"}` from `updated` (§ 5.2), so the backup stays as today.
- User ids in the app (`user.uid`, `memberUids`, `createdBy`, `updatedBy`, history `by`) are PocketBase user ids (15 characters) on the NAS copy.

### 2.3 Write semantics (the same on the phone and the server)

One pure module, `src/domain/pbwrite.js`, holds them; the server runs a generated CommonJS copy (§ 2.7). Each change is one **op**:

| Op | From | Target | Mode |
|---|---|---|---|
| `{t:'project', key, data, mode, arrayOps?, itemPatches?}` | `commit` with `coll: 'projects'` (`saveProject`, `createProject`, members, invitations) | `projects` | `fields` when the write has `replace`, else `deep` |
| `{t:'rec', pid, coll, key, data, mode}` | `commit` of a project collection | `records` | `fields` for `points` and for `replace`, else `deep` |
| `{t:'history', pid, key, data}` | the history entry of every save | `history` | create only |
| `{t:'pool', kind, key, data?, remove?}` | `commitPool` | `pool` | `deep`; `remove` = `{deleted: true}` |
| `{t:'inbox', key, data}` | `setInbox` | `inbox` | `deep` |
| `{t:'allowed', email}` | `allowEmails` | `allowed` | create if missing |
| `{t:'prefs', data, mode}` | `saveUserPrefs` | `prefs` of the signed-in user | `fields` when `replace`, else `deep` |

- **`deep`** = Firestore `set(…, {merge: true})`: plain objects merge key by key, recursively; arrays, strings, numbers, booleans and `null` replace; an **empty object replaces** (Firestore treats it as a leaf); keys the write does not carry stay.
- **`fields`** = Firestore `mergeFields: Object.keys(data)`: each top-level key of the write replaces that key whole; other keys stay.
- **`arrayOps`** after the merge: `{union: [...]}` appends the values not present yet, in order; `{remove: [...]}` drops every equal value. Equality of values = strict equality for strings and numbers (the app only uses strings here).
- **`itemPatches`** (jobs only, superuser): `{ drawings: {<id>: {...}}, tables: {<id>: {...}} }` merges the fields into the list item with that `id` (`{...item, ...patch}`); unknown ids are ignored. It replaces the read-then-write transaction of `server-tables.mjs` (`applyDrawingPatches`, `applyPatches`). When the project has no `tables` list yet, the job writes the whole list as before.
- A write never deletes a document. `remove(pid, coll, id)` stays a soft delete (`deleted: true`).
- A missing target is created from the write (after `arrayOps` on empty arrays).

### 2.4 The write route `POST /api/pm/save`

`pb/pb_hooks/pm.pb.js`, auth required (users or superusers). Body: `{ "schema": <the app's PB_SCHEMA>, "ops": [ … ] }`, at most 500 ops and 4 MB.

1. `schema` higher than the server's → **409** `{"code":"schema_old","schema":<server>}`, nothing written. `schema` below `MIN_CLIENT_SCHEMA` (1 now) → **426** `{"code":"app_old"}`.
2. All ops run in order inside one transaction. Before each op the route loads the target by its unique key (one indexed lookup), computes the merged document with `pbwrite.js`, checks the rule (below) against the old and the new document, and saves. Projects loaded once per request are reused, so a later op sees the result of an earlier one (Firestore's `getAfter` for a project and its lists in one batch).
3. Any refusal stops the request and rolls it back: **422** `{"status":422,"code":"forbidden"|"not-found"|"invalid","index":<op>,"message":…}`. `invalid` covers a bad op, an unknown pool kind, a bad collection name and PocketBase's own validation (JSON over 2 MB, a non-existent user id in `memberUids`).
4. Success: **200** `{"ok":true,"n":<ops>}`.
5. After every saved project the route syncs `invites` with `data.invitedEmails` (lower case): creates missing (`data`: `name`, `object`, `from` = `memberEmails[0]`), deletes the rest.

**Rules** (a copy of `firestore.rules`; *admin* = the e-mail in `admin`, *allowed* = admin or an `allowed` record with the user's e-mail; e-mails compared in lower case):

| Op | Allowed when |
|---|---|
| project, new | allowed, and `memberUids` contains the user |
| project, existing | **member** (user in old `memberUids`): if the user is not the creator (`data.createdBy`, absent = the user), none of `memberUids`, `memberEmails`, `invitedEmails`, `removedMembers`, `createdBy`, `archived`, `deleted` changes; **or invitee** (user's e-mail in old `invitedEmails`): only `memberUids`, `memberEmails`, `invitedEmails`, `updatedAt`, `updatedBy`, `updatedByName` change, and either `memberUids` = old + the user (accept) or `memberUids` unchanged (decline) |
| rec, history | the project exists (else `not-found`) and the user is in its `memberUids` at that point of the request |
| history | create only; an existing key is skipped as success (resend) |
| pool `types`, `devices`, `cables`, `catalog` | admin |
| pool `manuals` | allowed |
| pool `doorcfg`, `delayReasons`, `culprits`, `problems` | admin, or allowed and the merged item has no `deleted: true` (so only the admin marks deleted) |
| inbox | new: allowed; existing: admin, or allowed and none of `status`, `seenHash`, `seenItem`, `seenAt` changes |
| allowed | admin |
| prefs | always (it is the user's own record) |
| any op by a superuser | always; nothing is stamped |

"Changes" = the top-level key differs between the old and the merged document (deep compare), as Firestore's `diff().affectedKeys()`. Projects are never deleted through the route.

### 2.5 Other routes

- `GET /api/pm/info` (public): `{"app":"pm","schema":<N>}`; with a user token also `"admin":"<e-mail or empty>"`.
- `POST /api/pm/admin` (users): the administrator's e-mail; when none exists, creates it with the caller's e-mail in a transaction and returns it (two first sign-ins at once: the first wins, both get its e-mail). Replaces `meta/admin`.

### 2.6 Keep-alive

`cronAdd("pm_ping", "* * * * *")` sends `{"t":<ms>}` as event `pm_ping` to every realtime client subscribed to `pm_ping`. The app subscribes to it. Every 60 s is under the tunnel's ≈ 125 s idle cut; if A7 measures a cut under 60 s, the app still reconnects and reads changes (§ 3.5).

### 2.7 Files, version and generation

- `pb/pb_migrations/1764000001_pm_schema_1.js` — the collections of § 2.1 and the `users` rules. Later stages add files with higher numbers; a migration never deletes app data and never touches Settings or the `users` auth options (NAS document, "Who sets what").
- `pb/pb_hooks/pm.pb.js` — the routes and the cron; `const PM_SCHEMA = 1;`.
- `pb/pb_hooks/pm/pbwrite.js` — **generated** from `src/domain/pbwrite.js` by `scripts/pb-hooks-build.mjs` (ESM `export` turned into `module.exports`), committed like `src/i18n/en.json`; a test fails when it is stale. `src/domain/pbwrite.js` uses syntax PocketBase's JS engine runs (no optional chaining or `??`; plain functions; no imports).
- `PB_SCHEMA` in `src/domain/pbwrite.js` = `PM_SCHEMA` in the hook = `schema` in `nas-site.json`; a test compares the first two, the release script copies it into the third. It goes up by one whenever a migration or hook change is needed by the app; old apps keep working on a newer server (changes are additive).

## 3. The app on the NAS copy

### 3.1 The NAS build and start

- `npm run build:nas` → `scripts/build-nas.mjs` runs Vite with `VITE_BASE=/` and `VITE_BACKEND=pocketbase` into `dist-nas/` (git-ignored). `isPocketBase()` in `src/edition.js` reads the flag; Vite drops the PocketBase branches and chunks from the GitHub Pages build.
- On the NAS build there is no first-launch screen, no setup wizard, no connect link, no Firebase and no on-device mode; `?mem=1` still works.
- Start (`main.js`): (1) `?code=&state=` matching `pz.pbOauth` → finish the code flow (§ 3.2) and clean the address; (2) a saved PocketBase auth (`pocketbase_auth`, the SDK's own key) → start the session at once from the local copy, offline too, then refresh the token in the background; (3) else the sign-in screen.
- The administrator is remembered as `pm.admin.pb`; a new device waits for `/api/pm/admin` at most 6 s, as with Firestore.

### 3.2 Sign-in

**Screen** (mockup screen 1): the same texts and buttons as today, and under the card «База: домашний сервер · <host>» (`location.host`); no «⚙ Подключение».
- «Войти через Google» — the SDK's popup flow (`authWithOAuth2({provider:'google'})`, which opens the window at once and waits for the result over realtime).
- «Войти (запасной способ)» — the manual code flow: read `auth-methods`, keep `{state, codeVerifier, redirect}` in `pz.pbOauth`, go to `authURL + encodeURIComponent('https://<host>/')`; back at `/?code=…&state=…` call `authWithOAuth2Code('google', code, codeVerifier, redirect)`. A `state` that does not match is ignored (the address is cleaned, the screen says «Не удалось войти: state»).
- Errors: `auth-methods` unreachable → «Сервер недоступен — проверьте интернет и попробуйте ещё раз.»; no Google provider → «Вход через Google на этом сервере не настроен.»; anything else → the existing «Не удалось войти: <code or message>».
- **Password form, local tests only**: when `auth-methods` says password sign-in is on (never on the NAS, A5), the screen also shows «Вход по паролю — только для проверки на компьютере» with «Почта», «Пароль» and «Войти по паролю». Self-checks and the rehearsal use it.

**Token**
- `pb.autoClearAuthStore(false)`: the app, not the SDK, decides when the sign-in is gone.
- Every online start: `authRefresh()`. 200 → new token saved. 401 → **sign-in expired**. Network error → stay as is.
- Sign-in expired: the app keeps working on the local copy, the queue keeps its changes and is not sent; a banner under the top bar: «Вход истёк. Записи ждут на телефоне и уйдут после входа.» with «Войти снова» (opens the two sign-in buttons in a window). After the sign-in: the same user → sending resumes; another user → § 3.3.
- A full read that would drop **every** local project is applied only after a successful `authRefresh` in this run (a guard against a token that the server treats as a guest's).
- Sign-out (☰ → «Выйти») with unsent changes asks: «Есть неотправленные записи: N. Если выйти, они останутся на телефоне и уйдут, когда вы снова войдёте этим же аккаунтом. Выйти?».

### 3.3 The local copy (IndexedDB `pm-pb`)

| Store | Key | Value |
|---|---|---|
| `docs` | `<scope>\|<pid>\|<coll>\|<key>`; scopes `p` (projects), `r` (records), `pool`, `inbox`, `prefs`, `inv`, `adm` | the app's document plus `_pb: {id, updated}` |
| `queue` | auto-increment | `{uid, at, kind, pid, writes, ops}` — one item per `commit`/`commitPool`/`setInbox`/`allowEmails`/`saveUserPrefs` call |
| `meta` | text | the copy's user (`uid`), read marks (`mark\|r\|<pid>`, `mark\|pool`, `mark\|inbox`), last full reads (`full\|r\|<pid>`, `full\|pool`), last server answer time, last known server schema |
| `history` | `<pid>\|<id>` | history entries written on this phone or loaded from the server, kept 60 days |

- Everything of every project the user is a member of is kept (the owner's data: ≈ 5,000 records, a few MB), so switching projects offline works and «Месяц» has every project's days. History stays on the server (87 % of the data) and is read when the history screens open.
- Start: all stores are read into memory, then every queued item is replayed over the documents (so a change whose document write was cut off by the app closing is still shown), then listeners get their first data.
- Queue items are written to IndexedDB **in the same call** that accepts the write; document writes are batched (150 ms, and at `pagehide` / hidden), as in `localdb.js`.
- Listeners are per scope, project and collection; one write or one batch of server changes calls each affected listener once (server changes are grouped for 100 ms).
- Another user signs in on this phone: `docs`, `meta` and `history` are cleared and read anew; queue items of the other user stay but are not sent; a notice says «Вы вошли другим аккаунтом. Неотправленные записи прошлого аккаунта (N) ждут, пока он снова войдёт на этом телефоне.»
- `navigator.storage.persist()` is asked for, as today.

### 3.4 The write queue and sending

- `commit(pid, writes)` (and the other write calls): build ops (§ 2.3); apply them to the local copy with `pbwrite.js` (`_pending: true` on each touched document); append the item to the queue; return a promise that resolves when the item is on the server and rejects when it is refused (repo's `track` and `onReject` work unchanged).
- The sender runs when there is a queue, the token is not expired, the server is not older and the app is not offline: 300 ms after a write, on `online`, when the app becomes visible, after every realtime (re)connect and on its back-off timer. One request at a time.
- A request takes queue items in order while it stays ≤ 300 ops and ≤ 1.5 MB of JSON; an item larger than that is sent as consecutive chunks of its own (each chunk atomic, as today's 400-write Firestore chunks).
- Answers:

| Answer | What the app does |
|---|---|
| 200 | items done: removed from the queue, their promises resolved; `_pending` cleared on documents no later item touches |
| 422 with `index` | the item holding that op goes to «⚠» (`pz.rejected`, code `forbidden` / `not-found` / `invalid`), its promise rejects; the other items are sent again at once. A rejected chunk of a large item rejects the whole item («🔁 Повторить» resends it all; every op is idempotent) |
| 401 | sign-in expired (§ 3.2) |
| 404 without `code` (the route is missing) or 409 `schema_old` | server older (§ 3.7) |
| 426 `app_old` | the «app older» banner (§ 3.7) |
| 413 | a request of several items is resent one item per request; a single item → «⚠» `invalid` |
| 429, 5xx, network error, no answer in 60 s | back-off 2, 5, 10, 30, 60 s (stays at 60), reset after a success |
| any other 400 | treated as back-off three times, then the first item goes to «⚠» `invalid` |

- Idempotency: every op is an upsert by its key with a deterministic merge, history is create-only, `arrayOps` add or remove values; a request that reached the server but whose answer was lost is simply sent again.
- A server version of a record that arrives while a queued item still touches it is shown with the queued ops replayed on top, so the screen never jumps back.

### 3.5 Reading: first load, changes, realtime

**Realtime**: one SDK realtime connection subscribed to `projects/*`, `records/*`, `pool/*`, `invites/*`, `prefs/*`, `pm_ping`, and `inbox/*` for the administrator. Subscriptions are made before the reads, so nothing that changes during a read is lost. An event is applied when its `updated` is not older than the local `_pb.updated`; `delete` removes the document. Events are grouped for 100 ms.

**After every `PB_CONNECT`** (start, reconnect after a cut, the 30-min server limit, the phone back from the background):
1. `GET /api/pm/info`: schema check (§ 3.7), administrator.
2. Rollback check: `records?sort=-updated&perPage=1&fields=updated`; if the newest record the server shows is older than the newest the phone has seen, every scope is read in full (the server was restored from an older copy).
3. `projects`: always in full (a handful of records). Projects missing from the answer are removed locally with their records (the user was removed); a project the phone has not read before gets a full read of its records.
4. `invites`, `prefs`: in full.
5. `records` per project, `pool`, `inbox`: full when there is no mark or when `decideMode` says so (the first start from Saturday 00:00, as today); else changes only: `updated > mark − 10 min` (`DELTA_MARGIN`), sorted by `updated`, pages of 1,000 with `skipTotal=1`.
6. Marks = the newest `updated` seen per scope (server time, never the phone's clock). A full read replaces the scope: local documents the server no longer has are removed, unless a queued item touches them.

**One-off reads** (`readColl`, `readPool` for the shared-list merge): straight from the server, all pages; they reject offline, as Firestore's `getDocsFromServer`.

**History** (`loadHistory(pid, since, max)`): `history` filtered by project and `at >= since`, sorted `-at`, up to `max` (pages of 1,000), waiting at most 6 s; on a timeout or offline, the entries of the local `history` store.

### 3.6 Badges, statuses and `sync.js`

- «⬆ N» = the non-history writes in the queue of the current user (also after a restart, when no promise is alive); `store.pendingCount()` takes the largest of `ownPendingCount()`, documents with `_pending` and the backend's count. Tap: «Ждут отправки: N. Если число не уменьшается — откройте ☰ → «🔌 Подключение к базе».» (offline: the existing text).
- «⬇ N» = parts not yet read from the server since this start: «Список проектов», «Данные проектов», «Общий пул», «Приглашения», «Настройки пользователя», «Входящие пула» (administrator). A network error keeps a part waiting; a server error after the retries shows «⬇ ошибка» with its code, as today. Tap while waiting: «Ждём данные с сервера: N разд. Пока показано то, что есть на устройстве.» (offline: the existing text). «⬇ лимит» never shows on the NAS copy.
- «⚠ N» as today; `rejectReason(code, backend)` gives for PocketBase `forbidden`: «Нет прав на запись» + «Возможно, вас убрали из проекта (попросите создателя пригласить снова) или это может делать только администратор базы. Потом нажмите «Повторить».»; `not-found` and `invalid`: today's texts.
- The «онлайн / офлайн» pill stays `navigator.onLine`; «Подключение к базе» shows the realtime state (§ 3.7).
- `src/domain/sync.js` keeps `DELTA_MARGIN`, `lastSaturday`, `decideMode`, `maxMillis`, retention, `rejectReason`; `DAILY_WRITE_LIMIT`, `writeWarnLevel` and the read counter in `repo.js` stay Firestore-only. «📈 Чтений базы…» on «Проект» is hidden on the NAS copy.

### 3.7 Screens that differ (mockup `mockups/nas-copy.html`)

**☰ → «🔌 Подключение к базе»** (shown on the NAS copy too):
- «База: домашний сервер (PocketBase)», «Адрес: https://<host>», «Администратор базы: <e-mail>» (existing text).
- Card «Связь с сервером»: «Сейчас» — «на связи» (realtime connected) / «нет связи» / «вход истёк» / «сервер не обновлён»; «Последнее обновление» — the time of the last server answer or event, or «ещё не было»; «Ждут отправки» — N; «Не принято сервером» — the «⚠» count; «Без интернета всё работает: записи ждут на телефоне и уйдут сами.»; button «🔄 Перечитать всё с сервера» → confirm «Перечитать все данные с сервера? Записи, которые ждут отправки, не пропадут.» → toast «Читаю данные с сервера…» and a full read of every scope.
- Card «Как подключить коллегу»: «Пригласите его в проект (☰ → «👥 Участники»), пусть откроет этот адрес на телефоне, установит значок на экран «Домой» и войдёт через Google.» and «📋 Скопировать адрес» (toast «Адрес скопирован»).
- No Client ID, no «Скопировать правила», no «Отключиться от базы».

**☰ → «👥 Участники»**: the «🔗 Ссылка для подключения» card is replaced by «Как подключить коллегу» with «📋 Скопировать» and «💬 WhatsApp»; the text sent: «Приложение «Менеджер проектов». Откройте адрес на телефоне, установите значок на экран «Домой» и войдите своим Google-аккаунтом: https://<host>/».

**Invitation banner**: unchanged; on the NAS copy its project comes from `invites` (`name`, `object`, `from`).

**Server older** (mockup screen 3): when `/api/pm/info` answers a lower `schema`, or the route is missing: a banner under the top bar for everyone: «⚠ База на домашнем сервере ещё не обновлена под эту версию приложения. Записи ждут на телефоне (⬆) и уйдут сами, как только сервер обновят.» Sending holds; reading goes on (a collection the server does not have yet reads as empty). The app asks `/api/pm/info` again every 10 min and at every reconnect; when the schema fits, the banner goes and the queue is sent.

**App older** (426): banner «Вышла новая версия приложения, а эта уже не может записывать на сервер. Закройте приложение и откройте снова.»; sending holds.

**«Журнал событий»** diagnostics: «Хранилище: PocketBase (домашний сервер)», cache line «своя копия на телефоне (IndexedDB)».

### 3.8 Google Drive and Sheets on the NAS copy

- The Client ID is taken from `client_id` of Google's `authURL` in `auth-methods` (the owner's client, R-GOOG-1) and kept as `pm.pbGoogleClient`; scopes `drive` and `spreadsheets` (that client has them). Without it: today's shared client with `drive.file`.
- Flows as today without Firebase: a popup on a computer, a redirect on iPhone and the installed app (`redirect_uri = https://<host>/`, allowed by R-GOOG-2); `login_hint` = the PocketBase user's e-mail.
- One sign-in for both (PocketBase can ask Google for extra scopes and returns Google's access token in `meta.accessToken`) is **not used**: every helper would see a Drive consent at the first sign-in, and the token lives an hour, so `google.js` still needs its own flow.
- Management sheets: unchanged; the nightly job on the NAS uses a new key of the same service account (same e-mail, ADR 0009, R-JOB-1), and `serverEmail` is written into the project as today.

### 3.9 Service worker

`navigateFallbackDenylist` adds `^<BASE>api/` and `^<BASE>_/` (in the NAS build `/api/` and `/_/`), so the OAuth redirect page `/api/oauth2-redirect` and the dashboard are never answered by the app. The code flow comes back to `/` and is answered by the app, as it should.

### 3.10 KI-8 (fixed in this stage)

- `deltaListen` gets an `onError(e)` for errors it does not retry; `createFirestoreBackend().listenPool(kind, cb, {withDeleted, onError})` passes it on; the memory backend gets a test option that fails pool listeners (`?mem=1&memPoolDenied=1`).
- `startShared` passes `onError`: on `permission-denied` it stops the merge and seeding for this start and shows once: «Общие списки не читаются: правила базы устарели — вставьте свежие правила в Firebase («🔌 Подключение к базе» → «📋 Скопировать правила»).»
- The PocketBase backend calls `onError` only for a refusal (403); a missing collection (404) is the «server older» banner. KI-8 becomes `fixed (test: …)`.

## 4. The NAS build and the release

A new job `nas-build` in `.github/workflows/pages.yml`, `needs: build` (so tests passed), its own `permissions: contents: write`, concurrency inherited from the workflow (a newer push cancels the older run):

1. `npm ci`, `npm run build:nas`.
2. `node scripts/nas-pack.mjs out/` builds, deterministically (entries sorted, fixed timestamps, so unchanged contents give the same checksum):
   - `nas-site.zip` — the contents of `dist-nas/` at the root;
   - `nas-pb.zip` — `pb_migrations/…` and `pb_hooks/…` from `pb/`;
   - `nas-jobs.zip` — `scripts/`, `src/`, `package.json` and `node_modules/` with the jobs' production dependencies only (`google-auth-library`, `mupdf`; no `firebase-admin`), installed on `ubuntu-latest` with Node 22; run as `node scripts/nas-jobs.mjs <command>`;
   - `nas-site.json`:
     ```json
     { "commit": "<40-char sha>", "version": "<package.json version>", "builtAt": "<ISO time>",
       "sha256": "<of nas-site.zip>", "schema": 1, "pocketbase": "0.42.3",
       "pb": { "file": "nas-pb.zip", "sha256": "…" },
       "jobs": { "file": "nas-jobs.zip", "sha256": "…" } }
     ```
3. Creates the release `nas-build` if missing (`gh release create nas-build --title … --notes …`, marked pre-release so it never shows as "Latest"), then `gh release upload nas-build <zips> --clobber`, and **`nas-site.json` last**. An updater that reads the old JSON while the new zips are already there sees a checksum mismatch and tries again at its next check — expected, harmless.

Zips are made by `scripts/zip-lib.mjs` (Node's `zlib`, no `zip` program; the same writer makes the Drive zip on the NAS). `tools/nas-check.mjs` gets **A15**: `GET /api/pm/info` answers `app: "pm"` and a `schema` ≥ 1; SKIP before the first NAS build (no manifest), FAIL after it.

## 5. Job scripts for the NAS

### 5.1 The runner `scripts/nas-jobs.mjs`

| Command | Does | Cron (agent, UTC) |
|---|---|---|
| `backup` | export (§ 5.2) into a clone of `polevoy-backups`, commit and push; then cleanup (§ 5.3); then the zip of the newest export to the owner's Drive file «Автокопия данных (обновляется каждые 2 дня).zip» (renamed text: «обновляется каждый день» comes with the switch-over, § 8) | daily 01:30 (after the PocketBase backup at 01:00) |
| `tables` | the nightly management sheets, rack tables and «PDF с номерами» (`server-tables-lib.mjs` unchanged) reading PocketBase | 00:00 and 07:20 |
| `catch-up` | runs `backup` when its last success is older than 24 h or missing | at container start |

- Configuration: `PB_URL` (default `http://pocketbase:8090`), `PB_JOBS_EMAIL`; secrets as files in `PM_SECRETS` (default `/run/secrets`): `pb_jobs_password`, `google_service_account.json`, `github_token`; `PM_STATE` (default `/data`) for the backup clone and `state.json` (`{backup: {ok, at, error}, tables: {...}}`); `BACKUP_REPO` (default `kukilvan/polevoy-backups`).
- The GitHub token is passed to git through an environment variable and a credential helper, never in a URL that could be printed; no secret is ever logged.
- Exit code 0 on success, 1 on any failure, with a one-line reason; `state.json` is written either way. The NAS project watches the two off-site copies (26 h) and can watch `state.json` too.
- Needs inside the agent: Node 22, `git`, network to GitHub and Google; no npm install.

### 5.2 The PocketBase source and the export

- `scripts/pb-source.mjs` — talks to PocketBase as the `jobs` superuser over HTTP (no SDK): lists projects, reads a project's records and history, the common data, writes project fields through `/api/pm/save` (superuser, `deep`, `itemPatches`), deletes records for cleanup. `scripts/fs-source.mjs` wraps today's Firestore reads and writes in the same shape. `server-backup.mjs`, `server-cleanup.mjs` and `server-tables.mjs` keep their names, arguments and Firestore behaviour for GitHub Actions (`FIREBASE_SERVICE_ACCOUNT`), and import `firebase-admin` only on the Firestore path.
- Export = today's folder format: `<name> (полная).json` (`polevoy-full-1`, `project` = `{id: key, ...data}`, `data[coll]` = records with `history` among them, each with `updatedAtServer` from `updated`, plus `"source": "pocketbase"`), `<name> (импорт).json` (`buildBackup`, unchanged), the common file (`pool_<kind>`, `pool_inbox`, `allowed` as `{id: email, email, at}`, `meta` with `admin`, `prefs` as `{uid, id: 'main', data}`), `ИТОГ.json`; keeps 15 folders; every run is a full read (no read quota on PocketBase). The export writes `serverBackupAt` into each project, as today.
- The weekly starter-pool job in GitHub Actions reads this format unchanged.

### 5.3 Cleanup on PocketBase

The same rule as `server-cleanup.mjs`: a project with `deleted: true` and `deletedAt` over 365 days ago is deleted with all its records, history and invitations (cascade); records with an expired soft delete are deleted; history with `at` older than 365 days is deleted. At most 5,000 per collection per run, `DRY_RUN=1` only reports.

## 6. The restore tool `scripts/pb-restore.mjs`

`node scripts/pb-restore.mjs <backup folder> [--write] [--resume] [--admin <e-mail>] [--verify]`, with `PB_URL`, `PB_SUPERUSER_EMAIL` and the password in the file `PB_SUPERUSER_PASSWORD_FILE`. The folder is a `polevoy-backups` folder or the unpacked Drive zip, from Firebase or from PocketBase.

1. **Plan** (always, also without `--write`): reads every `(полная).json` and the common file; counts per target collection; the users: e-mail ↔ old uid from each project's `memberUids`/`memberEmails` pairs and `removedMembers`, names from `memberNames`; prefs owners through the same map; the administrator from `meta/admin`, else `--admin` (required then); lists uids it cannot map (kept as they are, with a warning) and keys that would collide.
2. **Write** (`--write`): refuses when the server already has projects, unless `--resume` (then it skips every record that already exists, so an interrupted run continues).
   - Users: for each e-mail without a PocketBase user, creates one (`verified: true`, `emailVisibility: false`, a random 32-character password nobody knows, `name`). Google sign-in later links to it by e-mail (§ 1).
   - Uid mapping: every string value and object key exactly equal to a mapped old uid is replaced with the PocketBase id, in every document (members, `createdBy`, `updatedBy`, `deletedBy`, history `by`, `before`, `after`, `removedMembers` keys); inbox keys starting with `<old uid>_` get the new prefix.
   - Creates projects (`key`, `data`, `members` from the mapped `memberUids`), records (key = the document's `id`), history (`at`), pool (`kind` from `pool_<kind>`), inbox, allowed, admin, prefs, and `invites` from `invitedEmails`; drops `updatedAtServer` from `data`. Superuser batches of 500 through `/api/batch`, one after another; a 429 waits 2 s and retries.
3. **Count check**: counts on the server per collection and per project against the plan; a table with ✓/✗; exit 1 on any difference.
4. **`--verify`**: reads everything back, maps the ids back and compares every document with the backup (ignoring `updatedAtServer`); reports differences; exit 1 on any.
5. Prints the time of each step (for the rehearsal).

**The way back** (R-MOVE-2, run by the NAS project): `server-restore.mjs` recognises a PocketBase export (`"source": "pocketbase"`) and then maps PocketBase ids to Firebase uids by e-mail (the export's member pairs, then `admin.auth().getUserByEmail`), writes `updatedAtServer` as the server time (so the phones' delta reads see every document), and writes into a non-empty database only with `--force`.

## 7. The rehearsal of the move (ticket 13)

On the owner's PC, nothing of the data in the repo:
1. Copy the newest folder of `polevoy-backups` into the scratchpad.
2. `node tools/pb-dev.mjs up --empty` — a fresh local PocketBase 0.42.3 with this repo's migrations and hooks and the NAS build in `pb_public`.
3. `pb-restore` plan → `--write` → count check → `--verify`; time each step.
4. In the browser pane at `http://localhost:8090/`: sign in as the owner's restored user (`pb-dev` sets a local password for that e-mail; local only) and check against the Firebase app with the same backup: the project list; points per project and per rack; a day's report text (Russian and Hebrew); the month report; «История изменений» (authors' names); «👥 Участники»; delay reasons, culprits, problems; problem marks on points; the management-sheet preview (no Google write).
5. Write `docs/nas-move-rehearsal.md` (English, for the NAS project): the commands in order, the times, the counts to expect and how to compare them (per collection, per project), what `--verify` must show, what went wrong and how it was fixed, the go/no-go list for the move day. No names or e-mails; counts only.

## 8. Switch-over instructions (ticket 14)

- `ПЕРЕЕЗД.md` in the repo root (Russian, plain words, `docs/workflow.md` "Instructions for the owner"):
  - **before the move day**, every phone: open the old icon with internet, wait until «⬆» is gone, record nothing more until the owner says;
  - **after the NAS project switches over**, every phone: open `https://<host>` in Safari (the owner sends the address), «Поделиться» → «На экран «Домой»», open the new icon, «Войти через Google» with the same Google account, accept nothing new (projects appear by themselves);
  - **the check** (the owner, then each helper): projects listed; the number of points of each project as on the old icon; today's or the last report text; the last entries of «🕘 Откат записей»; «👥 Участники»; the shared lists; what "wrong" looks like (a project missing, fewer points, «⚠» or a red «⬇ ошибка») and to send a screenshot;
  - **the old icon**: delete it only after the check and when the owner says; until then do not record anything in it (its changes would not reach the NAS);
  - **if something is wrong**: stop recording in the new icon, tell the owner; the NAS project brings the data back to Firebase (§ 6, the way back); the old icon then works as before.
- The in-app guide (`src/app/views/guide.js`) gets a section shown on the NAS copy only, «Домашний сервер»: «На домашнем сервере приложение работает так же, как с Firebase. Без интернета записи ждут на телефоне (значок ⬆) и уходят сами. Если вверху написано, что база на домашнем сервере ещё не обновлена, ничего делать не нужно: записи уйдут после обновления сервера. Если написано «Вход истёк» — нажмите «Войти снова».»
- The Drive zip's file name keeps «(обновляется каждые 2 дня)» (the owner shared that file with the service account; renaming is the owner's step and not needed).

## 9. Changes to the NAS document (this session)

`docs/nas-requirements.md` gets version **2026-11-25 (2)**, commit `626a548`. Changes: R-PB-1 and the Dockerfile and compose (0.42.3, new host, checksum, why); R-PB-5 (batch serves the restore tool); R-PB-6 (unchanged numbers; the app writes through its route; the agent needs no exclusion); R-PB-8 (asset `nas-pb.zip`, folder layout, replace both folders' contents, `GET /api/pm/info`); R-SITE-2 (`nas-site.json` fields, upload order); § 6 table condensed and R-JOB-1/2 (the runner, commands, times, configuration, secrets); R-BAK-3; § 8 bullets condensed; R-MOVE-1/2 (tool names, the rehearsal file, the way back); § 12. A15 is not in the table yet: ticket 02 adds it together with the tool (the guard test counts A1–A14). The guard test in `tests/nas-check.test.js` allows the host `ganigeorgiev.com` and its budget goes from 30,000 to 34,000 bytes (31,472 now; stage 4 still adds A15 and the rehearsal pointer). A short message for the NAS project goes with it: `.scratch/04-pocketbase-storage/nas-message-2.md` (the owner forwards both after «Коммит»).

## 10. Edge cases

1. **The same record changed on two phones offline.** Each change merges into the server's version in arrival order (points: whole top-level fields); the later arrival wins per field; both phones end with the server's result. Same as Firestore today (KI-5, KI-6 unchanged).
2. **The app is closed or the network drops while sending.** The request is sent again at the next chance; upserts and create-only history make it harmless.
3. **A member is removed from a project while offline with changes.** The next full read of `projects` drops the project and its records on the phone; its queued items come back 422 `forbidden` → «⚠» with the «убрали из проекта» text.
4. **A large save is rejected in its third chunk.** The first two chunks stay on the server; the whole item goes to «⚠»; «🔁 Повторить» resends all (idempotent).
5. **The token expires while offline for over 30 days.** The app opens from the local copy; online, `authRefresh` → 401 → banner; nothing is lost; after «Войти снова» the queue goes out.
6. **Another person signs in on the same phone.** § 3.3: the local copy is replaced; the first person's unsent items wait for them.
7. **A new app on an older server** (the NAS updater has not installed the migrations yet, or failed). Banner, sending holds, reading goes on; when the server catches up, everything goes out by itself.
8. **An old app on a newer server** (a phone that has not reloaded yet). Works: changes are additive; only a future breaking change would answer 426.
9. **The hooks are missing** (`pb_hooks` empty after a bad install). `/api/pm/info` 404 → treated as schema 0 → server-older banner.
10. **The tunnel cuts an idle stream** (≈ 125 s) or PocketBase ends it (30 min). The keep-alive prevents the first; either way the SDK reconnects, `PB_CONNECT` triggers the reads of § 3.5.
11. **An iPhone puts the app in the background.** The stream dies; when the app is visible again it reconnects, reads changes and sends the queue.
12. **A project appears** (an invitation accepted on this or another phone). Its records are read in full at once (a delta from an old mark would miss them).
13. **The server is restored from an older copy.** The rollback check of § 3.5 sees the newest record older than the phone's and reads everything; the Saturday full read stays the backstop.
14. **The phone drops the IndexedDB copy** (low space). The next start reads everything; unsent changes are lost, as with Firestore's cache today; the installed app and `storage.persist()` make it rare.
15. **A mass edit of 2,500 points** (5,000 writes with history). ≈ 17 requests of 300 ops, one after another; «⬆» counts down; ≈ 0.5 s of server time each.
16. **A document over 2 MB.** 422 `invalid` → «⚠» (Firestore would refuse over 1 MiB too).
17. **Two first sign-ins on an empty server at once.** `/api/pm/admin` runs in a transaction: the first becomes the administrator, both get its e-mail.
18. **An invitation to an e-mail with capital letters.** `invite()` already lowercases; rules and the route compare lower case.
19. **A helper who never signed in to the NAS is invited.** The invitation waits in `invites`; their first Google sign-in creates the user, and the banner shows.
20. **Restored users sign in with Google.** Linked to the restored user by e-mail (§ 1); their history and memberships stay theirs.
21. **A history author whose old uid is in no project's member or removed list.** The uid stays as it was; history shows its stored `byName`.
22. **Cleanup deletes a record for good.** Online phones get the realtime `delete`; offline ones notice at the Saturday full read.
23. **An empty object in a deep write** (`{managers: {}}`). Replaces the stored value, as Firestore's leaf rule.
24. **The server's echo of a change arrives while a newer change to the same record is still queued.** The screen shows the server version with the queued change replayed on top (§ 3.4).
25. **The phone's clock is wrong.** Marks are server time; `updatedAt` stamps stay the phone's time, as today.
26. **A non-administrator writes an administrator-only pool list** (an older build, or a bug). 422 `forbidden` → «⚠», as Firestore today.
27. **Two pushes to `main` close together.** The newer run cancels the older; the release ends with the newer build.
28. **The updater reads `nas-site.json` while zips are being replaced.** Checksum mismatch, next check succeeds (JSON uploaded last).
29. **A request body over the server's limit.** The client's limits (300 ops, 1.5 MB) keep far below 4 MB; a 413 still resolves (§ 3.4).
30. **The token is treated as a guest's** (a server older than 0.42 with an expired token). The guard of § 3.2 does not apply a full read that would drop every project until a token refresh has succeeded in this run.
31. **The old Firebase icon used after the switch-over.** Its writes stay in Firebase and never reach the NAS; the instructions say not to record there and to delete it after the check (§ 8). A "moved" lock in the old copy would need a Firestore write by the NAS project and is not worth it for 2–6 people.
32. **A job fails at night** (GitHub or Google down). Exit 1, `state.json` says why, the NAS project's 26-hour watch alerts; `catch-up` and the next night repeat it.

## 11. Tests

**Automated, pure, always run** (`npm test`, offline, rule 2):
- `tests/pbwrite.test.js`: ops from repo writes (every `commit` shape of `repo.js`); `deep`, `fields`, `arrayOps`, `itemPatches`, the empty-object case, ADR 0018's older-build case (`planColour` kept); every rule row of § 2.4 with allowed and refused cases (member, non-creator member, invitee accept/decline/cheat, non-member, admin, allowed, unknown kind, inbox status fields); chunking (300 ops, 1.5 MB, a large item split); answer classification of § 3.4; the generated hook module is fresh and `PB_SCHEMA` equals `PM_SCHEMA`.
- `tests/pbread.test.js`: record → document, marks, the delta filter, the rollback check, full-read replacement keeping queued documents, the event-apply order, the export shape (`updatedAtServer` timestamps, `source`).
- `tests/pb-restore.test.js` (plan part, no server): uid mapping (values, keys, inbox prefixes), users from member pairs and removed members, collisions, the administrator, counts — on a small synthetic backup in `tests/fixtures/`.
- `tests/nas-pack.test.js`: deterministic zips (same input → same checksum; entries read back with `zlib`), `nas-site.json` fields.
- `tests/nas-check.test.js`: A15.
- KI-8: the memory backend's denied pool listener reaches `startShared`'s handler.

**Automated against a real PocketBase** (`tests/pb-*.test.js`): `tools/pb-dev.mjs` fetches PocketBase 0.42.3 for the platform into `.cache/pocketbase/` and checks its SHA-256; tests start their own instance on a free port with the repo's migrations and hooks. Without the binary they are skipped with a message on the owner's PC; in CI the binary is fetched (cached by version) and they **always** run before the deploy.
- Migrations apply to an empty server; every app collection's write rules are `null`; guest user create refused.
- The route: every rule row on the real server; rollback on a refused op with the right `index`; resend of the same request is harmless; 409, 426; invites kept in step; realtime events after a save reach members only.
- The restore tool: plan → write → counts → `--verify` on the synthetic backup; `--resume`; OAuth2 linking by e-mail with the fake OIDC provider of § 1.
- Export → restore round trip on PocketBase equals the input; cleanup on PocketBase.

**The app in the browser pane** (self-check of every NAS ticket): `npm run build:nas`, `node tools/pb-dev.mjs up` (serves `dist-nas/`, password sign-in on, test users), `http://localhost:8090/` at 420 px: sign in with the password form; the ticket's scenario; "offline" by stopping the local PocketBase (`pb-dev down`; the app sees network errors) and starting it again; two tabs as two users for realtime. `?mem=1` keeps covering everything that is not storage.

**The owner checks live** (on the NAS, after the NAS side of "needed first" is ready): Google sign-in from the installed iPhone icon, both buttons (A14); work offline on site and the «⬆» count going to 0; two phones seeing each other's changes; Drive and Sheets from the NAS address; the rehearsal result and the switch-over text read through. The server-older banner is checked in the browser pane only (the NAS project would have to hold migrations on purpose).

## 12. Docs, terms, ADRs, known issues

- **Written in this session:** ADR 0020, ADR 0021; `CONTEXT.md` (new terms below; «Repo», «Delta read» and «NAS copy» updated); `docs/project-spec.md` (stage 4: the version move, the ticket count); `docs/nas-requirements.md` (§ 9); `.scratch/04-pocketbase-storage/nas-message-2.md`.
- **By tickets:** `docs/code-map.md` (rebuilt; the architecture part gets a PocketBase paragraph: storage, sync, start), `docs/coding-standards.md` (rule 14: users write to PocketBase only through the write route, collection write rules stay `null` — checked by a test; rule 15: `pb/pb_hooks/pm/pbwrite.js` is generated, never edited — checked by a test), `docs/workflow.md` (self-check of NAS tickets with `pb-dev`), `CLAUDE.md` Run (`npm run build:nas`, `node tools/pb-dev.mjs up|down`), `PROJECT_CONTEXT.md` (environment: the release, device keys `pocketbase_auth`, `pz.pbOauth`, `pm.pbGoogleClient`, `pm.admin.pb`, IndexedDB `pm-pb`; gotcha: PocketBase releases live at `ganigeorgiev.com` since 2026-10-26, GitHub is archived), `KNOWN_ISSUES.md` (KI-8 fixed), `ВОССТАНОВЛЕНИЕ.md` (the restore tool, ticket 12), `ПЕРЕЕЗД.md` (ticket 14), `docs/nas-move-rehearsal.md` (ticket 13), the in-app guide (tickets 07 and 14), `.gitignore` (`dist-nas/`, `.cache/`).
- **New `CONTEXT.md` terms:** NAS build; write route; local copy; write queue; schema version (with «server older»); restore tool; job runner; rehearsal of the move.
- **New `KNOWN_ISSUES.md` entries:** none now. The old Firebase icon after the switch-over is a decided risk (edge case 31), not a bug.

## 13. Proposed tickets

| # | Ticket | Complexity | Blocked by | The owner checks |
|---|---|---|---|---|
| 01 | Server schema and write route: `tools/pb-dev.mjs` (fetch with checksum, start, settings, test users), migration 1, `pm.pb.js` (save, info, admin, keep-alive), `src/domain/pbwrite.js` and its generator, server tests in CI | complex | — | nothing on the site changes; the test run in the deploy log |
| 02 | NAS build and release: `build:nas`, flag, service worker deny list, `nas-pack.mjs`, `zip-lib.mjs`, the `nas-build` job, A15; the NAS build shows a placeholder after start («Хранилище на домашнем сервере появится в следующих версиях»), so the NAS project can test its updater | complex | 01 | the release `nas-build` exists; the NAS project installs it (A9, A15) |
| 03 | Sign-in on the NAS copy: screen, both flows, token refresh, expired banner, password form for local tests, administrator, sign-out question | complex | 02 | sign-in from the installed iPhone icon, both buttons (A14) |
| 04 | Local copy and write queue: `pm-pb` stores, replay, listeners, the sender with every answer of § 3.4, «⬆» and «⚠» | complex | 03 | create a project and points on the NAS; close and reopen; offline «⬆ N» then 0 |
| 05 | Reading: realtime with keep-alive, reads after every connect, full/delta/Saturday, rollback check, new and removed projects, «⬇» | complex | 04 | two phones see each other's changes; after a night offline the changes arrive |
| 06 | The rest of the backend: members, invitations (`invites`), pool and shared lists, inbox, prefs, history screens, «Импорт данных»; `pendingCount` | complex | 05 | invite a helper; shared lists; «Откат записей»; the pool administrator's inbox |
| 07 | NAS screens: «Подключение к базе», members card, server-older and app-older banners, PocketBase texts of «⚠», «⬆», «⬇», hidden read counter, diagnostics, guide section «Домашний сервер», English and Hebrew | medium | 06 | the screens as in the mockup |
| 08 | Google Drive and Sheets on the NAS copy: Client ID from `auth-methods`, scopes, `login_hint` | medium | 03 | a drawing from Drive and a management sheet from the NAS address |
| 09 | KI-8 | simple | — | in test mode `?mem=1&memPoolDenied=1` the toast shows |
| 10 | Job sources and export: `pb-source.mjs`, `fs-source.mjs`, export format, cleanup on PocketBase, `itemPatches`; Firebase jobs unchanged | complex | 01 | the next Firebase backup and night sheets run as before (Actions log) |
| 11 | Job runner `nas-jobs.mjs`: `backup` (git push, Drive zip), `tables`, `catch-up`, `state.json`, secrets from files; the `nas-jobs.zip` contents | medium | 10, 02 | nothing on the site; the NAS project runs it at its stage 13 |
| 12 | Restore tool and the way back: `pb-restore.mjs` (plan, write, resume, counts, verify), user creation and linking test, `server-restore.mjs` from a PocketBase export; `ВОССТАНОВЛЕНИЕ.md` | complex | 10 | nothing on the site |
| 13 | Rehearsal of the move on the PC with the owner's newest backup; `docs/nas-move-rehearsal.md`; small fixes it finds | medium | 06, 12 | reads the rehearsal result |
| 14 | Switch-over instructions `ПЕРЕЕЗД.md`; the NAS document's final stage 4 version and a message to the NAS project | simple | 13 | reads the instructions |

Order: 01 → 02 → 03 → 04 → 05 → 06 → 07; 08 after 03; 09 any time (a warm-up for the sync code, on Firebase); 10 → 11, 10 → 12 → 13 → 14. Tickets 02 and 03 come early because the NAS project can use a release as soon as it exists and the owner's first check is the Google sign-in from the installed icon. With the description, spec, slicing and review: 18 sessions, plus fix rounds — inside the estimate of 21.

## Texts

New UI strings (rule 12). `<…>` is a value filled in by the app.

| Russian | English | Hebrew |
|---|---|---|
| База: домашний сервер · <host> | Database: home server · <host> | מסד נתונים: שרת ביתי · <host> |
| Сервер недоступен — проверьте интернет и попробуйте ещё раз. | The server cannot be reached — check the internet connection and try again. | אין חיבור לשרת — בדקו את החיבור לאינטרנט ונסו שוב. |
| Вход через Google на этом сервере не настроен. | Google sign-in is not set up on this server. | הכניסה עם Google לא הוגדרה בשרת הזה. |
| Вход по паролю — только для проверки на компьютере | Password sign-in — for testing on a computer only | כניסה עם סיסמה — לבדיקה במחשב בלבד |
| Почта | E-mail | דוא״ל |
| Пароль | Password | סיסמה |
| Войти по паролю | Sign in with password | כניסה עם סיסמה |
| Вход истёк. Записи ждут на телефоне и уйдут после входа. | Your sign-in has expired. Changes are waiting on the phone and will be sent after you sign in. | תוקף הכניסה פג. השינויים ממתינים בטלפון ויישלחו אחרי הכניסה. |
| Войти снова | Sign in again | להיכנס שוב |
| Есть неотправленные записи: <N>. Если выйти, они останутся на телефоне и уйдут, когда вы снова войдёте этим же аккаунтом. Выйти? | There are unsent changes: <N>. If you sign out, they stay on the phone and are sent when you sign in again with the same account. Sign out? | יש שינויים שלא נשלחו: <N>. אם תצאו, הם יישארו בטלפון ויישלחו כשתיכנסו שוב עם אותו חשבון. לצאת? |
| Вы вошли другим аккаунтом. Неотправленные записи прошлого аккаунта (<N>) ждут, пока он снова войдёт на этом телефоне. | You signed in with another account. The unsent changes of the previous account (<N>) wait until it signs in on this phone again. | נכנסתם עם חשבון אחר. השינויים שלא נשלחו של החשבון הקודם (<N>) ממתינים עד שהוא ייכנס שוב בטלפון הזה. |
| ⚠ База на домашнем сервере ещё не обновлена под эту версию приложения. Записи ждут на телефоне (⬆) и уйдут сами, как только сервер обновят. | ⚠ The database on the home server has not been updated for this version of the app yet. Changes are waiting on the phone (⬆) and will be sent by themselves as soon as the server is updated. | ⚠ מסד הנתונים בשרת הביתי עדיין לא עודכן לגרסה הזו של האפליקציה. השינויים ממתינים בטלפון (⬆) ויישלחו מעצמם ברגע שהשרת יעודכן. |
| Вышла новая версия приложения, а эта уже не может записывать на сервер. Закройте приложение и откройте снова. | A new version of the app is out, and this one can no longer write to the server. Close the app and open it again. | יצאה גרסה חדשה של האפליקציה, והגרסה הזו כבר לא יכולה לכתוב לשרת. סגרו את האפליקציה ופתחו אותה שוב. |
| База: домашний сервер (PocketBase) | Database: home server (PocketBase) | מסד נתונים: שרת ביתי (PocketBase) |
| Адрес: <url> | Address: <url> | כתובת: <url> |
| Связь с сервером | Connection to the server | חיבור לשרת |
| Сейчас | Now | כרגע |
| на связи | connected | מחובר |
| нет связи | not connected | לא מחובר |
| вход истёк | sign-in expired | תוקף הכניסה פג |
| сервер не обновлён | server not updated | השרת לא עודכן |
| Последнее обновление | Last update | עדכון אחרון |
| ещё не было | not yet | עדיין לא היה |
| Ждут отправки | Waiting to be sent | ממתינים לשליחה |
| Не принято сервером | Not accepted by the server | לא התקבלו בשרת |
| Без интернета всё работает: записи ждут на телефоне и уйдут сами. | Everything works without the internet: changes wait on the phone and are sent by themselves. | הכול עובד גם בלי אינטרנט: השינויים ממתינים בטלפון ונשלחים מעצמם. |
| 🔄 Перечитать всё с сервера | 🔄 Re-read everything from the server | 🔄 לקרוא הכול מחדש מהשרת |
| Перечитать все данные с сервера? Записи, которые ждут отправки, не пропадут. | Re-read all data from the server? Changes waiting to be sent will not be lost. | לקרוא מחדש את כל הנתונים מהשרת? שינויים שממתינים לשליחה לא יאבדו. |
| Читаю данные с сервера… | Reading data from the server… | קורא נתונים מהשרת… |
| Как подключить коллегу | How to connect a colleague | איך לחבר עמית |
| Пригласите его в проект (☰ → «👥 Участники»), пусть откроет этот адрес на телефоне, установит значок на экран «Домой» и войдёт через Google. | Invite them to the project (☰ → «👥 Members»), then let them open this address on their phone, add the icon to the Home Screen and sign in with Google. | הזמינו אותו לפרויקט (☰ ← «👥 משתתפים»), ואז שיפתח את הכתובת הזו בטלפון, יוסיף את הסמל למסך הבית וייכנס עם Google. |
| 📋 Скопировать адрес | 📋 Copy the address | 📋 להעתיק את הכתובת |
| Адрес скопирован | Address copied | הכתובת הועתקה |
| Приложение «Менеджер проектов». Откройте адрес на телефоне, установите значок на экран «Домой» и войдите своим Google-аккаунтом: <url> | The «Project Manager» app. Open the address on your phone, add the icon to the Home Screen and sign in with your Google account: <url> | האפליקציה «מנהל פרויקטים». פתחו את הכתובת בטלפון, הוסיפו את הסמל למסך הבית והיכנסו עם חשבון Google שלכם: <url> |
| Ждут отправки: <N>. Если число не уменьшается — откройте ☰ → «🔌 Подключение к базе». | Waiting to be sent: <N>. If the number does not go down, open ☰ → «🔌 Database connection». | ממתינים לשליחה: <N>. אם המספר לא יורד, פתחו ☰ ← «🔌 חיבור למסד הנתונים». |
| Ждём данные с сервера: <N> разд. Пока показано то, что есть на устройстве. | Waiting for data from the server: <N> sections. What is on the device is shown meanwhile. | ממתינים לנתונים מהשרת: <N> חלקים. בינתיים מוצג מה שיש במכשיר. |
| Возможно, вас убрали из проекта (попросите создателя пригласить снова) или это может делать только администратор базы. Потом нажмите «Повторить». | Perhaps you were removed from the project (ask its creator to invite you again), or only the database administrator may do this. Then tap «Retry». | ייתכן שהוסרתם מהפרויקט (בקשו מהיוצר להזמין אתכם שוב), או שרק מנהל מסד הנתונים רשאי לעשות זאת. אחר כך הקישו «לנסות שוב». |
| Общие списки не читаются: правила базы устарели — вставьте свежие правила в Firebase («🔌 Подключение к базе» → «📋 Скопировать правила»). | The shared lists cannot be read: the database rules are out of date — paste the fresh rules into Firebase («🔌 Database connection» → «📋 Copy the rules»). | לא ניתן לקרוא את הרשימות המשותפות: כללי מסד הנתונים מיושנים — הדביקו את הכללים העדכניים ב-Firebase («🔌 חיבור למסד הנתונים» ← «📋 העתקת הכללים»). |
| Хранилище на домашнем сервере появится в следующих версиях. | Storage on the home server comes in the next versions. | האחסון בשרת הביתי יגיע בגרסאות הבאות. |
| PocketBase (домашний сервер) | PocketBase (home server) | PocketBase (שרת ביתי) |
| своя копия на телефоне (IndexedDB) | own copy on the phone (IndexedDB) | עותק משלו בטלפון (IndexedDB) |
| Домашний сервер (guide section title) and its paragraph (§ 8) | Home server; the paragraph translated in ticket 14 | שרת ביתי; the paragraph translated in ticket 14 |

Labels in «» that point at existing menu items (`👥 Участники`, `🔌 Подключение к базе`, `📋 Скопировать правила`, `Повторить`) use the English and Hebrew of those items as the dictionaries already have them; the ticket aligns them.
