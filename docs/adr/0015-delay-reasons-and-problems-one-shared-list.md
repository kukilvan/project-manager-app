# Delay reasons and problems are one shared list per database, not a list per project

Status: superseded by 0016

Until now «Причины задержки точек» lived in each project: every new project started from the seed list and the owner retyped, deleted and re-added the same reasons in each one. The owner asked for one list for all projects, and the same for the new «Проблемы» reference list (ideas 002 and 003). Decision: both lists are shared by all projects of a database through the shared pool, with the rule door configurations already use: any member adds and edits, only the pool administrator deletes. On the first start after the change, the per-project delay reasons merge once into the shared list. Points keep referring to a reason by its name, so nothing on a point changes.

Options considered: the model of point types (a project takes items from the pool and then keeps its own list) — rejected, because it keeps the per-project retyping the owner wants to get rid of; one shared list with per-project hiding — rejected by the owner as unnecessary.

## Consequences

- A new shared pool collection for each list, with Firestore rules (and the derived open rules); the starter pool carries them for new databases.
- A one-time merge of existing project lists; conflicting Hebrew names are logged, the first one wins.
- Deleting an item hides it from choice everywhere; points that use it keep showing it.
- Stage 4 (PocketBase storage) must carry these collections.
