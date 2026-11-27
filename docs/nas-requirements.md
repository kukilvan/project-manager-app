# What the Project Manager app needs from the NAS

Version: 2026-11-27, commit `8ae88cb`. Previous version: 2026-11-26, commit `b3dba35`. Owned by this repo (`kukilvan/project-manager-app`); the NAS project proposes changes through the owner.

This document tells the NAS project exactly what to set up so the owner's copy of the app (the **NAS copy**) can run on the home NAS, how to move the owner's data there, and how to check it. The decisions behind it are in ADR 0013, ADR 0014 and ADR 0019 of this repo.

Conventions:

- **Placeholders**, never real values: `<host>` — the public hostname of the app (for example `pm.example.com`); `<domain>` — the owner's domain; `<nas-lan-ip>` — the NAS address on the home network; `<lan-subnet>` — the home network in CIDR form; `<docker-subnet>` — the subnet of the Docker network of the containers below (`docker network inspect`); `<tailnet>` — the owner's Tailscale range (`100.64/10`). Real values, keys, tokens and passwords stay with the NAS project and never come into this repo (it is public).
- Every requirement has an id `R-<AREA>-<n>` and a phase: **now** — can be done before any app change; **stage 4** — when the app gets PocketBase storage (it is being built now); **stage 5** — the move of the owner's data and the switch-over, done by the NAS project. "Must" and "must not" are checkable; a requirement written as a setting ("keep 7 days") is a must too; "should" is a recommendation with its reason.

## 1. Summary

Why: the NAS project needs the whole picture in one page before the details.

**Who does what** (ADR 0019).

| This repo | The NAS project |
|---|---|
| The app with its PocketBase storage | Docker, containers, settings (§ 2), Cloudflare, Google steps with the owner |
| The NAS build, in the release `nas-build` on every push to `main` (R-SITE-1) | The site updater (R-SITE-2), monitoring |
| Migrations and hooks with a version number (R-PB-8) | Installing them before the site that needs them |
| Job scripts and the restore tool, in the same release (§ 6, § 12) | The agent that runs them (R-JOB-1), backups, restore drills |
| This document, a new version line for every change | The data move, the switch-over, the way back, the report back (§ 12) |

**What runs on the NAS.** One `pocketbase` container (the data and the built site), one `cloudflared` container (the tunnel), from stage 4 the site updater, and from stage 5 one `agent` container (the server jobs). Users: the owner and 2–6 helpers, from phones, mostly outside home, without any VPN app.

**What stays elsewhere.** Google: the sign-in identity, drawings and backups on Drive, management sheets. GitHub: the code, the build releases, the private backup repo `polevoy-backups`. Cloudflare: DNS of the domain, the tunnel, the firewall rules. GitHub Pages and Firebase keep serving everyone who is not on the NAS copy.

```text
phone (installed app) --HTTPS--> Cloudflare edge (<host>, WAF, no cache)
        --> Cloudflare Tunnel (outbound from the NAS, no open router port)
        --> cloudflared container --> http://pocketbase:8090
                                        /       the site (pb_public)
                                        /api/   PocketBase API
                                        /_/     dashboard (blocked from the internet)
home network or Tailscale --> http://<nas-lan-ip>:8090/_/  (the owner administers)
```

## 2. PocketBase

Why: PocketBase holds the data and serves the site; its version, flags and settings decide whether the app works and stays safe.

