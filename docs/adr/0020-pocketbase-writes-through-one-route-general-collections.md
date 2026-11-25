# On PocketBase, users write only through one server route that merges like Firestore, into a few general collections

Status: accepted (planned, stage 4)

Decided in «Спека 4» (2026-11-25), checked on a local PocketBase 0.42.3. The app's writes rely on Firestore semantics: `merge: true` merges nested maps, `mergeFields` replaces whole top-level fields, `arrayUnion`/`arrayRemove` change member lists, a batch is atomic, and the rules compare the document before and after a write (a non-creator member must not touch member lists; an invitee may only add or keep themself). ADR 0018 depends on a write that omits a key keeping it. PocketBase replaces a JSON field whole, and its rule language cannot match an e-mail exactly inside a JSON array or compare a document before and after a write.

Decision: every write of a signed-in user goes to one route in `pb_hooks`, `POST /api/pm/save`. It takes a list of ops, runs them in one transaction, loads each target by the app's key, merges with the same pure code the phone uses (`src/domain/pbwrite.js`, a generated copy on the server), checks a copy of `firestore.rules` against the old and new document, and answers which op was refused. The create, update and delete rules of every app collection are `null`, so PocketBase's own record API is read-only for users. The data lives in general collections: `projects`, `records` (all project collections, by `coll` and `key`), `history`, `pool` (by `kind`), `inbox`, `allowed`, `admin`, `prefs`, and `invites` — an exact index of invitations that the route keeps in step with each project's `invitedEmails`. One realtime topic and one delta read cover a whole project.

Options considered: one PocketBase collection per Firestore collection, written through PocketBase's batch API with merge hooks — rejected: 30 collections with identical rules, hooks that depend on batch internals, record API writes open to users, and every request inside a batch counted by the rate limits; merging on the phone (read, merge, write the whole document) — rejected: a stale offline copy would overwrite other members' fields; deterministic hashed PocketBase ids with batch upserts — not needed once the route looks records up by their unique key.

## Consequences

- Writes are idempotent (upserts by key, create-only history), so a phone can resend after a lost answer.
- The rules live in tested JavaScript (`pbwrite.js` runs under node:test and on the server); a hook bug is a hole, so every rule row has tests against a real PocketBase in CI.
- The server-side jobs write project fields through the same route as a superuser, so their writes merge atomically too (`itemPatches` for list items by id).
- A new pool kind or a rule change needs a hooks change and a higher database `schema`; a new project collection does not.
- The restore tool writes with superuser batches through the record API, bypassing the route.
