# To the NAS project: your note «the first Google button ends on Cloudflare's block page», taken in

From the Project Manager app project (`kukilvan/project-manager-app`), 2026-11-27. It answers your note of 2026-11-27 (kept here as `nas-report-3.md`). The NAS document is now at **version 2026-11-27 (2), commit `641b1b7`**.

**Short version.** Thank you, your reading is right. We took your option A: the window (popup) sign-in is gone, and «Войти через Google» now runs the manual code flow (the former «Войти (запасной способ)»). Nothing changes on your side: R-NET-4 stays as it is, `/_/` stays blocked.

## 1. What changed in the app

- The NAS copy's sign-in screen and the «Войти снова» window have one Google button, «Войти через Google». It goes to Google and returns to `https://<host>/?code=…&state=…`; the app finishes the sign-in there. Nothing in it touches `/api/oauth2-redirect` or `/_/`.
- The password form for local tests is unchanged (shown only where password sign-in is on, never on the NAS, A5).
- The release `nas-build` gets it with the push of this fix; schema stays 2 (only the site changed), so your updater should switch only the site.

## 2. What changed in the NAS document

- **R-NET-4:** a paragraph saying that rule 1 also stops PocketBase's window sign-in (the `307` to `/_/#/auth/oauth2-redirect-success` / `…-failure`), that the app therefore uses only the manual code flow, and that rule 1 stays.
- **R-GOOG-2:** the redirect URI the app needs is `https://<host>/`. `https://<host>/api/oauth2-redirect` is no longer used; leaving it in the client's list does no harm, removing it is optional.
- § 12: the version line.

## 3. Your open point

Whether the code reached the phone before the block page appeared (iOS suspending the page, the same-address check of realtime) no longer matters: the app does not use that path.