- **R-PB-1 (now)** PocketBase **0.42.3**, linux amd64 (the DXP2800 is x86-64), in Docker. PocketBase left GitHub on 2026-10-26 (archived; its last release there is 0.40.6); releases come from `https://ganigeorgiev.com/meta/pocketbase/pocketbase/download/<tag>/<file>` (a redirect to the file). No official image: build it with the Dockerfile below, which checks the zip's SHA-256 from that release's `checksums.txt`. The app needs 0.42 or newer (an expired sign-in then gets 401 on every request; before, it silently became a guest). A stack built with 0.40.6 is rebuilt; the data folder stays. The version must not change automatically: no Watchtower or similar on these containers. PocketBase is before 1.0 and minor versions break things; the version changes only when this document says so.
- **R-PB-2 (now)** Start flags exactly: `serve --http=0.0.0.0:8090 --dir=/pb/pb_data --publicDir=/pb/pb_public --migrationsDir=/pb/pb_migrations --hooksDir=/pb/pb_hooks --origins=https://<host> --encryptionEnv=PB_ENCRYPTION_KEY --dev=false`. Environment: `PB_ENCRYPTION_KEY` (exactly 32 random characters, for example from `openssl rand -hex 16`; with any other length PocketBase does not start: `crypto/aes: invalid key size`, and the container restarts in a loop), `GOMEMLIMIT=512MiB`, `TZ=UTC`. Open-files limit ≥ 4096. Restart policy `unless-stopped`. Health check `GET /api/health`. `--dev=false` matters: otherwise every SQL statement is logged.
- **R-PB-3 (now)** Storage on the HDD mirror (RAID 1): `pb_data` in a dedicated shared folder; `pb_data/backups` mounted from a **separate** folder (R-BAK-1, R-BAK-2). `pb_public`, `pb_migrations` and `pb_hooks` are folders the app fills (stage 4); until then `pb_public` holds a one-line placeholder `index.html`. Reason: the data is small, SQLite on HDD is ample for 2–6 people, the mirror survives a disk failure; the NVMe has no redundancy.
- **R-PB-4 (now)** Port 8090 serves the owner's dashboard and must never be reachable from the internet: it must never be forwarded on the router. It may be published on `<nas-lan-ip>` only, or on `0.0.0.0` (IPv4) while IPv6 is off on the NAS and the router forwards nothing to it. The tunnel reaches PocketBase over the Docker network.
- **R-PB-5 (now)** Dashboard → Settings → Application:
  - Application URL (`appURL`) = `https://<host>`.
  - Batch API **on**: max requests 500, timeout 10 s, max body size 0 (server default). Batch is off by default; the restore tool needs it (R-MOVE-1).
  - Trusted proxy (user IP) header: `CF-Connecting-IP`.
  - Superuser IPs: `<lan-subnet>` and `<docker-subnet>`; `<tailnet>` may be added so the owner administers over Tailscale. Add the Docker subnet of a home-only reverse proxy only when that proxy cannot pass the real client address (§ 4).

  The header and the superuser IPs go together. Without the header, every request through the tunnel comes from `cloudflared`'s Docker address, so the internet would pass the IP list, and logs and rate limits would see one client. With it, a superuser login or token used from outside gets 403. Cloudflare sets the header itself, and no internet client has a `<tailnet>` address. A home device can forge it, but only to look like another address: accepted.
- **R-PB-6 (now)** Rate limiting **on**, with exactly these rules (the defaults would break the app: PocketBase counts every request inside a batch against the rules, so a 100-record batch fails at its 21st record under the default `*:create` rule):

  | Label | Audience | Max requests | Per |
  |---|---|---|---|
  | `*:auth` | all | 2 | 3 s |
  | `*:create` | `@guest` | 20 | 5 s |
  | `/api/batch` | all | 10 | 1 s |
  | `/api/` | `@guest` | 300 | 10 s |
  | `/api/` | `@auth` | 5,000 | 10 s |

  Re-checked in stage 4: the numbers stay. The app writes through its own route (R-PB-8), one request per chunk of ≤ 300 changes, one after another; the batch API serves only the restore tool. Superuser requests are not rate limited (6,400 creates in 2.6 s, no 429), so the agent needs no exclusion.
