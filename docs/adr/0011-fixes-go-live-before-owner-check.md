# Code goes live after the self-check; the owner checks on the live site

Status: accepted

Decided at adoption (2026-11-10). The owner checks on their iPhone with real data, and the only site is built from `main`. A preview site was offered and declined: the owner keeps the old way — a change reaches `main` (and the site) after the session's self-check (tests, build, browser at phone width), then the owner checks live and answers «Работает» or with remarks. Stage documents still wait for the owner's «Коммит».

Safety net instead of a gate: rollback branches before risky changes (`docs/rollback.md`), `✅ Checked by owner: …` commits marking the last verified state, and the owner's backup to Drive.

Considered: a preview site on another path (same origin, so sign-in would work) — declined as extra moving parts; checking locally with `?mem=1` — cannot cover the iPhone and real data.

## Consequences

- A broken change reaches all users until fixed or rolled back; the self-check must be thorough.
- Branches (not tags) mark versions: tags could not be pushed from the old cloud sessions.
