# What the Project Manager app needs from the NAS

Version: 2026-11-15, commit `11f01e9`. Owned by this repo (`kukilvan/project-manager-app`); the NAS project proposes changes through the owner.

This document tells the NAS project exactly what to set up so the owner's copy of the app (the **NAS copy**) can run on the home NAS, and how to check it. The decisions behind it are in ADR 0013 and ADR 0014 of this repo.

Conventions:

- **Placeholders**, never real values: `<host>` — the public hostname of the app (for example `pm.example.com`); `<domain>` — the owner's domain; `<nas-lan-ip>` — the NAS address on the home network; `<lan-subnet>` — the home network in CIDR form; `<docker-subnet>` — the subnet of the Docker network of the containers below (`docker network inspect`). Real values, keys, tokens and passwords stay with the NAS project and never come into this repo (it is public).
- Every requirement has an id `R-<AREA>-<n>` and a phase: **now** — can be done before any app change; **stage 4** — when the app gets PocketBase storage; **stage 5** — when the owner's copy moves to the NAS. "Must" and "must not" are checkable; a requirement written as a setting ("keep 7 days") is a must too; "should" is a recommendation with its reason.

## 1. Summary

Why: the NAS project needs the whole picture in one page before the details.

**What runs on the NAS.** One `pocketbase` container (the data and the built site), one `cloudflared` container (the tunnel), and from stage 5 one `agent` container (site updater and server jobs). Users: the owner and 2–6 helpers, from phones, mostly outside home, without any VPN app.

**What stays elsewhere.** Google: the sign-in identity, drawings and backups on Drive, management sheets. GitHub: the code, the build releases, the private backup repo `polevoy-backups`. Cloudflare: DNS of the domain, the tunnel, the firewall rules. GitHub Pages and Firebase keep serving everyone who is not on the NAS copy.

```text
phone (installed app) --HTTPS--> Cloudflare edge (<host>, WAF, no cache)
        --> Cloudflare Tunnel (outbound from the NAS, no open router port)
        --> cloudflared container --> http://pocketbase:8090
                                        /       the site (pb_public)
                                        /api/   PocketBase API
                                        /_/     dashboard (blocked from the internet)
home network --> http://<nas-lan-ip>:8090/_/  (the owner administers from home)
```

**The owner's checklist, with costs:**

| What | Cost | Notes |
|---|---|---|
| A domain | ≈ 40 ₪ a year | Cloudflare Registrar recommended: no nameserver move |
| A Cloudflare account | free | Free plan is enough |
| Docker on UGOS Pro | free | Two containers now, three from stage 5 |
| A UPS with USB | ≈ 300–500 ₪ once (estimate) | Recommended (R-POW-1) |
| Google Cloud OAuth client changes | free | R-GOOG-1, R-GOOG-2 |
| Disks | already there | Data on the HDD mirror (R-PB-3) |

## 2. PocketBase

Why: PocketBase holds the data and serves the site; its version, flags and settings decide whether the app works and stays safe.

