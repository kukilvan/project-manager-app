Status: accepted
Complexity: complex
Blocked by: 02

# 03. The NAS build and the release `nas-build`

The app can be built for the NAS (`npm run build:nas`), and every push to `main` publishes the release the NAS project installs. The NAS build shows a placeholder after start, so the NAS project can test its updater before the storage exists.

## Spec sections

§ 3.1 (build and start, flag), § 3.9 (service worker), § 4 (the job, the files, the manifest), § 9 (A15 is added here), § 10 (edge cases 27, 28), § 12 (`.gitignore`, `CLAUDE.md` Run, `PROJECT_CONTEXT.md` environment, term «NAS build»). Slicing notes under § 13 apply.

## What to do

1. The flag: `isPocketBase()` in `src/edition.js` reads `import.meta.env.VITE_BACKEND === 'pocketbase'` so Vite folds it to a constant and drops the PocketBase branches and chunks from the GitHub Pages build. `scripts/build-nas.mjs` runs Vite with `VITE_BASE=/` and `VITE_BACKEND=pocketbase` into `dist-nas/`; `package.json`: `"build:nas": "node scripts/build-nas.mjs"`.
2. NAS start (`src/main.js`, small): with `isPocketBase()` the app shows a placeholder screen with the text «Хранилище на домашнем сервере появится в следующих версиях.» (English and Hebrew; `node scripts/i18n-build.mjs`) and nothing else: no first-launch screen, no wizard, no Firebase. `?mem=1` still works. Ticket 04 replaces the placeholder with the sign-in.
3. Service worker: `navigateFallbackDenylist` gets `^<BASE>api/` and `^<BASE>_/` (§ 3.9) in every build.
4. `scripts/zip-lib.mjs`: a zip writer over Node's `zlib` (sorted entries, fixed timestamps, no `zip` program); header comment says the Drive zip of ticket 12 uses it too.
5. `scripts/nas-pack.mjs out/`: deterministic `nas-site.zip` (contents of `dist-nas/` at the root), `nas-pb.zip` (`pb_migrations/…`, `pb_hooks/…` from `pb/`), `nas-jobs.zip` (`scripts/`, `src/`, `package.json` and `node_modules/` with only the jobs' production dependencies — find how `server-backup.yml` installs them today: `google-auth-library`, and `mupdf` from `package.json` — no `firebase-admin`; ticket 12 completes the contents), `nas-site.json` (§ 4: `commit`, `version`, `builtAt`, `sha256`, `schema` from `PB_SCHEMA`, `pocketbase`, `pb`, `jobs`).
6. `.github/workflows/pages.yml`: job `nas-build` (`needs: build`, `permissions: contents: write`): `npm ci`, `npm run build:nas`, `node scripts/nas-pack.mjs out/`, the release `nas-build` created if missing (pre-release), `gh release upload nas-build <zips> --clobber`, **`nas-site.json` last**. It does not run on a pull request or a branch other than `main`.
7. `tools/nas-check.mjs` check **A15**: `GET /api/pm/info` answers `app: "pm"` and `schema` ≥ 1 (SKIP before the first NAS build, FAIL after); the row A15 in `docs/nas-requirements.md` § 10 (the document's guard test counts A1–A14 now and has a budget of 34,000 bytes: update the count, keep the budget), the version line of the document with the change, and a line for the NAS project in `.scratch/04-pocketbase-storage/nas-message-2.md` (forward note: A15 and the release exist).
8. Docs: `.gitignore` (`dist-nas/`); `CLAUDE.md` Run (`npm run build:nas`); `PROJECT_CONTEXT.md` environment (the release and its files); `CONTEXT.md` term «NAS build»; header comments; `node tools/code-map.mjs`.

## Done when

- `npm run build:nas` makes `dist-nas/` for base `/`; opened through `node tools/pb-dev.mjs up --serve dist-nas` at `http://localhost:8090/` it shows the placeholder, in Russian, English and Hebrew.
- The Pages build (`npm run build`) is unchanged: no PocketBase code in `dist/` (no file contains `PB_CONNECT`); in the browser pane `?mem=1` works as before.
- `node scripts/nas-pack.mjs out/` run twice gives identical files and checksums; the zips are read back with `zlib`; `nas-site.json` has every field and its `sha256` equals the zip's.
- `node tools/nas-check.mjs` against `pb-dev up` passes A15 (and SKIPs it with no manifest).
- After the push to `main`: `gh release view nas-build` lists the four files (pre-release), `nas-site.json` is the newest asset, and a second push replaces the files.
- `npm test`, `npm run build`, `node tools/code-map.mjs --check` pass.

## Tests to add

`tests/nas-pack.test.js` (§ 11): same input → same checksum; entries read back; manifest fields; the sort order. `tests/nas-check.test.js`: A15 (answers, SKIP, FAIL; the document's check count). A test that `isPocketBase()` is false without the flag.

## Owner check

1. In the browser on the PC open `https://github.com/kukilvan/project-manager-app/releases/tag/nas-build` — the release has four files: `nas-site.zip`, `nas-pb.zip`, `nas-jobs.zip`, `nas-site.json`. If the page says «404», the deploy of this ticket has not finished: wait two minutes.
2. Tell the NAS project (one line): «Релиз nas-build есть в GitHub, можно проверять установщик (A9, A15)».
3. The site on the phone works as before (the check of the Firebase app is not needed beyond opening it).

Needs the NAS: the NAS project installs the release and runs A9 and A15; the answer comes through the owner.
