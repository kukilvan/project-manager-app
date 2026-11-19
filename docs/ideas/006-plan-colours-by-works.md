# Idea 006: Plan colours by works, pink for pulled, thinner phone frames, focus frame goes away

Status: planned — stage 6, sliced into `.scratch/06-field-improvements/issues/08-plan-colours-works.md`
Added: 2026-11-19

## Why

Two points that are both only pulled look different on the plan: FC/C-55 (camera, five stages) is yellow, FC/D-04.2 (door, three stages) is yellow-green. Ticket 6.5 colours by the share of **stages** done, `round(k / n × 5)`, so one stage of three lands on the second step and one of five on the first. The owner wants one fixed colour that says "this point is pulled", and progress after the pull counted by **works**, the lines of the point's work list (FC/C-55 has 6 after the pull, FC/D-04.2 has 4).

On the phone the frames of the plan tags look too thick.

The magenta frame around the tapped point stays until another point is tapped; once the owner has done something with that point it is only in the way.

## Scenario

1. The owner opens «🗺 План» on the phone.
2. Every point whose pull is done and nothing else is pink `#E99AC4`, whatever its type and number of works.
3. A point with one work done after the pull is yellow; each further work moves it evenly towards green; all works done gives the thick dark-green frame of today.
4. A point whose pull is not finished (1 of 3 cables) is pink and, zoomed in, has small pink circles under it: one per cable, filled for a pulled cable. If other works are already done on it, the colour follows those works (yellow → green) and the circles stay until the last cable is pulled.
5. Tag frames on the phone are a quarter thinner.
6. The owner taps a point: the magenta frame shows it. They open its card (or add a work, mark a problem…), go back to the plan: the frame is gone.

## Behaviour

Colour of a point (first rule that fires):

1. Open problem or «Неисправна» → red `#ff1744` (unchanged).
2. No work at all (no cable pulled, no work done) → grey «новая» or blue «померяно» by the length (unchanged).
3. All works done, the pull included → dark green `#1b5e20`, frame ×1.75 (unchanged).
4. Some work done after the pull: `j` of `M` works after the pull done (`1 ≤ j`, and `j < M` or the pull is unfinished) → gradient colour at `t = (j − 1) / (M − 1)` (`t = 0` when `M = 1`), interpolated in the OKLab colour space from yellow `#fdd835` (`t = 0`) to green `#2e9e45` (`t = 1`). The owner chose this variant («1 — ровно») from three on the stand of 2026-11-19. It is continuous, so any number of works (2, 10, more) gets evenly spaced shades.
5. Otherwise (pull started or done, no other work done) → pink `#E99AC4`.

- Works after the pull: composite points — the point's tasks whose stage is not «Протяжка» (each line of the card's work list is one work, own works included); legacy points — the type's stages other than «Протяжка».
- A point type without a pull stage: rules 2–4 over all its works (no pink).
- Pull circles: shown only while the pull is unfinished (`pullDone < pullTotal`, counted per cable), one circle per cable, filled dark pink for a pulled cable, empty for not; only when zoomed in enough for tags (`big`), under the tag, the tag placement keeps room. No circles once every cable is pulled, and none on a red point.
- Shared mark (pair, triple): red if any point is red; otherwise the least finished point gives the colour and the circles (rank: unfinished pull first, by cables pulled; then by `j / M`).
- Legend under the plan, in order: «новая», «померяно», «протянута» (pink), a gradient strip «работы после протяжки» (yellow → green), «готово» (thick frame), «проблема / неисправна»; and a line for the circles: «кружочки — протянутые кабели». Hebrew and English get the same lines (`node scripts/i18n-build.mjs`).
- «PDF с номерами»: the same colours and legend, no circles. `numberedHash` changes, so the nightly job re-renders every file once.
- Phone frames: on a touch device (`lineK = 1`) every point frame of the plan is ×0.75: tag frame 2 → 1.5, finished point 3.5 → 2.6, the mark outline 2 / 1.5 → 1.5 / 1.1. A computer with a mouse keeps today's values (×2, the owner's wish at ticket 6.5).
- Focus frame (magenta `#e0007a`, `focusId` in `src/app/views/planmodal.js`): cleared when the owner comes back to the plan after any action on that point started from the plan (its card opened, a work added, a problem marked, a length or rack changed). A tap on an empty spot of the plan also clears it. Jumping to a point from elsewhere («показать на плане») still shows the frame until the first such action or tap. Selection (the blue frame of the selection bar) is not touched.

