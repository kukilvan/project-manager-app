Status: accepted

# Stage 2. What the app needs from the NAS — description

## Goal

The owner is setting up a home NAS (UGREEN DXP2800, 2×3 TB HDD mirror, 500 GB NVMe) in a separate project. When they trust it, their copy of the app moves there: PocketBase for the data (ADR 0012) and the site itself. The NAS project needs one document that says exactly what this app requires, so it can be set up without guessing and checked when it is done. This stage writes that document. The app's code does not change.

## What the owner will see at the end

- `docs/nas-requirements.md` in the repo, in English, for the sessions of the NAS project. The owner gives the NAS project a link to the file on GitHub. Its parts:
  1. **Summary.** What runs on the NAS and why, in a few lines. There is a short checklist of what to buy and set up: a domain, a Cloudflare account, Docker containers, and an optional UPS.
  2. **PocketBase.** Version, container, where the data and the backups live (NVMe or HDD), ports. Also the settings this app needs: batch API on, request size limits, CORS, Google OAuth2 provider, realtime.
  3. **The site on the NAS.** A static web server for the built app, its base path and HTTPS. How a new build reaches the NAS when `main` changes. The service worker and updates.
  4. **Access from outside.** A Cloudflare Tunnel to the owner's own domain. One address for the site and one for PocketBase, or one address with paths. Limits of Cloudflare's free plan that matter (request size, idle connections for realtime). No ports opened on the home router.
  5. **Sign-in and Google.** Google sign-in through PocketBase (OAuth client, redirect address). The new origin is added to the OAuth client for Drive and Sheets. What stays in Google: management sheets, Drive backups, drawings on Drive.
  6. **Server jobs.** Backup, management sheets, cleanup and starter pool run in GitHub Actions today. The document says where each runs for the NAS copy and what it needs: secrets, schedule, network access.
  7. **Backups.** The disk mirror is not a backup. Required: PocketBase backups on the NAS, an off-site copy (Google Drive and/or the private GitHub repo), and a tested restore.
  8. **Data volume and growth.** Numbers from the real data, see "Facts".
  9. **Power and network.** What happens when the NAS or the home internet is down. The app works offline and syncs later. A UPS is recommended.
  10. **Acceptance checks.** How the NAS project and the owner see that the NAS meets the document.
  11. **Open questions for the NAS project.**
- No change on the live site, no new screens, so no mockups.

## Facts found while describing

- Latest auto-backup (2026-11-13): two projects, ≈ 1,700 points, ≈ 10,500 history records, ≈ 15,000 documents in all. The full JSON of both projects is ≈ 18 MB; the shared pool, allowed e-mails and settings ≈ 0.2 MB. Drawings (PDF) are on Google Drive with a copy on each device. Their total size is not counted yet.
- Server jobs today (`docs/code-map.md`, "Server jobs"): `server-backup.yml` every 2 days runs backup, then cleanup, then the Drive zip; `server-tables.yml` runs nightly; `export-pool.yml` runs on Mondays. They use the secrets `FIREBASE_SERVICE_ACCOUNT` and `BACKUP_REPO_TOKEN`.
- The site is built with `VITE_BASE=/project-manager-app/` (ADR 0001). Another host means another base and new OAuth origins.
- The connection to a database lives on each device (`pm.connection`) and in the connect link, never in code (ADR 0004). A PocketBase address can live there the same way, so the domain never enters the public repo.

## In scope

- Research of what PocketBase needs for this app: the collections behind the repo interface, auth with Google, rules matching `firestore.rules` (members are equal, ADR 0003), batch writes, realtime, a server time field for delta reads, file size limits.
- Research of the site on the NAS: build, base path, deploy from `main`, service worker.
- Cloudflare Tunnel with the owner's own domain: setup needs and free-plan limits.
- Where the server jobs run for the NAS copy, and what each needs.
- Backups and restore.
- The list of external dependencies (GitHub, Google Cloud, Firebase while it stays, Cloudflare, the domain registrar).
- Open questions for the NAS project.
- `docs/nas-requirements.md`; ADR 0013 (site and PocketBase on the NAS behind a Cloudflare Tunnel); `docs/project-spec.md` stage 2 points to this description.

## Out of scope

- Any change to the app's code or the live site. The PocketBase backend is stage 4, the move is stage 5.
- Setting up the NAS itself (that is the NAS project), buying the domain or making accounts (the owner does it).
- Real addresses, the domain name, IPs, Tailscale names, keys and passwords in the repo. The repo is public (ADR 0005); the NAS project keeps them.
- Moving drawings off Google Drive. They stay on Drive for now (see open questions).
- Management sheets: they stay in Google (ADR 0009, ADR 0012).

## Pulled-in known issues and wishes

- `KNOWN_ISSUES.md`: no open entry fits this stage. KI-3 is about `tools/same-code.mjs`.
- Wishes of «Ревью 1» are about editing code: shorter header sentences, rule 10 for comments, KI-3 when two `same-code` runs collide. This stage changes no code, so they wait for stage 3.
- No ideas filed for the stage.

## Decisions taken with the owner

1. **The site moves to the NAS too, not only the data.** The owner wants everything at home. The cost: a new address, so every iPhone installs the icon again and connects again. The site also needs a deploy to the NAS. GitHub Pages stays for everyone else: ADR 0004, one site for all, and other users keep Firebase or on-device mode.
2. **The NAS copy is used by the owner and the helpers.** Access must be simple for helpers' phones, with no VPN app to install. So the address is public HTTPS, and PocketBase sign-in protects the data.
3. **Access is a Cloudflare Tunnel to the owner's own domain** (about 40 ₪ a year, paid by the owner by card). It gives a short stable address, and no ports are opened on the router. Tailscale (an app on every phone) and Tailscale Funnel (a free but long address) lost.
4. **The document is in English** (repo rule), with no Russian summary: the owner has no wishes beyond this list.

## Open questions for the spec

- One address with paths (`/` site, `/api` PocketBase) or two subdomains? This decides CORS, cookies and how the connect link carries the address.
- How a build reaches the NAS. Options: a GitHub Actions job pushes `dist/` through the tunnel; the NAS pulls a build artifact or a release on a timer; or the NAS builds from git itself. It also matters which build the owner checks after a push to `main` (ADR 0011): GitHub Pages, the NAS, or both.
- Server jobs: they could run on the NAS in a scheduled container, or stay in GitHub Actions and reach PocketBase through the tunnel with a service token. The trade-off: secrets living on the NAS versus PocketBase being reachable by a token from outside.
- Cloudflare Access (an extra login screen in front of the site): keep it off? An expiring Access cookie can break offline start and background sync of a PWA on the iPhone.
- PocketBase facts to check on a real instance (a local binary in the scratchpad): batch API limits, realtime through the tunnel (idle timeout), the Google OAuth2 flow from an installed iPhone PWA (popup versus redirect), and the `updated` field as the delta-read mark.
- Drawings: count their total size on Drive. Should the document reserve space for drawings in PocketBase file storage later (stage 4), or keep them on Drive?
- Is it worth a small tool, `tools/nas-check.mjs`, that the owner runs against the finished NAS? It would test HTTPS, the PocketBase health, batch on, CORS, and a realtime ping, as the acceptance check of the NAS project.
- What the NAS project already decided (Docker on UGOS Pro, folders, users). The spec asks the owner, or leaves it as an open question in the document.
