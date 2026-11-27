<!-- Received from the NAS project through the owner on 2026-11-27, kept as received; the tool output it attached is at the end. Taken in: nas-message-4.md. -->

# Note to the app project: your builds now reach the NAS (2026-11-27, NAS ticket 4.5)

Attached: `nas-check-577592e.txt`, the whole output of your `tools/nas-check.mjs` at commit `8ae88cb` (your document version 2026-11-27), run on the NAS against `<host>` after your build `577592e` was installed.

## Result

`Summary: 11 pass, 0 fail, 0 skip` — A8, A9 and A15 now pass too (`sw.js` not cached at the edge, the site built for `/`, `/api/pm/info` answers `"app":"pm"`, `schema` 2). A7's idle realtime stream was again cut after 125 s.

## What the NAS does with your release (R-SITE-2, R-PB-8)

- It looks at `nas-site.json` **every minute**, so a build is live about 1–2 minutes after your JSON is uploaded.
- The names are your document's: `sha256` of `nas-site.zip`, `schema`, `pocketbase`, `pb {file, sha256}`; `jobs` is ignored until the move.
- When `pb.sha256` differs from the installed one: PocketBase is stopped, `pb_data`, `pb_migrations` and `pb_hooks` are copied, the **whole contents** of `pb_migrations` and `pb_hooks` are replaced with your zip's, PocketBase is started and must answer `/api/health` within 120 s; only then is the site switched (an atomic symlink swap). Downtime was about 3 s for your build.
- A migration that keeps PocketBase from starting is rolled back automatically (data from the copy, the previous site stays) and **that release is not tried again**: publish a new one (a new commit or a new `pb.sha256`). The owner gets a Telegram message.
- A `schema` lower than the installed one is never installed automatically.
- A checksum mismatch right after a push is retried after 1, 2, 4 … minutes; the owner hears of a failure only when it is seen twice.
- The running PocketBase version is compared with your `pocketbase` field; a difference shows in the NAS health check.
- The previous 2 builds are kept; switching back is `python tools/pm.py site back` on the NAS side.

## For you

- The owner can now check your builds on the phone at `https://<host>` — your A14 (a real Google sign-in) can go ahead.
- Your build `4b6b66d` (schema 1) was never installed: it was published while the NAS updater still refused migrations, and `577592e` replaced it before the new updater ran.
- Note: `577592e` says `schema` 2, while its `nas-pb.zip` holds only `1764000001_pm_schema_1.js`. The NAS takes `schema` as given; if 2 was meant to bring a migration file, it is not in the zip.

## Attached: nas-check-577592e.txt

```text
NAS check of https://<host>
PASS A1  health answers 200: API is healthy
PASS A2  http:// redirects to https:// (301)
PASS A3a the dashboard /_/ is blocked (403)
PASS A3b the superuser login is blocked by name, by id and by the name in mixed case (403)
PASS A4  batch is on (empty batch rejected with validation_required)
PASS A5  password sign-in is off, OAuth2 is on with the google provider
PASS A6  no CORS for a foreign origin (Access-Control-Allow-Origin: absent)
     ... holding the realtime stream open for up to 150 s (--quick skips this)
PASS A7  realtime connects and reconnects after a cut
INFO A7i realtime stream cut after 125 s idle
PASS A8  sw.js is not served from the edge cache (cf-cache-status: DYNAMIC)
PASS A9  the site is the app built for / (manifest start_url "/")
PASS A15 the app's hooks answer: /api/pm/info has app "pm", schema 2
Summary: 11 pass, 0 fail, 0 skip
```
