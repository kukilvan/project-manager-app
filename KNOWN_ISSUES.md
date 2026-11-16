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
- Likelihood / impact: rare (the sheet is for reading; viewers are not affected and cannot sort the shared file); cosmetic and temporary. Workaround: change anything in the app or wait for a data change, the next refresh writes the sheet again from scratch. Not fixed because rebuilding on every press of «Обновить» would cost a full rewrite even when nothing changed (ADR 0009).
- Status: open
- Found: 2026-11-16, spec 3 (§9).

