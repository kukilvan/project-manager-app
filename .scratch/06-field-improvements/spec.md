Status: accepted

# Stage 6. Field improvements — spec

Built from `description.md` (accepted 2026-11-17) and ideas 001–005. Sections 1–5 follow the ideas in their build order; § 6 lists the open questions of the description with their answers; §§ 7–11 are services, tests, docs and tickets. UI strings are given as «Russian» with English and Hebrew in the tables of each section; a string already in the dictionaries is not repeated.

Words: `CONTEXT.md`. New terms of this spec: shared list, problem mark, stage dots (§ 10).

## 1. Day off (idea 001)

### 1.1 Data

A day off is a `days` document of the project, as any day (one day per date in a project stays):

| Field | Value |
|---|---|
| `off` | `true` for a day off; `false` or absent — a working day |
| `offReason` | ready reason id: `personal`, `holiday`, `sick`, `shabbat`, `nowork`, `weather`, `other` |
| `offText` | own text, only with `other` (trimmed, required then) |

Switching a day off back to working writes `off: false, offReason: null, offText: null`. Helper fields (`helper`, `helperHe`, `object`) are not touched while the day is off, so they come back when it is a working day again.

The ready reasons live in code, `src/domain/dayoff.js` (new, pure):

| id | Russian | Hebrew |
|---|---|---|
| `personal` | Личное | אישי |
| `holiday` | Праздник | חג |
| `sick` | Болезнь | מחלה |
| `shabbat` | Шаббат | שבת |
| `nowork` | Нет работы на объекте | אין עבודה באתר |
| `weather` | Погода | מזג אוויר |
| `other` | Другое | אחר |

`dayOffText(day, lang)` → the reason in `ru` or `he`; for `other` — `offText` as typed, in every language. The UI shows the Russian reason through the dictionary (English «Holiday» etc., table 1.6).

### 1.2 Day form («Новый день» / «День»)

Fields, top to bottom: «Дата»; «🌴 Выходной» (checkbox); «Причина выходного» (dropdown of the seven reasons, empty first, visible when on); «Своя причина» (text, visible when on and «Другое» is chosen); «Помощник (пусто = сам)», «Помощник на иврите», «Объект (для разового выезда)» (all three hidden when on); «Комментарий в конце отчёта» (always).

On «Сохранить», in this order (the first failing check stops the save, the form stays open):
1. Existing rule «one day per date in the project» — unchanged.
2. Day off without a reason → toast «Выберите причину выходного»; «Другое» with empty text → «Впишите свою причину».
3. Turning an existing day with entries into a day off → message window (one button «Понятно»): «В этом дне есть записи: N. Выходной — день без работы: сначала удалите записи, потом включите «🌴 Выходной».» (decision: block, § 6 Q1).
4. Day off on a date that has a not-deleted working day in another live project of the user → message window, title «Нельзя сделать выходным», text «DD.MM.YYYY уже есть рабочий день в проекте «<name>». Сначала удалите тот день или выберите другую дату.», button «Понятно» (description, decision 2).
5. Working day (new, or a day off switched back) on a date that is a day off in another live project → title «Эта дата — выходной», text «DD.MM.YYYY — выходной в проекте «<name>». Сначала снимите там «🌴 Выходной» или выберите другую дату.», «Понятно» (agent, the same rule from the other side; the owner confirms at «Коммит»).
6. Existing «date far from today» confirmation — unchanged.

Checks 4 and 5 use the days of all live projects the app already listens to (`allDays()`, the same set as «Месяц»); a pure helper `dayConflict(days, projects, { date, projectId, dayId, off })` in `dayoff.js` returns `null` or `{ kind: 'work' | 'off', project }`. A saved day off does not move `project.lastWorkDate`.

### 1.3 «Отчёты»

- List of days: a day off reads `DD.MM.YYYY` and under it «🌴 Выходной: <reason>» instead of «записей: N» / «пока без записей» (the author name stays after « · »).
- Day screen of a day off: date, «🌴 Выходной: <reason>», the comment (if any) as plain text, the hint «Это выходной: записей и отчёта у него нет. Чтобы снова сделать день рабочим, нажмите «✏️ Изменить день» и выключите «🌴 Выходной».», buttons «← Все дни» and «✏️ Изменить день». No «➕ Добавить работу», «Несколько работ» or report cards.
- «Удалить день» of a day off asks «Удалить выходной DD.MM.YYYY? Его можно будет вернуть из истории.».
- «📝 Сегодня» on a day-off date opens that day screen, as today.
- Every path that records work into today's day — `addWorkForPoints`, `addWorkForPoint`, `markShilutForPoints` (point card, plan, racks, «Что осталось», pulls) — when today is a day off in the current project: no form, no write; message window «Сегодня отмечен выходной (<reason>). Чтобы записать работу, откройте «Отчёты» → сегодняшний день → «✏️ Изменить день» и выключите «🌴 Выходной».». When today has no day yet and is a day off in another project: the window of check 5. `markShilutForPoints` returns `{ made: 0, blocked: true }` so the rack screen shows nothing more.

### 1.4 «Месяц» and the month texts

- `workdaysList` / `workdaysReport` (`month.js`): a day off is one block «DD.MM.YYYY — выходной — <reason ru>» in date order among the working-day blocks; `count` counts working days only; a new field `offCount`. Days off of several projects on one date show once (the earliest created); a working day and a day off on one date (possible only after an offline race, § 8) both show.
- Screen: «Дней: N» stays when the month has no day off; with days off — «Дней: N · выходных: M». The «Рабочие дни:» card shows when there is any day (working or off); the empty text stays «В этом месяце дней с отчётами нет.».
- `monthDays`-based functions skip days off in sums: `monthSummary.days`, minutes, quantities, pulls; `downtimeByCulprit` ignores them.
- `monthReportRu`: a day off is the line «DD.MM.YYYY — выходной — <reason ru>» plus the comment on the next line, in place of its daily report. `monthReportHe`: «DD.MM.YYYY — יום חופש — <reason he>» plus the comment. (Both are not on screen today; they stay tested.)
- `doh(day)` of a day off returns the same Russian / Hebrew / English one-liner («DD.MM.YYYY — day off — <reason>» in English through the name translator), so no caller prints an empty report.
- Excel export (`export.js`, sheet «Дни и работы»): a day off is one row: date, object, helper, «Выходной» in «Тип работы», the reason in «Работа», the comment.

### 1.5 Guide line (`guide.js`, section «Отчёты»)

«• 🌴 Выходной: в форме дня включите «🌴 Выходной» и выберите причину. У выходного нет записей и отчёта; «Месяц» показывает его строкой и не считает рабочим днём. Дата, где в другом проекте уже есть рабочий день, выходной не станет.»

### 1.6 Strings

