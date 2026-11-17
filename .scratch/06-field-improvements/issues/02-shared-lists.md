Status: in review
Complexity: complex
Blocked by: —

# 02. Shared delay reasons and culprits

«Причины задержки точек» and «Виновники простоя» become one list per database in the shared pool (ADR 0016): projects keep no copies, the app reads the pool, old project lists are merged into it once per project. This ticket also lays the pool plumbing that ticket 03 reuses for «Проблемы» (the `pool_problems` collection, its rules and seeding are built here; its screens in ticket 03). Idea 002 and the owner's addition (culprits too).

**Go-live order.** The owner publishes the new `firestore.rules` in the Firebase console of `polevoy-zhurnal` before this ticket's code reaches `main`. Everything is built and self-checked first; the push to `main` waits for the owner's word that the rules are published.

## Spec sections

§2 (all), §3.1 only the collection name, the document shape and the example list (the seeding of §2.4), §7 (Firestore rules, reads and writes), §8 rows «Shared item deleted while points use it», «Merge…» (3 rows), «Old rules in a colleague's database», §9 (`shared.js`, memory backend, `buildBackup`, `runImport`, rules), §10 (`KNOWN_ISSUES.md` line of this ticket). ADR 0016 is written already.

## What to do

1. `firestore.rules`: the three `pool_*` blocks of §2.7; check that `firestore.open.rules` equals `openRules(firestore.rules)`; ask the owner to publish (ticket text of the owner check).
2. Repo layer (Firestore and memory backends): `listenPool(kind, cb, { withDeleted: true })` (the default stays), `readColl(pid, coll)` and `readPool(kind)` from the server (`getDocsFromServer`, counted in `pz.reads`); the memory backend's pool `remove` marks `deleted` and its `listenPool` passes every document; `savePool` writes `deleted: false` when a name is added again. Hard deletes are gone for these kinds.
3. `src/domain/shared.js` (new, pure): `sharedView`, `choiceList`, `mergePlan` as §2.3–2.4; `buildContext` takes `shared` and builds `ctx.delayReasons` / `ctx.culprits` through `sharedView` (pass `problems` through untouched for ticket 03). `src/domain/seed.js` keeps the defaults used for seeding.
4. `src/app/shared.js` (new): the three pool listeners, the maps, the merge (per project, newest `lastWorkDate` first, from server reads, `sharedLists: 1` after the pool write succeeds), the seeding of empty pool collections (confirmed with `readPool`) written for any kind, with defaults for `pool_delayReasons` and `pool_culprits` only; the defaults of `pool_problems` (the four examples) are plugged in by ticket 03, until then that collection is left alone; the toast and event-log lines of §2.4. `store.js` rebuilds the context on change. `createProject` stops seeding the two lists.
5. Screens (§2.5): the sub lines on the reference-list rows, the shared-list banner, rows with «в этом проекте: N», the item form writing the pool, the administrator-only delete with its confirmation, «Такой пункт уже есть», re-adding a deleted name. On-device mode: the device user is the administrator. Pickers that use `choiceList`: point form, mass edit, the day-entry form.
6. `buildBackup(project, data, now, shared)`, import (`views/import.js`), `scripts/starter-from-backup.mjs` and `scripts/export-pool.mjs` with the new kinds, the nightly job (`scripts/server-tables.mjs`: read the two pools once per run, pass `shared` to `buildContext`, `changedSince` looks at the two top-level collections) as §2.6.
7. Strings of §2.9 and the guide line of §2.8; `node scripts/i18n-build.mjs`.
8. `KNOWN_ISSUES.md`: a conflicting Hebrew name merged on two devices at once keeps the last write (§10).
9. Header comments; `node tools/code-map.mjs`.

## Done when

- In `?mem=1` with a project that has its own lists: the merge fills the pool, marks the project `sharedLists: 1`, and a second project sees the first's items; a deleted item is not offered and not revived from an old list; points and entries that use it keep the name and its Hebrew.
- The screens read as §2.5; a new project does not get copies; the backup holds the pool lists; the import adds only absent items.
- With a failed pool write the project stays unmarked and the toast shows once per start.
- `firestore.rules` has the three blocks; `npm test`, `npm run build`, `node tools/code-map.mjs --check` pass.
- Pushed to `main` only after the owner says the rules are published.

## Tests to add

Spec §9: `sharedView` (pool over legacy, deleted kept for lookup), `choiceList` (legacy-only before the merge, never an administrator-deleted id), `mergePlan` (absent added, empty Hebrew filled, conflict listed, deleted skipped, deleted project items ignored, a second project sees the first's ops); memory backend (`remove` marks deleted, `readColl`, `readPool`); `buildBackup` with shared lists; `runImport` sends missing shared items to the pool only (fake repo); the rules test for the three blocks and for `firestore.open.rules`; `server-tables` with the `shared` argument builds the Hebrew name of a pool-only reason (fake data).

## Owner check

Before anything: **publish the rules** — Firebase console → project `polevoy-zhurnal` → Firestore Database → Rules → paste the new `firestore.rules` (the agent gives the exact steps in the reply) → Publish. Tell the agent «правила опубликованы»; only then the code goes live.

Then, on the phone:
1. Open the app (it updates itself). Wait a few seconds on the project list: the old reasons and culprits of every project are merged into the shared lists (no visible action).
2. Ещё → «Выпадающие списки» → «Причины задержки точек»: the banner «🔗 Общий список…», every row with its Hebrew and «в этом проекте: N».
3. Add a reason «Тест общий» in project A; open project B: the same reason is in the list and in the point form.
4. Delete it (you are the administrator): it is gone from the pickers; a point that already had it still shows it.
5. Same for «Виновники простоя».
6. A reason you know existed only in one old project is now in all projects.
Wrong looks like: a reason that came back after deletion, a Hebrew name replaced, a toast «Общий список не записался» (rules not published).
