Status: accepted

# Stage 2. What the app needs from the NAS — spec

Built from `description.md` (accepted 2026-11-15) and ADR 0013. No ideas filed for the stage. The owner answered on 2026-11-15: the NAS project has decided nothing yet (Docker, folders, users), so the document proposes a layout and the NAS project accepts or changes it.

The stage writes `docs/nas-requirements.md` (the NAS document) and a small check tool `tools/nas-check.mjs`. The app's code and the live site do not change.

## 1. Checked facts

### PocketBase 0.40.6 (latest release, 2026-10-23), run locally on the owner's PC on 2026-11-15

Downloaded from the official GitHub release, checksum matched (`checksums.txt`). Experiments in the session scratchpad; nothing of it is in the repo.

- **Static site.** `serve --publicDir <dir>` serves the folder at `/`; with the default `--indexFallback` an unknown path (`/some/deep/route`) returns `index.html` (SPA fallback). A file added while the server runs is served at once — a new build can be swapped in without a restart. Static responses carry `Last-Modified` but **no `Cache-Control` and no `ETag`**; `.webmanifest` comes as `text/plain`.
- **Batch API** (`POST /api/batch`): **off by default** (403 «Batch requests are not allowed.»). Defaults when on: `maxRequests` 50, `timeout` 3 s, `maxBodySize` 0 (= server default). 51 requests → 400 `validation_length_too_long`. With `maxRequests` raised, 1,000 record creates (≈ 1.6 KB each) took 0.36 s on the PC. A batch is **one transaction**: one bad request → 400, nothing of the batch is saved.
- **Unauthenticated probes** (usable by a check tool without credentials): batch on + `{"requests":[]}` → 400 `validation_required`; batch off → 403. `GET /api/health` → 200 `{"message":"API is healthy."}`. `GET /api/collections/users/auth-methods` is public and lists password / OAuth2 state and providers. A superuser login with a wrong password → 400 «Failed to authenticate.».
- **Record ids.** Default id pattern `^[a-z0-9]+$`, 15 chars generated; a custom id up to `max` (≤ 200 here) is accepted, so the app's `newId()` ids (12 chars a–z0–9) fit as they are. Widening the pattern to `^.+$` still rejects `/`, space and `.` («not a valid primary key character»). So ids that are names (catalog id = name, «Поставка / склад», even in `docKey` form «Поставка _ склад») **cannot be PocketBase ids** — stage 4 keeps the app's id in a separate field.
- **JSON field** default `maxSize` (0) = **1 MB** per value (2 MB → 400 `validation_json_size_limit`); configurable per field.
- **Request body**: a 40 MB request → 413 «Request entity too large.» (server default limit ≈ 32 MB).
- **`updated` field** (`autodate`, on create and update): set by the server, a client value is ignored (sent `2000-01-01`, stored the server time), millisecond precision (`2026-11-15 16:08:50.514Z`); the filter `updated > "<mark>"` returns exactly the changed records — usable as the delta-read mark like `updatedAtServer`.
- **Rules.** A `projects` collection with a multiple relation `members` → users, and `points` with a relation `project`: list/view/create/update rule `project.members.id ?= @request.auth.id` works — a non-member lists 0 records and cannot create into the project. The Firestore rule shape (members are equal, ADR 0003) is expressible.
- **List page size**: `perPage=1000` returns 1,000 (the cap); larger reads need paging.
- **Realtime** (`GET /api/realtime`, SSE): `PB_CONNECT` with a `clientId` arrives at once, subscription by `POST /api/realtime`, record events arrive within milliseconds. **No keep-alive while idle**: nothing is sent between events, and the server **closes the stream after 300 s without a message** (measured: last event at 24 s, closed at 324 s).
- **Auth defaults** (users collection): password sign-in **on**, and the create rule `""` lets anyone register by password; OAuth2 off, no providers; auth token valid **432,000 s (5 days)**; MFA and OTP off. Superusers: MFA/OTP off; OAuth2 not supported for superusers. Settings have `superuserIPs` (empty = any address), `trustedProxy` (no headers), `rateLimits` (rules present, **disabled**: `*:auth` 2 per 3 s, `*:create` 20 per 5 s, `/api/batch` 3 per 1 s, `/api/` 300 per 10 s).
- **CORS**: default `--origins *` — a preflight from any origin gets `Access-Control-Allow-Origin: *`. With `--origins https://pm.example.com` a preflight from `https://example.com` gets no `Access-Control-Allow-Origin`, one from the listed origin gets it back.
- **Rate limits count every request inside a batch.** With the default rules on, a batch of 100 creates failed at its 21st request (`*:create` 20 per 5 s → 429 inside, the whole transaction rolled back), and with `*:create` limited to guests a batch of 450 failed at its 301st (`/api/` 300 per 10 s). Rules with an audience work: `*:create` for `@guest` only, `/api/` 300 per 10 s for `@guest` and 5,000 per 10 s for `@auth` → a 450-record batch and 22 single creates in a row pass for a signed-in user. `/api/batch` 10 per 1 s counts the batch calls themselves: of 12 batches sent at once, 9 passed and 3 got 429.
- **Superuser IPs and the trusted proxy header work together**: with `trustedProxy.headers = ["CF-Connecting-IP"]` and `superuserIPs = ["127.0.0.1/32", "10.0.0.0/8"]`, a superuser login with no header or `CF-Connecting-IP: 10.1.2.3` succeeds, with `CF-Connecting-IP: 203.0.113.7` it gets 403 «You are not allowed to perform this request.» — and so does a valid superuser token used with that outside header. Without the trusted header every request through the tunnel would look like it came from `cloudflared`'s Docker address, i.e. from inside.
- **Backups**: built-in, `POST /api/backups` makes a zip of `pb_data` (without the backups themselves) in `pb_data/backups/`; settings `backups.cron` (empty = off), `cronMaxKeep` 3, optional S3.
- **Dev mode**: the binary logs every SQL statement unless started with `--dev=false`.
- `meta.appURL` defaults to `http://localhost:8090`.

