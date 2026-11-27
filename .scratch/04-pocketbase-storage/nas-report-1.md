<!-- Received from the NAS project through the owner on 2026-11-27, kept as received; the tool output it attached is at the end. Taken in: nas-message-3.md. -->

# Note to the app project: the first full `nas-check` (2026-11-27, NAS ticket 4.3)

Attached: `nas-check-first.txt`, the whole output of your `tools/nas-check.mjs` at commit `b3dba35` (your document version 2026-11-26), run on the NAS against `<host>`: from outside, through Cloudflare and the tunnel, in `node:22.23.5-alpine3.24` with no credentials and nothing mounted but the file (its SHA-256 pinned on our side).

## Result

`Summary: 8 pass, 0 fail, 3 skip`.

| Check | Result | What it proves on the NAS copy |
|---|---|---|
| A1 | pass | the health address answers through the tunnel |
| A2 | pass | `http://` redirects to `https://` |
| A3a, A3b | pass | the dashboard and the superuser login (by name and by id) are blocked from the internet |
| A4 | pass | the batch API is on |
| A5 | pass | `users`: password sign-in off, OAuth2 on with the Google provider |
| A6 | pass | no CORS for a foreign origin |
| A7 | pass | realtime connects through the tunnel and reconnects after a cut; **an idle stream was cut after 125 s** (R-NET-5) |
| A8, A9, A15 | skip | no build of yours is installed on the NAS yet: it still serves our placeholder page |

## Done on the NAS side

- Settings of R-PB-5, R-PB-6, R-PB-9, R-BAK-1, R-AUTH-1 and R-AUTH-2 (read back and compared with your document).
- R-NET-2, R-NET-3, R-NET-4 and R-SITE-3 in Cloudflare. Not proven by the tool: R-NET-3 (checked by eye) and R-SITE-3 until A8 runs.
- R-GOOG-1 and R-GOOG-2: the origin `https://<host>` and the redirect URIs `https://<host>/api/oauth2-redirect` and `https://<host>/` added to the owner's client; the provider set in PocketBase by the owner. A real Google sign-in has not been tried yet: that is your A14.
- Google now shows an existing client's secret only masked, so the owner's guide adds a second secret when the full one is not saved. The previous secret stays enabled. If anything of yours uses this client's secret, nothing changes for it; tell us before it is ever disabled.

## Not there yet

- **The site updater (R-SITE-2) and the migrations (R-PB-8)** are our next two tickets. Until they are done, your releases are not installed, so checks of a build on the owner's phone wait. We follow the release names of your document (`nas-pb.zip`, `pb.sha256`, `schema`, `pocketbase`).

## Two suggestions for your document

- **R-NET-4:** PocketBase finds a collection by name case-insensitively, so the literal rule lets `/api/collections/_SUPERUSERS/auth-with-password` reach the login. Our rule 2 compares `lower(http.request.uri.path)`; we probed mixed-case spellings and Cloudflare blocks them (403). We suggest `lower()` in R-NET-4 and a mixed-case probe in A3b.
- **R-NET-3:** Cloudflare's Web Analytics automatic setup added its script to every HTML page of the app. It is now disabled; the document could name it with the other switches.

## Attached: nas-check-first.txt

```text
NAS check of https://<host>
PASS A1  health answers 200: API is healthy
PASS A2  http:// redirects to https:// (301)
PASS A3a the dashboard /_/ is blocked (403)
PASS A3b the superuser login is blocked by name and by id (403)
PASS A4  batch is on (empty batch rejected with validation_required)
PASS A5  password sign-in is off, OAuth2 is on with the google provider
PASS A6  no CORS for a foreign origin (Access-Control-Allow-Origin: absent)
     ... holding the realtime stream open for up to 150 s (--quick skips this)
PASS A7  realtime connects and reconnects after a cut
INFO A7i realtime stream cut after 125 s idle
SKIP A8  no sw.js yet: the site is not there
SKIP A9  no manifest yet: the site is not there
SKIP A15 no NAS build installed yet: /api/pm/info comes with the first release nas-build
Summary: 8 pass, 0 fail, 3 skip
```
