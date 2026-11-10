# Workflow

How every session works. Every session reads this file first.

## Stages and steps

The project is split into stages (`docs/project-spec.md`; status in `PROJECT_CONTEXT.md`). Each stage takes this path, one step per session:

| Step | Session title | Output |
|---|---|---|
| Description | «Описание N» | `.scratch/NN-<slug>/description.md` |
| Spec | «Спека N» | `.scratch/NN-<slug>/spec.md` |
| Slicing | «Тикеты N» | `.scratch/NN-<slug>/issues/MM-<slug>.md` |
| Ticket | «Тикет N.M» | code, tests, module header comments (the code map is built from them) |
| Review | «Ревью N» | `.scratch/NN-<slug>/review.md` |

`N` is the stage number, `NN` the same with two digits, `M` the ticket number. File formats: `docs/formats.md`, the section for the file you write.

**Description.** What and why, in plain words. Before writing it:
- propose in chat (Russian) the nuances, ideas, risks and questions you see for this stage, and ask the owner for wishes (AskUserQuestion, with an option «Пожеланий нет»);
- pull in open `KNOWN_ISSUES.md` entries and wishes of earlier reviews that fit the stage;
- stage with UI: a rough mockup of every new screen — real texts in Russian, rough layout, phone width — saved as `.scratch/NN-<slug>/mockups/<screen>.html` and shown to the owner (desktop app: the browser pane; elsewhere the file path).

The approved description is the source of truth for its stage; when it changes the plan of later stages, update `docs/project-spec.md` in the same session.

**Spec.** Exact behaviour, texts (Russian, plus English and Hebrew for new UI strings), data, edge cases, tests. Built from the description; assumptions about external services (Firestore, Google Drive and Sheets, PocketBase) checked against real responses where possible. Ends with a proposed ticket split.

**Slicing.** One file per ticket, numbered from `01`. Each ticket is a finished piece the owner can check on its own and fits one session. Its `Complexity:` (simple · medium · complex) picks the model of its session.

**Ticket.** Code, tests, then the header comment of every module it adds or changes: its first sentence says what the module holds and becomes the line of `docs/code-map.md`. Nobody edits the map by hand: run the code-map command (`CLAUDE.md`, "Run"); its test fails when the map is stale. Then the self-check, then the owner's check.

**Review.** The whole stage against its spec and `docs/coding-standards.md` — with a code-review skill when one is installed: one pass for standards, one for the spec. Run things, not only read them. Each finding gets one decision in `review.md`:
- **fix now** — minutes of work and no design choice (typo, label, spacing): fixed in this session;
- **fix round** — needs design or tickets: the stage gets fix round k — `.scratch/NN-<slug>-fix<k>/`, the same five steps, titles ending in « · правки k» («Описание N · правки k» … «Ревью N · правки k»);
- **defer** — small or rare: a `KNOWN_ISSUES.md` entry.

A review with no fix-round finding closes the stage; the next stage begins with its description.

**Ideas.** The owner adds features and ideas with `/add-idea`: each becomes `docs/ideas/NNN-<slug>.md`, listed in the Ideas column of its stage in `PROJECT_CONTEXT.md`. The stage's next description, spec or slicing — whichever comes first — takes the listed ideas in and sets each idea's `Status:` to the file that took it.

## Quick fix «Правка: …»

The owner finds most fixes in real field work and writes them in Russian, often briefly and with typos. A quick fix is one session, outside the stage chain; the Next step stays.

