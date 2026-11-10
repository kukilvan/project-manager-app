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
| KI-1 | i18n tests import a Windows path without `file://` | `tests/i18n.test.js` | open | stage 1 |
| KI-2 | open-rules test fails on CRLF checkout | `tests/domain.test.js`, `src/domain/openrules.js` | open | stage 1 |

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
- Status: open
- Found: 2026-11-10, adoption (first run on the owner's PC).

## KI-2. open-rules test fails on CRLF checkout

- Where: the test «правила открытой версии: без вшитой почты, администратор из meta/admin»; `openRules` in `src/domain/openrules.js`.
- What's wrong: with `core.autocrlf=true` the rules files are checked out with CRLF; git stores them with LF and there is no `.gitattributes`; `openRules` inserts its own lines joined with `\n`, so the generated text mixes CRLF and LF and differs from the CRLF `firestore.open.rules` (cause confirmed 2026-11-10, stage 1 description).
- How to reproduce: `npm test` on Windows with `core.autocrlf=true` → that test fails.
- Likelihood / impact: always on this PC; test-only, the deploy runs on Linux with LF.
- Status: open
- Found: 2026-11-10, adoption.
