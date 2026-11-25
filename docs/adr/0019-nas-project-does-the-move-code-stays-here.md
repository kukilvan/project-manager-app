# The NAS project does the move; all code stays in this repo

Status: accepted (planned, stages 4–5)

Decided with the owner on 2026-11-24 («Описание 4»). Two projects work on the owner's NAS copy (ADR 0012–0014). This repo builds the app. The NAS project, a separate private repo, sets up the home NAS. The owner put the line between them so: the NAS project does the whole move, and this repo keeps developing the app.

So this repo writes every piece of code the NAS copy runs:
- the PocketBase storage in the app;
- the database description (migrations and hooks);
- the NAS build of the site, published to the GitHub release `nas-build` on every push to `main`;
- the server-job scripts for PocketBase;
- the restore tool, which loads a full server backup into PocketBase.

The NAS project installs, configures and runs it. It moves the data with the restore tool, schedules the jobs, keeps the backups and switches over. When the move is done, it reports back what is where and how to work from then on, and this repo's docs take that in. The NAS project's own tools need no app knowledge and stay its own, for example the site updater of R-SITE-2 and monitoring. The NAS document (`docs/nas-requirements.md`) is the contract between the two projects.

Considered: the NAS project also writing the app's PocketBase code. That would put two projects into one codebase, or let a copy drift from this repo, and the owner's later fixes would not reach the NAS copy. Also considered: this repo doing the move (the old plan of stage 5). The owner wants the NAS side in one place.

## Consequences

- The NAS build moves from stage 5 into stage 4, so the owner can check stage 4 on the iPhone on the real NAS. R-SITE-1 and R-SITE-2 become stage 4. ADR 0014's consequence "stage 5 builds the NAS variant" now happens in stage 4.
- Stage 4 also delivers the job scripts and the restore tool. This repo's stage 5 shrinks to taking in the NAS project's report and updating its own docs: where the owner checks after a push (ADR 0011, `docs/workflow.md`), the run commands and `ВОССТАНОВЛЕНИЕ.md`.
- Every change that needs the NAS side updates `docs/nas-requirements.md` with a new version line. The owner carries it to the NAS project.
- The database description has a version number. The NAS project installs new migrations before it switches to a site build that needs them.