### Cloudflare (official docs, read 2026-11-15)

- Proxy read timeout (Cloudflare waiting for data from the origin): **125 s**, then 524; changeable only on Enterprise. Client-side idle connections: 400 s. With a Tunnel the shorter of the CDN and Tunnel timeouts applies.
- Consequence with the fact above: an idle realtime stream is cut after ≈ 125 s through the tunnel (not 300 s). The SDK reconnects; events sent between the cut and the reconnect are lost to that client.
- Free plan: request body up to **100 MB**. HTML and JSON are not cached by default, but `.js` is — and without `Cache-Control` from the origin a 200 response is kept at the edge for **120 minutes**. Since PocketBase sends no `Cache-Control`, `sw.js`, `registerSW.js` and `workbox-*.js` would be served stale for up to 2 hours after a deploy.

### The owner's data (server backup of 2026-11-15, read in the scratchpad)

| | Project 1 | Project 2 | Total |
|---|---|---|---|
| Documents | 7,319 | 8,508 | 15,827 (+ pool ≈ 0.2 MB) |
| Points | 1,292 | 393 | 1,685 |
| History entries | 5,472 | 5,551 | 11,023 |
| Full JSON | 11.7 MB | 6.7 MB | 18.4 MB |
| of it history | 10.6 MB | 5.4 MB | 16.0 MB (87 %) |

- Largest single documents: history entry 19 KB, project document 45 KB (its `typeIcons` 30 KB), pull 9 KB, point < 1 KB. All far below the 1 MB JSON value limit.
- History spans 5½ weeks (from 2026-10-09 and 2026-10-17) and includes the bulk imports, so ≈ 13 MB a month is an upper bound; `server-cleanup.mjs` drops history older than a year.
- Drawings: all PDFs on the owner's Drive total **≈ 34 MB** (25 files, 0.7–3.7 MB each, including the «с номерами» copies and a few PDFs that are not drawings).

### The app today

- Writes: `save(pid, ops)` writes each record plus a history entry; `commit` sends them in chunks of 400 writes, all chunks at once (`Promise.all`). A mass edit of 500 points is 1,000 writes = 3 chunks in the same second.
- The service worker's `navigateFallback` serves `index.html` for every navigation in scope except the deny list (`/__/`). On a host where the site and PocketBase share the origin, a navigation to `/api/oauth2-redirect` (the OAuth popup) or `/_/` would get the app instead — the NAS build must deny `/api/` and `/_/` (stage 5, see D1).
- Google Drive on iPhone uses a redirect with `redirect_uri = location.origin + location.pathname` (`src/app/google.js`); the NAS site's root URL must therefore be an allowed redirect URI of the OAuth client.
- Server jobs use `FIREBASE_SERVICE_ACCOUNT`; management sheets are shared with the service account's e-mail (`serverEmail`, ADR 0009).

## 2. Decisions on the description's open questions

Each decision is recorded in ADR 0014 (§ 8) and drives the NAS document.

**D1. One hostname, served by PocketBase.** `https://<host>/` is the site, `/api/` the PocketBase API, `/_/` the PocketBase dashboard — all from one PocketBase container (`--publicDir`). Same origin: no CORS, one tunnel route, one OAuth origin, the connect link needs no PocketBase address (the app on the NAS uses its own origin; the domain never enters the repo, ADR 0005). Rejected: two subdomains (CORS, two routes, the address must travel in the connect link); a separate web server (Caddy/nginx — one more container for no gain, since PocketBase serves static files and the SPA fallback). Consequences for the app (stage 5): build with `VITE_BASE=/`; `navigateFallbackDenylist` gets `/api/` and `/_/`.

