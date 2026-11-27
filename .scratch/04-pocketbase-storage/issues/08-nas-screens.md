Status: in review
Complexity: medium
Blocked by: 07

# 08. NAS screens: connection card, banners, badge texts, guide section

Every screen and text that differs on the NAS copy, as in the mockup `mockups/nas-copy.html`, in Russian, English and Hebrew.

## Spec sections

§ 3.6 (badge texts, `rejectReason`, hidden counters), § 3.7 (all), § 3.10 (the toast text is ticket 10's), § 8 (guide section; its paragraph is translated here and finished in ticket 15), § 12, the Texts table (all rows not added by tickets 03–05 and 10), the mockup. Slicing notes under § 13 apply.

## What to do

1. **☰ → «🔌 Подключение к базе»** on the NAS copy: «База: домашний сервер (PocketBase)», «Адрес: <url>», «Администратор базы: <e-mail>»; the card «Связь с сервером» — «Сейчас» (`на связи` / `нет связи` / `вход истёк` / `сервер не обновлён`, from the `syncState()` of ticket 05 and the `readState()` of ticket 06), «Последнее обновление» (time or «ещё не было»), «Ждут отправки», «Не принято сервером», the line about working without the internet, «🔄 Перечитать всё с сервера» with its confirm and toast (a full read of every scope; queued items stay); the card «Как подключить коллегу» with «📋 Скопировать адрес» («Адрес скопирован»). No Client ID, no «Скопировать правила», no «Отключиться от базы».
2. **☰ → «👥 Участники»**: the «🔗 Ссылка для подключения» card is replaced by «Как подключить коллегу» with «📋 Скопировать» and «💬 WhatsApp» and the text of § 3.7 with the address.
3. **Banners** under the top bar for everyone: «server older» (the `/api/pm/info` schema is lower or the route is missing; asked again every 10 min and at every reconnect, the banner goes by itself) and «app older» (426), with the exact texts of the Texts table; sending holds while they show (the flags exist since ticket 05). The sign-in expired banner is ticket 04's: the three share one place and do not stack.
4. **Badge texts**: «⬆» tap text «Ждут отправки: N. Если число не уменьшается — откройте ☰ → «🔌 Подключение к базе».» (offline: the existing text); «⬇ N» = the six parts of § 3.6, tap text «Ждём данные с сервера: N разд. Пока показано то, что есть на устройстве.»; «⬇ лимит» never shows; `rejectReason(code, backend)` in `src/domain/sync.js` gives the PocketBase `forbidden` text («Нет прав на запись» + the explanation), `not-found` and `invalid` as today.
5. Hidden on the NAS copy: «📈 Чтений базы…» on «Проект»; the Firestore read and write counters and the daily-limit warnings.
6. «Журнал событий» diagnostics: «Хранилище: PocketBase (домашний сервер)» and the cache line «своя копия на телефоне (IndexedDB)».
7. The guide (`src/app/views/guide.js`): a section «Домашний сервер» shown on the NAS copy only, with the paragraph of § 8 (translated to English and Hebrew now; ticket 15 may only adjust wording after the rehearsal).
8. Labels in «» that point at existing menu items use the English and Hebrew those items already have in the dictionaries (the Texts note under the table). `node scripts/i18n-build.mjs`; the coverage test passes. Header comments; `node tools/code-map.mjs`.

## Done when

Local PocketBase, browser pane at 420 px, English and Hebrew too (Hebrew reads right to left):
- «🔌 Подключение к базе» shows every line and card of the mockup with live values; «🔄 Перечитать всё с сервера» asks, then reads; the address copies (check the clipboard through the toast).
- With the server stopped: «нет связи»; with an expired token: «вход истёк»; with a server whose `PM_SCHEMA` is lowered by a test-only environment variable of `pb-dev` (or by a fake `/api/pm/info`): the «server older» banner shows, the queue holds, and it goes away when the schema fits.
- The badges and their tap texts are as written; «⚠» shows the new `forbidden` text.
- «👥 Участники» has the new card and the WhatsApp text; on the Firebase build the old link card is unchanged.
- «Журнал событий» shows the two lines; the guide shows the section on the NAS copy and not on the Pages build.
- The Pages build has no PocketBase code; `?mem=1` is unchanged.
- `npm test`, `npm run build`, `node tools/code-map.mjs --check` pass.

## Tests to add

`tests/sync.test.js` or the existing file that tests `src/domain/sync.js`: `rejectReason` for PocketBase codes. The i18n coverage test (new strings in three languages). A test of the pure function that decides the banner (`signInExpired`, `serverOlder`, `appOlder` priority and no stacking).

## Owner check

Needs the NAS (the screens also show on the PC, but the values are real only there). On the phone, on the new icon:
1. ☰ → «🔌 Подключение к базе»: «Сейчас — на связи», the address of the NAS, your e-mail as the administrator; «📋 Скопировать адрес» gives the toast «Адрес скопирован».
2. Airplane mode: «Сейчас — нет связи»; make a change: «Ждут отправки — 1»; airplane mode off: back to 0.
3. ☰ → «👥 Участники»: «Как подключить коллегу» and «💬 WhatsApp» open WhatsApp with the text and the address.
4. ☰ → «📖 Как пользоваться приложением» (the guide): the section «Домашний сервер».
5. Wrong: a text in the wrong language, a card that overlaps another, or Hebrew not right to left — send a screenshot.

## Notes from ticket 07

- KI-9: the «⚠» list (`pz.rejected`) is one per phone, not per user, on both editions; ticket 07 kept that. When this ticket reworks «⚠», consider storing each item's `uid` and showing and retrying only the signed-in user's items.
- PB_SCHEMA is 2 since ticket 07 (an invitation carries the project key); a server with schema 1 shows the «server older» banner of this ticket.
