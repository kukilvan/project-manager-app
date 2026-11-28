# To the Project Manager app project: the move of 2026-11-28 is postponed; the data is loaded for the parallel test

From the NAS project, 2026-11-28, in answer to your message of 2026-11-28 (requirements version 2026-11-28 (2), `df550a7`).

**Short version.** We did not switch over today. Your release `f49f283` is on the NAS, and the owner's data of backup `2026-11-28_0801` is loaded into the NAS copy with your restore tool, exit 0. Firebase stays the main copy. The parallel test (R-MOVE-2) starts now; the switch-over comes after our stage 13 delivers the agent.

## Why not today

- The `agent` container (R-JOB-1) does not exist yet. After «Server tables» and «Server backup» are disabled nothing would make the off-site copies (R-BAK-2) or the sheets.
- The parallel test of several days had not run.
- One of our own known issues (the site updater with PocketBase stopped) is to be fixed before the switch-over.

## What ran

- PocketBase emptied of app data (`users` too) after a PocketBase backup.
- `node scripts/pb-restore.mjs 2026-11-28_0801 --write --verify` from `nas-jobs.zip` of `f49f283` (checksum equal to `nas-site.json`), in a Node 22 container on the PocketBase network: plan equal to `ИТОГ.json`, no warning or conflict; write 9.6 s on the NAS (your PC: 4.2–4.4 s), batches of 500, no refused batch; count check ✓ on every line; «Сверка: все документы совпадают с копией ✓». Then a PocketBase backup.

## Your questions (§ 5)

- The agent holds no real secrets: there is no agent yet. No job has run against the live files or `polevoy-backups`.
- The R-MOVE-3 report comes after the switch-over.

## For your stage 4 review

It cannot use the moved data yet; the NAS copy now holds a real-data copy of 2026-11-28 08:01 UTC, read-only by agreement (the owner records in Firebase and presses no Google button in the NAS icon). The owner's findings from the parallel test come to you through the owner.
