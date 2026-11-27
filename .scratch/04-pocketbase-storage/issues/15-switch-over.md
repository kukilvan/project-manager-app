Status: accepted
Complexity: simple
Blocked by: 14

# 15. Switch-over instructions and the NAS document's final stage 4 version

The phone instructions for the day of the move, the guide paragraph for the NAS copy, and the final stage 4 version of the NAS document with a message to the NAS project.

## Spec sections

§ 8 (all), § 9 (the document's version), § 3.7 (the guide section, translated in ticket 08), Texts (the guide row). Slicing notes under § 13 apply.

## What to do

1. `ПЕРЕЕЗД.md` in the repo root (Russian, plain words, `docs/workflow.md` "Instructions for the owner"), with the five parts of § 8: before the move day (every phone: open the old icon with internet, wait until «⬆» is gone, record nothing more until the owner says); after the NAS project switches over (open `https://<host>` in Safari, «Поделиться» → «На экран «Домой»», open the new icon, «Войти через Google» with the same account); the check (the owner, then each helper: the projects listed; the number of points of each project as on the old icon; today's or the last report text; the last entries of «🕘 Откат записей»; «👥 Участники»; the shared lists; what "wrong" looks like — a project missing, fewer points, «⚠», a red «⬇ ошибка» — and to send a screenshot); the old icon (delete it only after the check and when the owner says; until then do not record anything in it); if something is wrong (stop recording in the new icon, tell the owner; the NAS project brings the data back to Firebase). Each technical word explained once.
2. The guide paragraph of the section «Домашний сервер» (ticket 08 translated it): re-read it against what the rehearsal showed and adjust the wording in all three languages if needed.
3. `docs/nas-requirements.md`: the final stage 4 version (version line and the stage 4 parts that the tickets changed: names of the release files, the runner, the restore tool, the rehearsal pointer; budget 34,000 bytes), and `.scratch/04-pocketbase-storage/nas-message-3.md` — a short message for the NAS project (what changed, what to install, what to run, in which order, what the owner sends them). The owner forwards both after «Коммит».
4. `README.md` gets a pointer to `ПЕРЕЕЗД.md` only if it lists the other Russian docs (`ВОССТАНОВЛЕНИЕ.md` is the model).

## Done when

- `ПЕРЕЕЗД.md` reads as a numbered list a helper can follow with no other document; every command or button is spelled as it appears on screen.
- The guide paragraph reads the same in three languages; the coverage test passes.
- The NAS document's guard test passes (budget, host list, check count); its version line equals the one named in the message.
- `npm test`, `npm run build`, `node tools/code-map.mjs --check` pass.

## Tests to add

None beyond the guard tests that already cover the NAS document and the translations.

## Owner check

The owner reads `ПЕРЕЕЗД.md` through once, as if they were a helper: is every step clear, is anything missing for their own phone and the helpers' phones; and reads the message for the NAS project.

## Notes from ticket 12

- KI-15: the NAS document and the message must say that the jobs run with the real data, the Google key and `polevoy-backups` only from the switch-over on; before it, a trial uses a separate `BACKUP_REPO` and a test project.
- R-JOB-1: `state.json` is `{backup, tables}`, each `{ok, at, error, okAt}` (`okAt` — the last success); `tables` exits 1 when any table or drawing failed; the runner takes `FULL=1` and `DRY_RUN=1`.
