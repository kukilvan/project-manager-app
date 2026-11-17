# Idea 005: Translate everything left and keep it translated

Status: taken in by `.scratch/06-field-improvements/description.md`
Added: 2026-11-17

## Why

The UI was translated into English and Hebrew in 1.2 (ADR 0008). Features added since then (new drawing version, point merge, cables by label, management sheet changes, parts of the guide…) show Russian text in the English and Hebrew UI. The owner wants everything translated now, and a rule so new things never stay untranslated.

## Scenario

1. After the stage the owner switches the language to English, then Hebrew, and walks the app: no Russian left except the event log and the user's own data (reference names, notes).
2. Later, every ticket and quick fix that adds UI text adds its translation in the same session; the deploy stops if a UI string has no translation.

## Behaviour

- Measured on 2026-11-17 against the dictionaries (`scripts/i18n-extract.mjs` vs `src/i18n/src/*.json`): 284 of 2,783 Russian strings in `src/` have no entry — the guide `src/app/views/guide.js` 166, `src/app/repo.js` 16, `src/app/views/planversion.js` 16, `src/main.js` 13, `src/firebase.js` 12, `src/domain/report.js` 11, `src/domain/doh.js` 10, `src/domain/latin.js` 8 and a few in other files. Some are event-log lines (always Russian by rule) or texts that are not UI (file names, Russian-only report parts): they get an explicit «not UI» mark instead of a translation.
- The owner thinks the guide may already be translated another way: the check is done twice — by the dictionary and on screen (English and Hebrew, browser at phone width), listing what still shows Russian.
- An automated test (part of `npm test`, so the deploy stops on failure): every Russian UI string found by the extractor has an English and a Hebrew entry, or is on the «not UI» list.
- New rule in `docs/coding-standards.md` (with reason and check) and a line in the ticket and quick-fix steps of `docs/workflow.md`: every ticket and quick fix translates its own new UI strings (Russian → English, Hebrew) and runs `node scripts/i18n-build.mjs`.

## What changes in existing behaviour

- English and Hebrew UI show the missing texts in their language.
- Sessions can no longer push a UI string without translation: the test fails.

## Data and external services

- None: dictionaries in `src/i18n/src/*.json`, built by `scripts/i18n-build.mjs`.

## Edge cases

- Template strings with `${…}`: translated as templates, as the dictionary already does.
- Strings that are data, not UI (seed reference names in `src/domain/seed.js`, Hebrew report texts): on the «not UI» list or handled by their own Hebrew fields.
- Hebrew trade words: the owner's own words where they exist (`CONTEXT.md`, trade words).

## Out of scope

- English names for reference lists (types, works, cables) — user data with Russian and Hebrew only.
- The event log (always Russian).

## Decisions

- Each ticket translates its own strings + an automated check — owner.
- Translate everything left, verified by dictionary and on screen — owner.
- This idea goes last in the stage, after ideas 001–004, so their new strings are covered — owner's order.

## Owner check

Switch to English and walk: «Новая версия чертежа», «Одинаковые точки», the guide, a management sheet profile — all English; switch to Hebrew — all Hebrew, right to left.

## Tests

- The new test: no Russian UI string without English and Hebrew (or a «not UI» mark).
- Existing i18n tests stay green.

## Open questions for the stage

- The exact list of «not UI» strings (decided while translating).