- **R-PB-7 (now)** Superusers: one personal account for the owner with a strong password, made by the owner; from stage 5 a separate `jobs` superuser for the agent. Create one from the NAS shell with `docker exec <pocketbase container> /pb/pocketbase superuser upsert <email> <password> --dir=/pb/pb_data --encryptionEnv=PB_ENCRYPTION_KEY`, or with the one-time installer link PocketBase prints in its log at the first start (with `<nas-lan-ip>` in place of `0.0.0.0`). Every PocketBase command in the container needs the same `--dir` and `--encryptionEnv` as `serve` (else «missing encryption key»). E-mail OTP is not required: superuser access is home-only.
- **R-PB-8 (stage 4)** Collections, API rules and indexes come as migration files, hooks as files, from this repo; the NAS project never creates or changes collections by hand. Both come as `nas-pb.zip` of the release `nas-build` (SHA-256 and the database description version `schema` in `nas-site.json`, R-SITE-2), with the folders `pb_migrations/` (`<number>_pm_schema_<n>.js`) and `pb_hooks/` (`pm.pb.js`, folder `pm/`). Install: replace the **whole contents** of the mounted `pb_migrations` and `pb_hooks` with them, restart PocketBase (migrations apply at start), always **before** switching to a site with a higher `schema`. Then `https://<host>/api/pm/info` answers `{"app":"pm","schema":<n>}`. The hooks add the app's write route `POST /api/pm/save`, `GET /api/pm/info`, `POST /api/pm/admin` and a cron `pm_ping` (a keep-alive to the app's realtime connections every minute). Migrations never delete app data and never touch Settings or the `users` auth options. Until the first release both folders stay empty.
- **R-PB-9 (now)** Settings → Logs: keep 7 days; IP logging on.

**Who sets what.** The NAS project sets R-PB-5, R-PB-6, R-PB-9, R-AUTH-1 and R-AUTH-2: in the dashboard, or by a script that uses PocketBase's API from the home network with the owner's superuser session, holds no secret in any repo, and may re-check them later. This repo's migrations change only collections (fields, indexes, API rules, `users` rules and fields included), never Settings or the `users` auth options (password, OAuth2 providers, client secret, token durations). So they do not fight; a re-checking script must not "fix" collection rules.

**`PB_ENCRYPTION_KEY`** encrypts the stored settings (the Google client secret, SMTP), not the data. Keep it with the NAS project's secrets, and a copy outside the NAS (the owner's password manager). If it is lost, the data is intact, but those settings must be entered again.

Dockerfile (R-PB-1):

```dockerfile
FROM alpine:3.22
ARG PB_VERSION=0.42.3
ARG PB_SHA256=89b1ded352404c648dd92c2d884fc8ff7858138697cb1ccb52722ccaa0bbd2a9
RUN apk add --no-cache ca-certificates \
 && wget -q -O /tmp/pb.zip "https://ganigeorgiev.com/meta/pocketbase/pocketbase/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" \
 && echo "${PB_SHA256}  /tmp/pb.zip" | sha256sum -c - \
 && mkdir -p /pb \
 && unzip /tmp/pb.zip pocketbase -d /pb \
 && rm /tmp/pb.zip
EXPOSE 8090
ENTRYPOINT ["/pb/pocketbase"]
```

Compose example (R-PB-2…4, R-NET-1); folder paths are examples, the NAS project picks its shared folders:

```yaml
name: pm
services:
  pocketbase:
    build: ./pocketbase            # the Dockerfile above
    image: pm-pocketbase:0.42.3
    command:
      - serve
      - --http=0.0.0.0:8090
      - --dir=/pb/pb_data
      - --publicDir=/pb/pb_public
      - --migrationsDir=/pb/pb_migrations
      - --hooksDir=/pb/pb_hooks
      - --origins=https://<host>
      - --encryptionEnv=PB_ENCRYPTION_KEY
      - --dev=false
    environment:
      PB_ENCRYPTION_KEY: ${PB_ENCRYPTION_KEY}   # from .env, never in git
      GOMEMLIMIT: 512MiB
      TZ: UTC
    ulimits:
      nofile: { soft: 4096, hard: 4096 }
    ports:
      - "<nas-lan-ip>:8090:8090"   # or "0.0.0.0:8090:8090" under the conditions of R-PB-4
    volumes:
      - /volume1/pm/pb_data:/pb/pb_data
      - /volume1/pm-backups:/pb/pb_data/backups
      - /volume1/pm/pb_public:/pb/pb_public
      - /volume1/pm/pb_migrations:/pb/pb_migrations
      - /volume1/pm/pb_hooks:/pb/pb_hooks
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8090/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    restart: unless-stopped

  cloudflared:
    image: cloudflare/cloudflared:2026.11.0   # pinned by the NAS project (R-NET-1)
    command: tunnel --no-autoupdate run
    environment:
      TUNNEL_TOKEN: ${TUNNEL_TOKEN}             # from .env, never in git
    depends_on:
      pocketbase: { condition: service_healthy }
    restart: unless-stopped
```

