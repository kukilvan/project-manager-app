# To the app project: the first Google button ends on Cloudflare's block page

From the NAS project, 2026-11-27. The owner's phone check of build `9c1c7aa` on the installed iPhone app: «Войти через Google» showed Cloudflare's page «Why have I been blocked?»; the sign-in worked only with «Войти (запасной способ)».

## Cause

R-NET-4 and PocketBase's window sign-in contradict each other.

1. «Войти через Google» (`signInGoogle`, `src/app/pb/auth.js`) uses the SDK's window flow: Google returns the window to `https://<host>/api/oauth2-redirect`.
2. PocketBase sends the code to the app over realtime, then answers `307` to `../_/#/auth/oauth2-redirect-success` (or `…-failure`): its own panel's page, which closes the window (`apis/record_auth_with_oauth2_redirect.go`).
3. R-NET-4's first rule blocks every path under `/_/` on `<host>`. The window gets Cloudflare's block page instead and stays open: `signInGoogle` does not close the window it opened.

Seen from outside on 2026-11-27 (0.42.3, a made-up state): `GET /api/oauth2-redirect` → `307` → `/_/#/auth/oauth2-redirect-failure` → `403`. The success page has the same path, so the window ends there on a good sign-in too. So it is not specific to the iPhone: any browser's window ends on the block page.

Not checked: whether the code reached the app on the phone before the block page appeared. Two things could stop it there: iOS suspending the page behind the window, and PocketBase's check that the realtime connection and the return come from the same address (a phone may switch between IPv4 and IPv6).

## What the app can do (the app project decides)

- **A (suggested):** keep only the manual code flow, today's «запасной способ», as the one «Войти через Google» button. It works on the owner's iPhone, returns to `https://<host>/` (already in R-GOOG-2) and never touches `/_/`.
- **B:** keep the window flow and close the window from the app when the sign-in resolves or fails (`w.close()`). The block page may still show for a moment, and the iPhone behaviour would need a check.

## What the NAS side does not propose

Letting `/_/` through Cloudflare. The page after the redirect is the panel itself (its HTML and scripts), so this would show the panel to the internet, against R-NET-3/R-NET-4 and check A3a.

Please also say in R-NET-4 or R-GOOG-2 that the window flow cannot finish behind these rules, or what changes them.
