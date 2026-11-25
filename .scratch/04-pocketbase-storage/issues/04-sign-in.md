Status: in review
Complexity: complex
Blocked by: 03

# 04. Sign-in on the NAS copy

The NAS build opens a sign-in screen; both Google flows work; the token is kept fresh; an expired sign-in has its banner; the administrator is read. After the sign-in the placeholder of ticket 03 stays (no storage yet), now with the user's e-mail and the existing «Выйти».

## Spec sections

§ 1 (sign-in facts), § 3.1 (start), § 3.2 (all), § 10 (edge cases 5, 17, 30), § 12 (device keys), Texts (sign-in rows). Slicing notes under § 13 apply.

## What to do

1. Dependency: `pocketbase` (JS SDK, `^0.29.0`) in `package.json` and the lock file; it is imported only from NAS-only modules behind `isPocketBase()` (dynamic `import()` where needed) so the Pages build never contains it.
2. `src/app/pb/client.js`: the one `PocketBase` instance for `location.origin`, `autoClearAuthStore(false)`, the SDK's own auth key `pocketbase_auth`. `src/app/pb/auth.js`: `startSession()` (the three-way start of § 3.1: finish `?code=&state=` against `pz.pbOauth` and clean the address; else a saved auth → start at once, offline too, and refresh the token in the background; else the sign-in screen); `authRefresh()` with the three outcomes of § 3.2 (200, 401 → «sign-in expired», network error → unchanged); a small state with `onChange` for ticket 05 and ticket 08 (`signedIn`, `expired`, `user`).
3. The sign-in screen (the existing screen of `src/app/start.js` / `shell.js`, find where the Firebase one is built): same texts and buttons; under the card «База: домашний сервер · <host>»; «Войти через Google» = `authWithOAuth2({provider: 'google'})`; «Войти (запасной способ)» = the manual code flow (`auth-methods`, `pz.pbOauth` with `{state, codeVerifier, redirect}`, redirect to `authURL + encodeURIComponent('https://<host>/')`, back at `/?code=…&state=…` → `authWithOAuth2Code`); a `state` that does not match → the address is cleaned and the screen says «Не удалось войти: state»; the errors of § 3.2 (server unreachable, no Google provider, anything else). No «⚙ Подключение».
4. The password form (§ 3.2, local tests only): shown only when `auth-methods` says password sign-in is on; the three labels and the explanation line.
5. The administrator: `POST /api/pm/admin`, remembered as `pm.admin.pb`; a new device waits at most 6 s, as with Firestore (`setAdminEmail` in `src/edition.js`).
6. «Вход истёк» banner under the top bar with «Войти снова» opening the two sign-in buttons in a window; after the sign-in an event says whether it is the same user as before (ticket 05 uses it; here only the event).
7. Sign-out (☰ → «Выйти») on the NAS copy: the question of § 3.2 when the number of unsent changes is above 0. Until ticket 05 that number is 0 — the function that counts is a stub called from one place (`unsentCount()`), and a test proves the question appears when it returns above 0.
8. After the sign-in the placeholder shows the e-mail of the user next to «Выйти» (no new string if an existing one fits; otherwise add and translate it).
9. Texts: the sign-in rows of the Texts table in Russian, English and Hebrew; `node scripts/i18n-build.mjs`. `PROJECT_CONTEXT.md` environment: device keys `pocketbase_auth`, `pz.pbOauth`, `pm.admin.pb`. Header comments; `node tools/code-map.mjs`.

## Done when

On the local PocketBase (`npm run build:nas`, `node tools/pb-dev.mjs up --serve dist-nas`), browser pane at 420 px, after clearing site data:
- The sign-in screen shows «База: домашний сервер · localhost:8090»; the password form is there; signing in as a test user with it shows the placeholder with that e-mail.
- Reload: the app starts at once from the saved sign-in. With the server stopped (`pb-dev down`) it still starts and says nothing about errors; with the server back the token is refreshed (check the network log).
- Making the saved token invalid (edit `pocketbase_auth` in the browser's storage) and reloading shows the banner «Вход истёк…» and «Войти снова».
- The manual flow: `auth-methods` is read, `pz.pbOauth` is saved, the browser goes to Google's address (the local server has no Google provider, so this is checked by test with a stub `auth-methods` and by reading the built address); a wrong `state` shows «Не удалось войти: state» and cleans the address.
- With the server stopped at the first start, «Сервер недоступен — проверьте интернет и попробуйте ещё раз.».
- «Выйти» with the stub count above 0 asks the question; with 0 it signs out.
- The Pages build has no PocketBase code (no `PB_CONNECT` in `dist/`); `?mem=1` works as before; the three languages show the new texts.
- `npm test`, `npm run build`, `node tools/code-map.mjs --check` pass.

## Tests to add

Pure logic in `src/domain` or the module's own helpers (tested without the SDK): the three-way start decision, the refresh outcomes, the `state` check, the built `authURL + redirect`, the sign-out question rule. A guard test that the Pages build has no PocketBase import (a static check of the import graph from `src/main.js` that ignores the NAS-only branch is enough; or the `dist/` grep as a script under `tools/` if the session finds a test cannot build).

## Owner check

Needs the NAS (A1–A7, A13 and the site updater) and the Google client of the NAS address (R-GOOG-2): the first real Google check. The line is kept for the stage list.

1. iPhone, Safari: open `https://<адрес NAS>/`, «Поделиться» → «На экран «Домой»», open the new icon.
2. «Войти через Google», choose your account: the screen with your e-mail appears. Wrong: an error text under the buttons — send a screenshot.
3. Close the icon completely, open again: you are still signed in (no screen with the buttons).
4. Sign out (☰ → «Выйти»), then «Войти (запасной способ)»: Google opens in the same window and brings you back to the app signed in.