The `.env` file next to it holds `PB_ENCRYPTION_KEY` and `TUNNEL_TOKEN`, readable only by the NAS administrator.

## 3. The site on the NAS

Why: the owner wants the site at home too, on the same hostname as the data, and it must update itself when this repo changes. From stage 4 the owner checks the app's PocketBase storage there.

- **R-SITE-1 (stage 4)** The site is this app built with `VITE_BASE=/`, served by PocketBase from `pb_public` at `https://<host>/`. Unknown paths fall back to `index.html`. One hostname for the site and the API: no CORS, one tunnel route, one Google origin; the app finds PocketBase at its own origin.
- **R-SITE-2 (stage 4)** Delivery by pull, by the NAS project's own updater (no app knowledge needed). It checks `https://github.com/kukilvan/project-manager-app/releases/download/nas-build/nas-site.json` every 10 minutes: `{"commit", "version", "builtAt", "sha256" (of nas-site.zip), "schema", "pocketbase" (the tested version: warn the owner when the running one differs), "pb": {"file": "nas-pb.zip", "sha256"}, "jobs": {"file": "nas-jobs.zip", "sha256"}}`. Zips are uploaded first, the JSON last; unchanged contents keep their checksum (deterministic zips). A checksum mismatch right after a push is normal: retry at the next check.
  - On a new `commit` it downloads `nas-site.zip`, checks `sha256`, unpacks into `site-<commit>/` and switches the folder PocketBase serves (a symlink swap or a rename); no restart is needed.
  - If `schema` is higher than the installed one, the migrations go first (R-PB-8); an updater that does not install them must hold the old site and alert the owner.
  - It keeps the previous two builds; a failed download or checksum leaves the site untouched and logs the error; switching back is a documented manual step. No secret is involved.
- **R-SITE-3 (now)** Cloudflare must not cache the app's files: a Cache Rule "Bypass cache" for hostname `<host>`. PocketBase sends no `Cache-Control`, so Cloudflare would keep `.js` files (`sw.js` too) up to 2 hours after a deploy.

Explanations (no action): installed apps update themselves within one start after the switch; the first start from the new address installs the app anew, so every phone installs the icon again (ADR 0013). A NAS that was off catches up at its next check. The `nas-build` release comes with stage 4's first tickets; the owner tells the NAS project when the first build is there.

## 4. Access from outside

Why: phones must reach the NAS from anywhere over HTTPS, without a VPN app and without opening the home router.

- **R-NET-1 (now)** A remotely managed Cloudflare Tunnel (Zero Trust → Networks → Tunnels). `cloudflared` runs in Docker with the tunnel token (kept by the NAS project), with `--no-autoupdate`, its version pinned by the NAS project. The NAS project may raise the version on its own, for example in its monthly update sessions, if `nas-check` (A1–A7, with the realtime hold) passes on the new version. Public hostname `<host>` → service `http://pocketbase:8090`. No port is opened on the home router; this works behind the provider's NAT.
- **R-NET-2 (now)** SSL/TLS: "Always Use HTTPS" on, so `http://` redirects to `https://`.
- **R-NET-3 (now)** Off for `<host>`: Cloudflare Access, Rocket Loader, Email Address Obfuscation, Bot Fight Mode, Web Analytics with automatic setup (it adds its script to every HTML page). They rewrite pages or challenge the app's requests; an expiring Access cookie breaks an installed iPhone app. A zone-wide switch on the Free plan is fine while the zone's other names stay DNS-only.
- **R-NET-4 (now)** Two WAF custom rules on `<host>`, action **Block**:
  1. `starts_with(http.request.uri.path, "/_/")` — the dashboard;
  2. `starts_with(lower(http.request.uri.path), "/api/collections/_superusers/") or starts_with(lower(http.request.uri.path), "/api/collections/pbc_3142635823/")` — superuser sign-in and records, by the collection's name and by its id (PocketBase accepts both; the id is fixed in PocketBase's code). `lower()` because PocketBase finds a collection by name in any letter case (`_SuperUsers` reaches the login; the NAS project found it, 2026-11-27).

  The outer layer; R-PB-5 is what really holds. The id is there because PocketBase answers a wrong password with 400 and a right one with 403, which would tell an outsider a guess is right.