| Russian | English | Hebrew |
|---|---|---|
| 🌴 Выходной | 🌴 Day off | 🌴 יום חופש |
| Причина выходного | Reason for the day off | סיבת יום החופש |
| Личное | Personal | אישי |
| Праздник | Holiday | חג |
| Болезнь | Sick | מחלה |
| Шаббат | Shabbat | שבת |
| Нет работы на объекте | No work on site | אין עבודה באתר |
| Погода | Weather | מזג אוויר |
| Другое | Other | אחר |
| Своя причина | Own reason | פירוט הסיבה |
| Выберите причину выходного | Choose the reason for the day off | בחרו את סיבת יום החופש |
| Впишите свою причину | Type the reason | כתבו את הסיבה |
| 🌴 Выходной: {} | 🌴 Day off: {} | 🌴 יום חופש: {} |
| Это выходной: записей и отчёта у него нет. Чтобы снова сделать день рабочим, нажмите «✏️ Изменить день» и выключите «🌴 Выходной». | This is a day off: it has no entries and no report. To make it a working day again, tap “✏️ Edit day” and turn off “🌴 Day off”. | זה יום חופש: אין בו רשומות ואין דוח. כדי להפוך אותו שוב ליום עבודה, לחצו „✏️ עריכת היום” וכבו את „🌴 יום חופש”. |
| В этом дне есть записи: {}. Выходной — день без работы: сначала удалите записи, потом включите «🌴 Выходной». | This day has entries: {}. A day off has no work: delete the entries first, then turn on “🌴 Day off”. | ביום הזה יש רשומות: {}. ביום חופש אין עבודה: קודם מחקו את הרשומות ואז הפעילו את „🌴 יום חופש”. |
| Нельзя сделать выходным | Can't make it a day off | אי אפשר להפוך ליום חופש |
| {} уже есть рабочий день в проекте «{}». Сначала удалите тот день или выберите другую дату. | {} already has a working day in project “{}”. Delete that day first or choose another date. | ב-{} כבר יש יום עבודה בפרויקט „{}”. קודם מחקו את היום ההוא או בחרו תאריך אחר. |
| Эта дата — выходной | This date is a day off | התאריך הזה הוא יום חופש |
| {} — выходной в проекте «{}». Сначала снимите там «🌴 Выходной» или выберите другую дату. | {} is a day off in project “{}”. Turn off “🌴 Day off” there first or choose another date. | {} הוא יום חופש בפרויקט „{}”. קודם כבו שם את „🌴 יום חופש” או בחרו תאריך אחר. |
| Сегодня отмечен выходной ({}). Чтобы записать работу, откройте «Отчёты» → сегодняшний день → «✏️ Изменить день» и выключите «🌴 Выходной». | Today is marked as a day off ({}). To record work, open “Reports” → today → “✏️ Edit day” and turn off “🌴 Day off”. | היום מסומן כיום חופש ({}). כדי לרשום עבודה פתחו „דוחות” ← היום ← „✏️ עריכת היום” וכבו את „🌴 יום חופש”. |
| Удалить выходной {}? Его можно будет вернуть из истории. | Delete the day off {}? You can restore it from history. | למחוק את יום החופש {}? אפשר יהיה לשחזר אותו מההיסטוריה. |
| Дней: {} · выходных: {} | Days: {} · days off: {} | ימים: {} · ימי חופש: {} |
| the guide line of 1.5 | • 🌴 Day off: in the day form turn on “🌴 Day off” and choose the reason. A day off has no entries and no report; “Month” shows it as a line and does not count it as a working day. A date that already has a working day in another project cannot become a day off. | • 🌴 יום חופש: בטופס היום הפעילו „🌴 יום חופש” ובחרו סיבה. ביום חופש אין רשומות ואין דוח; „חודש” מציג אותו בשורה ולא סופר אותו כיום עבודה. תאריך שכבר יש בו יום עבודה בפרויקט אחר לא יהפוך ליום חופש. |

Report texts (the month lines, `doh` of a day off, the Excel row) are data, not UI: Russian and Hebrew as above, not in the dictionary.

## 2. Shared lists: delay reasons and culprits (idea 002 + owner)

### 2.1 Decision (ADR 0016, replaces 0015)

«Причины задержки точек», «Виновники простоя» and «Проблемы» (§ 3) are each one list per database in the shared pool. Projects keep **no copies**: the app reads the pool directly. The per-project `delayReasons` and `culprits` collections stay in Firestore untouched and read-only — the app stops writing them, uses them only to show a name that is not in the pool and as the source of the one-time merge. Units stay per project.

### 2.2 Data

| Collection | Doc id | Fields |
|---|---|---|
| `pool_delayReasons` | the Russian name (through `docKey`, as today) | `id`, `he`, `deleted`, `updatedBy`, `updatedByName`, `updatedAt`, `updatedAtServer` |
| `pool_culprits` | the Russian name | the same |
| `pool_problems` | § 3.1 | § 3.1 |
| `projects/{pid}` | — | new `sharedLists: 1` — the project's lists are merged (§ 2.4) |

Deletion is soft in every backend: `{ deleted: true }`; the memory backend (`?mem=1`, on-device) changes its pool `remove` from erasing to the same mark, and its `listenPool` keeps passing every document (consumers already filter `deleted`). A deleted item can be added again under the same name: the write sets `deleted: false`.

Points (`delayReasonId`) and day entries (`delayReason`, `delayCulprit`, old `culprit`) keep referring by the Russian name; nothing on them changes.

### 2.3 What the app reads

New module `src/app/shared.js`: listens to the three pool collections through `repo.listenPool(kind, cb, { withDeleted: true })` (the Firestore backend stops filtering deleted documents when asked; the existing pool kinds keep the default), keeps them in maps, runs the merge and the seeding (§ 2.4), notifies `store.js`, which rebuilds the context on every change.

New pure module `src/domain/shared.js`:
- `sharedView(projectItems, poolItems)` → the list for lookups: live project items marked `legacy: true`, overlaid by every pool item of the same id (deleted pool items too, marked `deleted`). `buildContext` takes `shared: { delayReasons, culprits, problems }`; `ctx.delayReasons` and `ctx.culprits` are built from `sharedView`, so the daily report, «Месяц», the management sheet column «Причина задержки» and the Excel export show the Hebrew of any name that is either in the pool or in the project's old list.
- `choiceList(view)` → what pickers offer: pool items not deleted, plus legacy items whose id is not in the pool at all (live or deleted). After the merge, legacy-only items disappear; an item the administrator deleted never comes back from an old list.

Pickers that use `choiceList`: the point form and mass edit («Причина задержки»), the day-entry form («⏱ Задержка: причина», «виновник», «Виновник (прежняя запись)»).

### 2.4 One-time merge and seeding

Runs in `src/app/shared.js` at start (after sign-in, when the repo is ready, online), and again on the next start if it did not finish. For each live project of the user without `sharedLists >= 1`, newest `lastWorkDate` first:
1. Read the project's `delayReasons` and `culprits` and the two pool collections **from the server** (new repo calls `readColl(pid, coll)` and `readPool(kind)`: Firestore `getDocsFromServer`, reads counted; the memory backend returns its buckets). Offline or a read error → stop the whole run, retry at the next start.
2. Plan with the pure `mergePlan(pool, items, projectName)` → `{ ops, conflicts }`: an item absent from the pool → added with its `he`; a live pool item with empty `he` → `he` filled from the item; a live pool item with another non-empty `he` → kept, the pair goes to `conflicts`; a deleted pool item → skipped. Deleted project items are ignored. The in-memory pool copy takes the ops, so the next project of the run sees them.
3. `repo.savePool(ops)` and wait for it; then `saveProject(pid, { sharedLists: 1 })`. A rejected pool write → the project is not marked; toast once per start «Общий список не записался: правила базы устарели — их нужно обновить в Firebase.»; event log line.
4. Event log (Russian, not UI): «Общие списки: проект «<name>» — причин +N, виновников +M» and one line per conflict «Общие списки: «<name>» — иврит «<kept>» оставлен, «<other>» из проекта «<project>» не взят».

