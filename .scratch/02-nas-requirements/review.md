Status: accepted

# Stage 2. What the app needs from the NAS — review

## What was reviewed

- Commits `2deeaa5..20d6edf` (from «Slicing 2: accepted» to «Ticket 2.2 accepted»): tickets 01 (the NAS document, ADR 0014, project spec, glossary) and 02 (`tools/nas-check.mjs`, `tests/nas-check.test.js`, code map, `CLAUDE.md`) of `.scratch/02-nas-requirements/issues/`.
- Against `.scratch/02-nas-requirements/spec.md`, the tickets, `docs/coding-standards.md`, `CONTEXT.md`, `docs/formats.md` and the document budgets of `docs/workflow.md`.
- Two passes, run in parallel by the code-review skill: standards (rules, glossary, budgets, code smells in the tool) and spec (every R-id, number and check of spec § 1–8 against the document, the tool and the tests). Then this session's own runs below.

## Tests

- Start: 191/191 pass (Windows, Node 24).
- End: 192/192 pass (one new test: the WAF rule of the NAS document names the superuser collection by name and by the id the tool probes; new cases in the A3, A8 and A9 tests). `tests/nas-check.test.js` also passes when run from the `tests` folder.

## Verified by running

- PocketBase 0.40.6 downloaded from the official release (with the owner's yes), checksums matched `checksums.txt`; the linux zip's SHA-256 is the one in R-PB-1 and the Dockerfile. Everything ran in the session scratchpad and was removed at the end.
- **The tool against a real PocketBase** (Windows binary, `http://127.0.0.1:8090`): default settings → A4, A5 (naming «password sign-in is on; OAuth2 is off»), A6 FAIL, exit 1. Then the settings of R-PB-5, R-PB-6, R-AUTH-1, R-AUTH-2 set through the API and `--origins=https://pm.example.com`, and the app built with `VITE_BASE=/` in `pb_public` → A1, A4–A7, A9 PASS, A2/A3/A8 SKIP, exit 0; `--hold 4` gives the A7i line. The same server checked as a remote address (no Cloudflare in front): A3a and A3b FAIL with PocketBase's real answers (the dashboard 200; the superuser login 400), A8 PASS — the lines a NAS without the WAF rules would get.
- **Superuser access from outside** (`CF-Connecting-IP: 203.0.113.x`, trusted header and superuser IPs as R-PB-5): a login with a wrong password gets 400, with the right password 403 — by the collection's name and by its id `pbc_3142635823` alike (F1); a valid superuser token from outside 403; the dashboard page `/_/` 200 (only the WAF blocks it). The id is a constant in the 0.40.6 binary.
- **Rate limits of R-PB-6:** four `auth-refresh` calls in a row from one address all pass — `*:auth` does not count the token refresh the app does at every start.
- **Guest sign-up with password sign-in off:** `POST /api/collections/users/records` with an e-mail and a password still creates a user (F4).
- **The Dockerfile and Compose example of the NAS document**, copied verbatim (placeholders filled, port on `127.0.0.1`, folders in the scratchpad, `cloudflared` left out): the image builds, the SHA-256 check inside passes, the health check turns `healthy`. A 29-character `PB_ENCRYPTION_KEY` makes PocketBase exit at once («crypto/aes: invalid key size 29») and the container restarts in a loop (F2). `superuser upsert` in the container without `--encryptionEnv` fails («missing encryption key»), with it works (F3). A backup lands in the separately mounted backups folder; a restore through the API brings the data back (4 users → 3) and PocketBase restarts itself inside the container in ≈ 2 s.
- `node tools/nas-check.mjs --help`, no address and a remote `http://` address: usage, exit 2. `npm run build` passes; `node tools/code-map.mjs --check` exit 0; `node tools/ru-comments.mjs` — 0 Russian comments, exit 0. Nothing the site is built from changed (`git diff --name-only main`).
- Not verifiable here (no NAS, no domain): anything through a real Cloudflare Tunnel — A2, the WAF's 403 page for A3, `cf-cache-status` for A8, the real cut time of A7; UGOS Pro specifics; Google sign-in. The NAS project's first run of the tool covers them.

## Findings

- **F1** — NAS document R-NET-4: rule 2 blocked `/api/collections/_superusers/` but not the same collection by its id (`/api/collections/pbc_3142635823/`), which PocketBase also accepts. Through that path a login attempt reaches PocketBase, which answers a wrong password with 400 and a right one with 403, so an outsider could tell a guessed password is right (using it from outside is still blocked by R-PB-5). **Fix now:** rule 2 also matches the id, the note explains why; A3b probes the login by name and by id and passes only when both get 403; a test keeps the document's rule and the tool's id together.
- **F2** — R-PB-2 said «32 random characters» for `PB_ENCRYPTION_KEY`; another length stops PocketBase from starting, with a restart loop. **Fix now:** «exactly 32», a command that makes such a key (`openssl rand -hex 16`) and the error it shows otherwise.
- **F3** — R-PB-7 did not say how to create the first superuser; a PocketBase command run in the container fails without the same `--dir` and `--encryptionEnv` as `serve`. **Fix now:** the `docker exec … superuser upsert …` command, the installer-link alternative, and the rule for every command.
- **F4** — R-AUTH-1 read as if password sign-in off stops sign-up («anyone may register by password»); the records API still creates users under the default create rule (they cannot sign in and see nothing). **Fix now:** the document says so and points to stage 4's migrations (R-PB-8); `docs/project-spec.md`, stage 4: the `users` create rule must let only Google sign-in create users.
- **F5** — `tools/nas-check.mjs`, A9: any manifest answer other than a 200 JSON was a SKIP «site not there», so a 5xx or a broken manifest hid a broken site (spec § 4: SKIP only for «no manifest»). **Fix now:** SKIP only for 404 or PocketBase's HTML fallback; another status or a manifest that is not JSON is a FAIL; tests added.
- **F6** — A8: only the first `sw.js` answer was checked for 200, so a 5xx second answer passed (spec § 4: «200 and `cf-cache-status` … on the second»). **Fix now:** the second answer must be 200 too; test added.
- **F7** — NAS document § 6: the cleanup row left out that history entries older than a year are deleted too (`scripts/server-cleanup.mjs`). **Fix now.**
- **F8** — `docs/project-spec.md`, stage 4: dropped D6's «the redirect URIs of R-GOOG-2 cover both», and repeated numbers whose home is the NAS document (≈ 125 s, 30 days, 10 batch calls per second), which would drift when stages 4–5 change it. **Fix now:** pointers to R-NET-5, R-AUTH-2, R-PB-6 and the R-GOOG-2 note.
- **F9** — Spec § 3.0 asks for requirements as «must» statements; most R-items are written as settings. **Fix now:** the conventions line says a requirement written as a setting is a must.
- **F10** — `tests/nas-check.test.js`: the host allow list of the document check was wider than spec § 6 (`pocketbase.io`, `googleapis.com`, any `*.google.com` or `*.cloudflare.com`). **Fix now:** narrowed to `github.com`, `example.com` and its subdomains, `<host>`, `developers.cloudflare.com` and the Google documentation hosts.
- **F11** — The document check read `docs/nas-requirements.md` relative to the current folder, unlike the other tests (`import.meta.url`). **Fix now.**
- **F12** — Tool code: `cut` meant both the body clip and the stream cut; the exported `DEFAULT_HOLD_S` and `USER_AGENT` were not used by the tests, which repeated their values; the A8 "file is there" condition was written out twice. **Fix now:** `clip`, the tests import the constants, one `missingFile` helper serves A8 and A9.
- **F13** — R-GOOG-1: «the owner's app connection» is not a word of `CONTEXT.md`. **Fix now:** «the owner's connect link».
- **F14** — ADRs 0012–0014 have `Status: accepted (planned, stages …)`, which `docs/formats.md` did not allow; ADRs are never rewritten. **Fix now:** `docs/formats.md` allows that status.
- **F15** — `PROJECT_CONTEXT.md`, State: the ticket 2.1 and 2.2 lines keep details that `docs/history.md` holds (sizes, counts, flags). **Fix now:** folded into one stage-2 line when the stage closes.

Checked and left as they are:
- A1 that times out stops the run with «cannot reach … timeout after 15 s», exit 2: a host that does not answer its health check cannot be checked further, and every other request would wait 15 s too.
- `--quick` prints no A7i line (the spec table says SKIP, the ticket «no A7i»): the ticket was followed.
- «helpers» (an established project word, `docs/project-spec.md`, ADR 0013); «the owner's copy» only in the sentence that defines **NAS copy**; the overlap of ADR 0014 and the NAS document (the document must stand alone for another project); the extra placeholder `<docker-subnet>` (R-PB-5 needs it); the UPS price marked as an estimate.

No fix-round finding: the stage closes with this review. Nothing deferred to `KNOWN_ISSUES.md`.

## Wishes for later stages

- **NAS project (now):** the first run of `node tools/nas-check.mjs https://<host>` after the tunnel works covers what this review could not: A2, A3 through the WAF, A8 and the real realtime cut time for stage 4. If a line fails, the owner brings the output to a «Вопрос: …» session.
- **Stage 4:** the `users` rules come as a migration and must stop sign-up through the records API while Google sign-in still creates users (F4) — try both on a real PocketBase with a real Google client. The token refresh at every start is not limited by `*:auth` (checked).
- **Stage 4–5:** the restore through the dashboard works in the container with the backups folder mounted inside `pb_data` (checked); the restore drill R-BAK-4 on the NAS stays the NAS project's.