- **R-PB-1 (now)** PocketBase **0.40.6**, linux amd64 (the DXP2800 is x86-64), in Docker. There is no official image: build it with the Dockerfile below, which checks the release zip's SHA-256 (`0e1f609158ed945f809f8a02ae012aa0427129c66ebb63c1aee76f2c0309373f` for `pocketbase_0.40.6_linux_amd64.zip`, from the release's `checksums.txt`). The version must not change automatically: no Watchtower or similar on these containers. PocketBase is before 1.0 and minor versions break things; the version changes only when this document says so.
- **R-PB-2 (now)** Start flags exactly: `serve --http=0.0.0.0:8090 --dir=/pb/pb_data --publicDir=/pb/pb_public --migrationsDir=/pb/pb_migrations --hooksDir=/pb/pb_hooks --origins=https://<host> --encryptionEnv=PB_ENCRYPTION_KEY --dev=false`. Environment: `PB_ENCRYPTION_KEY` (exactly 32 random characters, for example from `openssl rand -hex 16`; with any other length PocketBase does not start: `crypto/aes: invalid key size`, and the container restarts in a loop), `GOMEMLIMIT=512MiB`, `TZ=UTC`. Open-files limit ≥ 4096. Restart policy `unless-stopped`. Health check `GET /api/health`. `--dev=false` matters: otherwise every SQL statement is logged.
- **R-PB-3 (now)** Storage on the HDD mirror (RAID 1): `pb_data` in a dedicated shared folder; `pb_data/backups` mounted from a **separate** folder (R-BAK-1, R-BAK-2). `pb_public`, `pb_migrations` and `pb_hooks` are folders the app fills (stages 4–5); until then `pb_public` holds a one-line placeholder `index.html`. Reason: the data is small (under 1 GB for years), SQLite on HDD is ample for 2–6 people, and the mirror survives one disk failure. If the NVMe becomes a storage pool with its own redundancy, the NAS project may move the data there.
- **R-PB-4 (now)** Port 8090 is published on `<nas-lan-ip>` only (the owner's dashboard). It must never be forwarded on the router. The tunnel reaches PocketBase over the Docker network.
- **R-PB-5 (now)** Dashboard → Settings → Application:
  - Application URL (`appURL`) = `https://<host>`.
  - Batch API **on**: max requests 500, timeout 10 s, max body size 0 (server default). Batch is off by default and the app needs it.
  - Trusted proxy (user IP) header: `CF-Connecting-IP`.
  - Superuser IPs: `<lan-subnet>` and `<docker-subnet>`.

  The last two go together. Without the header, every request through the tunnel comes from `cloudflared`'s Docker address, so the internet would pass the superuser IP list, and logs and rate limits would see one client. With it, a superuser login, or even a valid superuser token, used from outside gets 403. A device on the home network can forge `CF-Connecting-IP`, but only to look like another address: accepted.
- **R-PB-6 (now)** Rate limiting **on**, with exactly these rules (the defaults would break the app: PocketBase counts every request inside a batch against the rules, so a 100-record batch fails at its 21st record under the default `*:create` rule):

  | Label | Audience | Max requests | Per |
  |---|---|---|---|
  | `*:auth` | all | 2 | 3 s |
  | `*:create` | `@guest` | 20 | 5 s |
  | `/api/batch` | all | 10 | 1 s |
  | `/api/` | `@guest` | 300 | 10 s |
  | `/api/` | `@auth` | 5,000 | 10 s |

  From stage 5 the agent container's address goes in the excluded list.
- **R-PB-7 (now)** Superusers: one personal account for the owner with a strong password; from stage 5 a separate `jobs` superuser for the agent. Create one from the NAS shell with `docker exec <pocketbase container> /pb/pocketbase superuser upsert <email> <password> --dir=/pb/pb_data --encryptionEnv=PB_ENCRYPTION_KEY`, or with the one-time installer link PocketBase prints in its log at the first start (with `<nas-lan-ip>` in place of `0.0.0.0`). Every PocketBase command run in the container needs the same `--dir` and `--encryptionEnv` as `serve`; without them it fails with «missing encryption key». MFA with e-mail OTP should be turned on once SMTP is set (the `superuser otp` command is the fallback); it is not required, because superuser access is LAN-only (R-PB-5, R-NET-4).
- **R-PB-8 (stage 4)** Collections, API rules and indexes come as migration files from this repo into `pb_migrations`; the NAS project must not create collections by hand. A migration applies when PocketBase starts. How the files reach the NAS (by hand or by the agent) is decided in stage 4.
- **R-PB-9 (now)** Settings → Logs: keep 7 days; IP logging on.

**`PB_ENCRYPTION_KEY`** encrypts the stored settings (the Google client secret, SMTP), not the data. Keep it with the NAS project's secrets. If it is lost, PocketBase still starts and the data is intact, but those settings must be entered again.

Dockerfile (R-PB-1):

```dockerfile
FROM alpine:3.22
ARG PB_VERSION=0.40.6
ARG PB_SHA256=0e1f609158ed945f809f8a02ae012aa0427129c66ebb63c1aee76f2c0309373f
RUN apk add --no-cache ca-certificates \
 && wget -q -O /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" \
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
    image: pm-pocketbase:0.40.6
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
      - "<nas-lan-ip>:8090:8090"   # home network only
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
    image: cloudflare/cloudflared:2026.11.0
    command: tunnel --no-autoupdate run
    environment:
      TUNNEL_TOKEN: ${TUNNEL_TOKEN}             # from .env, never in git
    depends_on:
      pocketbase: { condition: service_healthy }
    restart: unless-stopped
```

The `.env` file next to it holds `PB_ENCRYPTION_KEY` and `TUNNEL_TOKEN`, readable only by the NAS administrator.

## 3. The site on the NAS

Why: the owner wants the site at home too, on the same hostname as the data, and it must update itself when this repo changes.

- **R-SITE-1 (stage 5)** The site is this app built with `VITE_BASE=/`, served by PocketBase from `pb_public` at `https://<host>/`. Unknown paths fall back to `index.html` (PocketBase default). One hostname for the site and the API: no CORS, one tunnel route, one Google origin, and the app finds PocketBase at its own origin, so the address never enters this repo.
- **R-SITE-2 (stage 5)** Delivery by pull. The agent checks `https://github.com/kukilvan/project-manager-app/releases/download/nas-build/nas-site.json` (`commit`, `version`, `builtAt`, `sha256`) every 10 minutes. On a new `commit` it downloads `nas-site.zip` from the same release, checks `sha256`, unpacks into `site-<commit>/` and switches the folder PocketBase serves to it (a symlink swap or a rename; stage 5 checks which works on UGOS). PocketBase reads the folder on every request, so no restart is needed. The agent keeps the previous two builds. A failed download or checksum leaves the current site untouched and logs the error. Switching back to the previous build is a documented manual step. No secret is involved: the repo is public and nothing reaches into the NAS.
- **R-SITE-3 (now, stage 5)** Cloudflare must not cache the app's files: a Cache Rule "Bypass cache" for hostname `<host>`. PocketBase sends no `Cache-Control`, and without it Cloudflare keeps `.js` files (including the service worker `sw.js`) at the edge for up to 2 hours after a deploy. The traffic is small, so bypassing costs nothing.

Explanations (no action):

- **Service worker and updates.** Installed apps update themselves within one start after the switch. The first start from the new address installs the app anew: a new origin has its own storage, so every phone installs the icon and connects again (ADR 0013).
- **The NAS is off while a deploy goes out.** GitHub Pages gets the new build; the NAS catches up at its next check after it starts. The owner checks the NAS copy only once its build shows the new commit.

## 4. Access from outside

Why: phones must reach the NAS from anywhere over HTTPS, without a VPN app and without opening the home router.

- **R-NET-1 (now)** A remotely managed Cloudflare Tunnel (Zero Trust → Networks → Tunnels). `cloudflared` runs in Docker with the tunnel token (kept by the NAS project), version pinned (2026.11.0 at the time of writing), with `--no-autoupdate`. Public hostname `<host>` → service `http://pocketbase:8090`. No port is opened on the home router; this works behind the provider's NAT.
- **R-NET-2 (now)** SSL/TLS: "Always Use HTTPS" on, so `http://` redirects to `https://`.
- **R-NET-3 (now)** Off for `<host>`: Cloudflare Access, Rocket Loader, Email Address Obfuscation, Bot Fight Mode. They rewrite pages or challenge the app's own requests; an expiring Access cookie breaks an installed iPhone app (offline start, background sync, the sign-in popup).
- **R-NET-4 (now)** Two WAF custom rules on `<host>`, action **Block**:
  1. `starts_with(http.request.uri.path, "/_/")` — the dashboard;
  2. `starts_with(http.request.uri.path, "/api/collections/_superusers/") or starts_with(http.request.uri.path, "/api/collections/pbc_3142635823/")` — superuser sign-in and records, by the collection's name and by its id (PocketBase accepts both; the id is fixed in PocketBase's code).

  These are the outer layer. What really holds is R-PB-5: a superuser login with the right password from outside gets 403 even without these rules. The id is in rule 2 because PocketBase answers a wrong password with 400 and a right one with 403, so a login attempt that reaches it tells an outsider whether a guessed password is right.
