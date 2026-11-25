Status: accepted
Complexity: medium
Blocked by: 04

# 09. Google Drive and Sheets on the NAS copy

Drawings from Drive and management sheets work from the NAS address: the app takes the owner's Google Client ID from PocketBase's `auth-methods`, asks for the Drive and Sheets scopes, and signs in as before (popup on a computer, redirect on iPhone and the installed icon).

## Spec sections

§ 3.8 (all), § 1 (`auth-methods` returns `client_id` in Google's `authURL`), § 10 (nothing new), Texts (none new). Slicing notes under § 13 apply.

## What to do

1. `src/app/google.js` and where the Client ID is chosen (`clientId()` / `DEFAULT_CLIENT_ID` in `src/edition.js`): on the NAS copy read `client_id` from the Google `authURL` of `GET /api/collections/users/auth-methods`, keep it as `pm.pbGoogleClient`, and use it with the scopes `drive` and `spreadsheets` (that client has them, R-GOOG-1). Without it (server unreachable at the first use, or no Google provider) fall back to today's shared client with `drive.file`.
2. The flows as today without Firebase: a popup on a computer; a redirect on iPhone and the installed app with `redirect_uri = https://<host>/` (allowed by R-GOOG-2) — check the code that builds the redirect and the return handling does not depend on the GitHub Pages path; `login_hint` = the PocketBase user's e-mail. The return `/#access_token=…` or `?code` of the Drive flow must not be taken for the PocketBase code flow of ticket 04 (distinguish them by the stored state key; add a test).
3. The one-sign-in idea is **not** used (§ 3.8): do not request Drive scopes at the PocketBase sign-in.
4. Management sheets: unchanged (`serverEmail` and the service account as today). Nothing is written to Google in the self-check: the test mode stub `window.__gcalls` and a fake `auth-methods` answer are enough.
5. `PROJECT_CONTEXT.md` environment: device key `pm.pbGoogleClient`. Header comments; `node tools/code-map.mjs`.

## Done when

Local PocketBase (it has no Google provider), browser pane at 420 px:
- With a fake `auth-methods` answer (a small local proxy or the SDK call stubbed in the page) the Client ID is read, saved as `pm.pbGoogleClient` and used in the built Google address together with the two scopes and `login_hint`; without a Google provider the shared client is used.
- The Drive flow's return is not taken for the sign-in's code flow and vice versa (test).
- The Pages build and `?mem=1` are unchanged; no PocketBase code in `dist/`.
- `npm test`, `npm run build`, `node tools/code-map.mjs --check` pass.

## Tests to add

A pure function that builds the Google authorization address (client id, scopes, redirect, `login_hint`) for the NAS copy and the Firebase one; the return-handler discrimination; the fallback.

## Owner check

Needs the NAS, tickets 04–07 and the NAS address in Google Cloud Console (R-GOOG-2). On the phone, on the new icon:
1. On the screen where a drawing is chosen press «☁️ Показать тохниты с Диска»: the first time Google asks for access to Drive and Sheets, then you are back in the app and your files from Drive are listed.
2. Choose a drawing from the list: it opens.
3. Make a management sheet as in the stage 3 check («Таблицы для руководства»): the file appears in your Drive and its data is filled.
4. Wrong: Google says «redirect_uri_mismatch» — send a screenshot; the NAS address is missing in Google Cloud Console.
