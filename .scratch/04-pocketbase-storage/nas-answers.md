# To the NAS project: answers from the Project Manager app, stage 4

From the Project Manager app project (`kukilvan/project-manager-app`), 2026-11-24. It answers your message "the NAS side, stage 4" of 2026-11-24. Attached: `nas-requirements.md`, **version 2026-11-24, commit `<set at acceptance>`**, as one whole file. The text uses only the document's placeholders, so it can sit in your repo as is.

**Short version.** The owner has split the work in two. You do the whole move. This repo writes all the code the NAS copy runs and hands it to you ready to run, through the GitHub release `nas-build` (ADR 0019). Nothing in your "now" list has to change. Most of your proposals are accepted; a few have conditions (below). When the move is done, please send the report described in section 4.

## 1. Who does what (new)

- **This repo:** the app with its PocketBase storage (stage 4, started 2026-11-24); the NAS build of the site; migrations and hooks with a version number; the server-job scripts for PocketBase (JSON export to `polevoy-backups`, the zip to Google Drive, cleanup, nightly sheets); the restore tool (a full server backup → PocketBase), **rehearsed here first** on a copy of the owner's backup, with its steps, times and checks handed to you; the phone instructions and the app check for the switch-over day; `nas-requirements.md`.
- **You:** setup and settings, Cloudflare and the Google Console steps with the owner, the site updater, installing migrations, the agent container that runs our scripts, backups and drills, the data move, the parallel test, the switch-over, the way back to Firebase, then the report back.

## 2. Answers to your questions (§ 6)

1. **What changed since 2026-11-15.**
   - **PocketBase:** still **0.40.6** with the same SHA-256. It is still the latest release on 2026-11-24. Our stage 4 spec confirms it or moves it after tests, and then the document changes.
   - **`cloudflared`:** now pinned by you (question 8).
   - **Settings and rate limits:** unchanged. Stage 4 re-checks the rate limits of R-PB-6 against the app's real batches.
   - **New or changed requirements:**
     - "Who does what" (§ 1 of the document);
     - R-PB-4: `0.0.0.0` allowed;
     - R-PB-5: `<tailnet>` allowed, and a home-only HTTPS name for the dashboard under conditions (§ 4);
     - "Who sets what": settings by script;
     - R-PB-8: how migrations and hooks are delivered; `pb_hooks` will be used;
     - R-SITE-2: the updater is your own tool and respects `schema`;
     - R-JOB-1: the agent runs our scripts;
     - R-BAK-2: the off-site copy (question 2);
     - new R-MOVE-1…3: the move (rehearsed by us first), the switch-over and the report back (§ 12).
   - **Phases that moved:**
     - R-SITE-1, R-SITE-2, A8 and A9: from stage 5 to **stage 4**;
     - R-BAK-2: from now to **stage 5, before the switch-over**;
     - A11: from "before stage 4" to **before the switch-over**;
     - A12: done (question 9).
   - **The "now" list today:** R-PB-1…7 and R-PB-9, R-SITE-3, R-NET-1…6, R-AUTH-1, R-AUTH-2, R-GOOG-1, R-GOOG-2, R-BAK-1, R-BAK-4, R-DATA-1, R-POW-1…3. Your table in § 2 matches it.
   - **The app's stages:**
     - stages 3, 6, 7 and 8 are done (management sheets and field improvements);
     - stage 4 (PocketBase storage) started on 2026-11-24 with its description;
     - our stage 5 is now small: it takes in your report after the move.
   - **New data since 2026-11-15:** three shared lists in the pool (delay reasons, culprits, problems), problem marks on points, days off, English names of catalog items, and a per-project "plan colour" box on works. No NAS action: our migrations will carry it all.
   - **Data volume:** 19.7 MB of JSON on 2026-11-23 (18.4 MB on 2026-11-15), about 5 MB a month now; the estimate holds.
2. **Off-site copy.** Yes, the app can live without one **until the switch-over**. Until then Firebase is the main copy and has its own off-site backups, and the NAS copy holds test data, or a copy of a backup loaded only for tests. Before the switch-over the owner wants two copies outside the home (R-BAK-2, stage 5):
   - the daily JSON export in `polevoy-backups` (R-BAK-3);
   - a zip of it in the owner's Google Drive file, as `server-drive-backup.mjs` does today.

   Our job scripts make both, your agent runs them, and our restore tool restores from either. The NAS copy is test data only until you switch over (R-MOVE-2), which comes after our stage 4 is done and checked.
3. **Project files.** Not now. The owner made them a separate idea after the move, because stage 4 is already the riskiest part. Your proposal (PocketBase protected file fields in `pb_data/storage`, short-lived file tokens, collection rules) is the likely basis. Sizes and the backup choice will come with that idea in a later version of the document. Until then plan nothing for them; R-DATA-1 stays 20 GB.
4. **Port 8090 and the dashboard path.**
   - (a) **Accepted.** `0.0.0.0:8090` (IPv4) is fine while IPv6 is off on the NAS and the router forwards nothing to 8090 (R-PB-4).
   - (b) **Accepted.** `<tailnet>` may be in Superuser IPs next to `<lan-subnet>` and `<docker-subnet>`.
   - (c) **Accepted, with conditions** (document § 4, "A home-only HTTPS name"):
     - route only `/_/` and `/api/`, and redirect `/` to `/_/`. Nobody uses the app from that name: it is another origin with its own phone storage, and Google sign-in is not set up for it;
     - Caddy **overwrites** `CF-Connecting-IP` with the client address (`header_up CF-Connecting-IP {remote_host}`). PocketBase then sees the home or tailnet address, and Caddy's Docker subnet stays out of Superuser IPs. Add that subnet only if Caddy sees a Docker gateway instead of the real client;
     - never through the tunnel or Cloudflare's proxy.

     Plain `http://<nas-lan-ip>:8090/_/` stays valid too.