- For: a bug, a wrong label, a small behaviour change in one area. Something that needs design decisions, a new screen or data migration → tell the owner and file it as an idea (`/add-idea`) or a stage.
- Ask only when the decision really is the owner's, with options to pick. If you need their screenshots or backup file, say so.
- Branch `claude/fix-<slug>`; then: understand by the code (and, if needed, on a copy of the owner's data: the backup JSON they send, kept in the scratchpad); fix; tests in `tests/` for the `src/domain` logic; new UI strings into `src/i18n/src/*.json` + `node scripts/i18n-build.mjs`; user-visible behaviour change → a line in the in-app guide (`src/app/views/guide.js`); module header comments and the code map.
- Self-check (below), then straight to `main` (ADR 0011) and wait for the deploy. Reply short: what was done in one or two sentences and numbered check steps on the phone. No code retelling.
- `KNOWN_ISSUES.md` entry only if something is left unfixed; a line in `docs/history.md`.

## One session — one step

A session does one step and never starts the next, even with time left. Outside the chain:
- **«Вопрос: …»** — a question or discussion; changes no files and no Next step.
- **«Идея: …»** — `/add-idea`; files an idea into a stage, the Next step stays.
- **«Правка: …»** — the quick fix above; the Next step stays.

## Start of a session

1. Title the session from the table (desktop app: the session-title tool via ToolSearch; elsewhere skip).
2. Read what the step needs, no more:

| Session | Reads, besides `CLAUDE.md`, `PROJECT_CONTEXT.md` and this file |
|---|---|
| Description | `docs/project-spec.md` (the stage and what it touches), the stage's ideas, `CONTEXT.md`, `KNOWN_ISSUES.md` index, the last review's wishes, ADRs of the area |
| Spec | the description, the stage's ideas not yet taken in, `CONTEXT.md`, ADRs of the area, `docs/code-map.md` |
| Slicing | the spec, the stage's ideas not yet taken in |
| Ticket | the ticket, the spec sections it names, `CONTEXT.md`, `docs/coding-standards.md`, `docs/code-map.md` |
| Review | the spec, the tickets, `docs/coding-standards.md`, `docs/code-map.md`, the stage diff |
| Quick fix | `CONTEXT.md`, `docs/coding-standards.md`, `docs/code-map.md`, then only the modules involved |

`docs/history.md`, `docs/rollback.md` and full `KNOWN_ISSUES.md` entries — only for a specific past detail.

3. Git: `git fetch origin`, `git switch main`, `git pull --ff-only`. The worktree must be clean; changes you did not make — touch nothing, ask the owner. Then `git switch -c claude/sNN-<step>` (`claude/s02-spec`, `claude/s02-ticket-03`, `claude/s02-fix1-review`) or `claude/fix-<slug>`. A session the app already put in its own worktree keeps its branch and only brings it up to date with `main`.

## Self-check (ticket and quick fix)

Before the owner sees the change:
1. The full test suite passes; failures listed as known in `PROJECT_CONTEXT.md` don't count, new ones do.
2. `npm run build` passes. Start the app: `npx vite preview --port 4176` (stop the running one first).
3. Walk the owner's check exactly as you will write it in the browser pane (desktop app) or Playwright, at phone width (420 px), in test mode `?mem=1` (below). What only the owner can do — iPhone, real Firestore data, Google sign-in, Drive and Sheets, offline on site — stays theirs and is listed as unverified.
4. Fix what broke and repeat. The owner's check then lists what you could not verify, and one line says what you did.

**Test mode `?mem=1`.** Data in memory, a stub sign-in (`test@example.com`; another address: `&memEmail=…`), Google replaced by a stub (`window.__gcalls`). `window.__pzTest = { state, getRepo, currentProject, setCurrentProject }` gives access to data: create a project with `__pzTest.getRepo().createProject(...)` and load a copy of the owner's backup (format `polevoy-import-1`) into it. The tour pops up first: press «Не напоминать». Listeners are synchronous here, so races of real Firestore do not reproduce — think those through in the code.

## End of a session

1. Status line of the step's file → `in review`. Commit and `git push -u origin <branch>` — allowed without asking.
2. Ticket and quick fix only: after the self-check, bring the branch up to date (`git pull --rebase origin main` — the pool bot may have committed) and `git push origin HEAD:main`; wait for the deploy (`gh run list --workflow pages.yml --limit 1`, usually 1–2 minutes). A failed deploy is fixed before you report.
3. Message to the owner, Russian:
   - what was done, 2–4 lines;
   - ticket and quick fix — "it is on the site" in one line and the numbered check (rules below);
   - description, spec, slicing, review — a retelling of the key points and every decision needed from the owner; they approve by the retelling; the file path for those who want to read.
4. AskUserQuestion: ticket and quick fix — «Работает» / «Есть замечания»; other steps — «Коммит» (принять и перенести в `main`) / «Есть замечания».
5. **«Есть замечания»:** fix, self-check, push (ticket and quick fix: to `main` again), show the change, ask again.
6. **«Работает» / «Коммит»:**
   - the step file → `accepted`; `PROJECT_CONTEXT.md` — State and Stages updated, the Next step (new one with model and effort from `docs/models.md` after a chain step; unchanged after a quick fix), within budget; `docs/history.md` — a dated entry: what changed, where, which decisions;
   - commit, push the branch, then into `main`: if `main` has not moved — `git push origin HEAD:main`; if it has — merge `main` into the branch, run the tests, push, then `git push origin HEAD:main`. `main` history is never rewritten;
   - after «Работает» this commit's message starts with `✅ Checked by owner: <what exactly>` — the marker of the last state the owner verified;
   - the closing message, in this shape:
     > Готово, всё в `main`. В следующей сессии мы будем делать <what, one line> («<session title>»). Это <простая / средняя / сложная> работа, поэтому рекомендую модель **<model>** с effort **<effort>**. Откройте новую сессию, выберите их и напишите «дальше».

     After a quick fix: «Готово, всё в `main`. Следующий шаг не изменился: <session title>. Новую правку — в новой сессии: «Правка: …».»

## Instructions for the owner

The owner is not a programmer. For anything they do by hand:
- step by step, nothing skipped; for each step — where: which window (PowerShell, browser, phone), which folder, which account;
- one command per code block, in the owner's shell (PowerShell);
- for a check — the exact text to type or button to press, what should appear, and what "wrong" looks like; checks are mostly on the iPhone (icon on the home screen), sometimes in the browser on Windows;
- each technical term explained in plain words the first time («журнал» — файл, куда программа пишет, что она делает);
- the app updates itself; if not yet: ☰ → Настройки → «🔄 Обновить приложение»;
- short, plain Russian, no jargon; if something failed or is not done, say it directly.

## Documents

| File | Holds | Budget |
|---|---|---|
| `CLAUDE.md` | rules, run commands, pointers | 60 lines and 6,000 bytes |
| `PROJECT_CONTEXT.md` | Next step, state, stages, environment, gotchas | 20,000 bytes |
| `docs/project-spec.md` | the product and its stages | — |
| `CONTEXT.md` | glossary | — |
| `docs/adr/` | one decision per file with its reasons; replaced by a new ADR, never rewritten | — |
| `KNOWN_ISSUES.md` | index on top, entries below | one index line per entry |
| `docs/coding-standards.md` | rules with reason and check; added by the ticket that introduces a rule | — |
| `docs/code-map.md` | architecture, the files that are not code, and the list of the modules built from their header comments by `tools/code-map.mjs` — never edited by hand | — |
| `docs/rollback.md` | release and rollback branches, how to roll back | read when needed |
| `docs/history.md` | dated details of accepted steps | read rarely |
| `docs/models.md` | model and effort per session | — |
| `docs/ideas/` | one idea spec per file, with its stage and status | — |
| `.scratch/NN-<slug>/` | a stage's description, spec, tickets, review, mockups | — |
| `README.md`, `ВОССТАНОВЛЕНИЕ.md` | for people (Russian): what the app is; how to restore everything elsewhere | — |

Budgets are in bytes (`wc -c`; in Git Bash `wc -m` counts bytes too), not lines: a few very long lines pass a line budget and still cost tens of thousands of tokens in every session (a token is about 4 bytes of English and about 2.7 bytes of Russian). Each fact has one home; other files point to it. Over budget → the oldest detail moves to `docs/history.md`.