After the projects, seeding: when the listener shows a pool collection empty, the run confirms it with `readPool` (a new device's cache may be empty); if the collection has **no document at all** on the server (not even a deleted one), it gets its defaults — `pool_delayReasons` ← `DELAY_REASONS`, `pool_culprits` ← `CULPRITS` (`src/domain/seed.js`), `pool_problems` ← the example problems (§ 3.1). So a new database without projects gets the lists, the owner's database gets the example problems once, and deleted examples never return. Two devices seeding at once write the same ids — harmless.

`createProject` stops seeding `culprits` and `delayReasons` into the new project (units stay).

### 2.5 Screens (Ещё → «Выпадающие списки (справочники)»)

- The list rows «Причины задержки точек», «Виновники простоя», «Проблемы» get the sub line «Общий для всех проектов · N пунктов» (N = `choiceList` size; problems: live problems).
- List screen of delay reasons and culprits: on top «🔗 Общий список для всех проектов этой базы. Удаляет только администратор.», then the existing hint. Rows: name; sub «<he or —> · в этом проекте: N» — N: delay reasons — points of the current project with this reason; culprits — entries of the current project with this `culprit` or `delayCulprit`.
- «➕ Добавить пункт» and the item form as today (name once, Hebrew required); saving writes the pool (`repo.savePool`), toast «Сохранено в общем списке». A name already in the list → «Такой пункт уже есть»; a name that was deleted is added again.
- «Удалить» in the item form only for the pool administrator (`isPoolAdmin()`); confirmation «Удалить «<name>» из общего списка? Его нельзя будет выбрать ни в одном проекте этой базы. Точки и записи, где он уже стоит, его сохранят.»; toast «Удалено из общего списка».
- On-device mode: the same screens; the device user is the administrator (`isAdminEmail` → `isLocal()`), as for door configurations.

### 2.6 Backup, import, starter pool, server

- `buildBackup(project, data, now, shared)`: `reference.delayReasons`, `reference.culprits`, `reference.problems` = the live pool items. The project's old lists are no longer written to the backup.
- Import (`views/import.js`): `reference.delayReasons`, `culprits`, `problems` of a file → added to the pool when the id is absent there (nothing overwritten, deleted ones not revived); never into project collections.
- Starter pool: `scripts/starter-from-backup.mjs` and `scripts/export-pool.mjs` add the kinds `delayReasons`, `culprits`, `problems`; `seedStarterPool` seeds whatever kinds the file has (unchanged logic). Until the Monday bot refreshes the file, the code defaults of § 2.4 cover new databases.
- Nightly job (`scripts/server-tables.mjs`): reads `pool_delayReasons` and `pool_problems` once per run and passes them to every project's `buildContext` (the same `shared` argument); `changedSince` adds the two top-level collections to its «anything changed since the project's mark» `limit(1)` queries, so a fixed Hebrew name reaches the sheets the same night. `pool_culprits` is not needed by the sheets.
- Server backup and restore copy all top-level collections already (`listCollections`): nothing to change.

### 2.7 Firestore rules

Added to `firestore.rules` after `pool_doorcfg`, the same rule as door configurations (live in the owner's database since stage 1 — any member writes, only the administrator deletes):

```
// Shared delay reasons, culprits and problems: any member adds and edits; only the pool admin deletes (marks deleted)
match /pool_delayReasons/{id} { allow read: if signedIn(); allow create, update: if poolAdmin() || (allowed() && request.resource.data.get('deleted', false) == false); allow delete: if poolAdmin(); }
match /pool_culprits/{id} { …the same… }
match /pool_problems/{id} { …the same… }
```

`firestore.open.rules` is regenerated by `openRules` (the existing test compares). Problem marks (§ 3.2) are a project subcollection and are covered by the existing project rule. `sharedLists` on the project document is a member-writable key.

**Order on go-live:** the owner publishes the new `firestore.rules` in the Firebase console of `polevoy-zhurnal` **before** the ticket's code reaches `main` (the new rules only add, so they are safe to publish early). Colleagues with their own database: «Подключение к базе» → «📋 Скопировать правила» (the guide already says so); until then their shared-list writes are rejected and the toast of § 2.4 shows.

### 2.8 Guide line (section of reference lists)

«• Причины задержки, виновники простоя и проблемы — общие списки для всех проектов базы: добавленное в одном проекте видно во всех. Удаляет только администратор базы; там, где пункт уже стоит, он сохраняется.»

### 2.9 Strings

| Russian | English | Hebrew |
|---|---|---|
| Общий для всех проектов · {} пунктов | Shared by all projects · {} items | משותף לכל הפרויקטים · {} פריטים |
| 🔗 Общий список для всех проектов этой базы. Удаляет только администратор. | 🔗 One list for all projects of this database. Only the administrator deletes. | 🔗 רשימה משותפת לכל הפרויקטים במאגר הזה. רק המנהל מוחק. |
| {} · в этом проекте: {} | {} · in this project: {} | {} · בפרויקט הזה: {} |
| Сохранено в общем списке | Saved to the shared list | נשמר ברשימה המשותפת |
| Удалить «{}» из общего списка? Его нельзя будет выбрать ни в одном проекте этой базы. Точки и записи, где он уже стоит, его сохранят. | Delete “{}” from the shared list? It can no longer be chosen in any project of this database. Points and entries that already have it keep it. | למחוק את „{}” מהרשימה המשותפת? לא יהיה אפשר לבחור בו באף פרויקט במאגר הזה. נקודות ורשומות שכבר יש בהן אותו ישמרו אותו. |
| Удалено из общего списка | Deleted from the shared list | נמחק מהרשימה המשותפת |
| Общий список не записался: правила базы устарели — их нужно обновить в Firebase. | The shared list was not saved: the database rules are out of date — update them in Firebase. | הרשימה המשותפת לא נשמרה: כללי המאגר ישנים — צריך לעדכן אותם ב-Firebase. |
| the guide line of 2.8 | • Delay reasons, people responsible for downtime and problems are shared lists for all projects of the database: what is added in one project is seen in all. Only the database administrator deletes; where an item is already used, it stays. | • סיבות עיכוב, אחראים לעיכוב ובעיות הן רשימות משותפות לכל הפרויקטים במאגר: מה שנוסף בפרויקט אחד נראה בכולם. רק מנהל המאגר מוחק; היכן שפריט כבר בשימוש, הוא נשאר. |

## 3. Problems on points (idea 003)

### 3.1 The reference list `pool_problems`

Document (id `pr_<newId(8)>`; examples have fixed ids):

```
{ id, name: 'Магнит индикация', nameHe: 'מגנט חיווי',
  types: ['Дверь'],                       // empty — every point type
  descs: [{ id: 'd_<newId(6)>', ru, he, deleted? }],
  deleted, updatedBy, updatedByName, updatedAt, updatedAtServer }
```

- A problem fits a point when `types` is empty, or contains the point's `typeId`, or contains the name of the point type's group (`type.group`, e.g. «Дверь» covers every door type) — pure `problemFits(problem, point, ctx)`.
- A ready description is never erased: ✕ in the form sets `deleted: true` on it (hidden from choice, still shown on marks that use it). Any member edits a problem and its descriptions; only the administrator deletes the problem.
- Example problems (seeded by § 2.4; ids fixed so two devices make one set):

| id | name / nameHe | types | descriptions (id: ru / he) |
|---|---|---|---|
| `pr_magnet` | Магнит индикация / מגנט חיווי | Дверь | `d_notdrilled`: Не просверлены двери / הדלתות לא קדוחות |
| `pr_lock` | Замок / מנעול | Дверь | `d_nopower`: Нет питания на замке / אין מתח במנעול |
| `pr_cable` | Кабель / כבל | — | `d_damaged`: Кабель повреждён / כבל פגום; `d_short`: Кабель не дотянут / הכבל לא הושחל עד הסוף |
| `pr_access` | Доступ / גישה | — | `d_noaccess`: Нет доступа в помещение / אין גישה לחדר |

### 3.2 Problem marks (ADR 0017)

Project subcollection `problemMarks` (added to `COLLECTIONS`, so `store.js` listens and the history, rollback and delta reads work as for every collection). One document per point × problem × time:

```
{ id: newId(), pointId, problemId,
  descId: 'd_…' | null, text: '<own Hebrew>' | null,   // at most one of the two; both null — no description
  markedAt, markedBy, markedByName,                     // set on marking and on re-marking
  solvedAt: null | ms, solvedBy, solvedByName }
```

- Open mark: `solvedAt` empty and not `deleted`. Marking a problem that the point already has open updates that mark (description, `marked*`), it does not add one. A solved problem marked again is a new mark; the old one stays as history.
- Two members marking the same problem on one point offline make two open marks: the point shows the newest; «Решено» solves all open marks of that problem on that point.
- Context: `buildContext` builds `ctx.problems` (map of `pool_problems`, deleted included) and `ctx.marksByPoint` (marks of existing points, open first by `markedAt` desc, then solved by `solvedAt` desc).
- New pure module `src/domain/problems.js`: `openProblemsOf(point, ctx)` (deduplicated by problem), `marksOf(point, ctx)`, `problemFits`, `problemsForPoints(points, ctx)` (§ 3.4), `markOps(pointIds, { problemId, descId, text }, by, now, ctx)`, `solveOps(pointIds, problemId | null, by, now, ctx)`, `problemLabel(mark, ctx, lang)` → «<problem>: <description>» / «<problem>», `problemCounts(points, ctx)` → `{ points, marks, byProblem }`, `EXAMPLE_PROBLEMS`.
- Display language of names and ready descriptions: Russian UI — `name` / `ru`; Hebrew UI — `nameHe` / `he` (they are added to the Hebrew name translator next to delay reasons, `shell.js`); English UI — Russian (reference lists have no English, description «out of scope»). Own text shows as written everywhere.
- A deleted problem or description still shows on marks (name and text from the deleted record); it is not offered for new marks.
- Point merge (`src/domain/merge.js`): the open marks of points merged away move to the kept point (`pointId` updated), except a problem the kept point already has open (that mark is solved by the merge with `solvedByName` of the user). Deleting a point leaves its marks; restoring the point brings them back.
- Writes: a mass mark of N points is N mark writes plus N history entries (≈ 1,500 writes for 750 points, within the 20,000 daily limit); offline they wait and sync like any write.

### 3.3 «⚠ Проблемы» reference screen

Ещё → «Выпадающие списки (справочники)» → «Проблемы» (after «Причины задержки точек»; sub line § 2.5).
- On top «🔗 Общий список для всех проектов этой базы. Удаляет только администратор.» and «Конкретная неполадка на точке, например «не просверлены двери». Отмечается кнопкой «⚠ Проблема» у выбранных точек.»
- Rows (live problems, by name): «<name> · <types joined by «, » or «все типы»>», sub «<nameHe>», on the right «N открыто» (points of the current project with this problem open; nothing when 0). Button «➕ Добавить проблему».
- Form («Новая проблема» / the problem's name): «Название» (required), «Название на иврите» (required), «Для типов точек (пусто — для всех)» — ticks: the type ids of the current project, the group names of its types and ids already in `types` (even if this project lacks them), sorted; «Готовые описания» — rows «<ru> / <he> ✕» and «➕ Добавить описание», which adds two inputs «Описание (русский)», «Описание (иврит)», both required for a row to be kept. Validation: «Впишите название на русском и на иврите»; a half-filled description row → «У описания нужны оба текста: русский и иврит». Save → pool, toast «Сохранено в общем списке».
- «Удалить» (administrator only): «Удалить проблему «<name>» из общего списка? Её нельзя будет выбрать для новых отметок. Отметки на точках останутся.» → soft delete, toast «Удалено из общего списка».

### 3.4 Marking

Entry points: the point card (button «⚠ Проблема» in the «Проблемы» block, § 3.5); the selection bars of «Точки», of the plan and of the rack screen get «⚠ Проблема» and «✔ Решено» (disabled with no selection; «✔ Решено» also disabled when no selected point has an open problem).

Form «⚠ Проблема — <label>» (one point) / «⚠ Проблема — выбрано точек: N»:
1. «Проблема» (dropdown, required): live problems that fit **every** selected point (an empty `types` fits all), by name. When some live problems were left out — hint «Показаны проблемы, подходящие всем выбранным точкам.». No live problem at all → the form is not opened; message window «Список проблем пуст. Добавьте их: Ещё → Выпадающие списки → «Проблемы».» with «Понятно».
2. «Описание» (dropdown): «— без описания —» (default), the live ready descriptions of the chosen problem, «✍️ Своё описание». Changing the problem resets it.
3. «Своё описание» (text, `dir="rtl"`, visible with «✍️»): required then (toast «Впишите своё описание»); hint «Только иврит — так попадёт в таблицу для руководства.»; text with a Cyrillic letter → toast «Своё описание пишется на иврите (без русских букв)», not saved (Latin letters and digits are allowed: models, labels).
4. «Сохранить» → `markOps` → `repo.save`; toast «Проблема отмечена. Точек: N»; the selection stays (the bar refreshes).

Form «✔ Решено — выбрано точек: N»: «Какая проблема решена» — «Все открытые (K)» first, then each problem open on the selection «<name> (K)» (K = points); «✔ Решено» → `solveOps`; toast «Решено. Отметок: M». A selection without open problems → toast «У выбранных точек нет открытых проблем» and no form.

### 3.5 Point card — block «Проблемы»

After the facts grid and before «Работы»: heading «Проблемы»; open marks first — a red-bordered row: problem name in bold, the description on the next line (if any), «отмечено: <name>, DD.MM HH:MM», button «✔ Решено» (one tap, no confirmation; toast «Решено. Отметок: 1»); then solved marks in grey: name, description, «отмечено: <name>, DD.MM · решено: <name>, DD.MM». Then the button «⚠ Проблема». A point that never had a mark shows only the heading and the button.

### 3.6 Lists, filters, red

- «Точки»: a new filter, shown when the project has open problems or the filter is set: «Проблемы: все» / «⚠ С проблемами (N)» / «Проблема: <name> (N)» (N — points; problems by name). A point row with open problems gets a red line under the label «⚠ <names, «, »>».
- Plan: the same options inside the plan's «Осталось» filter (§ 4.4, group «Проблемы»); points not matching go pale.
- Plan and «PDF с номерами»: a point with an open problem is red (§ 4.1), whatever its progress.
- «Проект»: under the readiness bars, when there are open marks: the link line «⚠ Открытых проблем: M (точек: N) — показать» (red); tap → «Точки» with «⚠ С проблемами». No line when there are none.
- History screen: collection label «Проблема на точке».

### 3.7 Management sheet (`src/domain/report.js`, app and nightly job)

- New column `{ id: 'problem', ru: 'Проблема', he: 'בעיה', w: 260 }` after «Причина задержки» in `COLUMNS`. Cell: the open problems of the point, one per line (`\n`), oldest first, each `problemLabel` in the sheet's language — Hebrew sheet: `nameHe: he` (own text as written); Russian sheet: `name: ru`. Solved problems are not shown. The column's point cells get `wrapStrategy: 'WRAP'` (the same request already used for the header and legend).
- Row colour: a point with an open problem → `#E57373` for the whole row's informational columns, over any status colour (own shade, darker than «Неисправность» `#F4B6B6`; § 6 Q13). Stage and status cells keep their own rules.
- Legend: a 7th cell after «Неисправность»: `#E57373` «Есть проблема» / «יש בעיה» (the legend becomes A–G). Always shown, like the other legend cells.
- The column is a profile tick. Saved profiles are not changed: the owner ticks it in «Таблицы для руководства». The two default profiles (projects that never saved one) get it — `t_main` after «checked», `t_ext` after «delay».
- `STYLE_V` 7 → 8, so every sheet is rebuilt once. The nightly job reads `problemMarks` (added to `NEED`) and `pool_problems` (§ 2.6).
- Excel export reuses `buildReport`, so the column is there when the profile has it.

### 3.8 Guide lines (section «Точки» and the plan)

«• ⚠ Проблема: выберите точки (в «Точках», на плане или в шкафу) → «⚠ Проблема» → проблема и описание (готовое или своё на иврите). Точка с открытой проблемой красная на плане и в таблице для руководства. Когда сделано — «✔ Решено»: проблема остаётся в карточке точки серой, с тем, кто и когда решил.»
«• Список проблем — Ещё → Выпадающие списки → «Проблемы»: у проблемы название на русском и иврите, типы точек и готовые описания.»

### 3.9 Strings

| Russian | English | Hebrew |
|---|---|---|
| Проблемы | Problems | בעיות |
| Проблема | Problem | בעיה |
| ⚠ Проблема | ⚠ Problem | ⚠ בעיה |
| ✔ Решено | ✔ Solved | ✔ נפתר |
| Конкретная неполадка на точке, например «не просверлены двери». Отмечается кнопкой «⚠ Проблема» у выбранных точек. | A specific trouble on a point, for example “doors not drilled”. Marked with “⚠ Problem” on the selected points. | תקלה מסוימת בנקודה, למשל „הדלתות לא קדוחות”. מסמנים בכפתור „⚠ בעיה” בנקודות שנבחרו. |
| все типы | all types | כל הסוגים |
| {} открыто | {} open | {} פתוחות |
| ➕ Добавить проблему | ➕ Add problem | ➕ הוספת בעיה |
| Новая проблема | New problem | בעיה חדשה |
| Название на иврите | Name in Hebrew | שם בעברית |
| Для типов точек (пусто — для всех) | For point types (empty — all) | לסוגי נקודות (ריק — לכולם) |
| Готовые описания | Ready descriptions | תיאורים מוכנים |
| ➕ Добавить описание | ➕ Add description | ➕ הוספת תיאור |
| Описание (русский) | Description (Russian) | תיאור (רוסית) |
| Описание (иврит) | Description (Hebrew) | תיאור (עברית) |
| Впишите название на русском и на иврите | Type the name in Russian and in Hebrew | כתבו את השם ברוסית ובעברית |
| У описания нужны оба текста: русский и иврит | A description needs both texts: Russian and Hebrew | לתיאור צריך שני טקסטים: רוסית ועברית |
| Удалить проблему «{}» из общего списка? Её нельзя будет выбрать для новых отметок. Отметки на точках останутся. | Delete the problem “{}” from the shared list? It can no longer be chosen for new marks. Marks on points stay. | למחוק את הבעיה „{}” מהרשימה המשותפת? לא יהיה אפשר לבחור בה לסימונים חדשים. הסימונים בנקודות יישארו. |
| ⚠ Проблема — {} | ⚠ Problem — {} | ⚠ בעיה — {} |
| ⚠ Проблема — выбрано точек: {} | ⚠ Problem — points selected: {} | ⚠ בעיה — נקודות שנבחרו: {} |
| Показаны проблемы, подходящие всем выбранным точкам. | Showing the problems that fit all selected points. | מוצגות הבעיות שמתאימות לכל הנקודות שנבחרו. |
| Список проблем пуст. Добавьте их: Ещё → Выпадающие списки → «Проблемы». | The problem list is empty. Add problems: More → Dropdown lists → “Problems”. | רשימת הבעיות ריקה. הוסיפו בעיות: עוד ← רשימות בחירה ← „בעיות”. |
| Описание | Description | תיאור |
| — без описания — | — no description — | — ללא תיאור — |
| ✍️ Своё описание | ✍️ Own description | ✍️ תיאור משלך |
| Своё описание | Own description | תיאור משלך |
| Только иврит — так попадёт в таблицу для руководства. | Hebrew only — this is how it goes into the management sheet. | עברית בלבד — כך זה ייכנס לטבלה להנהלה. |
| Выберите проблему | Choose a problem | בחרו בעיה |
| Впишите своё описание | Type your own description | כתבו את התיאור |
| Своё описание пишется на иврите (без русских букв) | Write your own description in Hebrew (no Russian letters) | כתבו את התיאור בעברית (בלי אותיות רוסיות) |
| Проблема отмечена. Точек: {} | Problem marked. Points: {} | הבעיה סומנה. נקודות: {} |
| ✔ Решено — выбрано точек: {} | ✔ Solved — points selected: {} | ✔ נפתר — נקודות שנבחרו: {} |
| Какая проблема решена | Which problem is solved | איזו בעיה נפתרה |
| Все открытые ({}) | All open ({}) | כל הפתוחות ({}) |
| Решено. Отметок: {} | Solved. Marks: {} | נפתר. סימונים: {} |
| У выбранных точек нет открытых проблем | The selected points have no open problems | לנקודות שנבחרו אין בעיות פתוחות |
| отмечено: {}, {} | marked: {}, {} | סומן: {}, {} |
| отмечено: {}, {} · решено: {}, {} | marked: {}, {} · solved: {}, {} | סומן: {}, {} · נפתר: {}, {} |
| Проблемы: все | Problems: all | בעיות: הכול |
| ⚠ С проблемами ({}) | ⚠ With problems ({}) | ⚠ עם בעיות ({}) |
| Проблема: {} ({}) | Problem: {} ({}) | בעיה: {} ({}) |
| ⚠ Открытых проблем: {} (точек: {}) — показать | ⚠ Open problems: {} (points: {}) — show | ⚠ בעיות פתוחות: {} (נקודות: {}) — הצג |
| Проблема на точке | Problem on a point | בעיה בנקודה |
| the two guide lines of 3.8 | • ⚠ Problem: select points (in “Points”, on the plan or in a rack) → “⚠ Problem” → the problem and a description (a ready one or your own in Hebrew). A point with an open problem is red on the plan and in the management sheet. When it is fixed — “✔ Solved”: the problem stays grey in the point card, with who solved it and when. / • The problem list — More → Dropdown lists → “Problems”: a problem has a name in Russian and Hebrew, point types and ready descriptions. | • ⚠ בעיה: בחרו נקודות („נקודות”, בתוכנית או בארון) ← „⚠ בעיה” ← הבעיה ותיאור (מוכן או משלכם בעברית). נקודה עם בעיה פתוחה אדומה בתוכנית ובטבלה להנהלה. כשתוקן — „✔ נפתר”: הבעיה נשארת אפורה בכרטיס הנקודה, עם מי פתר ומתי. / • רשימת הבעיות — עוד ← רשימות בחירה ← „בעיות”: לבעיה יש שם ברוסית ובעברית, סוגי נקודות ותיאורים מוכנים. |

Sheet texts «Проблема» / «בעיה» and «Есть проблема» / «יש בעיה» are data of the sheet, not UI.

## 4. Plan colours by progress (idea 004)

### 4.1 The colour of a point — `planColor(point, ctx)` in `src/domain/plan.js`

Replaces `statusColor` for the plan and «PDF с номерами» (the status words, the management sheet and the rack screens do not change). Returns `{ color, done: bool[], full, width }`; first rule that fires:

1. An open problem (§ 3.2) or status «Неисправна» → red `#ff1744`.
2. The point's stages S, in the order протяжка, хивут, установка, проверка, шилют: composite points — the stages that have tasks (`info.stages`); legacy points — `type.stages`, or all five when the type has no `stages` field (as `isFinished`). A stage is done: composite — all its tasks are done; legacy — `pulled`, `hived`, `install === 'Установлено'`, `checked`, `shilut`.
3. `S` empty, or nothing done at all (no stage done and no task done — composite; no stage and no pulled cable — legacy) → blue `#2979ff` when the length is entered («Посчитана»), else grey `#9e9e9e`.
4. Every stage done → `#1b5e20`, `full: true`, frame width ×1.75 (plan 2 → 3.5).
5. Otherwise step = clamp(round(k / n × 5), 1, 4) with k done of n stages (JS `Math.round`); a point with work started but no stage complete (part of the cables pulled) gets step 1:

| stages n | 1 done | 2 done | 3 done | 4 done |
|---|---|---|---|---|
| 5 | 1 | 2 | 3 | 4 |
| 4 | 1 | 3 | 4 | — |
| 3 | 2 | 3 | — | — |
| 2 | 3 | — | — | — |

Palette — «Жёлтые чуть темнее», the owner's pick at «Коммит» (§ 6 Q11): steps 1–4 `#f2c80f`, `#c0ca33`, `#8bc34a`, `#43a047`. (Not taken: «Цвета как в идее» `#fdd835`, `#d4e157`, `#9ccc65`, `#43a047`.)

A mark shared by several points (pair, triple, one tag): its colour and dots follow the least finished point (smallest k / n, then the first label); red when any of them is red.

### 4.2 Stage dots

On the plan, when zoomed in enough for tags (`big`, scale > 0.6), under the tag of every started, not finished point: one dot per stage of S in order — filled `#1b5e20` when done, white with a `#1b5e20` ring when not; radius 3.5 screen px, 13 px apart, starting at the tag's left edge, 6 px under it. No dots for grey, blue, full or red points. The tag placement keeps room for the dot row. «PDF с номерами» has no dots (§ 6 Q10).

### 4.3 Legend

`PLAN_LEGEND` (replaces `STATUS_COLORS`), used by the plan legend and by both «PDF с номерами» legends:

| Colour | Russian | Hebrew (PDF) |
|---|---|---|
| grey | новая | חדשה |
| blue | померяно | נמדד |
| step 1 | ≈ 20% | ≈ 20% |
| step 2 | ≈ 40% | ≈ 40% |
| step 3 | ≈ 60% | ≈ 60% |
| step 4 | ≈ 80% | ≈ 80% |
| `#1b5e20`, thick | готово | הושלם |
| red | проблема / неисправна | בעיה / תקלה |

The plan legend line starts with «Цвет — доля сделанных этапов точки:» and ends with «● — этап сделан, ○ — нет (протяжка, хивут, установка, проверка, шилют)». The Russian PDF legend's first line: «Цвет рамки — доля сделанных этапов точки: новая, померяно, ≈ 20% … ≈ 80%, готово, проблема / неисправна»; the Hebrew one: «צבע המסגרת = חלק השלבים שבוצעו».

`numberedInput` takes the colour from `planColor`; a full point gets the thicker frame in the PDF too. `numberedHash` already includes the colour, so every «PDF с номерами» changes its fingerprint and the nightly job re-renders it once; the server needs `problemMarks` (§ 3.7) for the red.

### 4.4 Plan filter «Осталось» (§ 6 Q9)

The plan's stage dropdown keeps its first option and gets groups:
- «Осталось» — the existing «Осталось: длина (не померяно)», «протяжка», «дотянуть», «хивут», «установка», «проверка», plus new «Осталось: шилют» (the point has the shilut stage and it is not done).
- «Работа» — the concrete works still waiting on the points of this drawing, as in «Что осталось» (the same keys and labels: `leftTasksOf` moves from `views/points.js` to `src/domain/remaining.js` as a pure `leftTasks(point, ctx, info)`, used by «Что осталось», the point card and the plan), each «<work> (N)»; only works with N > 0.
- «Проблемы» — only when the drawing has points with open problems: «⚠ С проблемами (N)», «Проблема: <name> (N)».

Points not matching go pale, as today. The «Что осталось» pull filter (pulled / not pulled) does not come to the plan: «Осталось: протяжка» covers it. Labels stay «Осталось: …» (as today and as in «Что осталось»), not the mockup's rough «Ждёт: …».

### 4.5 Guide line (plan section)

«• Цвет точки на плане — сколько её этапов сделано: от жёлтого (начато) к зелёному (почти всё); полностью готовая — тёмно-зелёная толстая рамка. Кружки под подписью (при увеличении) — этапы по порядку: закрашен — сделан. Красная — открытая проблема или «Неисправна».»

### 4.6 Strings

| Russian | English | Hebrew |
|---|---|---|
| Осталось | Left | נותר |
| Осталось: шилют | Left: labeling | נותר: שילוט |
| готово | done | הושלם |
| проблема / неисправна | problem / faulty | בעיה / תקלה |
| Цвет — доля сделанных этапов точки: | Colour — share of the point's stages done: | צבע — החלק של שלבי הנקודה שבוצעו: |
| ● — этап сделан, ○ — нет (протяжка, хивут, установка, проверка, шилют) | ● — stage done, ○ — not yet (pull, termination, installation, test, labeling) | ● — שלב בוצע, ○ — עדיין לא (השחלה, חיווט, התקנה, בדיקה, שילוט) |
| the guide line of 4.5 | • A point's colour on the plan shows how many of its stages are done: from yellow (started) to green (almost all); a finished point has a thick dark-green frame. The dots under the label (when zoomed in) are the stages in order: filled — done. Red — an open problem or “Faulty”. | • צבע הנקודה בתוכנית מראה כמה משלביה בוצעו: מצהוב (התחיל) לירוק (כמעט הכול); נקודה גמורה — מסגרת עבה בירוק כהה. העיגולים מתחת לתווית (בהגדלה) הם השלבים לפי הסדר: מלא — בוצע. אדום — בעיה פתוחה או „תקלה”. |

«Работа» and «Проблемы» are in the dictionaries already or in § 3.9.

## 5. Everything translated (idea 005)

### 5.1 Translating

- Every Russian UI string found by the extractor gets an English and a Hebrew entry in `src/i18n/src/*.json` (new strings of this stage: tables 1.6, 2.9, 3.9, 4.6), then `node scripts/i18n-build.mjs`. Hebrew trade words follow `CONTEXT.md` (חיווט, שילוט, השחלה…); existing translations of the same words are reused (e.g. «Справочники» → «Lists» / «רשימות», «Хивут» → «Termination» / «חיווט»).
- The guide (`guide.js`, 166 strings missing on 2026-11-17) is translated through the same dictionary (its header says so); the check is done twice — by the dictionary and on screen: English, then Hebrew, browser at 420 px, every guide section and every screen of the stage, listing what still shows Russian.

### 5.2 Not UI

`src/i18n/not-ui.json` (new): `{ "<Russian text as the extractor prints it>": "<why>" }`. First content, decided while translating: the Russian report texts sent to the employer, stored values that are identifiers (work types, status keys, seed names in `src/domain/seed.js`), file and folder names on Drive, the Russian sheet captions of `report.js` (data of a Russian sheet). The extractor skips by itself string literals that are arguments of the event-log calls (`info(`, `warn(`, `error(` of `src/log.js`) and of `console.*` — the event log is always Russian.

### 5.3 The check

`scripts/i18n-extract.mjs` exports its collector (the CLI stays). New test `tests/i18n-coverage.test.js`: every extracted string that is not skipped and not in `not-ui.json` is covered in **both** `en.json` and `he.json` — an exact key after trimming, or a pattern key that `tr()` would apply to the string with each `{}` replaced by `0`. It fails listing up to 30 uncovered strings with their files. It also fails on a `not-ui.json` entry that no longer occurs in `src/` (the list stays honest). It is part of `npm test`, so the deploy stops on an untranslated string.

### 5.4 Rule and workflow

- `docs/coding-standards.md`, new rule: «Every UI string has English and Hebrew» — rule (a ticket or quick fix that adds a Russian UI string adds its English and Hebrew to `src/i18n/src/*.json` and runs `node scripts/i18n-build.mjs`; a Russian string that is not UI goes to `src/i18n/not-ui.json` with the reason); why (the English and Hebrew UI showed Russian for months; the owner's colleagues and managers read Hebrew); checked (`tests/i18n-coverage.test.js`).
- `docs/workflow.md`: the Ticket paragraph and the quick-fix list get «new UI strings translated into English and Hebrew in the same session (`docs/coding-standards.md`, rule N)»; the quick-fix list already names `node scripts/i18n-build.mjs`.

## 6. Open questions of the description — answers

| # | Question | Answer | By |
|---|---|---|---|
| 1 | Day off with entries | Blocked: «Сначала удалите записи» (§ 1.2, check 3) | agent; owner confirms at «Коммит» |
| 2 | Day-off reason | Required; «Другое» needs text; stored as id + own text (§ 1.1) | agent (suggestion of the description) |
| 3 | Copies of shared lists | No copies: the pool is read directly; old project lists kept read-only as the display fallback (§ 2.1, 2.3) | agent |
| 4 | The merge | Per project, by any member's app, from server reads, marked `sharedLists: 1` on the project; conflicts to the event log; on-device the same (§ 2.4) | agent |
| 5 | Problem marks storage | Project subcollection `problemMarks`, one document per point × problem × time (§ 3.2, ADR 0017) | agent |
| 6 | Ready description edited later; description required | Marks refer to it: a fix reaches the sheet; the description is optional (§ 3.1, 3.4) | agent (suggestions of the description) |
| 7 | Mixed selection | Problems that fit every selected point; «all types» fit always (§ 3.4) | agent (suggestion) |
| 8 | Rounding; legacy points; shared mark | Table of § 4.1; legacy through the type's stages; a shared mark follows its least finished point | agent |
| 9 | Plan filter by concrete work and pull | Concrete works come to the plan (group «Работа», as the owner decided in idea 004); the pull filter does not (§ 4.4) | agent; owner confirms |
| 10 | Dots in «PDF с номерами» | No: the PDF tags are 6 pt among the drawing's own lines, 1–1.5 pt dots are not readable in print and clutter it; colour and legend carry the progress | agent; owner confirms |
| 11 | Final palette | «Жёлтые чуть темнее» (§ 4.1), chosen at «Коммит» after `mockups/plan-colours.html` | owner |
| 12 | «Not UI» list | A list file `src/i18n/not-ui.json` plus automatic skipping of event-log calls (§ 5.2) | agent |
| 13 | Red row in the sheet | Own shade `#E57373`, legend «Есть проблема» / «יש בעיה» (§ 3.7) | agent; owner confirms |
| 14 | Stage 4 note | `docs/project-spec.md`, stage 4, lists the new collections and fields (§ 10) | done in this session |

Other choices of this spec, accepted by the owner with «Коммит» (2026-11-17): a working day is blocked on a date that is a day off in another project (§ 1.2, check 5); the «Проблема» column is ticked by hand in saved profiles and is on in the default ones (§ 3.7); the «Проект» line reads «⚠ Открытых проблем: M (точек: N) — показать» (§ 3.6).

## 7. External services

| Service | What changes | Checked |
|---|---|---|
| Firestore rules | 3 new `pool_*` blocks (§ 2.7); the owner publishes before ticket 02 goes live | The same rule text is live for `pool_doorcfg` in the owner's database (members create and update, the administrator deletes) — read from `firestore.rules`, not re-run here (no credentials in this session) |
| Firestore reads | 3 new pool listeners (delta reads, tens of documents); one listener `problemMarks` per project; the merge reads each unmerged project's two old lists and the two pools once (`getDocsFromServer`) | `getDocsFromServer` exists in the installed SDK (firebase 11.10.0 typings) |
| Firestore writes | Merge: a few dozen pool writes once; marks: N + N history per mass mark (≈ 1,500 for 750 points, limit 20,000/day) | By the repo's existing counters (`pz.writes`) |
| Google Sheets | One new column, a new row colour value, a 7th legend cell, `wrapStrategy: WRAP` on the problem cells; `STYLE_V` 8 → one rebuild of every sheet | All request kinds are already sent and accepted by Google (stage 3); only values change |
| GitHub Actions nightly job | Reads `pool_delayReasons`, `pool_problems` once per run and `problemMarks` per project; «PDF с номерами» re-rendered once (new colours) | Not run in this session; ticket 04 runs the lib functions in tests with fakes |

Failure handling: a rejected pool write → § 2.4 toast, nothing marked, retried at the next start; the merge never deletes; the nightly job treats a missing pool collection as empty (sheets show names from the old project lists).

## 8. Edge cases

| Case | Expected |
|---|---|
| Day off and a working day on one date in two projects after offline edits on two devices | Both show in «Месяц»; the working day counts; to be recorded in `KNOWN_ISSUES.md` by ticket 01 |
| Two projects with a day off on the same date | Allowed; «Месяц» shows one line |
| Day off of a project that is archived later | Not in «Месяц» (archived projects are not, today) |
| Day off on a one-off project («разовый выезд») | The object field hides; the line has no place |
| Today is a day off and «Шилют поклеен» is tapped in a rack | The message of § 1.3; nothing written, no port marked |
| Shared item deleted while points use it | Points, entries, the sheet and the daily report keep the name (and Hebrew from the deleted pool record); the item is not offered |
| Merge: the same name in two projects with different Hebrew | The newest project's Hebrew wins (or the one already in the pool); the other goes to the event log; the old project lists still hold it |
| Merge on two devices at once | Same ids, last write wins for a conflicting Hebrew; nothing is lost from the old lists |
| Merge offline at first start | Nothing written, nothing marked; pickers offer the old project items meanwhile (§ 2.3) |
| Old rules in a colleague's database | Pool writes rejected → toast § 2.4 and the «⚠» badge; retried after the rules are pasted («⚠» → retry) |
| A problem deleted while open on points | Still red, still in the sheet, solvable; not offered for new marks |
| A ready description fixed later | Every open mark shows the new text; the next sheet refresh shows it (the nightly job sees the pool change) |
| A ready description removed (✕) | Soft: open marks keep its text |
| Problem for door types, selection mixes doors and cameras | Only problems with empty types (and those listing both) are offered, with the hint |
| A point with a problem and «Неисправна» | Red; the sheet shows the problem column and the status |
| The same problem marked twice on a point | One open mark, description replaced |
| Two members mark the same problem offline | Two open marks; the newest shows; «Решено» closes both |
| Points merged, the removed one had an open problem | It moves to the kept point (§ 3.2) |
| A point deleted with open problems | Not counted anywhere; restoring the point restores them |
| Mass mark on 750 points offline | One `repo.save` (batches of 400); the waiting badge counts them; synced later |
| A composite point whose type has no works | Grey / blue, no dots |
| A checked point without shilut | Step 4 of 5 (green, not dark), four filled dots and one empty |
| Re-check after «Не работает» | Red until a check without fault |
| A pair on one mark, one point finished, the other not | The mark shows the unfinished point's colour and dots |
| A legacy point type without `stages` | Counted over all five stages |
| Template strings in the coverage test | Matched as patterns, `{}` → `0` |
| A Russian string that is only data | In `not-ui.json` with its reason; the test fails when it disappears from the code |

## 9. Tests

Automated (`node:test`, offline):
- `dayoff.js`: reasons in ru/he, `other` text, `dayConflict` (other project working / off, same project ignored, deleted days ignored).
- `month.js`: day-off block and order in `workdaysReport`, `count` and `offCount`, duplicates of one date, sums and `downtimeByCulprit` skip days off, `monthReportRu` / `monthReportHe` lines with the comment, `doh` of a day off.
- `shared.js`: `sharedView` (pool over legacy, deleted kept for lookup), `choiceList` (legacy-only shown before the merge, never an admin-deleted id), `mergePlan` (absent → added, empty Hebrew filled, conflict listed, deleted skipped, deleted project items ignored, a second project sees the first's ops).
- Memory backend: pool `remove` marks deleted; `readColl`, `readPool`.
- `buildBackup` with shared lists; `runImport` sends missing shared items to the pool only (fake repo).
- Rules: `firestore.rules` has the three new blocks with the door-configuration condition; `firestore.open.rules` equals `openRules(firestore.rules)` (existing test).
- `problems.js`: `problemFits` (empty types, id, group), `problemsForPoints` on a mixed selection, `markOps` (new, re-mark updates, solved then marked → new), `solveOps` (one problem, all, duplicates closed), `openProblemsOf` dedup, `problemLabel` ru/he/own text/no description, deleted problem and description still labelled, `problemCounts`.
- `merge.js`: open marks move to the kept point; a duplicate problem is solved.
- `report.js`: the problem column (several lines, solved hidden, Hebrew/Russian), row colour `#E57373` over the status colour, the 7th legend cell, `STYLE_V` 8 changes the hash, default profiles have the column; server lib builds the same with the `shared` argument.
- `plan.js`: `planColor` for 1–4 of 5, 1–3 of 4, 1–2 of 3, 1 of 2, all done (full, width), none (grey / blue), part of the cables pulled (step 1), open problem and «Неисправна» over any progress, legacy point by type stages, type without `stages`, the palette of § 4.1; `numberedInput` colours; `numberedHash` changes with the new colours; the shared-mark rule.
- `tests/i18n-coverage.test.js` (§ 5.3); existing i18n tests stay green.

Owner checks live (each ticket's «Owner check» in plain words; summary): day off «Праздник» yesterday, «Месяц» line and count, the block with another project, back to working; a reason added in project A seen in project B, deleted by the administrator, still on old points and in the sheet; the example problems, a problem with two descriptions, 5 doors marked from the plan and 2 with own Hebrew, red on the plan and in «Точки» with the filter, the «Проект» line, the sheet column «בעיה» and red rows after ticking the column and refreshing, 3 solved with history; the plan of a real project with the new colours, dots and «Осталось: шилют», «PDF с номерами» colours; English and Hebrew walk through the app.

Not verifiable by the agent: the owner's real Firestore data and rules, the iPhone, Google Sheets and Drive, the nightly job on GitHub.

## 10. Docs, terms, ADRs, known issues

Written in this session (reach `main` with «Коммит»):
- ADR 0016 «Delay reasons, culprits and problems are one shared list per database, read directly from the pool» (replaces 0015; 0015 → `Status: superseded by 0016`).
- ADR 0017 «Problem marks are a project subcollection, one document per point and problem».
- `CONTEXT.md`: Day off (code fields), Delay reason and Culprit (shared, code `pool_delayReasons`, `pool_culprits`), Problem (code `pool_problems`), new **Problem mark** (code `problemMarks`), new **Shared list**, Progress colour (by stages, `planColor`), new **Stage dots**.
- `docs/project-spec.md`, stage 4: the new data PocketBase must carry — `days.off`, `offReason`, `offText`; top-level `pool_delayReasons`, `pool_culprits`, `pool_problems` (with nested `descs`, soft delete); project subcollection `problemMarks`; `projects.sharedLists`.

Written by the tickets:
- Guide lines (§§ 1.5, 2.8, 3.8, 4.5) and their translations.
- Module header comments of new and changed modules (`dayoff.js`, `shared.js` in domain and app, `problems.js`, `views/problems.js` or wherever the forms live), the code map.
- `docs/coding-standards.md` rule and `docs/workflow.md` line (§ 5.4) — ticket 07.
- `KNOWN_ISSUES.md` (when the behaviour exists): ticket 01 — a working day and a day off on one date after offline edits on two devices; ticket 02 — a conflicting Hebrew name merged on two devices at once keeps the last write.

## 11. Proposed tickets

| # | Ticket | Spec | Complexity | Blocked by |
|---|---|---|---|---|
| 01 | Day off | § 1 | medium | — |
| 02 | Shared delay reasons and culprits: pool collections, rules (owner publishes first), merge and seeding, screens and pickers, backup and import, starter pool, nightly job reads | § 2 | complex | — |
| 03 | Problems: reference list and examples, marks, mark and solve forms, point card block, «Точки» filter and list mark, «Проект» line, point merge | §§ 3.1–3.6, 3.8 | complex | 02 |
| 04 | Problems in the management sheet: column, row colour, legend, `STYLE_V` 8, default profiles, nightly job | § 3.7 | medium | 03 |
| 05 | Plan colours by progress: `planColor`, dots, legend, «PDF с номерами», red for problems, the plan filter with shilut, works and problems | § 4 | complex | 03 |
| 06 | Translations 1: the guide, checked by dictionary and on screen | § 5.1 | medium | 05 |
| 07 | Translations 2: everything else, `not-ui.json`, the coverage test, the coding standard and the workflow line | §§ 5.1–5.4 | medium | 06 |

Each ticket adds the strings of its section to the dictionaries (tables of §§ 1–4), so the coverage test of ticket 07 only finds the old gap. Ticket 02's self-check runs in `?mem=1`; its owner check starts with publishing the rules, and the code reaches `main` only after the owner says they are published.
