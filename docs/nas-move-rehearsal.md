# Rehearsal of the move

For the NAS project: the data move of R-MOVE-1 done once on a PC with a copy of the owner's data, so that the move day holds no surprise. Requirements: `docs/nas-requirements.md`. No names or e-mails here, counts only.

Run on 2026-11-28 with the newest full Firebase backup (folder of 2026-11-27 18:20 UTC, 2 projects, 20.9 MB): PocketBase 0.42.3 on Windows 11, Node 24, this repo's migrations, hooks and NAS build.

## Result

The restore passes: plan, write, count check and `--verify` with no warning, no conflict and no difference. The app on the restored data shows what the same backup shows in the old app. The rehearsal found four faults of the app on the NAS copy; all are fixed, and **the move needs a release that holds the fixes** (go / no-go, line 1).

## Commands, in order

All in the agent container, from the unpacked `nas-jobs.zip` of the release the NAS runs (no npm install). The password stays in a file and is never printed.

1. A fresh Firebase backup: the owner runs GitHub → Actions → «Server backup» by hand after every phone has sent its changes. Take the newest folder of `polevoy-backups`.
2. Empty PocketBase of app data (below).
3. The plan, which needs no server:
   `node scripts/pb-restore.mjs <folder>`
4. Write and check:
   `PB_URL=http://pocketbase:8090 PB_SUPERUSER_EMAIL=<superuser> PB_SUPERUSER_PASSWORD_FILE=<file> node scripts/pb-restore.mjs <folder> --write --verify`
5. Interrupted (network, restart): the same command with `--write --resume --verify`, the same folder. It adds what is missing and never updates a record that exists.
6. `--verify` belongs **before the first sign-in**. Then make a PocketBase backup in the dashboard.

**Empty** means no record in `users`, `projects`, `records`, `history`, `invites`, `pool`, `inbox`, `allowed`, `admin`, `prefs` (the NAS has held trial data since 2026-11-27). The tool refuses only a server with projects: a leftover of `pool`, `inbox`, `allowed` or `prefs` with the same key is skipped and the trial version stays. A trial user left in `users` keeps its id, so a phone keeps its old local copy and sends its unsent trial changes into the restored data. Either delete the records (deleting a project takes its records, history and invitations with it), or start a fresh `pb_data` and set R-PB-5, R-PB-6, R-PB-9, R-AUTH-1, R-AUTH-2, the superusers and the backup schedule again.

Needed settings: batch API on (R-PB-5). The rate limits of R-PB-6 were on in one rehearsal run: no 429.

## Times on the PC

| Step | Time |
|---|---|
| Plan | 0.2 s |
| Write: 17,151 records in superuser batches of 500 | 4.2–4.4 s |
| Count check | 0.2–0.3 s |
| `--verify` | 0.8–1.0 s |
| Whole run | 5.6–5.9 s |
| `--resume --verify` on a complete server | 2.3 s |
| PocketBase export of the restored data (the nightly backup's read, 21 MB) | 0.9 s |
| Restore of that export into a second empty server, with `--verify` | 5.6 s |
| The app's first full read after sign-in (22 requests, ≈ 2.9 MB; history is read on demand) | ≈ 0.5 s |

The NAS is slower: allow minutes. A batch has 10 s (R-PB-5) and took ≈ 0.1 s here; a batch that is refused saves nothing of itself, and `--resume` goes on. If batches time out, `PM_RESTORE_BATCH=100` sends smaller ones. The data folder after the restore: `data.db` 24 MB and a write-ahead log of 5 MB.

## Counts, and how to compare them

The numbers grow with every working day: on the move day compare the tool's plan with `ИТОГ.json` of the same folder (per project, "records" is the sum of every count except `history`), and the server with the plan (the tool's table, ✓ on every line).

| Target | Rehearsal |
|---|---|
| users (one per member e-mail) | 3 |
| projects | 2 |
| records | 4,977 |
| history | 11,936 |
| invites | 0 |
| pool | 149 |
| inbox | 78 |
| allowed | 3 |
| admin | 1 |
| prefs | 2 |

| Project collection | Project 1 | Project 2 |
|---|---|---|
| points | 1,292 | 393 |
| journal | 337 | 2,370 |
| entries | 113 | 106 |
| days | 16 | 20 |
| catalog | 59 | 60 |
| types | 22 | 28 |
| devices | 18 | 18 |
| configs | 4 | 16 |
| todos | 2 | 19 |
| delayReasons | 9 | 12 |
| pulls | 11 | 1 |
| culprits | 7 | 7 |
| notes | — | 7 |
| units | 5 | 5 |
| problemMarks | 5 | 5 |
| cables | 3 | 4 |
| cabinetSettings | — | 3 |
| **records** | **1,903** | **3,074** |
| history | 5,841 | 6,095 |