## What changes in existing behaviour

- `planColor` / `markColor` / `PLAN_LEGEND` / `PLAN_PALETTE` in `src/domain/plan.js`: colour by works after the pull instead of the share of stages; the four fixed steps and the «≈ 20% … 80%» legend go.
- Pink returns to the plan as «протянута» (stage 3 removed pink from the management sheets only; they stay without it).
- Circles return to the plan, but only for an unfinished pull (ticket 6.5 removed the stage dots at the owner's wish).
- Phone plan frames are thinner.
- The focus frame no longer stays forever.
- The plan filter of ticket 6.5 is unchanged.

## Data and external services

None new: works and pull counters come from `pointInfo` / `composedInfo` (`tasks`, `stageStats`, `pullDone`, `pullTotal`). «PDF с номерами» files on Drive are re-rendered once by the nightly job.

## Edge cases

- `M = 1` (one work after the pull): pulled → pink, done → dark green; the gradient is not used.
- All works after the pull done, the pull unfinished: the top gradient shade (`t = 1`), circles shown, not dark green.
- A work done before any cable is pulled: the gradient colour, with all circles empty.
- Re-check after «Не работает»: red until checked again (unchanged).
- A point with no works at all: grey / blue (unchanged).
- Many works (10+): shades get closer but stay evenly spaced; dark green with the thick frame still marks finished points clearly.
- Pink and the problem red side by side: the pink is light and blue-ish, the red saturated; check on the owner's drawing.

## Out of scope

- Management sheet row colours (stage 3) and the «🧵 Протяжки» screen colours (`statusColor`).
- Frame thickness on a computer with a mouse.
- Circles in «PDF с номерами».
- The plan's selection (blue frame) behaviour.

## Decisions

- Count works (lines of the work list), not stages — owner.
- Pulled = pink `#E99AC4`; partial pull = pink + circles per cable — owner.
- Pull unfinished but other works done: gradient by works + the pink circles — owner (at the confirmation).
- Gradient «1 — ровно»: OKLab `#fdd835` → `#2e9e45`, then the existing dark green — owner, from three variants.
- Phone frame 1.5 instead of 2 — owner; the same ×0.75 for every plan frame on the phone — agent, so frames stay in proportion.
- «PDF с номерами»: colours yes, circles no — owner.
- Focus frame clears after an action on the point or a tap on an empty spot — owner asked for the first; the empty-spot tap — agent, the usual way to drop a highlight.
- Circles dark pink, only when zoomed in, like the tags — agent: same rule as tags, readable on white.
- Ticket 6.8 of stage 6, after 6.7 and before «Ревью 6» — owner: it continues ticket 6.5.

## Owner check

On the phone, on the plan of the current project:
1. FC/C-55 and FC/D-04.2 (both only pulled) are the same pink.
2. Add one work to a pulled point: it turns yellow; more works move it towards green; the last one gives the thick dark green.
3. A point with part of its cables pulled: pink, zoomed in — circles under it, filled ones for the pulled cables; pull the rest — the circles go.
4. Frames look thinner than before; on the computer they are as before.
5. Tap a point, open its card, close it: the magenta frame is gone. Tap a point, then an empty spot: gone too.
6. The legend under the plan matches; a fresh «PDF с номерами» has the same colours.

## Tests

- `planColor`: pulled only (pink) for 3-, 5- and 7-work points — the same colour; `j` of `M` for `M` = 2, 4, 10 — the exact gradient hex values and even spacing; all done (dark green, width); `M = 1`; partial pull without other works (pink + `pull: { done, total }`); partial pull with works (gradient + circles); all works but pull unfinished; no pull stage; red over everything; grey / blue unchanged; legacy point by type stages.
- `markColor`: the ranking rule with partial pulls.
- `numberedInput` colours and `numberedHash` change; two builds of an unchanged project give the same hash.
- `PLAN_LEGEND` order and strings.

## Open questions for the stage

- How a partly pulled `6005×3` line is recorded (one task with `qty 3` or per cable): the ticket checks `pullDone` / `pullTotal` count cables, not tasks, before drawing circles.
- Pink `#E99AC4` on the owner's real drawing: adjust slightly at the check if it is too pale on white.