- **R-NET-5 (now)** Limits (explanation): request body up to 100 MB on the free plan (the app sends 1–2 MB per batch); an idle realtime stream is cut after ≈ **125 s** (PocketBase itself: 300 s); the app reconnects and re-reads changes (stage 4).
- **R-NET-6 (now, should)** A down-alert on `https://<host>/api/health` through Cloudflare and the tunnel (the planned Gatus check every minute with a Telegram alert meets it). Reason: helpers notice an outage only as "changes do not arrive".

**Administration** from home or over Tailscale only (`http://<nas-lan-ip>:8090/_/`), never from the internet.

**A home-only HTTPS name for the dashboard (optional)**, through the NAS's own reverse proxy (home network and Tailscale only), if: it routes only `/_/` and `/api/` and redirects `/` to `/_/` (the app is never used from it: another origin, no Google sign-in there); it overwrites `CF-Connecting-IP` with the real client address (Caddy: `header_up CF-Connecting-IP {remote_host}`), so the proxy's Docker subnet stays out of Superuser IPs unless the proxy only sees a Docker gateway; and the name never goes through the tunnel or Cloudflare's proxy.

## 5. Sign-in and Google

Why: users sign in with their Google accounts, and the app talks to Google Drive and Sheets from the new address.

- **R-AUTH-1 (now)** PocketBase `users` collection: password sign-in **off** (by default it is on); OAuth2 **on** with the Google provider (Client ID and secret of R-GOOG-1); field mapping: name → `name`, avatar URL → `avatar`. Google sign-in may create users; who sees which project is decided by the collection rules (stage 4). Password sign-in off does not stop the records API from creating users; stage 4's migrations set the `users` rules (R-PB-8) so users come only from Google sign-in.
- **R-AUTH-2 (now)** Auth token duration for users: **30 days** (2,592,000 s; the default is 5 days). The app refreshes it at every online start (stage 4). Reason: a helper's phone may stay offline or unused for weeks, and 5 days would force a new Google sign-in.
- **R-GOOG-1 (now)** The OAuth client is the owner's existing Google Cloud web client — the one whose Client ID the owner's connect link carries (it already has the Drive and Sheets scopes). Its client secret is typed into PocketBase settings only by the owner (encrypted by `PB_ENCRYPTION_KEY`). Google shows an existing secret only masked, so the owner may add a second one for PocketBase; the previous secret must stay enabled while the Firebase copy lives (Firebase Authentication's Google sign-in may use the same client and its secret); this repo's code and jobs use no client secret. If the client's consent screen is in "Testing" status, every helper's Google account should be on its test-user list, otherwise their sign-in is refused.
- **R-GOOG-2 (now)** On that client (Google Cloud Console → APIs & Services → Credentials) add:
  - authorized JavaScript origin `https://<host>`;
  - authorized redirect URIs `https://<host>/api/oauth2-redirect` (PocketBase popup sign-in) and `https://<host>/` (the manual code flow, and the app's Drive sign-in on iPhone, which redirects back to the app's own address).

Staying in Google: management sheets, drawings on Drive, Drive backups, the service account of the nightly sheets.

## 6. Server jobs

Why: today GitHub Actions run the backups and the nightly sheets against Firebase; for the NAS copy they run on the NAS, so the superuser API is never reachable from outside. This repo writes the job scripts; the NAS project runs them (ADR 0019).

| Today (GitHub Actions) | NAS copy (R-JOB-1) | Needs |
|---|---|---|
| `server-backup.yml`: Firestore JSON into `polevoy-backups`, cleanup, zip to Drive | PocketBase backup (R-BAK-1) + `nas-jobs.mjs backup` (R-BAK-2, R-BAK-3) | a GitHub fine-grained token (contents write on `polevoy-backups` only); the service-account key below (the owner shares the Drive file with it, as today); `jobs` superuser |
| `server-tables.yml` | `nas-jobs.mjs tables` | a **new key of the same service account** (same e-mail, so the sheets shared with it keep working); `jobs` superuser |
| `export-pool.yml` (Mondays) | stays in GitHub Actions (it reads `polevoy-backups`) | nothing new |

- **R-JOB-1 (stage 5)** The agent container: Node 22 with `git`, cron inside. It unpacks `nas-jobs.zip` of the same release (checksum `jobs.sha256`; its own `node_modules`, no npm install) and runs `node scripts/nas-jobs.mjs <command>`: `backup` daily 01:30 UTC (the JSON export into `polevoy-backups`, commit and push, then the cleanup, then the zip to the owner's Drive file), `tables` 00:00 and 07:20 UTC (sheets and «PDF с номерами»), `catch-up` at every container start (`backup` if its last success is over 24 h old). Configuration: `PB_URL` (`http://pocketbase:8090`), `PB_JOBS_EMAIL`; secret files read-only in `/run/secrets` (or `PM_SECRETS`): `pb_jobs_password`, `google_service_account.json`, `github_token`; a writable `/data` (or `PM_STATE`) for the clone and `state.json` (each command's last `ok`, `at`, `error`). Exit 0 on success, 1 with a one-line reason; no secret is printed.
- **R-JOB-2 (stage 5)** A job missed while the NAS was off runs at the next start (`catch-up`: backup and export) or the next night (sheets).

Three secrets then live on the NAS: the service-account key, the GitHub token, the `jobs` superuser password. A leaked service-account key is revoked alone in Google Cloud (IAM → Service accounts → Keys); the GitHub Actions key keeps working. Firebase jobs stay in GitHub Actions while the Firebase copy lives.

## 7. Backups

Why: the disk mirror is not a backup — it copies a deletion or a corruption to both disks at once.

- **R-BAK-1 (now)** PocketBase backups (Dashboard → Settings → Backups): cron `0 1 * * *` (01:00 UTC), keep **14**, into the separate backups folder (R-PB-3).
- **R-BAK-2 (stage 5, before the switch-over)** Two copies outside the home, each at most 26 hours behind:
  1. the daily JSON export in `polevoy-backups` (R-BAK-3), private on GitHub;
  2. a zip of the newest export in the owner's Google Drive file, made by the agent like `server-drive-backup.mjs` today (Drive keeps earlier versions ≈ 30 days).

  Both restore with the restore tool (§ 12). Until the switch-over Firebase is the main copy with its own off-site backups and the NAS holds test data, so it needs none. Copies inside the home do not replace these.
- **R-BAK-3 (stage 5)** A JSON export to the private repo `polevoy-backups` in today's format, so the existing restore path (the restore tool, `server-restore.mjs`, the app's «Импорт данных») and the starter-pool job keep working. It is made by `nas-jobs.mjs backup` (R-JOB-1).
- **R-BAK-4 (now)** A restore drill before the switch-over, then every 3 months, written down step by step:
  1. copy the newest backup zip to an empty folder and unpack it there;
  2. start a second PocketBase container from the same image with that folder as `--dir`, on another LAN port, without the tunnel;
  3. sign in to its dashboard from the home network;
  4. compare the record counts of each collection with the live one;
  5. stop and remove the test container and its folder.

  From stage 5 it also restores the newest JSON export with the restore tool.

