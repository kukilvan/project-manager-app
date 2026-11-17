Status: in review
Complexity: medium
Blocked by: 05

# 06. Translations 1: the guide

The in-app guide (`src/app/views/guide.js`) shows Russian in English and Hebrew: its missing strings (166 on 2026-11-17, plus the guide lines tickets 01–05 add) are translated through the dictionary and checked on screen. Idea 005, first half.

## Spec sections

§5.1 (the guide paragraph; the Hebrew trade words), §4.6-style tables are not repeated here.

## What to do

1. Run `node scripts/i18n-extract.mjs`; list the guide's strings that have no English or Hebrew entry (the guide lines of tickets 01–05 are already translated by those tickets — do not translate them twice).
2. Add English and Hebrew for each into `src/i18n/src/*.json`; Hebrew trade words follow `CONTEXT.md` (חיווט, שילוט, השחלה…); reuse existing translations of the same words (e.g. «Хивут» → «Termination» / «חיווט»). Keep the guide's own phrasing: short and plain, as in the Russian.
3. `node scripts/i18n-build.mjs`.
4. Check on screen, browser pane at 420 px, `?mem=1`: the guide in English, then in Hebrew (RTL), every section; write down what still shows Russian and fix it. Also open the screens of this stage in both languages (day form and day screen, shared lists, problems forms and card block, plan legend and filter) and fix leftovers inside their strings.
5. Header comments if a module changed.

## Done when

- Every section of the guide reads English in the English UI and Hebrew in the Hebrew UI, with no Russian left (names of buttons quoted in the guide match the translated buttons).
- The extractor lists no uncovered string from `guide.js`.
- `npm test`, `npm run build` pass.

## Tests to add

None new; the existing i18n tests stay green. (The coverage test is ticket 07.)

## Owner check

On the phone, after the site updates:
1. Ещё → Настройки → language English → open «Справка» / guide, scroll through every section: no Russian; the quoted button names are the ones you see in the app.
2. The same in Hebrew: right-to-left, no broken punctuation or lines running the wrong way.
3. Tell the agent any phrase that sounds wrong in Hebrew — it is a quick fix.
Wrong looks like: a Russian sentence in the middle of an English section, a button name in the guide that differs from the button on the screen.
