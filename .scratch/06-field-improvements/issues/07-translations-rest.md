Status: in review
Complexity: medium
Blocked by: 06

# 07. Translations 2: the rest and the coverage test

Every other Russian UI string gets English and Hebrew; strings that are not UI go to `src/i18n/not-ui.json`; a test fails when a UI string is untranslated, so the deploy stops. The coding standard and the workflow get the rule. Idea 005, second half.

## Spec sections

§5.1–5.4, §8 rows «Template strings in the coverage test», «A Russian string that is only data», §9 (`tests/i18n-coverage.test.js`).

## What to do

1. `scripts/i18n-extract.mjs` exports its collector (the CLI stays); it skips string literals that are arguments of `info(`, `warn(`, `error(` of `src/log.js` and of `console.*`.
2. Translate every uncovered string the extractor finds (English and Hebrew, `src/i18n/src/*.json`; trade words from `CONTEXT.md`, reuse existing words), `node scripts/i18n-build.mjs`.
3. `src/i18n/not-ui.json`: `{ "<Russian text as the extractor prints it>": "<why>" }` for report texts sent to the employer, stored identifiers (work types, status keys, seed names in `src/domain/seed.js`), file and folder names on Drive, the Russian sheet captions of `report.js`. Each entry has a reason.
4. `tests/i18n-coverage.test.js` (§5.3): every extracted string not skipped and not in `not-ui.json` is covered in both `en.json` and `he.json` — exact key after trimming, or a pattern key that `tr()` would apply with each `{}` replaced by `0`; lists up to 30 uncovered strings with files; fails on a `not-ui.json` entry no longer in `src/`.
5. Screen check as in ticket 06 for the screens outside the guide, English then Hebrew, 420 px.
6. `docs/coding-standards.md`: the rule «Every UI string has English and Hebrew» (rule, why, checked-by); `docs/workflow.md`: the Ticket paragraph and the quick-fix list get «new UI strings translated into English and Hebrew in the same session (`docs/coding-standards.md`, rule N)».
7. Header comments; `node tools/code-map.mjs`.

## Done when

- `npm test` includes the coverage test and it passes; removing an English entry makes it fail with the string and file listed.
- Walking the app in English and in Hebrew shows no Russian on any screen except data (report texts, stored values).
- The coding standard and the workflow carry the rule.
- `npm run build`, `node tools/code-map.mjs --check` pass.

## Tests to add

`tests/i18n-coverage.test.js` as above, with a small fixture test for the pattern matching (`{}` → `0`) and for the stale `not-ui.json` entry.

## Owner check

On the phone, after the site updates:
1. Switch to English and open every tab and the main screens (project, points, plan, reports, month, more, settings, lists): no Russian text, except what you typed and the Russian report texts.
2. The same in Hebrew.
3. Send the agent any string still in Russian or a Hebrew phrase that sounds wrong — a quick fix.
Wrong looks like: a Russian button, toast or heading in the English or Hebrew UI.
