# The NAS copy keeps a full local copy and a persistent write queue on the phone

Status: accepted (planned, stage 4)

Decided in «Спека 4» (2026-11-25). PocketBase has no offline persistence like Firestore's (ADR 0012), and the app must work fully offline on site. Decision: the PocketBase storage keeps in IndexedDB (`pm-pb`) every document of every project the user is a member of, the shared pool, the user's settings and invitations, plus a queue of the writes not yet on the server. Screens read only the local copy. A write is applied locally at once and queued in the same call; a sender sends the queue in chunks of at most 300 ops, one request at a time, with back-off on network errors and 429. The server is the truth: server versions replace local ones, with queued writes replayed on top. Changes arrive by realtime (one connection, a keep-alive every 60 s) and, after every connect, by a read of what changed since the last mark (PocketBase's `updated`, server time), with a full read on Saturdays, for projects new on the phone and after a server rollback. History stays on the server and is read when its screens open.

Options considered: loading only the current project — rejected: switching projects offline and «Месяц» need every project, and the owner's whole data is a few MB without history; reusing `src/app/localdb.js` as it is — rejected: it notifies every listener on every write and has no queue; Background Sync in the service worker — rejected: iPhone Safari does not support it, and the app is open while people work.

## Consequences

- A phone's first sign-in reads everything once (≈ 5,000 records for the owner); later starts read only changes.
- A lost IndexedDB copy costs unsent changes, as Firestore's cache does today; `storage.persist()` and the installed app make it rare.
- The «⬆» badge counts the queue, also after a restart; «⬇ лимит» and the Firestore quota lines do not apply.
- Another user signing in on the same phone replaces the copy; the first user's queue waits for them.
