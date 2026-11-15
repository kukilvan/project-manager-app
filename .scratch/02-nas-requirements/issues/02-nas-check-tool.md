Status: open
Complexity: medium
Blocked by: 01

# 02. The NAS check tool `tools/nas-check.mjs`, its tests, code map and `CLAUDE.md`

The automated part of the acceptance checks: a dependency-free Node script that probes a NAS address and reports PASS, FAIL or SKIP per check A1–A9, plus the realtime cut time. It sends no credentials and changes nothing. Also the test that guards the NAS document written by ticket 01.

## Spec sections

3.10 (the A-ids), 4 (the tool, in full), 5 (edge cases: empty PocketBase, local address), 6 (tests, self-check), 7 (owner check), 8 (code map and `CLAUDE.md` lines).

## What to do

1. **`tools/nas-check.mjs`** — section 4.
   - CLI: `node tools/nas-check.mjs https://<host> [--quick] [--hold <seconds>]`; `parseArgs` from `node:util`; the address is required; a plain `http://` address is refused with exit 2 except `http://127.0.0.1` and `http://localhost` (local testing: the checks that need Cloudflare are skipped); no arguments or `--help` prints the usage and exits 2.
   - Checks A1, A2, A3a, A3b, A4, A5, A6, A7 (+ the A7i info line), A8, A9 with the requests, PASS, FAIL and SKIP conditions of the table in section 4. Every request: 15 s timeout (the A7 hold excepted), header `User-Agent: project-manager-nas-check`; a timeout or network error is a FAIL of that check; when A1 cannot connect at all, stop with "cannot reach <base>" and exit 2.
   - Output: one line per check — `PASS` / `FAIL` / `SKIP` / `INFO`, the id, a short English text; a FAIL adds what was expected and what came back (status and the first 120 characters of the body). Then `Summary: <n> pass, <n> fail, <n> skip`. Exit 0 with no FAIL, 1 with a FAIL, 2 on bad usage or an unreachable host.
   - Structure: the pure parts (argument parsing, judging a response per check, the summary and exit code) are exported functions; the network part takes a `fetch` function so tests can stub it; the CLI runs only when the file is the entry point. No file is read or written, no dependency is added (`package.json` stays as it is).
   - Header comment in English per `docs/coding-standards.md`; the first sentence says what the module holds (it becomes the code-map line).
2. **`tests/nas-check.test.js`** — section 6 (below). Its header comment is the first comment of the file.
3. **`docs/code-map.md`** — the "Not code" tools line gets `tools/nas-check.mjs`; run `node tools/code-map.mjs` (never edit the list by hand).
4. **`CLAUDE.md`** Run — one line `NAS check: node tools/nas-check.mjs https://<host>`; stay within 60 lines and 6,000 bytes (`wc -c`).
5. **Self-check against a real PocketBase** (section 6): download PocketBase 0.40.6 into the scratchpad (never into the repo; check the SHA-256 against the one in `docs/nas-requirements.md`), start it with `serve --http=127.0.0.1:8090 --dir=<scratchpad>/pb_data --dev=false`, create a superuser through its CLI, and run the tool at `http://127.0.0.1:8090`. Flip each setting through the dashboard or API and see the expected line change: batch off → A4 FAIL, then on → PASS; password sign-in on → A5 FAIL (the text names the part), off with a Google provider with dummy credentials → PASS; a custom `--origins` and `*` → A6; a stopped server → exit 2. A2, A3, A8 print SKIP on the local address, A9 SKIP (no site). Stop the server and remove the scratchpad data at the end.
6. The self-check below.

## Done when

- `node tools/nas-check.mjs --help` prints the usage and exits 2; with no address the same.
- Against the local PocketBase every flipped setting changes the expected line (step 5), and the summary and exit code follow (0 / 1 / 2).
- `npm test` passes, including `tests/nas-check.test.js` and `tests/code-docs.test.js` (code map not stale, the new module has its header comment).
- `node tools/code-map.mjs --check` exits 0; `node tools/ru-comments.mjs` exits 0 (no Russian comments in the new files).
- `npm run build` passes; `git diff --name-only main...HEAD` lists only `tools/nas-check.mjs`, `tests/nas-check.test.js`, `docs/code-map.md`, `CLAUDE.md`, `.scratch/`, `PROJECT_CONTEXT.md`, `docs/history.md`: nothing the site is built from.
- On `main`; the deploy succeeded.

## Tests to add

`tests/nas-check.test.js` (node:test, no network; spec section 6):
- argument parsing: no address; remote `http://` refused; local `http://127.0.0.1` and `http://localhost` allowed; `--quick`; `--hold`; `--help`.
- each of A1–A9 judged from stubbed responses: the PASS case and each FAIL case of the table in section 4; A2, A3 and A8 skipped on a local address; A8 and A9 skipped when the site is not there (404 / no manifest); A9 FAIL when `start_url` is not `/`.
- A7 with a stubbed stream that closes after 1 s and a reconnect that connects (hold 2 s) → PASS and an INFO line with the cut time; a failed reconnect → FAIL; `--quick` → connect only and no A7i.
- the summary line and the exit code (0 / 1 / 2); the 120-character cut of a body in a FAIL line; an unreachable host stops with exit 2.
- **document check** of `docs/nas-requirements.md` (section 6): it exists, is at most 30,000 bytes, has the sections of section 3 in order, every `R-…` id is unique, every id in the acceptance table is A1–A14, and it contains no e-mail address except `@example.com` ones, no IPv4 address except `127.0.0.1` and `0.0.0.0`, and no `https://` host outside the allow list (`github.com`, `example.com`, `<host>`, Cloudflare and Google documentation hosts). If the document and the tool disagree on an A-id or a PASS rule, the document (ticket 01) is fixed first, then the tool.

## Self-check

1. `npm test` — all pass (160 tests before this ticket, plus the new ones).
2. `npm run build` passes.
3. `node tools/code-map.mjs --check` and `node tools/ru-comments.mjs` — exit 0.
4. The local-PocketBase run of step 5, output read; the scratchpad binary and data removed.
5. `git diff --name-only main...HEAD` — only the files listed above.
6. Push to `main` (`git pull --rebase origin main` first); `gh run list --workflow pages.yml --limit 1` → success.

Then mark the ticket `accepted`, update `PROJECT_CONTEXT.md` (Stages: tickets 2/2; Next step «Ревью 2», Opus 5.5, effort high; xhigh if ticket 01 is counted complex — `docs/models.md`) and `docs/history.md`.

## Owner check

In PowerShell in the project folder: `node tools/nas-check.mjs --help` — the usage text appears (the address and the `--quick` and `--hold` options). The real run waits for the NAS: the NAS project runs the tool once the tunnel works; if a line fails, the owner pastes the output into a «Вопрос: …» session. (Spec section 7.)
