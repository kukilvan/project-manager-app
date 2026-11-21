# Known issues

Bugs decided not to fix now, and rare cases where the app can go wrong (source data, races, network failures, unusual settings) — whoever found them: review, check, tests or the owner.

- Recorded in the same session it was found, never only in chat.
- IDs `KI-<n>` go in order and are never reused.
- Fixed: the entry stays, its status becomes `fixed (test: …)`, and the index row changes too.
- Each stage description pulls in the open entries that fit its stage.
- Before final polishing, every open entry gets a test.
- Sessions read the index; a full entry is found by its `## KI-<n>` heading.

## Index

| ID | Title | Where | Status | Fix in |
|---|---|---|---|---|
| KI-1 | i18n tests import a Windows path without `file://` | `tests/i18n.test.js` | fixed | stage 1, ticket 1.1 |
| KI-2 | open-rules test fails on CRLF checkout | `tests/domain.test.js`, `src/domain/openrules.js` | fixed | stage 1, ticket 1.1 |
| KI-3 | two same-code runs at once break each other | `tools/same-code.mjs`, `checkSite` | open | — |
| KI-4 | an editor's sort of the points sheet scatters section and empty rows | management sheet (Google Sheets), `src/domain/report.js` | open | — |
| KI-5 | a working day and a day off on one date after offline edits on two devices | `src/app/views/doh.js` (day form checks), `src/domain/month.js` | open | — |
| KI-6 | a conflicting Hebrew name merged into a shared list on two devices at once keeps the last write | `src/app/shared.js` (merge), `src/domain/shared.js` (`mergePlan`) | open | — |
| KI-7 | the translation coverage test sees string literals, not sentences built from parts (the half «catalog names show Russian in English» is fixed) | `tests/i18n-coverage.test.js` | open (catalog names fixed) | stage 7, ticket 7.7 (catalog names) |
| KI-8 | a database with rules older than stage 6 cannot read the shared lists: no merge, no seeding, no «rules out of date» toast, empty lists in a new project | `src/app/shared.js`, `listenPool` in `src/app/repo.js`, `firestore.rules` | open | — |

## Entries

Entry format:

```text
## KI-<n>. <title>

- Where: file and function.
- What's wrong: one or two sentences.
- How to reproduce: concrete input or state, and what comes out.
- Likelihood / impact:
- Status: open | fixed (test: …)
- Found: date, by what (review, check, owner).
```

## KI-1. i18n tests import a Windows path without `file://`

