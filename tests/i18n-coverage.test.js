// Fails when a Russian UI string in src/ has no English or Hebrew entry (src/i18n/*.json) or a not-UI mark (src/i18n/not-ui.json), so the deploy stops on it.
// Strings come from scripts/i18n-extract.mjs; each is run through the real tr() with every «{}» replaced by 0, so patterns, icons and brackets count as at run time.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectStrings } from '../scripts/i18n-extract.mjs';
import { loadTr } from './i18n-loader.js';

const CYR = /[А-Яа-яЁё]/;
const I18N = new URL('../src/i18n/', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, I18N), 'utf8');

/**
 * Strings of `list` that `tr` leaves in Russian. The guide strips a leading «• » / «# » of a line before showing it
 * (body() in guide.js), so its dictionary keys have no prefix and the prefix is cut here too: the icon branch of tr()
 * must not pass the raw literal while the screen shows the stripped one.
 */
export function uncovered(tr, list, notUi) {
  const bad = [];
  for (const { text, files } of list) {
    if (Object.hasOwn(notUi, text)) continue;
    const shown = files.length === 1 && files[0] === 'app/views/guide.js' ? text.replace(/^(?:• |# )/, '') : text;
    const probe = shown.replaceAll('{}', '0');
    const out = tr(probe);
    // Russian left in a translation is fine only inside quotes or braces: words the person types or sees on a button stay as they are («тв», «{шкаф}»)
    if (out === probe || CYR.test(out.replace(/[“„«][^”»]*[”»]|\{[^{}]+\}/g, ''))) bad.push({ text, files });
  }
  return bad;
}

const show = (bad) => bad.slice(0, 30).map((b) => `  ${JSON.stringify(b.text)}  [${b.files.join(', ')}]`).join('\n') + (bad.length > 30 ? `\n  … and ${bad.length - 30} more` : '');

const list = collectStrings(fileURLToPath(new URL('../src', import.meta.url)));
const notUi = JSON.parse(read('not-ui.json'));
const dicts = { en: JSON.parse(read('en.json')), he: JSON.parse(read('he.json')) };

for (const lang of ['en', 'he']) {
  test(`i18n coverage: every UI string is translated into ${lang === 'en' ? 'English' : 'Hebrew'}`, async () => {
    const tr = await loadTr(lang, dicts.en, dicts.he);
    const bad = uncovered(tr, list, notUi);
    assert.equal(bad.length, 0, `${bad.length} Russian string(s) without a ${lang} entry — add them to src/i18n/src/*.json and run node scripts/i18n-build.mjs, or to src/i18n/not-ui.json with a reason:\n${show(bad)}`);
  });
}

test('i18n coverage: not-ui.json lists only strings that are still in src/ and gives a reason for each', () => {
  const present = new Set(list.map((x) => x.text));
  const stale = Object.keys(notUi).filter((k) => !present.has(k));
  assert.equal(stale.length, 0, `not-ui.json entries no longer in src/: ${JSON.stringify(stale.slice(0, 30))}`);
  const noReason = Object.entries(notUi).filter(([, why]) => typeof why !== 'string' || !why.trim()).map(([k]) => k);
  assert.equal(noReason.length, 0, `not-ui.json entries without a reason: ${JSON.stringify(noReason.slice(0, 30))}`);
});

test('i18n coverage: matching — {} becomes 0, the guide prefix is cut, a missing entry is reported with its file', async () => {
  const dict = { 'Точек: {}': 'Points: {}', 'Готово': 'Done', '👋 Знакомство': '👋 Intro', 'С префиксом': 'With prefix' };
  const tr = await loadTr('en', dict, {});
  const mk = (text, ...files) => ({ text, files });
  assert.deepEqual(uncovered(tr, [mk('Точек: {}', 'a.js'), mk('Готово', 'a.js'), mk('👋 Знакомство', 'a.js')], {}), []);
  // an icon in front of a known text is translated by the icon branch, as on screen
  assert.deepEqual(uncovered(tr, [mk('✅ Готово', 'a.js')], {}), []);
  const missing = uncovered(tr, [mk('Нет перевода', 'b.js', 'c.js'), mk('Готово', 'a.js')], {});
  assert.deepEqual(missing, [{ text: 'Нет перевода', files: ['b.js', 'c.js'] }]);
  // a not-UI mark removes the string from the check
  assert.deepEqual(uncovered(tr, [mk('Нет перевода', 'b.js')], { 'Нет перевода': 'identifier' }), []);
  // guide: the key has no «• »; the literal with the bullet is covered only through it
  assert.deepEqual(uncovered(tr, [mk('• С префиксом', 'app/views/guide.js')], {}), []);
  assert.deepEqual(uncovered(tr, [mk('• Без перевода', 'app/views/guide.js')], {}), [{ text: '• Без перевода', files: ['app/views/guide.js'] }]);
  // a bullet key (the 14 wrong ones of ticket 06) does not cover the guide line
  const wrong = await loadTr('en', { '• Старый ключ': '• Old key' }, {});
  assert.equal(uncovered(wrong, [mk('• Старый ключ', 'app/views/guide.js')], {}).length, 1);
});

test('i18n coverage: the collector skips event-log and console texts, keeps templates with {}', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-src-'));
  fs.writeFileSync(path.join(dir, 'm.js'), [
    "import { info, warn } from './log.js';",
    "info('Журнал один'); warn(`Журнал ${1}`, 'доп'); console.log('Консоль');",
    "const a = ok ? 'Видно один' : 'Видно два'; const b = `Шаблон ${a} конец`;",
  ].join('\n'));
  const got = collectStrings(dir);
  assert.deepEqual(got.map((x) => x.text).sort(), ['Видно два', 'Видно один', 'Шаблон {} конец'].sort());
  assert.equal(got.find((x) => x.text === 'Шаблон {} конец').tpl, true);
});