**D2. Builds are pulled by the NAS from a public GitHub release.** From stage 5, a workflow builds the NAS variant on every push to `main` and publishes `nas-site.zip` plus `nas-site.json` (`commit`, `version`, `builtAt`, `sha256`) as assets of a fixed release `nas-build` in the public repo. On the NAS an updater (the agent container, D3) checks `nas-site.json` every 10 minutes, downloads the zip only when `commit` changed, checks `sha256`, unpacks into a new folder and switches `pb_public` to it (keeping the previous folder for rollback). No secret anywhere: the repo is public, nothing reaches into the NAS. Rejected: a GitHub job pushing `dist/` through the tunnel (an inbound write path and a deploy secret on GitHub); building on the NAS from git (Node and `npm ci` on the NAS, slower, more to break). Owner's check (ADR 0011): until the move, on GitHub Pages as now; after the move, on the NAS once its build shows the new commit — at most ≈ 10 minutes after the Pages deploy (stage 5 updates ADR 0011 and `docs/workflow.md`).

**D3. Server jobs of the NAS copy run on the NAS.** One "agent" container (Node 22, cron) runs the backup export, cleanup, nightly sheets and the site updater, talking to PocketBase over the Docker network with a superuser that is allowed only from the NAS's own networks. Reasons: the superuser API never needs to be reachable from outside; reads are local (no tunnel limits); no GitHub schedule that switches itself off after 60 idle days. Cost: three secrets live on the NAS (service-account key, a GitHub token for the backup repo, the jobs superuser), and a job missed while the NAS was off runs at the next start or the next night. Rejected: GitHub Actions reaching PocketBase through the tunnel with a token — it needs superuser auth from the internet. The weekly starter-pool job (`export-pool.yml`) stays in GitHub Actions: it reads the backup repo, so it keeps working as long as the NAS export keeps the backup format. Firebase jobs keep running in GitHub Actions while the Firebase copy lives (stage 5 decides when they stop).

**D4. No Cloudflare Access in front of the app.** An Access cookie that expires breaks an installed iPhone PWA (offline start, background sync, the OAuth popup). PocketBase sign-in protects the data. Instead, two Cloudflare WAF rules block from the internet what only an administrator needs: the dashboard `/_/` and the superuser login `/api/collections/_superusers/`. The owner administers PocketBase from the home network (`http://<nas-lan-ip>:8090/_/`).

**D5. Realtime is allowed to drop.** Through the tunnel an idle stream is cut after ≈ 125 s, and PocketBase itself closes it after 300 s. The NAS side needs nothing special (the tunnel carries SSE). The app (stage 4) must reconnect and run a delta read after every reconnect; a keep-alive hook (`pb_hooks`, a message to every client every ≈ 60 s) is optional and, if stage 4 wants it, arrives as a file from this repo. The check tool measures the real cut time through the tunnel and reports it for stage 4.

**D6. PocketBase facts for stage 4** (recorded in `docs/project-spec.md`, stage 4, not in the NAS document): the app's ids live in their own field, not as PocketBase ids where they can be names; batch writes must stay ≤ 500 requests, one batch is one transaction, and chunks go one after another with a retry on 429 (§ 5); list reads page by 1,000; the JSON value limit is 1 MB per field (raise per field if needed); `updated` is the delta-read mark; realtime reconnect + delta read (D5); auth token 30 days and refreshed at every online start (R-AUTH-2); both OAuth flows (popup with realtime, and the manual code flow with redirect) must be tried on an installed iPhone PWA, and the redirect URIs of R-GOOG-2 cover both.

**D7. Drawings stay on Google Drive.** ≈ 34 MB in all; moving them later would need well under 1 GB a year. The NAS document reserves no special space for them; the app's folder budget (R-DATA-1) covers it if stage 4 ever moves them.

**D8. A check tool: `tools/nas-check.mjs`.** The owner or a NAS-project session runs it with the address; it needs no credentials and changes nothing. It is the automated part of the acceptance checks (§ 3.10, § 4).

**D9. Disks.** The PocketBase data lives on the HDD mirror (RAID 1), not on the NVMe: the data is small (< 1 GB for years), SQLite on HDD is ample for 2–6 people, and the mirror survives one disk failure. The NVMe is for whatever the NAS project uses it for (cache, Docker images, apps); if it becomes a storage pool with its own redundancy, the NAS project may move the data there.

**D10. PocketBase version is pinned.** 0.40.6 now; PocketBase is before 1.0 and minor versions break things. No automatic updates (no Watchtower or similar on these containers). The version changes only when this repo says so: stage 4 confirms or moves the pin and updates the NAS document in the same session.

## 3. `docs/nas-requirements.md` — what it says

### 3.0 Form

