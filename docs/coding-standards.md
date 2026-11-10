# Coding standards

One rule per item: the rule, why, how it is checked. Reviews check against this file; the ticket that introduces a rule adds it here.

## 1. Secrets and work data stay out of the repo and the logs

**Rule.** Keys and tokens live only in GitHub Actions secrets or local files ignored by git; logs and error messages carry no secret values. Work data, customer drawings and the owner's backups are never committed (ADR 0005).

**Why.** The repo is public; a secret or customer data in git history is leaked for good.

**Checked.** `.gitignore` holds `.env` and service-account files; the review searches the diff for key-like values and data files.

## 2. Tests run offline

**Rule.** Automated tests use fakes for external services and need no network, real keys or running app.

**Why.** The suite must give the same answer on any machine at any time; the deploy runs it.

**Checked.** The suite passes with the network off.

## 3. The first sentence of a module's header comment is its line in the code map

**Rule.** Every source module in `src/` and `scripts/` starts with a header comment whose first sentence says what the module holds, in English, in at most 200 characters; the next sentences say what it talks to. `docs/code-map.md` lists those sentences and is built from them by `tools/code-map.mjs`; nobody edits the list by hand.

**Why.** Every spec, ticket and review session reads the code map. A hand-written map drifts from the code; a built one stays short and true, and a comment next to the code is edited together with the code.

**Checked.** `tests/code-docs.test.js` and `node tools/code-map.mjs --check`: the committed map equals the built one, every module has an English header (except the paths still in `PENDING` during stage 1), no first sentence is over 200 characters.

## 4. Domain logic is pure and tested

**Rule.** Calculations (statuses, composition, daily report, pulls, racks, import parsing, drawing fit, merge, sync decisions) live in `src/domain/` without browser or Firebase calls, with tests in `tests/`. Screens in `src/app/views/` only call them.

**Why.** UI is checked by hand and in `?mem=1` only; logic is where silent errors cost the owner money (wrong report sums, lost points).

**Checked.** Review: new logic in a view or without a test is a finding.

## 5. All writes go through the repo; drawings through `patchDrawings`

**Rule.** Data changes go through `repo.save(pid, ops)` (it stamps author and time and writes history). `project.drawings` is written only through `patchDrawings(pid, fn)` in `src/app/drawings.js`. Firestore document ids pass through `docKey()` (no `/`).

**Why.** History and rollback depend on it (ADR 0003); writing drawings from an old snapshot overwrote the fresh list once.

**Checked.** Review: a direct `setDoc`/`writeBatch` outside `repo.js`, or a drawings write outside `patchDrawings`.

## 6. Firestore reads are economised

**Rule.** Normal paths read only changes (`updatedAtServer`); a new full read, a listener over a whole collection or a screen that reads history needs a reason in the spec. The UI is built from the cache listener (ADR 0010).

**Why.** Spark allows 50,000 reads a day; overrun breaks the night backup and sheets (ADR 0002).

**Checked.** Review of every new Firestore query.

## 7. Auth popups and redirects get the resolver explicitly

**Rule.** Every `signInWithPopup`, `signInWithRedirect`, `getRedirectResult`, `reauthenticateWithPopup` passes `browserPopupRedirectResolver`.

**Why.** With cached auth the resolver is not set at init; without it the call fails with `auth/argument-error` (ADR 0010).

**Checked.** A search for these calls in the diff.

## 8. UI strings are translated; user-visible changes reach the guide

**Rule.** New Russian UI strings get English and Hebrew in `src/i18n/src/*.json`, then `node scripts/i18n-build.mjs`; templates use `{}`. A change of behaviour the user sees gets a line in `src/app/views/guide.js`.

**Why.** Colleagues use English or Hebrew; they learn the app from the guide (ADR 0008).

**Checked.** `tests/i18n.test.js`; review compares new strings with the dictionaries.

## 9. UI helpers: no nulls in children; custom form fields re-render only on change

**Rule.** Filter children with `.filter(Boolean)` before `replaceChildren(...)` — `h()` prints `null` as text. A custom `formModal` field (`type: 'custom'`) gets `update(v)` on every keystroke (input events bubble): re-render only when its values really changed (compare a signature); read other custom fields loaded in the same update after it (example: `queueMicrotask` in `src/app/views/ownworks.js`).

**Why.** Both bugs happened and are easy to repeat.

**Checked.** Review of new views.

## 10. Comments are in English

**Rule.** Code comments (JS, CSS, Python, YAML, Firestore rules) are written in English. Cyrillic in a comment only inside `«…»`, for UI text or data (`// the «Точки» tab`). Strings stay as they are: UI texts, event-log lines, test names, Russian data.

**Why.** One language for every session that reads the code; a mixed codebase costs more to read and search.

**Checked.** `tests/code-docs.test.js` (through `tools/ru-comments.mjs`): every Russian comment of the scope is in a path still listed in `PENDING` (stage 1 empties the list).

## 11. A comment-only change keeps the built site identical

**Rule.** A change meant to touch only comments and docs is proved with `node tools/same-code.mjs`: check 1 — the code of every changed file is the same without comments; check 2 — the base commit and the working tree build into byte-identical sites. Code changes a ticket intends are named with `--expect <path>`; the built site is never excused.

**Why.** Comment and doc changes then need no browser walk and cannot break the live site.

**Checked.** The tool in the self-check of every such change.
