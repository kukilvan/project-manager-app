# File formats

Read the section for the file you are writing.

Every step file opens with `Status: open | in review | accepted`. A ticket adds `Complexity: simple | medium | complex` and `Blocked by: MM, MM` (or `—`).

## Description — `.scratch/NN-<slug>/description.md`

- Goal: why, in plain words.
- What the owner will see at the end: scenarios, screens (mockups in `mockups/`).
- In scope · out of scope.
- Pulled-in `KNOWN_ISSUES.md` entries and review wishes.
- Decisions taken with the owner: what and why.
- Open questions for the spec.

## Spec — `spec.md`

- Behaviour per scenario: exact texts, states, errors.
- Data: what is stored; migrations.
- External services: requests, limits, failure handling — checked against real responses where possible.
- Edge cases, each with its expected behaviour.
- Tests: what is automated, what the owner checks live.
- Docs to update; new `CONTEXT.md` terms; new ADRs; new `KNOWN_ISSUES.md` entries.
- Proposed tickets: order, complexity, dependencies.

## Ticket — `issues/MM-<slug>.md`

- Spec sections it implements.
- What to do: a concrete list.
- Done when: checkable criteria.
- Tests to add.
- Owner check: the live check, in plain words.

## Review — `review.md`

- What was reviewed: commit range, tickets.
- Tests: results at the start and at the end.
- What was verified by running, not only by reading.
- Findings: `F<n>` — what, where, decision (fix now · fix round · defer `KI-<n>`), why.
- Wishes for later stages.

## Code map — `docs/code-map.md`

Built, not written. A script (`tools/code-map.mjs`, Node) lists every source module (`src/`, `scripts/`) as `` - `path` — first sentence of its description `` between the markers `<!-- code-map:start … -->` and `<!-- code-map:end -->`, sorted by path. The sentence is one line of at most 200 characters (the first sentence of the first paragraph of the header comment — the leading `//` or `/* */` block — joined into one line); a period inside a number, a file name or an abbreviation does not end it. With `--check` the script changes nothing and exits with 1 when the file is stale. A test calls the same functions and fails on a stale file, a module without a description or a sentence over the limit. The parts above the markers (architecture, files that are not code) are written by hand.

## ADR — `docs/adr/NNNN-<slug>.md`

Written when a decision is hard to reverse, surprising without context, or a real trade-off.

```text
# <The decision, as a statement>

Status: accepted | superseded by NNNN

Context and decision in 1–3 paragraphs; options considered and why they lost.

## Consequences

- What follows from it.
```

## Commit messages

English, `<Step>: <what>` — `Spec 2: login and sessions`, `Ticket 2.3: add login page`, `Review 2: fix button labels`, `Fix: pull meters for paired points`. After the owner's «Работает»: `✅ Checked by owner: <what exactly>`. Older history (before 2026-11-10) is in Russian, with `✅ Проверено Иваном: …` markers.
