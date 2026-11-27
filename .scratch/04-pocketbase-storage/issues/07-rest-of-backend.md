Status: in review
Complexity: complex
Blocked by: 06

# 07. The rest of the backend: members, invitations, shared lists, inbox, settings, history, import

Every method of the backend interface works on PocketBase, so every screen of the app that needs storage works on the NAS copy.

## Spec sections

§ 2.1 (`invites`, `pool`, `inbox`, `allowed`, `admin`, `prefs`), § 2.2, § 2.4 (rules rows for these ops), § 3.5 (history, one-off reads), § 3.6 (`pendingCount`), § 3.7 (invitation banner), § 10 (edge cases 3, 12, 18, 19, 20, 21, 26), § 3.10 (the 403 → `onError` part). Slicing notes under § 13 apply.

## What to do

1. Walk **every** method of `createFirestoreBackend` and every `createRepo` call that reaches a backend method (`src/app/repo.js`), and make the PocketBase backend answer each one as Firestore does: a list in the ticket's report says which method is answered by which scope. A method that has no PocketBase meaning is named and left out on purpose.
2. Members: `invite`, `cancelInvite`, `acceptInvite`, `declineInvite`, `removeMember`, `renameMember` go through `saveProject` with `arrayOps` (already queued by ticket 05) — now with the invited / accepting user's other half: `listenInvitations` from the `invites` scope (`name`, `object`, `from`) filtered the way the Firestore one is (`memberUids` without the user); `allowEmails` (admin) writes `allowed`; the invitation banner works unchanged.
3. Shared lists and the pool: `listenPool(kind, cb, {withDeleted, onError})` per kind, `commitPool` (`remove` = `{deleted: true}`), `readPool`; `onError` is called **only** for a refusal (403); a missing collection (404) is the «server older» state. `startShared` (`src/app/shared.js`) works as it does today, including the merge, the seeding and the first start of a new project.
4. Inbox (`listenInbox` only for the administrator, `{...data, key}`; `setInbox` deep), the administrator's «Входящие пула», the personal settings (`listenUserPrefs`, `saveUserPrefs` with `replace`), `loadSettings` / `saveSettings` as `createFirestoreBackend` has them (check what they do today and keep the behaviour).
5. History: «История изменений» and «🕘 Откат записей» read through `loadHistory` and roll back through `revertTo` as today; the author's name comes from `byName`; entries of an author whose uid is in no member list keep their stored name (edge case 21).
6. «Импорт данных» (`polevoy-import-1`) and the backup import of «Резервная копия» into a new project: chunked through the queue; a project with 2,500 points saves in ≈ 17 requests, «⬆» counts down.
7. `store.pendingCount()` (§ 3.6): the largest of `ownPendingCount()`, documents with `_pending` and the backend's queue count — wired in ticket 05, here proven after a restart with pool and inbox writes in the queue.
8. Header comments, `node tools/code-map.mjs`.

## Done when

Local PocketBase, browser pane at 420 px, two tabs as two test users:
- User A creates a project, invites B's e-mail (capital letters included): B's tab shows the invitation banner; B accepts, sees the project and its points; A removes B: B's project disappears, and a change B queued meanwhile goes to «⚠» with `forbidden`.
- The shared lists (delay reasons, culprits, problems): a member adds an item in A, it shows in B; only the administrator can mark one deleted (the other gets «⚠»).
- The administrator's inbox shows what members' projects bring; a non-administrator gets no inbox events.
- «История изменений» and «🕘 Откат записей» list entries with author names and roll one back; the roll-back is itself in the history.
- An import file in the `polevoy-import-1` format (made from the test project of `?mem=1&memPlan=1` or a synthetic one; never the owner's data in the repo) lands completely; counts equal on the server.
- The `?mem=1` and Firebase builds behave as before; the Pages build has no PocketBase code.
- `npm test`, `npm run build`, `node tools/code-map.mjs --check` pass.

## Tests to add

Pure: invitation filtering, history merge of the server and the local store, `pendingCount`, the `onError` rule (403 only). Real-server tests with ticket 02's helper: the invitation round trip, removal and the refused queued change, shared-list deletion rights, the inbox visibility, a rollback written to history. `tests/shared.test.js`: `startShared` with the PocketBase backend's `onError`.

## Owner check

Needs the NAS and a helper with a Google account. Kept for the stage list:
1. ☰ → «👥 Участники» → invite a helper's Google e-mail. The helper opens the NAS address, signs in with Google: a banner offers the project; accepts; sees the project.
2. In «📋 Справочники» add a delay reason in one phone: it shows on the other.
3. ☰ → «🕘 Откат записей»: the last entries have names; roll one back and see it come back.
4. As the pool administrator: «🗂 Общий пул» / the inbox show what the helper's project brought.
5. Wrong: the helper sees no project after accepting, or «⚠» appears — send a screenshot.

## Notes from ticket 05

- Until reading exists (ticket 06), `readPool` and `listenPool` answer from the local copy only, so a user with an empty copy sees an empty pool: `startShared` then seeds the shared lists, and a user not in `allowed` gets «⚠ forbidden» for that seed (seen with `b@pm.test` on pb-dev). Check that this is gone once `readPool` reads the server.
- `pz.rejected` («⚠») is one list per device, not per user, as on Firestore: after another account signs in, the previous account's refused writes still show in «⚠» and their «Повторить» would be sent as the new user. Decide whether to keep it or filter by uid (ticket 08 owns the «⚠» texts).