- English, for the sessions of the NAS project; the owner gives them the GitHub link. Budget: at most 30,000 bytes (`wc -c`).
- Placeholders only: `<host>` (the public hostname, e.g. `pm.example.com`), `<domain>`, `<nas-lan-ip>`, `<lan-subnet>`. Never a real domain, IP, e-mail other than the public examples, key, token or password (ADR 0005); a test (§ 6) checks this.
- Every requirement has an id `R-<AREA>-<n>` and a phase: **now** (the NAS project can do it before any app change), **stage 4** (when the app gets PocketBase storage), **stage 5** (when the copy moves). Requirements are written as checkable statements ("must", "must not"); recommendations say "should" and give the reason.
- Sections in this order, each starting with one sentence of why. A header line: version of the document = the date of its last change and the commit; "owned by this repo; the NAS project proposes changes through the owner".
- The last section lists what changes in later stages of the app, so the NAS project knows the document will move.

### 3.1 Summary

- What runs on the NAS: one PocketBase container (data + the built site), one `cloudflared` container (the tunnel), and from stage 5 one agent container (site updater + server jobs). Who uses it: the owner and 2–6 helpers, from phones, outside home, without a VPN app.
- What stays elsewhere: Google (sign-in identity, Drive drawings and backups, management sheets), GitHub (code, releases, the private backup repo), Cloudflare (domain DNS, tunnel), GitHub Pages and Firebase for everyone else.
- A checklist for the owner with costs: domain (≈ 40 ₪ a year; Cloudflare Registrar recommended — no nameserver move); free Cloudflare account; Docker on UGOS Pro; a UPS (recommended); the Google Cloud OAuth client changes (R-GOOG).
- A diagram in text (phone → Cloudflare edge → tunnel → `cloudflared` → `pocketbase:8090`).

### 3.2 PocketBase

- **R-PB-1 (now)** PocketBase 0.40.6, linux amd64 (the DXP2800 is x86-64), in Docker. No official image: a Dockerfile in the document builds from the release zip and checks its SHA-256 (`0e1f609158ed945f809f8a02ae012aa0427129c66ebb63c1aee76f2c0309373f` for `pocketbase_0.40.6_linux_amd64.zip`). Version pinned (D10).
- **R-PB-2 (now)** Start flags: `serve --http=0.0.0.0:8090 --dir=/pb/pb_data --publicDir=/pb/pb_public --migrationsDir=/pb/pb_migrations --hooksDir=/pb/pb_hooks --origins=https://<host> --encryptionEnv=PB_ENCRYPTION_KEY --dev=false`. `PB_ENCRYPTION_KEY`: 32 random characters, kept by the NAS project, never in this repo. `GOMEMLIMIT=512MiB`. Open files limit ≥ 4096. `restart: unless-stopped`. Health check `GET /api/health`. Container time zone UTC.
- **R-PB-3 (now)** Storage on the HDD mirror (D9): `pb_data` in a dedicated shared folder; `pb_data/backups` mounted from a separate folder (R-BAK). `pb_public`, `pb_migrations`, `pb_hooks` are folders the app fills (stage 4/5); before that `pb_public` holds a one-line placeholder page.
- **R-PB-4 (now)** Ports: 8090 published to the home network only (dashboard for the owner); never forwarded on the router. The tunnel reaches it over the Docker network.
- **R-PB-5 (now)** Settings → Application: `appURL` = `https://<host>`; batch **on**, `maxRequests` 500, `timeout` 10 s, `maxBodySize` 0 (default); trusted proxy header `CF-Connecting-IP` (so logs, rate limits and the superuser IP list see the real phone, not `cloudflared`); superuser IPs = `<lan-subnet>` and the Docker network's subnet. The two go together: without the header, requests through the tunnel come from the Docker subnet and would pass the superuser IP list.
- **R-PB-6 (now)** Rate limits **on**, exactly these rules (the defaults would break the app: they count every record inside a batch, § 1): `*:auth` all, 2 per 3 s; `*:create` `@guest`, 20 per 5 s; `/api/batch` all, 10 per 1 s; `/api/` `@guest`, 300 per 10 s; `/api/` `@auth`, 5,000 per 10 s. The agent container's address goes in the excluded list (stage 5).
- **R-PB-7 (now)** Superusers: one personal account for the owner (strong password), and from stage 5 a separate `jobs` superuser for the agent. MFA with e-mail OTP is recommended once SMTP is set (`superuser otp` command as the fallback); not required, since superuser access is LAN-only (R-PB-5, R-NET-4).
- **R-PB-8 (stage 4)** Collections, rules and indexes come as migration files from this repo (`pb_migrations`); the NAS project creates no collections by hand. How the files reach the NAS (copy by hand vs. the agent) — stage 4 decides; a migration applies when PocketBase starts.
- **R-PB-9 (now)** Logs kept 7 days; IP logging on.

### 3.3 The site on the NAS

