# Delay reasons, culprits and problems are one shared list per database, read directly from the pool

Status: accepted (planned, stage 6)

Replaces ADR 0015, which covered delay reasons and problems only; the owner added culprits («Виновники простоя») in «Описание 6».

Until stage 6, «Причины задержки точек» and «Виновники простоя» lived in each project: every new project started from the seed list, and the owner retyped, deleted and re-added the same items in each one. The owner asked for one list for all projects, and the same for the new «Проблемы» reference list. Decision: the three lists are shared pool collections — `pool_delayReasons`, `pool_culprits`, `pool_problems` — with the rule door configurations already use: any member adds and edits, only the pool administrator deletes, and deletion is a `deleted` mark. Projects keep no copies; the app reads the pool directly. The old per-project collections stay untouched and read-only: they are the source of a one-time merge (per project, by the first member's app that sees the project, from server reads, marked `sharedLists: 1` on the project) and a fallback for showing a name that is not in the pool. Points and day entries keep referring by the Russian name, so nothing on them changes.

Options considered: copies in each project, as door configurations have — rejected: the owner wants one list, and copies bring back per-project drift and a sync step; the model of point types (a project takes items from the pool and keeps its own list) — rejected for the same reason; one shared list with per-project hiding — rejected by the owner as unnecessary; one merge for the whole database by the first user — rejected, because a user can read only the projects they are a member of.

## Consequences

- Three new pool collections with Firestore rules (and the derived open rules); the owner publishes the new rules before the code goes live, colleagues with their own database paste the fresh rules from «Подключение к базе».
- The memory backend marks pool deletions too, so a deleted item never returns from an old project list.
- Empty pool lists are seeded once from the code defaults (and from the starter pool for new databases).
- The nightly job reads the shared lists it needs for the management sheets.
- Stage 4 (PocketBase storage) must carry these collections.