- Where: `tests/i18n.test.js`, the helper that writes a temp module and calls `import(file)`.
- What's wrong: `import()` gets a plain absolute path; on Windows Node needs a `file://` URL (`pathToFileURL`).
- How to reproduce: `npm test` on Windows → «i18n: английский» and «i18n: иврит» fail with `ERR_UNSUPPORTED_ESM_URL_SCHEME`, protocol `c:`.
- Likelihood / impact: always on Windows; test-only, the app and the Linux deploy are unaffected.
- Status: fixed (test: «i18n: английский», «i18n: иврит» pass on Windows) — 2026-11-10, ticket 1.1: the test imports `pathToFileURL(file).href`.
- Found: 2026-11-10, adoption (first run on the owner's PC).

## KI-2. open-rules test fails on CRLF checkout

- Where: the test «правила открытой версии: без вшитой почты, администратор из meta/admin»; `openRules` in `src/domain/openrules.js`.
- What's wrong: with `core.autocrlf=true` the rules files are checked out with CRLF; git stores them with LF and there is no `.gitattributes`; `openRules` inserts its own lines joined with `\n`, so the generated text mixes CRLF and LF and differs from the CRLF `firestore.open.rules` (cause confirmed 2026-11-10, stage 1 description).
- How to reproduce: `npm test` on Windows with `core.autocrlf=true` → that test fails.
- Likelihood / impact: always on this PC; test-only, the deploy runs on Linux with LF.
- Status: fixed (test: «правила открытой версии: без вшитой почты, администратор из meta/admin» passes on Windows) — 2026-11-10, ticket 1.1: `.gitattributes` keeps both rules files LF on every checkout.
- Found: 2026-11-10, adoption.

## KI-3. Two same-code runs at once break each other

- Where: `tools/same-code.mjs`, `checkSite` and `cleanUp`.
- What's wrong: check 2 always uses the same temp folder (`<OS temp>/pm-same-code`) and first removes what is there, so that a crashed run leaves nothing behind (spec 01-code-docs, section 11). A second run started while the first is building removes the first run's worktree and outputs.
- How to reproduce: two sessions (e.g. two worktrees) run `node tools/same-code.mjs` within the same minute → one of them fails with exit 2 (build or git error) or reports missing files.
- Likelihood / impact: rare (sessions run one step at a time; a quick fix runs the tool only for a comment-only change); the run fails or gives a wrong report — run it again alone. Fix when it happens: a per-run temp folder (`mkdtemp`) plus removal of stale `pm-same-code-*` folders older than an hour.
- Status: open
- Found: 2026-11-15, «Ревью 1» (standards pass).

## KI-4. An editor's sort of the points sheet scatters section and empty rows

- Where: the points sheet of a management file; sections come from `sectionRows` in `src/domain/report.js`.
- What's wrong: when someone with edit access sorts the sheet (Data → Sort range), the section heading rows and the empty rows between sections move with the points and end up scattered, until the next rebuild.
- How to reproduce: open the management sheet with edit rights, select the points, sort by any column → section rows are mixed into the points.
- Likelihood / impact: rare (the sheet is for reading; a viewer's sort or filter is temporary and only theirs, so other people do not see it); cosmetic and temporary. Workaround: change anything in the app or wait for a data change, the next refresh writes the sheet again from scratch. Not fixed because rebuilding on every press of «Обновить» would cost a full rewrite even when nothing changed (ADR 0009).
- Status: open
- Found: 2026-11-16, spec 3 (§9).

## KI-5. A working day and a day off on one date after offline edits on two devices

- Where: the day form checks in `src/app/views/doh.js` (`dayConflict` in `src/domain/dayoff.js`), `workdaysReport` in `src/domain/month.js`.
- What's wrong: the clash check between a working day of one project and a day off of another reads the days the device already has. When two devices edit offline (project A: a working day on a date; project B: a day off on the same date) and then sync, both days exist and nothing stops them.
- How to reproduce: device 1 offline — project A, a working day for 05.11; device 2 offline — project B, a day off for 05.11; both go online. «Месяц» shows both blocks; the working day counts, the day off is also listed and counted in «выходных».
- Why not fixed now: the clash is only visible after sync; a fix would need a server rule or a repair pass. The month report stays readable and the working day is counted, so the employer's figures are right. The owner can turn the day off back into a working day or delete it.

## KI-6. A conflicting Hebrew name merged into a shared list on two devices at once keeps the last write

- Where: the one-time merge of the old project lists into `pool_delayReasons` / `pool_culprits` — `src/app/shared.js` (the run) and `mergePlan` in `src/domain/shared.js`.
- What's wrong: each device plans the merge from its own server read. When two devices merge at the same time, both see a pool item with empty Hebrew (or an absent item) and both write their project's Hebrew for the same name; the write that reaches the server last wins. The other Hebrew is not listed as a conflict in either event log.
- How to reproduce: two projects with the same reason and different Hebrew, neither merged; two devices of different members open the app at the same moment, each on a project of its own.
- Why not fixed now: it needs a transaction per item, and it happens only during the one-time merge. Nothing is lost: the old project lists still hold both names, and the Hebrew can be fixed in «Выпадающие списки» by hand.

## KI-7. The translation coverage test sees string literals, not sentences built from parts

- Where: `tests/i18n-coverage.test.js` (through `scripts/i18n-extract.mjs`); the catalogs `src/domain/seed.js`, `src/domain/problems.js`, the colour names in `src/domain/rack.js`.
- What's wrong: the test checks every Russian literal, so a sentence assembled at run time from pieces (`` `${label} ×${n}` ``, `` `${action}: ${name}` ``) passes while the screen can show a mix of Russian and the other language. Found on screen at ticket 6.7: a trailing « ×3» (fixed in `tr()`), the history rows «создал: Точка …» in Hebrew (fixed with `tr()` per part). Names that are data of a catalog (the example problems, the colour names) had a Hebrew name of their own but no English one, so the English UI showed them in Russian («default (зелёный)», the groups «Замок», «Доступ») — fixed, see Status.
- How to reproduce: any new sentence built with `+` or a template of translated parts without `tr()` on each part. (An own catalog item without `nameEn` shows its Russian name in English by design, spec 7 § 5.2.)
- Likelihood / impact: every new UI line built from parts; a few Russian words in a translated screen, nothing breaks.
- Status: open (catalog names fixed — test: «every built-in name reads in English with no Cyrillic letters» in `tests/catalog-en.test.js`; 2026-11-21, stage 7 ticket 7.7: example problems and colour names translated, own English names `nameEn`, review 7). The sentences-built-from-parts half stays open.
- Found: 2026-11-19, screen check of ticket 6.7.

## KI-8. A database with rules older than stage 6 cannot read the shared lists

- Where: `src/app/shared.js` (merge, seeding, the toast «Общий список не записался: правила базы устарели…»), `listenPool` / `deltaListen` in `src/app/repo.js`; the rules come from `firestore.rules` (`firestore.open.rules` for the open edition).
- What's wrong: the rules have no catch-all read rule, so in a database whose rules were pasted before ticket 6.2 the listeners of `pool_delayReasons`, `pool_culprits` and `pool_problems` fail with `permission-denied`. `startShared` then never sees the three lists loaded, so it neither merges the old project lists nor seeds the defaults, and the «rules out of date» toast of spec § 2.4 never shows (it is tied to a rejected write, and nothing is written). A project created there gets no delay reasons and culprits (`createProject` no longer copies them); old projects keep offering their own lists. What the person sees is the red «⬇ ошибка» badge; tapping it names the three pool collections with `permission-denied`.
- How to reproduce: a colleague's own database with the rules of 2026-11-17 or older; open the app after ticket 6.2; create a project; open «Причины задержки точек».
- Likelihood / impact: only a colleague with their own database who has not pasted the new rules; the owner's database has them since 2026-11-18. Empty pickers in new projects until «Подключение к базе» → «📋 Скопировать правила» is done in that database's Firebase console.
- Why not fixed now: the fix (an error callback from `listenPool` that shows the same toast on `permission-denied`) changes the sync core and cannot be checked in `?mem=1`; it is rare and has a plain remedy.
- Status: open
- Found: 2026-11-19, review 6.
