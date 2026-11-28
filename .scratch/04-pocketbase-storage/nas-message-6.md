# To the NAS project: the final stage 4 version — when the jobs may touch the live files, and the order of the move

From the Project Manager app project (`kukilvan/project-manager-app`), 2026-11-28. Attached: `nas-requirements.md`, **version 2026-11-28 (2), commit `df550a7`**, as one whole file (use that commit for `nas-check` too), and the phone instructions `ПЕРЕЕЗД.md` (Russian). Only the document's placeholders are used.

**Short version.** Our code for the move is ready: the app, the job runner and the restore tool are in the release `nas-build`, and the move was rehearsed on a PC with a copy of the owner's data. Two things change on your side: the jobs get the real secrets only on the switch-over day, and the off-site copies start that day, not before it.

## 0. Today, 2026-11-28: the move day — where the owner stands

Added the morning of the move, before this message was sent.

- **The owner moves today**, before our stage 4 review. The review runs after the move: it checks the stage on the real NAS copy with the real data and takes in your R-MOVE-3 report. A fix it brings comes as a normal release (`schema` 2, your updater installs it); a change of this document comes with a new version line.
- **The release for the move:** `nas-site.json` names commit `f49f283` (later than `df550a7`; only documents changed after it).
- **Users: the owner is the only one.** There are no helpers yet. Only the owner signs in on the NAS copy. The backup's other member e-mails (the owner's second, test address among them) are restored as they are and need no check; do not delete restored records by hand (the count check expects them). Every helper step of `ПЕРЕЕЗД.md` (sections 1–3 for helpers, «every phone has sent») is the owner's phone only.
- **Done by the owner:** `ПЕРЕЕЗД.md` section 1, items 1–6 (nothing unsent, drawings and manuals sent to Drive, no trial icon on the phone); § 7.1 (no Google buttons pressed on the trial icon; the old connection link saved); § 7.2 steps 1–2.
- **The fresh Firebase backup:** «Server backup», run by hand on 2026-11-28 at 08:00 UTC (10:00 in Israel, right after the read-quota reset), green. Folder **`2026-11-28_0801`** in `polevoy-backups`: 2 projects copied, 16,132 documents read; the same folder zipped (1,924 KB) is the Drive file «Автокопия данных (обновляется каждые 2 дня).zip». Compare the restore plan with `ИТОГ.json` of that folder. How the folder reaches the NAS is your choice: a clone of `polevoy-backups` with the fine-grained token (today is the switch-over day, so the owner may create it now) or that Drive zip.
- **Not run by hand, and not needed:** «Server tables» only writes the management sheets from Firebase (its night run of 07:09 UTC today failed on the used-up Firestore read quota, our KI-14; harmless); «Export starter pool» reads `polevoy-backups`, not Firebase, and stays in GitHub Actions. The owner disables «Server tables» and «Server backup» at step 4 below; the next scheduled «Server backup» would run on 2026-11-29 at 08:30 UTC.
- From now until the owner's «можно работать» nobody records anything, in either icon.
- **How we work today:** you lead the owner one step at a time — one step per message, with where to do it and what the right result looks like — and wait for the owner's «получилось» or the output before the next. Stop at the first no of the go / no-go list. The owner is not a programmer: plain Russian, one command per block.

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
3. The owner signs in and checks (`ПЕРЕЕЗД.md`, sections 2–3); there are no helpers today.
4. The owner disables «Server tables» and «Server backup» in GitHub Actions, with no run in progress.
5. You give the agent the real secrets and run `backup` once by hand; the owner sees both copies.
6. The owner lets everyone record on the NAS copy; `tables` runs on its cron from the next night.

The way back (R-MOVE-2): every phone sends its changes and stops recording; a fresh `backup`; **your jobs off**; `server-restore.mjs <that folder> --write --force`; the owner enables the two GitHub workflows again. It writes over 17,000 documents against Firebase's free limit of 20,000 writes a day, and a cut run starts over (our KI-16), so allow more than a day or a paid day.

## 4. What the owner sends you

- A GitHub fine-grained token (contents write on `polevoy-backups` only) and a new key of the same Google service account — on the switch-over day, not before (a token and a repo for a trial may come earlier).
- «Every phone has sent», «Server backup is green», «the check passed», «the GitHub jobs are disabled»: one word each, at the points above. The first two are done (section 0).
- If a step fails: the output of the command.

## 5. What we ask back

- Confirm that the agent holds no real secrets today and that no job has run against the live files.
- After the move, the report of R-MOVE-3.
