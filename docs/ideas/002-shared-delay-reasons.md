# Idea 002: One shared list of delay reasons for all projects

Status: planned — stage 6, taken in by its description
Added: 2026-11-17

## Why

«Причины задержки точек» (Ещё → Справочники) are kept per project: in every new project the owner retypes the same reasons, deletes the starter ones they don't use and adds the same new ones again. They want one list for all projects.

## Scenario

1. The owner opens Ещё → Справочники → «Причины задержки точек» in any project.
2. Sees the shared list — the same in every project of the database.
3. Adds or edits a reason (Russian and Hebrew) — it appears at once in all projects.
4. Deletes a reason they no longer need (pool administrator only) — it disappears from the list everywhere; points that already have it keep showing it.

## Behaviour

- The screen keeps its look (name Russian, name Hebrew, usage count in this project).
- Any member adds and edits; only the pool administrator deletes (the same rule as door configurations, `src/app/doorpool.js`). A member without delete rights sees no «Удалить».
- A short hint on the screen: «Общий список для всех проектов этой базы».
- On-device mode: the same behaviour inside the device's database.

## What changes in existing behaviour

- Delay reasons stop being a per-project list.
- On the first start after the update, the reasons of all the user's projects merge into the shared list once (by Russian name; the Hebrew of the first project that has one wins, conflicts listed in the event log). Points keep their reason (they refer to it by name).
- The management sheet column «Причина задержки» and the Excel export keep working.
- The starter pool (`src/data/starter-pool.json`, weekly bot) carries the shared delay reasons for new databases.

## Data and external services

- A shared pool collection for delay reasons (name chosen in the spec, e.g. `pool_delayReasons`); Firestore rules for it (members read and write, admin deletes); the open-rules derivation and its test follow.
- Whether projects keep a copy (like door configurations) is the spec's choice; the owner sees one list either way.
- Stage 4 (PocketBase) must carry the new collection: noted for its spec.
- ADR 0015.

## Edge cases

- The same reason in two projects with different Hebrew: one wins, the rest go to the event log.
- A reason deleted from the pool but still on points: the point card and the sheet show its name; it can't be chosen again.
- Offline: adding works offline and syncs later; two members adding the same name offline end up with one item (the id is the name).
- A colleague's own Firebase database has its own shared list.

## Out of scope

- Hiding a shared reason in one project only (the owner chose one list).
- Culprits («Виновники простоя») and units stay per project unless the description adds them.

## Decisions

- One list for all projects of a database, like door configurations; only the administrator deletes; old lists merge once — owner.
- The same mechanism serves the problems reference list (idea 003) — agent: one way of sharing for both lists.

## Owner check

Add a reason «Нет потолка» in project A; open project B — it is there. Delete a starter reason they never use — it disappears in both projects. Old points with a reason still show it on the card and in the management sheet.

## Tests

- The merge of per-project lists into the shared one (pure function in `src/domain`): duplicates, different Hebrew, deleted items.
- Firestore rules test for the new collection (member writes, non-admin cannot delete), through the existing rules tests.

## Open questions for the stage

- Should culprits («Виновники простоя») also become shared? Ask the owner in the description.