- **R-SITE-1 (stage 5)** The site is the app built with `VITE_BASE=/`, served by PocketBase from `pb_public` at `https://<host>/` (D1); unknown paths fall back to `index.html` (PocketBase default).
- **R-SITE-2 (stage 5)** Delivery by pull (D2): the agent checks `https://github.com/kukilvan/project-manager-app/releases/download/nas-build/nas-site.json` every 10 minutes; on a new `commit` it downloads `nas-site.zip`, checks `sha256`, unpacks into `site-<commit>/`, and switches the folder PocketBase serves to it (a symlink swap or a rename — stage 5 checks which works on UGOS, since PocketBase reads the folder on every request and needs no restart); keeps the previous two builds; a failed check leaves the current site untouched and logs the error. A switch back to the previous build is a documented manual step.
- **R-SITE-3 (now, stage 5)** Freshness: Cloudflare must not cache the app's files at the edge — a Cache Rule "Bypass cache" for `<host>` (the traffic is small). Without it `sw.js` stays stale up to 2 hours.
- Service worker and updates (explanation, no action): installed apps update themselves within one start after the switch; the first start from the new address installs the app anew (new origin, ADR 0013).

### 3.4 Access from outside

- **R-NET-1 (now)** A remotely managed Cloudflare Tunnel (Zero Trust → Networks → Tunnels), `cloudflared` in Docker with the tunnel token (kept by the NAS project), version pinned (2026.11.0 at the time of writing), `--no-autoupdate`. Public hostname `<host>` → `http://pocketbase:8090`. No port opened on the home router; works behind the provider's NAT.
- **R-NET-2 (now)** SSL/TLS: "Always Use HTTPS" on; HTTP → HTTPS redirect.
- **R-NET-3 (now)** Off for `<host>`: Cloudflare Access (D4), Rocket Loader, Email Address Obfuscation, Bot Fight Mode (they rewrite pages or challenge the app's own requests).
- **R-NET-4 (now)** Two WAF custom rules, action Block: URI path starts with `/_/`; URI path starts with `/api/collections/_superusers/`.
- **R-NET-5 (now)** Limits that matter (explanation): body ≤ 100 MB (the app sends ≤ 1–2 MB per batch); idle streams cut after ≈ 125 s (D5); one hostname, so CORS is not involved.
- Monitoring: **R-NET-6 (now, should)** Cloudflare's Tunnel health notification (e-mail when the tunnel is down), or a free external monitor on `https://<host>/api/health` every 5 minutes.

### 3.5 Sign-in and Google

- **R-AUTH-1 (now)** Users collection: password sign-in **off**; OAuth2 **on** with the Google provider (Client ID + secret of R-GOOG-1); mapped fields: name → `name`, avatar URL → `avatar`. Creating a user by Google sign-in stays allowed (who sees which project is decided by the rules, as in Firestore today).
- **R-AUTH-2 (now)** Auth token duration for users: 30 days (2,592,000 s); the app refreshes it at every online start (stage 4). Reason: a helper's phone may stay offline or unused for weeks; 5 days would force a new Google sign-in.
- **R-GOOG-1 (now)** The Google OAuth client is the owner's existing web client — the one whose Client ID is in the owner's connection (the database's own Client ID, full Drive and Sheets scopes). Its client secret goes only into PocketBase settings (encrypted by `PB_ENCRYPTION_KEY`).
- **R-GOOG-2 (now)** On that client add: authorized JavaScript origin `https://<host>`; authorized redirect URIs `https://<host>/api/oauth2-redirect` (PocketBase popup flow) and `https://<host>/` (manual code flow and the app's Drive redirect on iPhone).
- What stays in Google (explanation): management sheets (ADR 0009), drawings on Drive (D7), Drive backups, the service account used by the nightly sheets.

### 3.6 Server jobs

A table with every job of today and its NAS-copy counterpart (D3):

| Today (GitHub Actions) | NAS copy | Runs | Needs |
|---|---|---|---|
| `server-backup.yml` → Firestore JSON into `polevoy-backups` | PocketBase built-in backup (R-BAK-1) + a JSON export in the `polevoy-import-1` backup format into `polevoy-backups` | PocketBase cron; agent, daily | GitHub fine-grained token, contents write on `polevoy-backups` only |
| `server-cleanup.mjs` | the same rule on PocketBase | agent, after the export | `jobs` superuser |
| `server-drive-backup.mjs` | off-site copy of the backup zips (R-BAK-2) | UGOS Cloud Sync or agent | Drive access of the chosen method |
| `server-tables.yml` (00:00 UTC, retry 07:20) | the same, reading PocketBase | agent, same times | a **new key of the same service account** (same `serverEmail`, so the sheets already shared with it keep working); `jobs` superuser; internet to Google |
| `export-pool.yml` (Mondays) | unchanged, stays in GitHub Actions | GitHub | nothing new |
| — | site updater (R-SITE-2) | agent, every 10 min | nothing |

- **R-JOB-1 (stage 5)** The agent container: Node 22, its code from the same release as the site (an asset of `nas-build`), cron inside; secrets as files mounted read-only; talks to PocketBase as `http://pocketbase:8090`.
- **R-JOB-2 (stage 5)** A job missed while the NAS was off runs at the next start (backup, export) or the next night (sheets).

### 3.7 Backups

- The disk mirror is not a backup (it copies a deletion or a corruption at once).
- **R-BAK-1 (now)** PocketBase backups: cron `0 1 * * *` (01:00 UTC), keep 14, into the separate backups folder (R-PB-3).
- **R-BAK-2 (now)** Off-site: the backups folder copied off the NAS daily — UGOS Cloud Sync (one-way upload) to a Google Drive folder, or an rclone container. Off-site holds at least the last 7 daily backups and is at most 26 hours behind.
- **R-BAK-3 (stage 5)** The JSON export to the private repo `polevoy-backups` (same format as today), so the existing restore path (`server-restore.mjs`, the app's «Импорт данных») and the starter-pool job keep working.
- **R-BAK-4 (now)** A restore drill, before the move and then every 3 months: copy the newest zip, unpack into an empty folder, start a second PocketBase container on another port without the tunnel, sign in to its dashboard from the home network, compare record counts with the live one, remove the test container. Written down step by step.
- Restoring for real (explanation): Dashboard → Backups → Restore replaces all data and restarts PocketBase; the app's devices then catch up by their normal reads.

### 3.8 Data volume and growth

- The table of § 1 (documents, points, history, JSON size) and the largest documents.
- Estimate: ≤ 200 MB of JSON per year at the current pace (history is 87 % and is cleaned after a year); SQLite with indexes ≈ 2× → ≤ 0.5 GB; 14 backup zips ≤ 1 GB; drawings ≈ 34 MB now on Drive.
- **R-DATA-1 (now)** A folder budget of 20 GB on the mirror for `pb_data` and backups together — more than ten times the estimate, so nobody needs to watch it.

### 3.9 Power and network

- What happens (explanation): NAS or home internet down → phones keep working offline from their own copy, writes wait and are sent later (stage 4 builds this), the site opens from the phone's cache, cached sign-in works; impossible meanwhile: a first install, a new sign-in, a new helper joining, seeing others' changes. Google Drive and Sheets actions keep working (they go to Google directly). Server jobs skip and catch up (R-JOB-2). At home the app also goes through the tunnel, so without internet it works offline at home too.
- **R-POW-1 (now, should)** A UPS with a USB signal (≈ 600–700 VA covers the NAS and the router); the NAS shuts down cleanly on low battery.
- **R-POW-2 (now)** The NAS powers on by itself when power returns (UGOS power-recovery setting); containers start by themselves (R-PB-2).
- **R-POW-3 (now)** Time synced by NTP (the `updated` mark of delta reads is server time).

### 3.10 Acceptance checks

| # | Check | How | Phase |
|---|---|---|---|
| A1 | `https://<host>/api/health` answers 200 through the tunnel | `nas-check` | now |
| A2 | `http://` redirects to `https://` | `nas-check` | now |
| A3 | `/_/` and the superuser login are blocked from the internet | `nas-check` | now |
| A4 | batch on | `nas-check` | now |
| A5 | password sign-in off, Google provider on | `nas-check` | now |
| A6 | no CORS for a foreign origin | `nas-check` | now |
| A7 | realtime connects through the tunnel and reconnects after a cut; the cut time is reported | `nas-check` | now |
| A8 | Cloudflare does not cache the app's files | `nas-check` | stage 5 (skipped before) |
| A9 | the site is the app built for `/` | `nas-check` | stage 5 (skipped before) |
| A10 | a backup appears daily; the off-site copy appears daily | by hand, a week after setup | now |
| A11 | the restore drill (R-BAK-4) done once | by hand | now, before stage 4 starts |
| A12 | power cut: unplug → clean shutdown on the UPS → power back → NAS, containers and A1 back without a hand | by hand | now |
| A13 | the dashboard opens from the home network | by hand | now |
| A14 | Google sign-in from the installed iPhone app | by hand | stage 4 |

Stage 4 starts when A1–A7 and A10–A13 pass and the owner says the NAS is reliable (project spec, stage 4).

### 3.11 Open questions for the NAS project

1. NVMe: cache or a storage pool? (D9 places the data on the mirror either way.)
2. The domain and the hostname of the app (a subdomain such as `pm.<domain>` keeps the bare domain free); registrar (Cloudflare Registrar recommended).
3. UPS model and whether UGOS Pro talks to it over USB.
4. Off-site method: UGOS Cloud Sync or rclone; which Google account holds the copy.
5. SMTP for superuser MFA (optional).
6. Docker on UGOS Pro: the built-in Docker app with Compose projects, or something else; which shared folders.

### 3.12 What changes in later stages (last section)

Stage 4: migrations and possibly hooks (`pb_migrations`, `pb_hooks`), the pin confirmed, A14. Stage 5: the release `nas-build`, the agent container with its secrets, the JSON export, the move of the owner's data, the jobs switch-over. Each of those stages updates this document in the same session.

## 4. `tools/nas-check.mjs`

A Node 22 script with no dependencies (built-in `fetch`, `node:util` `parseArgs`). It reads nothing from disk and writes nothing; it never sends credentials and never creates records.

**Usage:** `node tools/nas-check.mjs https://<host> [--quick] [--hold <seconds>]`

- The address is required, must start with `https://` (a plain `http://` address is refused with exit 2, except `http://127.0.0.1` and `http://localhost` — local testing, where the checks that need Cloudflare are skipped).
- `--quick` skips the realtime hold (A7 then checks only the connect). `--hold` sets the realtime hold, default 150 s.
- Without arguments or with `--help`: the usage text and exit 2.

**Output:** one line per check — `PASS`, `FAIL`, `SKIP` or `INFO`, its id (A1…), a short English text, and for a FAIL what was expected and what came back (status and the first 120 characters of the body). Then `Summary: <n> pass, <n> fail, <n> skip`. Exit code 0 when nothing failed, 1 when a check failed, 2 on bad usage or when the host cannot be reached at all.

**Checks** (`base` = the address without a trailing slash):

| Id | Request | PASS when | FAIL when | SKIP |
|---|---|---|---|---|
| A1 | `GET base/api/health` | 200 and JSON `message` = «API is healthy.» | anything else | — |
| A2 | `GET http://<host>/api/health`, redirects not followed | 301, 302, 307 or 308 with `Location` starting `https://` | 200 over http | local address |
| A3a | `GET base/_/` | 403 | 200 (the dashboard is reachable) or other | local address |
| A3b | `POST base/api/collections/_superusers/auth-with-password` with `{"identity":"check@example.com","password":"x"}` | 403 | 400 (PocketBase answered: not blocked) or other | local address |
| A4 | `POST base/api/batch` with `{"requests":[]}` | 400 and `data.requests.code` = `validation_required` | 403 (batch off) or other | — |
| A5 | `GET base/api/collections/users/auth-methods` | `password.enabled` false, `oauth2.enabled` true, a provider named `google` | otherwise; the text names which part | — |
| A6 | `OPTIONS base/api/health` with `Origin: https://example.com`, `Access-Control-Request-Method: GET` | no `Access-Control-Allow-Origin`, or one that is neither `*` nor `https://example.com` | `*` or the foreign origin | — |
| A7 | `GET base/api/realtime` (`Accept: text/event-stream`) | `PB_CONNECT` within 10 s; then hold: if the stream closes before `--hold` ends, a second connection gets `PB_CONNECT` within 10 s | no `PB_CONNECT`; or the reconnect fails | — |
| A7i | — | INFO line: "realtime stream cut after <n> s idle" or "stream still open after <hold> s" | — | `--quick` |
| A8 | `GET base/sw.js` twice | 200 and `cf-cache-status` absent or not `HIT` on the second | `HIT` on the second | `sw.js` 404 (site not there yet) or local address |
| A9 | `GET base/` and `GET base/manifest.webmanifest` | HTML with `rel="manifest"`; manifest JSON with `start_url` `/` | the app is there but built for another base (`start_url` not `/`) | no manifest (site not there yet) |

- Every request has a 15 s timeout (A7 hold excepted) and the header `User-Agent: project-manager-nas-check`; a timeout or network error is a FAIL of that check, and when A1 cannot connect at all the tool stops with exit 2 and "cannot reach <base>".
- The pure parts (argument parsing, judging a response, the summary) are exported functions; the network part takes a `fetch` function so tests can stub it. The CLI runs only when the file is the entry point.
- Header comment per `docs/coding-standards.md`; listed in `docs/code-map.md` ("Not code" → tools line) like the other tools.

## 5. Edge cases

- **The NAS project sets up before stage 4.** Everything marked "now" works on an empty PocketBase: A1–A7 pass with no collections (the `users` collection exists by default), A8–A9 skip.
- **The superuser rules block the owner from outside.** By design; the owner administers from home. If remote administration is ever needed: a second hostname with Cloudflare Access, decided then (the NAS document says so in § 3.4).
- **Rate limit hits the app.** Today `commit` sends all chunks at once; a mass edit of ≈ 2,500 points (5,000 writes) would be 13 batches in one second, above 10, and one batch is limited to 5,000 inner requests per 10 s. The phone would get 429 for some chunks and keep them as rejected writes (`pz.rejected`). Stage 4 must send chunks one after another and retry on 429. Noted for stage 4 in `docs/project-spec.md`.
- **Many helpers behind one IP** (a site Wi-Fi): with `CF-Connecting-IP` they share one rate-limit bucket; 300 requests per 10 s is ample for 2–6 people.
- **A LAN client sends a forged `CF-Connecting-IP`.** It can only make itself look like another address; superuser access is still limited by R-PB-5 and blocked from the internet by R-NET-4. Accepted.
- **The release asset is broken or half-uploaded.** `sha256` mismatch → the updater keeps the current site (R-SITE-2).
- **A deploy reaches GitHub Pages but not the NAS** (NAS off). The NAS catches up at the next check; the owner checks the NAS only once its build shows the new commit (D2).
- **Cloudflare is down.** Same as the home internet being down (§ 3.9).
- **`PB_ENCRYPTION_KEY` lost.** The encrypted settings (OAuth secret, SMTP) cannot be read: PocketBase starts but those settings must be entered again; the data itself is not encrypted by it. The document says to keep the key with the NAS project's secrets.
- **The service-account key leaks from the NAS.** Revoke that key in Google Cloud; the GitHub Actions key is a different key of the same account and keeps working.
- **The document is read before stage 4 changes it.** Its header carries the date and commit; § 3.12 says which parts will move.

## 6. Tests

- **`tests/nas-check.test.js`** (node:test, no network): argument parsing (no address, `http://` remote refused, local `http://` allowed, `--quick`, `--hold`); each check judged from stubbed responses — the PASS case and each FAIL case of the table in § 4, A2/A3/A8 skipped on a local address, A8/A9 skipped when the site is not there; A7 with a stubbed stream that closes after 1 s and a reconnect (hold 2 s); the summary line and the exit code.
- **`tests/code-docs.test.js`** (existing) covers the header comment of the new tool through the code map.
- **A document check in `tests/nas-check.test.js`**: `docs/nas-requirements.md` exists, is ≤ 30,000 bytes, has the sections of § 3 in order, every `R-…` id is unique, and it contains no e-mail address except `@example.com` ones, no IPv4 address except `127.0.0.1` and `0.0.0.0`, and no `https://` host outside an allow list (`github.com`, `example.com`, Cloudflare and Google documentation hosts, `<host>`).
- **Self-check of the tool ticket**: run against the local PocketBase binary in the scratchpad (`http://127.0.0.1:8090`): batch on and off, password auth on and off, a Google provider with dummy credentials — each flips the expected line.
- **What the owner checks live** — § 7.

## 7. What the owner checks

- Ticket 01 (the document): open the link `https://github.com/kukilvan/project-manager-app/blob/main/docs/nas-requirements.md` on the phone or PC — the document opens, has the checklist at the top; hand the link to the NAS project.
- Ticket 02 (the tool): in PowerShell in the project folder, `node tools/nas-check.mjs --help` prints the usage. The real run waits for the NAS: the NAS project runs it after the tunnel works, and the owner pastes its output into a «Вопрос: …» session if something fails.

## 8. Docs to update

- **New:** `docs/nas-requirements.md` (ticket 01), `tools/nas-check.mjs` and `tests/nas-check.test.js` (ticket 02).
- **New ADR 0014** (ticket 01): "The NAS copy: one hostname served by PocketBase, builds pulled from a GitHub release, server jobs on the NAS" — D1, D2, D3, D4 with their reasons and the rejected options.
- **`docs/project-spec.md`** (ticket 01): stage 2 — the output and the tool; stage 4 — the PocketBase facts of D6 and the rate-limit note of § 5, "starts when A1–A7, A10–A13 pass"; stage 5 — the release `nas-build`, the agent container, the owner's check on the NAS after the move (ADR 0011 to be updated then).
- **`CONTEXT.md`** (ticket 01): **NAS copy** — the owner's copy of the app on the home NAS: the site and PocketBase behind a Cloudflare Tunnel (ADR 0013, 0014); _avoid_: server, home server. **NAS document** — `docs/nas-requirements.md`, what the app requires from the NAS. **NAS check** — `tools/nas-check.mjs`, the automated acceptance checks of the NAS copy.
- **`docs/code-map.md`** (ticket 02): the "Not code" tools line gets `tools/nas-check.mjs`.
- **`CLAUDE.md`** Run (ticket 02): one line `NAS check: node tools/nas-check.mjs https://<host>` — within its 6,000-byte budget.
- **`KNOWN_ISSUES.md`**: nothing new (no bug found; the stage-4 notes go to the project spec).
- `README.md`, `ВОССТАНОВЛЕНИЕ.md`: unchanged now (stage 5 adds the NAS copy).

## 9. Proposed tickets

| # | Ticket | Complexity | Depends on | Owner checks |
|---|---|---|---|---|
| 01 | The NAS document `docs/nas-requirements.md` (§ 3), ADR 0014, project spec and `CONTEXT.md` updates | complex (security and external services; every fact must match § 1) | — | the GitHub link opens (§ 7) |
| 02 | `tools/nas-check.mjs` (§ 4) and `tests/nas-check.test.js` with the document check (§ 6), code map and `CLAUDE.md` lines | medium | 01 (the document check reads it; A-ids match § 3.10) | `--help` (§ 7) |

Both go to `main` after the self-check (ADR 0011). Neither touches what the site is built from (`src/`, `public/`, `index.html`, `vite.config.js`, `package*.json`): the self-check shows it with `git diff --name-only main...HEAD`, so there is nothing to check on the phone beyond § 7. Then «Ревью 2».
