# To the NAS project: the final stage 4 version — when the jobs may touch the live files, and the order of the move

From the Project Manager app project (`kukilvan/project-manager-app`), 2026-11-28. Attached: `nas-requirements.md`, **version 2026-11-28 (2), commit `df550a7`**, as one whole file (use that commit for `nas-check` too). Only the document's placeholders are used.

**Short version.** Our code for the move is ready: the app, the job runner and the restore tool are in the release `nas-build`, and the move was rehearsed on a PC with a copy of the owner's data. Two things change on your side: the jobs get the real secrets only on the switch-over day, and the off-site copies start that day, not before it. Our review of stage 4 comes next and may still change something; we then send a new version.

## 1. What changed in the document

- **R-JOB-1:** the real service-account key and `polevoy-backups` only from the switch-over on. Before it, `tables` would write NAS test data into the real management sheets, rack tables and numbered drawings, and `backup` would replace the owner's Drive zip and add folders to `polevoy-backups`. A trial uses another `BACKUP_REPO` and no Google key, or a test Google project's. Also named: the fields of `state.json`, when `tables` exits 1, `FULL=1`, `DRY_RUN=1`.
- **R-BAK-2, A10:** the two off-site copies start on the switch-over day: `backup` by hand, both copies seen, before anyone records on the NAS copy. Before the switch-over A10 means the daily PocketBase backups only.
- **R-MOVE-2:** the phone instructions are `ПЕРЕЕЗД.md` in our repo (Russian). In the parallel test the app's own Google buttons on a copy of the real data write over the live files too; the owner does not press them.
- **R-MOVE-1** (since version 2026-11-28): the rehearsal, `docs/nas-move-rehearsal.md`.

## 2. What to install

- The release `nas-build` at commit `df550a7` or later (`nas-site.json` → `commit`). It holds the four fixes the rehearsal found; an older release must not take the real data. `schema` stays 2: your updater switches the site as usual.
- The agent container (R-JOB-1) from `nas-jobs.zip` of that release, still **without** the real key and the real `BACKUP_REPO`.

## 3. What to run, in order

Before the move day:

1. `node tools/nas-check.mjs https://<host>` at the commit above.
2. PocketBase backups daily (R-BAK-1); the restore drill (R-BAK-4, A11).
3. The parallel test (R-MOVE-2). `--verify` of the restore tool belongs before the first sign-in.

On the day: `docs/nas-move-rehearsal.md`, "Go / no-go", stop at the first no. In short:

1. The owner confirms that every phone has sent its changes and runs GitHub's «Server backup».
2. You empty PocketBase of app data (`users` too), then `pb-restore.mjs <newest folder>`: the plan, then `--write --verify`; then a PocketBase backup.
3. The owner signs in and checks, then the helpers (`ПЕРЕЕЗД.md`, sections 2–3).
4. The owner disables «Server tables» and «Server backup» in GitHub Actions, with no run in progress.
5. You give the agent the real secrets and run `backup` once by hand; the owner sees both copies.
6. The owner lets everyone record on the NAS copy; `tables` runs on its cron from the next night.

The way back (R-MOVE-2): every phone sends its changes and stops recording; a fresh `backup`; **your jobs off**; `server-restore.mjs <that folder> --write --force`; the owner enables the two GitHub workflows again. It writes over 17,000 documents against Firebase's free limit of 20,000 writes a day, and a cut run starts over (our KI-16), so allow more than a day or a paid day.

## 4. What the owner sends you

- A GitHub fine-grained token (contents write on `polevoy-backups` only) and a new key of the same Google service account — on the switch-over day, not before (a token and a repo for a trial may come earlier).
- «Every phone has sent», «Server backup is green», «the check passed», «the GitHub jobs are disabled»: one word each, at the points above.
- If a step fails: the output of the command.

## 5. What we ask back

- Confirm that the agent holds no real secrets today and that no job has run against the live files.
- After the move, the report of R-MOVE-3.
