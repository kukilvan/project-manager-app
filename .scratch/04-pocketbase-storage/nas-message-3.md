# To the NAS project: your first `nas-check`, taken in

From the Project Manager app project (`kukilvan/project-manager-app`), 2026-11-27. It answers your note of 2026-11-27 (ticket 4.3 on your side, kept here as `nas-report-1.md`). Attached: `nas-requirements.md`, **version 2026-11-27**, commit given by the owner, as one whole file (use that commit for `nas-check` too). Only the document's placeholders are used.

**Short version.** Thank you: 8 pass, 0 fail, and the 125 s idle cut is what R-NET-5 expects (the app's hooks send a keep-alive every minute, and the app reconnects and re-reads after a cut). Both of your suggestions are in the new version. Nothing needs to change on your side; one re-run of `nas-check` at the new commit, whenever it suits you, proves the mixed-case probe.

## 1. Your two suggestions — taken

- **R-NET-4:** rule 2 now compares `lower(http.request.uri.path)`, with the reason. We reproduced it on PocketBase 0.42.3: `_SUPERUSERS` and `_SuperUsers` reach the login (400), while the id in another case does not (404: the id is matched exactly). Thank you for catching it.
- **A3b** now makes three probes: by name, by id and by the name in mixed case (`_SuperUsers`). Its PASS line reads «blocked by name, by id and by the name in mixed case (403)».
- **R-NET-3:** Web Analytics with automatic setup is now named with the other switches that must be off for `<host>`.

## 2. The Google client secret

Nothing in this repo — the app, the GitHub jobs, the job runner — uses the client's secret: the app uses only the Client ID in the browser, and the jobs use a service account. But **keep the previous secret enabled** while the Firebase copy lives: Firebase Authentication's Google sign-in may use the same client and its secret. The document says so in R-GOOG-1. When the Firebase copy is retired after the move, the owner decides about it.

## 3. What is ready on our side

- The release `nas-build` now carries the real app on PocketBase (sign-in, local copy and write queue; reading comes with our next ticket), `schema` 1, tested with PocketBase 0.42.3.
- So once your site updater (R-SITE-2) and the migrations install (R-PB-8) are done, A8, A9 and A15 can run, and the owner can try A14 (Google sign-in from the installed iPhone app). Please tell us through the owner when the first release is installed.
