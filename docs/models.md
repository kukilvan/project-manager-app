# Model and effort per session

The cheapest model that does the step well. The owner picks at the start of a session; the Next step line of `PROJECT_CONTEXT.md` carries the recommendation.

Models from cheaper and weaker to pricier and stronger: Haiku 5.5 → Sonnet 5.5 → Opus 5.5 → Fable 5.2. Effort (how long the model thinks): low → medium → high → xhigh → max.

| Session | Model | Effort | Why |
|---|---|---|---|
| Kickoff «Старт проекта» / «Перенос на схему» | Opus 5.5 | high | every later step builds on it |
| Description | Opus 5.5 | high | decisions are made here; a mistake spreads to the spec and every ticket |
| Spec | Opus 5.5 | high; xhigh for data model, money, security, concurrency | exact behaviour and edge cases |
| Slicing | Sonnet 5.5 | high | a ready spec, little to decide |
| Ticket, simple | Sonnet 5.5 | medium | texts, layout, a small change by a clear ticket |
| Ticket, medium | Sonnet 5.5 | high | a screen or a feature by a clear ticket |
| Ticket, complex | Opus 5.5 | high | data and migrations, concurrency, external APIs, tricky logic |
| Review | Opus 5.5 | high; xhigh for 5+ tickets or any complex ticket | finds what the tickets missed; saving here costs more later |
| «Вопрос: …» | Sonnet 5.5 | medium | no code |
| «Идея: …» (`/add-idea`) | Opus 5.5 | high | interview, placement and a spec — decisions, like a description |
| «Правка: …» | Sonnet 5.5; Opus 5.5 for storage, sync, offline, Firestore rules, drawing parsing or data migration | high | goes live right after the self-check |
| «Есть замечания» | the same session | the same | the session keeps its context |

- Fable 5.2 — only when Opus failed the same task twice, or for a final review before publishing.
- `max` — little gain for a large cost.
- Haiku 5.5 — only for mechanical text edits with nothing to decide.
- Sonnet going in circles (third try at the same thing): a new session on Opus 5.5 — «дальше, прошлая сессия не справилась с …».

## Spending less

Told to the owner once, at kickoff:
1. One session — one step: every reply re-reads the whole conversation, so a long session costs more.
2. Pick model and effort at the start and keep them: switching mid-session rebuilds the cache.
3. Start with «дальше» — everything else is in the docs.
4. Remarks as one list in one message.