- **R-NET-5 (now)** Limits that matter (explanation): request body up to 100 MB on the free plan (the app sends at most 1–2 MB per batch); Cloudflare waits at most **125 s** for data from the origin, so an idle realtime stream is cut after ≈ 125 s (PocketBase itself closes it after 300 s idle; the app reconnects and re-reads changes, stage 4); one hostname, so CORS is not involved.
- **R-NET-6 (now, should)** A down-alert: Cloudflare's Tunnel health notification (an e-mail when the tunnel is down), or a free external monitor on `https://<host>/api/health` every 5 minutes. Reason: helpers notice an outage only as "changes do not arrive".

**Remote administration.** The owner administers PocketBase only from home, by design. If administration from outside is ever needed, it gets a second hostname behind Cloudflare Access, decided then, never a hole in R-NET-4.

## 5. Sign-in and Google

Why: users sign in with their Google accounts, and the app talks to Google Drive and Sheets from the new address.

- **R-AUTH-1 (now)** PocketBase `users` collection: password sign-in **off** (by default it is on); OAuth2 **on** with the Google provider (Client ID and secret of R-GOOG-1); field mapping: name → `name`, avatar URL → `avatar`. Creating a user by Google sign-in stays allowed: who sees which project is decided by the collection rules (stage 4), as in Firestore today. Password sign-in off does not stop the records API from creating users (the default create rule lets anyone; such a user cannot sign in and sees nothing); stage 4's migrations set the `users` rules (R-PB-8) so that users come only from Google sign-in.
- **R-AUTH-2 (now)** Auth token duration for users: **30 days** (2,592,000 s; the default is 5 days). The app refreshes it at every online start (stage 4). Reason: a helper's phone may stay offline or unused for weeks, and 5 days would force a new Google sign-in.
- **R-GOOG-1 (now)** The OAuth client is the owner's existing Google Cloud web client — the one whose Client ID the owner's connect link carries (it already has the Drive and Sheets scopes). Its client secret goes only into PocketBase settings (encrypted by `PB_ENCRYPTION_KEY`). If the client's consent screen is in "Testing" status, every helper's Google account should be on its test-user list, otherwise their sign-in is refused.
- **R-GOOG-2 (now)** On that client (Google Cloud Console → APIs & Services → Credentials) add:
  - authorized JavaScript origin `https://<host>`;
  - authorized redirect URIs `https://<host>/api/oauth2-redirect` (PocketBase popup sign-in) and `https://<host>/` (the manual code flow, and the app's Drive sign-in on iPhone, which redirects back to the app's own address).

