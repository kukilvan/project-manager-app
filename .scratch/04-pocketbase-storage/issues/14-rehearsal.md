Status: in review
Complexity: medium
Blocked by: 07, 13

# 14. The rehearsal of the move

The whole move done once on the owner's PC with the owner's newest backup, before the NAS project does it for real. The result is a document for the NAS project and a list of fixes the rehearsal found.

## Spec sections

§ 7 (all), § 6 (the tool and its times), § 12 (`docs/nas-move-rehearsal.md`). Slicing notes under § 13 apply.

## What to do

1. Get the newest folder of `polevoy-backups` into the scratchpad (never into the repo, ADR 0005): with `gh` signed in as `kukilvan` (clone the private repository into the scratchpad), or ask the owner for a fresh «☰ → Данные → Резервная копия на Диск» file. Tell the owner in one line what you take.
2. `node tools/pb-dev.mjs up --empty` — a fresh local PocketBase with this repo's migrations, hooks and the NAS build in `pb_public`.
3. `pb-restore`: plan → `--write` → count check → `--verify`; time each step.
4. In the browser pane at `http://localhost:8090/` (420 px): sign in as the owner's restored user (`pb-dev` sets a local password for that e-mail; local only), and compare with the Firebase app opened with the same backup in test mode: the project list; points per project and per rack; a day's report text (Russian and Hebrew); the month report; «История изменений» (authors' names); «👥 Участники»; delay reasons, culprits, problems; problem marks on points; the management-sheet preview (no Google write).
5. `docs/nas-move-rehearsal.md` (English, for the NAS project): the commands in order, the times, the counts to expect and how to compare them (per collection, per project), what `--verify` must show, what went wrong and how it was fixed, the go / no-go list for the move day. **No names or e-mails; counts only.** A pointer to it from `docs/nas-requirements.md` R-MOVE-1 (stay inside the guard test's 34,000 bytes; the version line of the document changes with it).
6. Small fixes the rehearsal finds are made here when they are minutes of work and no design choice; anything larger is a `KNOWN_ISSUES.md` entry or goes to the owner as a decision.
7. Header comments if code changed; `node tools/code-map.mjs`; the scratchpad copy is not committed and is named to the owner for deletion when the stage is done.

## Done when

- Plan, write, count check and `--verify` pass on the owner's data with the times written down; the counts in `docs/nas-move-rehearsal.md` match the report of the tool.
- The comparison list of step 4 is done and every difference is explained or fixed; the document says so.
- The document names nothing private (grep for e-mail-like strings and project names finds none).
- `npm test`, `npm run build`, `node tools/code-map.mjs --check` pass.

## Tests to add

Only for the fixes it finds.

## Owner check

The owner reads the result of the rehearsal in the session's retelling: the times, the counts, the differences found and fixed, and the go / no-go list for the move day. Nothing on the phone.
