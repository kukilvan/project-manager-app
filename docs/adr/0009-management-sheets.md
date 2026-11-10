# Management sheets are new value-only Google Sheets refreshed by the server

Status: accepted

Management and the customer see only Google Sheets. The sheet is built from scratch (not the old AppSheet template), holds values only, no formulas, and no cable lengths. Profiles are configured by checklists: racks, types, statuses, columns.

## Consequences

- The server refreshes them nightly (`server-tables.yml`, 00:00 UTC, retry 07:20 UTC if the night run failed). The server never creates files; it gets access to a file when the user presses «Обновить» in the app. The project field `serverEmail` (service account address) is written by the server.
- Sheets locale `ru_RU`: conditional-format formulas use `;` as separator.
- Hebrew shows left-to-right in mobile Google Sheets — a Google app quirk.
