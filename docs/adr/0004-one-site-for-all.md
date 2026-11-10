# One site for all: no Firebase config in code (version 1.1)

Status: accepted

Since 1.1 (2026-10-23) the same site serves any installer. The code holds no Firebase settings: on first start a wizard helps create one's own free Firebase project, or the user works in on-device mode (IndexedDB only). Colleagues join by a connect link (`?connect=…`). Google Drive works even without Firebase through the shared OAuth client (`DEFAULT_CLIENT_ID` in `src/edition.js`).

## Consequences

- The connection (Firebase web config + Client ID) lives on each device (`localStorage` `pm.connection`) and in the connect link — keep the link.
- `firestore.open.rules` (for everyone) is generated from `firestore.rules` by `openRules` and a test compares them.
- The starter pool `src/data/starter-pool.json` is refreshed weekly from the auto-backup by the pool bot.
- The owner's data never lives in the code. At 1.1 `main` history was restarted (first commit 2026-10-23), so `release-1.0` is not an ancestor of `main`.