Restoring for real (explanation): Dashboard → Settings → Backups → Restore replaces all data and restarts PocketBase; the phones then catch up by their normal reads.

## 8. Data volume and growth

Why: the folder sizes and the disk choice follow from the real data.

The owner's data (server backup of 2026-11-23; 2026-11-15 in brackets): 1,685 points (1,685), 11,858 history entries (11,023), full JSON of both projects 19.7 MB (18.4 MB), of it history ≈ 87 %; shared pool, allowed e-mails and settings 0.19 MB.

- Largest documents: a project 45 KB, a history entry 19 KB (the limit per JSON value: 2 MB). Growth ≈ 5 MB a month now, ≈ 13 MB a month during the first bulk imports (the upper bound used here); history older than a year is cleaned. Estimate: at most 200 MB of JSON a year, SQLite ≈ 2× → at most 0.5 GB; 14 backup zips at most 1 GB. Drawings ≈ 34 MB, on Google Drive.
- **R-DATA-1 (now)** A folder budget of **20 GB** on the mirror for `pb_data` and the backups together — more than ten times the estimate, so nobody needs to watch it.
- **Project files** (the owner's spreadsheets and PDFs, downloaded only through the app) are not in this version: they become a separate idea after the move. Sizes and the backup choice come with it.

## 9. Power and network

Why: the app is offline-first, so an outage must cost nothing but delay, and the NAS must come back by itself.

When the NAS, the home internet or Cloudflare is down (explanation): phones work offline from their own copy, writes wait (stage 4), the site opens from the cache, a cached sign-in works; a first install, a new sign-in and others' changes wait; Drive and Sheets keep working; jobs catch up (R-JOB-2). At home the app also goes through the tunnel.

- **R-POW-1 (now, should)** A UPS with a USB signal; the NAS shuts down cleanly on low battery. Reason: a power cut during a SQLite write is the one way to damage the data. (In place: § 11.)
- **R-POW-2 (now)** The NAS powers on by itself when power returns (UGOS power-recovery setting); the containers start by themselves (R-PB-2).
- **R-POW-3 (now)** The NAS time is synced by NTP: the app's delta reads compare against PocketBase's `updated` field, which is server time.

## 10. Acceptance checks

Why: the NAS project and the owner need a clear "done", and most of it can be checked by a tool.

The tool is `tools/nas-check.mjs` in this repo: Node 22, no dependencies, no credentials, changes nothing. Run it from a clone at the commit of this document's version line (tool and document move together): `node tools/nas-check.mjs https://<host>` (`--quick` skips the realtime hold of A7; `--help` explains); a pinned `node:22` container on the NAS is fine. Exit code 0 means no check failed.

| # | Check | How | Phase |
|---|---|---|---|
| A1 | `https://<host>/api/health` answers 200 through the tunnel | `nas-check` | now |
| A2 | `http://` redirects to `https://` | `nas-check` | now |
| A3 | `/_/` and the superuser login (by name, by id, by the name in mixed case) are blocked from the internet | `nas-check` | now |
| A4 | batch on | `nas-check` | now |
| A5 | password sign-in off, Google provider on | `nas-check` | now |
| A6 | no CORS for a foreign origin | `nas-check` | now |
| A7 | realtime connects through the tunnel and reconnects after a cut; the cut time is reported | `nas-check` | now |
| A8 | Cloudflare does not cache the app's files | `nas-check` | stage 4 (skipped before the first NAS build) |
| A9 | the site is the app built for `/` | `nas-check` | stage 4 (skipped before the first NAS build) |
| A10 | a PocketBase backup appears daily (now); the two off-site copies appear daily (stage 5) | by hand, a week after setup | now / stage 5 |
| A11 | the restore drill (R-BAK-4) done once | by hand | before the switch-over |
| A12 | power cut: clean shutdown on the UPS, power back, NAS and containers back without a hand | done at the NAS level on 2026-11-18; plus a NAS restart showing the `pm` containers and A1 back | now |
| A13 | the dashboard opens from the home network | by hand | now |
| A14 | Google sign-in from the installed iPhone app | by hand | stage 4 |
| A15 | the app's hooks answer `/api/pm/info` with `"app":"pm"` and a `schema` ≥ 1 (R-PB-8) | `nas-check` | stage 4 (skipped before the first NAS build) |

Everything marked "now" works on an empty PocketBase: A1–A7 pass with no app collections (`users` exists by default); A8, A9 and A15 skip until the site is there.

**When the app needs what.** Stage 4's code is self-checked on a local PocketBase, so it does not wait for the NAS; the owner's phone checks do:
- **first** (when stage 4's first phone-checked ticket goes live): A1–A7, A13, R-AUTH-1/2, R-GOOG-1/2 and the site updater (R-SITE-2); most urgent are the tunnel with its rules and the Google settings, since the owner first checks the sign-in from the installed icon;
- **then**, in stage 4: A8, A9, A15 (right after installing a release), A14;
- **before the switch-over**: A10 in full, A11, the agent (R-JOB-1).

If a check fails, the owner brings the tool's output to this repo's sessions.

## 11. Open questions for the NAS project

Why: the NAS project answered on 2026-11-24.

None open. Relied on: `pb_data` on the Btrfs mirror; the domain and DNS at Cloudflare, other names DNS-only; a UPS with NUT, power cut tested 2026-11-18; NTP; no SMTP; Compose stacks deployed over SSH; IPv6 off, only TCP 443 forwarded (not used by the app); Tailscale from `<tailnet>`; ≈ 5 GB of memory free.

## 12. What changes in later stages, and the move

- **Stage 4** (now): version 2026-11-25 (2) fixed the names (R-PB-8, R-SITE-2, R-JOB-1, R-MOVE-1) and moved PocketBase to 0.42.3. Version 2026-11-26: the release `nas-build` exists (its site is a placeholder until the sign-in ticket) and `nas-check` has A15. The first full `nas-check` through the tunnel passed on 2026-11-27 (8 pass, 3 skip; idle realtime cut after 125 s). Version 2026-11-27: the NAS project's two suggestions — `lower()` in R-NET-4 with a mixed-case probe in A3b, Web Analytics in R-NET-3. Next: the rehearsal result.
- **Stage 5** (the move, by the NAS project): the requirements below; this repo changes the document only if the NAS project's work shows something missing.

Each stage of this repo that changes the NAS side updates this document in the same session, with a new version line on top.

The move is the NAS project's (ADR 0019); this repo gives it the tools and needs to hear back.

- **R-MOVE-1 (stage 5)** The data move: the NAS project loads the owner's newest full server backup (Firebase, from `polevoy-backups`) into an empty PocketBase with this repo's restore tool: `node scripts/pb-restore.mjs <backup folder> --write --verify` (in `nas-jobs.zip`; `PB_URL`, `PB_SUPERUSER_EMAIL`, the password in the file named by `PB_SUPERUSER_PASSWORD_FILE`; without `--write` only the plan; `--resume` continues). It creates a user per member e-mail (Google sign-in links to it), maps old user ids, checks counts and compares every document. This repo rehearses it first and hands over steps, times and checks in `docs/nas-move-rehearsal.md`.
- **R-MOVE-2 (stage 5)** A parallel test of several days with the owner, then the switch-over: the NAS copy becomes the main one, the phones move to `https://<host>`, and Firebase stays readable as the way back (`server-restore.mjs` loads a NAS export back into Firebase, mapping users by e-mail, with `--force` for a database that is not empty). The NAS project does its steps with the owner; the phone steps and the app check after the move come from this repo. R-BAK-2, A10 and A11 must hold before the switch-over.
- **R-MOVE-3 (stage 5)** When the move is done, the NAS project sends this repo, through the owner, a report: what runs where (stacks, containers, folders, versions); how a new build and new migrations reach the NAS and how long it takes; where and when the owner checks a change after a push to `main`; how to restore and where the copies are; what the Firebase jobs should do now; how to tell the NAS side when this repo changes something it needs.

  This repo's last NAS step takes the report in: ADR 0011, `docs/workflow.md`, `CLAUDE.md` and `ВОССТАНОВЛЕНИЕ.md`.

