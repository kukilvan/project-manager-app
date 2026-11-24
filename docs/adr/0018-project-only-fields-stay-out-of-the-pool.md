# Project-only fields stay out of the shared pool

Status: accepted

A catalog work can be unticked «Учитывать в цвете точки на плане» (idea 008, `planColour: false`): the plan colours the point without it. How a project runs its works is that project's business, so the box must not reach the shared pool, its inbox or the personal type library; otherwise every colleague's project, the starter set and the administrator's «Новое из проектов» would carry one project's choice. Decision: `bare()` in `src/domain/typelib.js` drops, besides the service fields, a list of project-only fields, `PROJECT_ONLY = ['planColour']`. Every pool path already copies items through `bare()` (fingerprints, inbox candidates, parts and bundles, «take from the pool», the new-project wizard, filling an empty pool), and the administrator's accept and edit now write through it too, so none of them stores, sends, hashes or compares the field. A future project-only field goes into the same list.

An absent field means the default (counted in the colour): old works, the pool and the starter set need no migration, and a work taken from the pool arrives ticked. Taking from the pool writes only what the project lacks, so it never changes an existing work's box; project writes merge into the document (`{ merge: true }`, and `{ ...old, ...data }` in the memory and on-device repos), so an older build that saves the work without the field keeps the box, and a work deleted and taken again gets its old box back. The form writes `planColour: false` when unticked and `planColour: true` when ticked on a work that had `false` (clearing needs a value), and nothing for a never-unticked work; a «Протяжка» work always counts, whatever the field holds.

Options considered: a per-work list on the project document — rejected: the catalog document is already the place of every work's settings and the repo gives it history, rollback and the backup; stripping the field at each pool path separately — rejected: seven places to forget, one future field each; keeping the field in the pool as a default for new projects — rejected: it would make colleagues' works unticked without their choice and every project's box show up in the administrator's inbox.

## Consequences

- Items without the field keep their fingerprints: nothing is re-sent to the inbox and `pz.poolSent` stays valid.
- A phone with an older build may still send the field to `pool_inbox`; reading paths strip it and the administrator's accept writes without it.
- The nightly job builds its context from the project's catalog documents, which carry the field, so it colours like the app.
- Stage 4 (PocketBase storage) must carry `planColour` on project catalog works and never in the pool.
