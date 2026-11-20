Status: accepted
Complexity: medium
Blocked by: —

# 07. English names: `nameEn`, own names first, example problems, test

English names of catalog items (KI-7, catalog part): built-in names all translated and kept so by a test; the owner's own items get an optional English name shown first in the English interface.

## Spec sections

§ 0 (D4, D5, D6), § 5 (all), § 8 (rows from «Название (English)» to the last example problem, guide line 5), § 9 (the field), § 11 (`CONTEXT.md`, `docs/project-spec.md`, KI-7 note), § 7 (rows on English UI).

## What to do

1. Example problems and their ready descriptions get dictionary entries in `src/i18n/src/*.json` (English and Hebrew, § 8 table) and leave `src/i18n/not-ui.json`; `node scripts/i18n-build.mjs`. The seed and `src/data/starter-pool.json` are **not** changed (D4).
2. `src/app/views/shilutsettings.js`: the template `по умолчанию${…}` becomes two literals `по умолчанию (${name})` and `по умолчанию — без цвета`; the strings of § 8.
3. Field «Название (English)» (`nameEn`, optional text) right after the Hebrew name in `REFS.catalog`, `REFS.devices`, `REFS.types`, `REFS.cables` (`src/app/views/settings.js`) and in the problem form (`src/app/views/problems.js`, after «Название на иврите»). Saving (`prepare` and the problem form's `onSubmit`): the trimmed value, written only when not empty, or `''` when the item had a `nameEn` before; an item that never had one gets no field (its pool fingerprint `deepHash` must not change by editing other fields). The reference-list `line()` shows nothing new. Door configurations get no field (D5).
4. Display: `ctxNames` in `src/app/shell.js` also runs in English — builds `name → nameEn` for items with a non-empty `nameEn` (catalog, devices, problems by `name`; types, cables by `id`) and passes it to a new `addOwnNames(map)` in `src/i18n/index.js`. `tr()` order in English: own names (exact text) → static dictionary → `extra` → patterns; sentences with a name inside («Проблема: {} ({})», «{} · {}») translate the name part through the same lookup. Hebrew order unchanged and ignores `nameEn`. Russian and Hebrew screens, the daily and month reports, «PDF с номерами» and the management sheets never read `nameEn`.
5. Check that `nameEn` travels with the item to the shared pool and its inbox (`src/domain/pool.js` compares whole items) and that `scripts/export-pool.mjs` keeps it; fix if not.
6. Docs: `CONTEXT.md` — `nameEn` in **Shared pool** («items carry `nameEn`, an optional English name»); `docs/project-spec.md` stage 7 Data («One new optional field, `nameEn`, on works, point types, devices, cables (project and shared pool) and on shared problems»; door configurations removed from the list); guide line 5; `KNOWN_ISSUES.md` KI-7 is updated only after the review (spec § 11) — do not close it here.
7. Header comments; `node tools/code-map.mjs`.

## Done when

- In English the example problems and the full names of door configurations show no Russian (`tests/catalog-en.test.js` passes); «Замок» shows «Lock».
- Own work «Датчик протечки» without `nameEn` shows its Russian name in English; with `nameEn` «Leak sensor» it shows «Leak sensor» in lists, filters, and sentences with a name; built-in «Камера» with own `nameEn` «CCTV camera» shows «CCTV camera» (D6).
- Hebrew and Russian unchanged; editing another field of an item without `nameEn` adds no `nameEn` key.
- `npm test`, `npm run build`, `node tools/code-map.mjs --check` pass.

## Tests to add

- `tests/catalog-en.test.js` (§ 5.1): every Cyrillic name of the seed (`CATALOG`, `composedTypes(POINT_TYPES)`, `DEVICES`, `CABLES`, `UNITS`, `CULPRITS`, `DELAY_REASONS`), of `src/data/starter-pool.json` (types, devices, cables, works, door configurations), of `EXAMPLE_PROBLEMS` (names and descriptions), of `SHILUT_COLORS`, the door part names and the short words of `doorcfg.js` goes through the real `tr()` in English (the loader of `tests/i18n-coverage.test.js`) and comes out with no Cyrillic letters.
- `tr()` with own names: own name wins in English; Hebrew order unchanged (in `tests/i18n-coverage.test.js` or a new file using its loader).
- `prepare` / form save: `nameEn` written only when not empty, `''` to clear, no key for an item that never had one.
- The coverage test passes with the new strings.

## Owner check

On the phone, after the site updates:
1. ☰ → Настройки → English. «Проект» → problems: the example problem «Замок» reads «Lock».
2. Reference list → «Каталог работ» → make a work of your own with «Название (English)» «Leak sensor»: it shows as «Leak sensor» in English, in «Что осталось» and in the add-work form.
3. Switch to Hebrew and Russian: the work shows its own name there.