These counts include deleted records (the app keeps them for a year). On the screens: 742 and 297 points, 14 and 7 days.

## What the tool must show

- `План восстановления:` with the table above; `Администратор:` the owner's account; no line beginning `Предупреждение:` or `Конфликт:`.
- `Проверка количества:` ✓ on every line.
- `Сверка: все документы совпадают с копией ✓`, then `Готово`, exit code 0.
- Anything else (`✗`, `Есть различия`, `пакет не записан`, exit 1) is a no-go until explained.

After a sign-in `--verify` reports differences in `pool_inbox`, and that is right: a new device of the administrator sends the current project's candidates for the shared pool again (35 of 78 here: same keys, same decisions, a new time). Nothing else changed on the server at the first sign-in.

## The app compared with the old one

The app on the restored server (the owner's restored user, a local password set by `node tools/pb-dev.mjs password <e-mail>`) against the old app in test mode with the same backup loaded.

- **Calculations**, 106 comparisons over both projects: documents of every collection and the history; points per rack, every point's status, readiness, «Что осталось», problem marks, port labels; every day's report and every month report in Russian and Hebrew, downtime by culprit, the list of working days; every management-sheet profile as a preview (nothing written to Google); history authors and order. Equal, except a `deleted: false` field on four shared lists that the rehearsal's own test-mode loader added.
- **Screen texts**: all projects, the project tab, points, to-dos, every day, month, journal, «Откат записей», members, settings, every reference list (delay reasons, culprits, problems among them), the rack plan and the sheets. Equal, except: the Firestore read counter (not shown on the NAS copy), the card «Как подключить коллегу» (NAS copy only), «1 новых» in the work catalog's pool button (in the backup; the test mode does not read the inbox), and the order of history entries of the same moment (the test mode differs from Firestore here; the NAS copy now orders them as Firestore does).

Not covered by the rehearsal: the NAS hardware and the tunnel, Google sign-in linking to restored users (tested only with a stand-in provider), the iPhone, Drive and Sheets, the way back into a real Firebase.

## What went wrong, and the fixes

| Found | Effect | Fix |
|---|---|---|
| A new device's empty local copy looked like an empty database to the starter set | The administrator's first sign-in overwrote 135 items of the shared pool and shared lists with the starter set | The server is asked before the starter set is written |
| The local copy's server version (`_pb`) was part of what screens read | Every project item differed from the pool: 93 inbox entries rewritten or added, the field stored inside them | Listeners give documents without it |
| Documents came in the order they arrived | Rows sorted as equal (journal, history of one moment) stood differently from the old app | Document id order, as Firestore |
| The tour offer was shown before the user's settings were read | «Хотите пройти обучение?» on a new device after «Не напоминать» | Asked again before showing |

## Go / no-go for the move day

Before the day, every line yes:

1. `nas-site.json` names the commit that added this file, or a later one, and the NAS runs it.
2. `nas-check` passes; Google sign-in works from the installed iPhone icon (A14).
3. PocketBase backups appear daily (R-BAK-1); the restore drill is done (A11).
4. `nas-jobs.mjs tables` and `backup` have **not** run with the owner's real data against the live Google files or `polevoy-backups` (KI-15 in `KNOWN_ISSUES.md`): until the switch-over use no Google key and a separate `BACKUP_REPO`. How A10 holds before the switch-over without touching the live files is settled in the final stage 4 version of the NAS document.
5. The way back is understood: Firebase stays untouched; `server-restore.mjs` loads a NAS export with `--force`. Today that is 17,148 writes, close to the free plan's 20,000 a day, and a cut run starts over (KI-16).

On the day, stop at the first no:

1. Every phone: the old app shows no «⬆»; nobody records anything more.
2. «Server backup» succeeded after that; its folder is the newest.
3. PocketBase is empty of app data; trial NAS icons are removed from the phones.
4. The plan matches `ИТОГ.json`; no warning, no conflict.
5. `--write --verify` exits 0; a PocketBase backup is made.
6. The owner signs in: no toast «Загружен стартовый набор», no «⚠»; projects, points per rack, the last report, «Откат записей», members and shared lists as on the old icon. Then the helpers.
7. «Server tables» and «Server backup» of GitHub Actions are disabled before the NAS jobs run with the real key.

A no before step 6 changes nothing for the phones: they go on with Firebase.