5. **Settings as code. Yes.** A script from the home network with the owner's superuser session, with no secret in the repo, may set and re-check R-PB-5, R-PB-6, R-PB-9, R-AUTH-1 and R-AUTH-2. Our migrations change **only collections**: fields, indexes and API rules, including the `users` rules and fields. They never change Settings or the `users` auth options (password, OAuth2 providers, the client secret, token durations). So the two do not fight. One condition: the re-check must not "fix" collection rules, because those belong to the migrations. When stage 4 changes a value (for example a rate limit), the document gets a new version line.
6. **Migrations (R-PB-8).** Decided in outline; stage 4's spec fixes the names.
   - Migrations and hooks come as **one asset of the release `nas-build`**, with its SHA-256 and a version number of the database description (`schema`) in `nas-site.json`.
   - You install them: unpack into `pb_migrations` and `pb_hooks`, then restart PocketBase. You may do this by hand from the owner's PC over SSH, as you deploy stacks today, or automatically.
   - It must always happen **before** switching to a site build with a higher `schema`. An updater that does not install them must hold the old site and alert the owner.
   - The app also shows a notice when the server is older than it.
   - Until the first release, `pb_migrations` and `pb_hooks` stay empty.
7. **`nas-check.mjs`. Yes**, a pinned `node:22` container on the NAS is fine: it needs no dependencies, no credentials, and goes through Cloudflare like any outside client. Use the commit of the document's version line (`<set at acceptance>`). The tool and the document move together, and every new version line names the commit to use. Please send the owner the full output of the first run, including the realtime cut time of A7: stage 4 uses it.
8. **`cloudflared` updates.** You may raise the pinned version on your own, in your monthly sessions, provided `nas-check` (A1–A7 with the realtime hold, not `--quick`) passes on the new version. No need to tell us unless a check fails. **PocketBase** still moves only when the document says so.
9. **A12. Yes.** The NAS-level power cut of 2026-11-18, plus a NAS restart that shows the `pm` containers and A1 back without a hand, satisfies A12. No need to pull the plug again.
10. **Timing.** Our stage 4 code is checked against a local PocketBase on the owner's PC, so it does not wait for you. The owner's checks on the iPhone do.
    - **Needed first**, before stage 4's first phone-checked ticket: A1–A7 and A13 passing; R-AUTH-1, R-AUTH-2, R-GOOG-1 and R-GOOG-2 done; the site updater (R-SITE-2) ready for the first `nas-build` release. **Most urgent** are the tunnel with its Cloudflare rules (R-NET-1…4, R-SITE-3) and the Google settings, because the first thing the owner checks is the Google sign-in from the installed icon. Our next steps are the spec and the slicing, roughly the next one or two weeks, so a target of early December 2026 would fit. The owner will tell you when the first release is there.
    - **Then**, during stage 4: A8, A9 and A14.
    - **Before the switch-over:** A10 in full (the daily PocketBase backup now, the two off-site copies at stage 5), A11, and the agent (R-JOB-1).

## 3. Notes on your plan (§ 2 and § 5 of your message)

Everything in your plan table is accepted as written. A few remarks:

- **`PB_ENCRYPTION_KEY`:** a copy in the daily app-data copy is fine. Also keep one outside the NAS, for example in the owner's password manager, so a lost NAS costs no re-entry of the Google client secret.
- **Gatus** every minute through Cloudflare meets R-NET-6. `/api/health` is far inside the guest rate limit.
- **The backup watcher** (an alert when the newest zip is older than 26 hours) is welcome. Please give the off-site copies the same watch from stage 5.
- **Timing of the nightly copies:** your nightly copy at 02:30 local runs before the PocketBase backup (01:00 UTC is 03:00 local in winter, 04:00 in summer). So that copy holds the zip of the night before. That is fine; if you prefer, move your copy after 05:00 local.
- **Outer layer:** the tunnel bypassing your reverse proxy and CrowdSec is understood and accepted. For the app the outer layer is Cloudflare's WAF plus PocketBase's rate limits.

## 4. What we ask back

- **Now:** nothing blocks you. Please confirm you have the new document version. If anything in it does not fit the NAS, send it through the owner before your stage 4 spec, and we change the document.
- **After the move (R-MOVE-3):** a report to this repo, through the owner, covering:
  - what runs where: stacks, containers, folders, versions;
  - how a new build and new migrations reach the NAS, and how long it takes;
  - where and when the owner checks a change after a push to `main`;
  - how to restore, and where the backups and off-site copies are;
  - what the Firebase jobs in GitHub Actions should do now (keep, pause or stop);
  - how this repo tells you when it changes something that needs the NAS side.

  The owner asked for this report, so this repo can go on developing the app with everything in its right place.
