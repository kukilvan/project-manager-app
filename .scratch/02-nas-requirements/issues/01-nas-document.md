Status: in review
Complexity: complex
Blocked by: —

# 01. The NAS document, ADR 0014, project spec and glossary

The main output of the stage: `docs/nas-requirements.md`, the document the sessions of the NAS project build from. It is security- and external-service-heavy, so every statement must match the facts checked in the spec (section 1). No code changes; the site and the app are untouched.

## Spec sections

1 (checked facts — the source of every number), 2 (decisions D1–D10), 3 (the whole document, 3.0–3.12), 5 (edge cases that the document must mention), 7 (owner check), 8 (docs to update, the ticket-01 items).

## What to do

1. **`docs/nas-requirements.md`** — write it as section 3 says, in this order: header line (version = date and commit; "owned by this repo; the NAS project proposes changes through the owner"), 3.1 Summary (with the owner's checklist and costs, and the text diagram), 3.2 PocketBase (R-PB-1…9), 3.3 The site on the NAS (R-SITE-1…3), 3.4 Access from outside (R-NET-1…6), 3.5 Sign-in and Google (R-AUTH-1…2, R-GOOG-1…2), 3.6 Server jobs (the table and R-JOB-1…2), 3.7 Backups (R-BAK-1…4), 3.8 Data volume and growth (the table of section 1 and R-DATA-1), 3.9 Power and network (R-POW-1…3), 3.10 Acceptance checks (A1–A14), 3.11 Open questions for the NAS project, 3.12 What changes in later stages (last).
   - English; at most 30,000 bytes (`wc -c`); each section starts with one sentence of why.
   - Every requirement has an id `R-<AREA>-<n>` and a phase (now / stage 4 / stage 5); "must" and "must not" for checkable statements, "should" with a reason for recommendations.
   - Placeholders only: `<host>`, `<domain>`, `<nas-lan-ip>`, `<lan-subnet>`. No real domain, IP, e-mail other than `@example.com`, key, token or password (ADR 0005). The SHA-256 of the PocketBase 0.40.6 zip (R-PB-1) is public and stays as written in the spec; check it once more against the release's `checksums.txt` while writing.
   - The Dockerfile of R-PB-1 (download the release zip, check the SHA-256, unzip) and a Compose example of the two containers (`pocketbase`, `cloudflared`) are written out in full, so the NAS project copies them; the flags are exactly those of R-PB-2.
   - Explanations (no id) go where section 3 lists them: service worker and updates, what stays in Google, what happens on a power or internet cut, restoring for real, the remote-administration note of section 5.
   - Edge cases of section 5 that touch the NAS side are in the text: lost `PB_ENCRYPTION_KEY`, leaked service-account key, the forged `CF-Connecting-IP`, the NAS off while a deploy goes out.
   - The acceptance table's ids A1–A14 and phases are exactly those of 3.10; the ids A1–A9 are the ones ticket 02 implements, so do not renumber them later.
2. **`docs/adr/0014-nas-copy-one-hostname-pulled-builds-jobs-on-nas.md`** — the format of `docs/formats.md` (ADR): title as a statement, context, decision, consequences. Holds D1, D2, D3 and D4 with their reasons and the rejected options exactly as section 2 gives them; refers to ADR 0013, ADR 0009 and ADR 0005; says which later ADR will have to be updated (ADR 0011 in stage 5).
3. **`docs/project-spec.md`** — section 8 (ticket-01 items): stage 2 gets its output (`docs/nas-requirements.md`, `tools/nas-check.mjs`); stage 4 gets the PocketBase facts of D6, the rate-limit note of section 5 (chunks one after another, retry on 429, reconnect + delta read) and "starts when A1–A7 and A10–A13 pass and the owner says the NAS is reliable"; stage 5 gets the release `nas-build`, the agent container, `VITE_BASE=/`, the `navigateFallbackDenylist` entries `/api/` and `/_/`, and "the owner checks on the NAS after the move (ADR 0011 updated then)".
4. **`CONTEXT.md`** — three terms, as worded in section 8: NAS copy, NAS document, NAS check (with the _avoid_ words for NAS copy).
5. **Facts re-check.** Re-read section 1 against the finished document: every number (batch limits, rate-limit rules, 125 s and 300 s, 30-day token, 20 GB budget, 14 backups) is the same in the document and in the spec; where they differ, the spec wins and the document is fixed.
6. The self-check below.

## Done when

- `docs/nas-requirements.md` has all the sections of 3.1–3.12 in that order, every requirement has an id and a phase, all R-ids are unique, and the file is at most 30,000 bytes.
- `grep -nE "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+" docs/nas-requirements.md` shows only `@example.com` addresses (and the `@guest` / `@auth` rule audiences, which are not addresses); no IPv4 address other than `127.0.0.1` and `0.0.0.0`; every `https://` host is `github.com`, `example.com`, `<host>`, or a Cloudflare or Google documentation host. (Ticket 02 turns this into a test; here it is run by hand.)
- ADR 0014, the three project-spec stages and the three `CONTEXT.md` terms are in place.
- `git diff --name-only main...HEAD` lists only docs (`docs/`, `CONTEXT.md`, `.scratch/`, `PROJECT_CONTEXT.md`): nothing in `src/`, `public/`, `index.html`, `vite.config.js`, `package*.json`.
- `npm test` passes (a docs-only change; this confirms `tests/code-docs.test.js` and the other tests did not break) and the build still passes.
- On `main`; the deploy succeeded; the file opens on GitHub.

## Tests to add

None in this ticket: the document check of section 6 is added by ticket 02, which reads this file.

## Self-check

1. The "Done when" checks above, in order, with their output read.
2. `npm test`, `npm run build`.
3. `git diff --name-only main...HEAD` — docs only.
4. Push to `main` (`git pull --rebase origin main` first); `gh run list --workflow pages.yml --limit 1` → success.

Then mark the ticket `accepted`, update `PROJECT_CONTEXT.md` (Stages: tickets 1/2; Next step «Тикет 2.2», Sonnet 5.5, effort high) and `docs/history.md`.

## Owner check

Open `https://github.com/kukilvan/project-manager-app/blob/main/docs/nas-requirements.md` on the phone or PC: the document opens and has the owner's checklist with costs near the top. Give the link to the NAS project. (Spec section 7.)
