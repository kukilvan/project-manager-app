# The UI has three languages; some parts always stay Russian

Status: accepted

Since 1.2 the UI is in Russian (source), English and Hebrew (RTL). The language follows the phone only for new people: whoever already has data stays on Russian. Dictionaries `src/i18n/src/*.json` (`{ "русская строка": ["en", "he"] }`) are built by `node scripts/i18n-build.mjs` into `src/i18n/en.json` and `he.json` (both in git); templates with insertions use `{}`. Untranslated strings: `node scripts/i18n-extract.mjs --json out.json`, compared with the dictionaries.

## Consequences

- Always Russian: the event log, Drive folder names; management sheets are Hebrew or Russian by profile.
- Hebrew is needed in the daily report, management sheets and reference names (`nameHe`).
- Old event-log lines may lack translations — normal.