What stays in Google (explanation): management sheets (ADR 0009), drawings on Drive (≈ 34 MB, not moved), backups on Drive, and the service account that writes the nightly sheets.

## 6. Server jobs

Why: today GitHub Actions run the backups and the nightly sheets against Firebase; for the NAS copy they run on the NAS, so the superuser API is never reachable from outside.

| Today (GitHub Actions) | NAS copy | Runs | Needs |
|---|---|---|---|
| `server-backup.yml` → Firestore JSON into `polevoy-backups` | PocketBase built-in backup (R-BAK-1) + a JSON export in the `polevoy-import-1` backup format into `polevoy-backups` (R-BAK-3) | PocketBase cron; agent, daily | a GitHub fine-grained token, contents write on `polevoy-backups` only |
| `server-cleanup.mjs` | the same rule (permanently delete what was marked deleted over a year ago, and history entries older than a year) on PocketBase | agent, after the export | `jobs` superuser |
| `server-drive-backup.mjs` | the off-site copy of the backup zips (R-BAK-2) | UGOS Cloud Sync or agent | Drive access of the chosen method |
| `server-tables.yml` (00:00 UTC, retry 07:20 UTC) | the same sheets, reading PocketBase | agent, same times | a **new key of the same service account** (same e-mail, so the sheets already shared with it keep working); `jobs` superuser; internet to Google |
| `export-pool.yml` (Mondays) | unchanged, stays in GitHub Actions (it reads `polevoy-backups`) | GitHub | nothing new |
| — | site updater (R-SITE-2) | agent, every 10 min | nothing |

- **R-JOB-1 (stage 5)** The agent container: Node 22, its code from the same release as the site (an asset of `nas-build`), cron inside; secrets as files mounted read-only; it talks to PocketBase as `http://pocketbase:8090` over the Docker network.
- **R-JOB-2 (stage 5)** A job missed while the NAS was off runs at the next start (backup, export) or the next night (sheets).

Three secrets then live on the NAS: the service-account key, the GitHub token, the `jobs` superuser password. **If the service-account key leaks from the NAS**, revoke that key in Google Cloud (IAM → Service accounts → Keys); the GitHub Actions key is a different key of the same account and keeps working. Firebase jobs keep running in GitHub Actions while the Firebase copy lives.

## 7. Backups

Why: the disk mirror is not a backup — it copies a deletion or a corruption to both disks at once.

- **R-BAK-1 (now)** PocketBase backups (Dashboard → Settings → Backups): cron `0 1 * * *` (01:00 UTC), keep **14**, into the separate backups folder (R-PB-3).
- **R-BAK-2 (now)** Off-site: the backups folder is copied off the NAS daily — UGOS Cloud Sync (one-way upload) to a Google Drive folder, or an rclone container. Off-site holds at least the last **7** daily backups and is at most 26 hours behind.
- **R-BAK-3 (stage 5)** A JSON export to the private repo `polevoy-backups` in today's format, so the existing restore path (`server-restore.mjs`, the app's «Импорт данных») and the starter-pool job keep working.
- **R-BAK-4 (now)** A restore drill before the move, then every 3 months, written down step by step:
  1. copy the newest backup zip to an empty folder and unpack it there;
  2. start a second PocketBase container from the same image with that folder as `--dir`, on another LAN port, without the tunnel;
  3. sign in to its dashboard from the home network;
  4. compare the record counts of each collection with the live one;
  5. stop and remove the test container and its folder.

Restoring for real (explanation): Dashboard → Settings → Backups → Restore replaces all data and restarts PocketBase; the phones then catch up by their normal reads.

## 8. Data volume and growth

Why: the folder sizes and the disk choice follow from the real data.

The owner's data (server backup of 2026-11-15):

| | Project 1 | Project 2 | Total |
|---|---|---|---|
| Documents | 7,319 | 8,508 | 15,827 (+ shared pool ≈ 0.2 MB) |
| Points | 1,292 | 393 | 1,685 |
| History entries | 5,472 | 5,551 | 11,023 |
| Full JSON | 11.7 MB | 6.7 MB | 18.4 MB |
| of it history | 10.6 MB | 5.4 MB | 16.0 MB (87 %) |

- Largest single documents: a history entry 19 KB, a project document 45 KB, a cable pull 9 KB, a point under 1 KB — far below PocketBase's 1 MB limit per JSON value.
- Growth: history spans 5½ weeks including bulk imports, so ≈ 13 MB a month is an upper bound; history older than a year is cleaned.
- Estimate: at most 200 MB of JSON a year; SQLite with indexes ≈ 2× → at most 0.5 GB; 14 backup zips at most 1 GB. Drawings ≈ 34 MB, on Google Drive.
- **R-DATA-1 (now)** A folder budget of **20 GB** on the mirror for `pb_data` and the backups together — more than ten times the estimate, so nobody needs to watch it.

## 9. Power and network

Why: the app is offline-first, so an outage must cost nothing but delay, and the NAS must come back by itself.

What happens when the NAS, the home internet or Cloudflare is down (explanation): phones keep working offline from their own copy; writes wait and are sent later (stage 4 builds this); the site opens from the phone's cache; a cached sign-in works. Impossible meanwhile: a first install, a new sign-in, a new helper joining, seeing others' changes. Google Drive and Sheets actions keep working (they go to Google directly). Server jobs skip and catch up (R-JOB-2). At home the app also goes through the tunnel, so without internet it works offline at home too.

- **R-POW-1 (now, should)** A UPS with a USB signal (≈ 600–700 VA covers the NAS and the router); the NAS shuts down cleanly on low battery. Reason: a power cut during a SQLite write is the one way to damage the data.
- **R-POW-2 (now)** The NAS powers on by itself when power returns (UGOS power-recovery setting); the containers start by themselves (R-PB-2).
- **R-POW-3 (now)** The NAS time is synced by NTP: the app's delta reads compare against PocketBase's `updated` field, which is server time.

## 10. Acceptance checks

Why: the NAS project and the owner need a clear "done", and most of it can be checked by a tool.

The tool is `tools/nas-check.mjs` in this repo: Node 22, no dependencies, no credentials, changes nothing. Run it from a clone of the repo: `node tools/nas-check.mjs https://<host>` (`--quick` skips the realtime hold of A7; `--help` explains). Exit code 0 means no check failed.

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

Everything marked "now" works on an empty PocketBase: A1–A7 pass with no app collections (`users` exists by default); A8 and A9 skip until the site is there. Stage 4 of the app starts when A1–A7 and A10–A13 pass and the owner says the NAS is reliable. If a check fails, the owner brings the tool's output to this repo's sessions.

## 11. Open questions for the NAS project

Why: the NAS project had decided nothing when this was written; these are its choices, and the rest of the document works with any answer.

1. NVMe: cache or a storage pool? (The data goes on the mirror either way, R-PB-3.)
2. The domain and the app's hostname (a subdomain such as `pm.<domain>` keeps the bare domain free); the registrar (Cloudflare Registrar recommended).
3. The UPS model, and whether UGOS Pro talks to it over USB.
4. The off-site method (UGOS Cloud Sync or rclone) and which Google account holds the copy.
5. SMTP for superuser MFA (optional, R-PB-7).
6. Docker on UGOS Pro: the built-in Docker app with Compose projects, or something else; which shared folders.

## 12. What changes in later stages

Why: this document will move; the NAS project should know which parts.

- **Stage 4** (PocketBase storage in the app): migrations and possibly hooks (`pb_migrations`, `pb_hooks`), the PocketBase version confirmed or moved, A14.
- **Stage 5** (the move): the release `nas-build`, the agent container with its secrets, the JSON export, the move of the owner's data, the switch-over of the server jobs.

Each of those stages updates this document in the same session, with a new version line on top.
