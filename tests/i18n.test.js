// Checks UI translation (src/i18n/index.js): tr() on typical strings — icons, quotes in names, numbers in brackets, templates.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = new URL('../src/i18n/', import.meta.url);
async function load(lang) {
  globalThis.localStorage = { getItem: () => lang, setItem() {} };
  const read = (f) => fs.readFileSync(new URL(f, root), 'utf8');
  const src = read('index.js')
    .replace("import en from './en.json';", `const en = ${read('en.json')};`)
    .replace("import he from './he.json';", `const he = ${read('he.json')};`);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-')), `i18n-${lang}.mjs`);
  fs.writeFileSync(file, src);
  return import(pathToFileURL(file).href);
}

test('i18n: английский', async () => {
  const { tr } = await load('en');
  assert.equal(tr('👋 Знакомство'), '👋 Introduction');
  assert.equal(tr('1️⃣ Шаг 1. Добавить точки'), '1️⃣ Step 1. Add points');
  assert.equal(tr('Установка камеры (8)'), 'Camera installation (8)');
  assert.equal(tr('Установка камеры ×3'), 'Camera installation ×3');
  assert.equal(tr('test@example.com (вы)'), 'test@example.com (you)');
  assert.equal(tr('точек cat7: 8 (портов 8) · расставлено 0 из 8 · плана ещё нет'), 'cat7 points: 8 (ports 8) · placed 0 of 8 · no plan yet');
  assert.equal(tr('45 м на 1 кабель (всего 45 м)'), '45 m per cable (total 45 m)');
  assert.equal(tr('Google Таблицы проекта «Демо-проект «Офис»»'), 'Google Sheets of project “Demo project “Office””');
  assert.equal(tr('Октябрь 2026'), 'October 2026');
  assert.equal(tr('  Понятно '), '  Got it ');
  assert.equal(tr('ABC-12'), 'ABC-12');
});

test('i18n: иврит', async () => {
  const { tr, isRtl } = await load('he');
  assert.equal(isRtl(), true);
  assert.equal(tr('Новый: шкаф'), 'חדש: ארון');
  assert.equal(tr('Установка камеры (8)'), 'התקנת מצלמה (8)');
});

// The build (scripts/i18n-build.mjs) keeps the last file's entry, so a second, different translation of the same Russian text
// silently overrides the first one: an edit of the first one never reaches the screen (found in review 6: the plan legend)
test('i18n: no Russian text gets two different translations in src/i18n/src', () => {
  const dir = new URL('src/', root); const seen = new Map(); const clash = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    for (const [ru, v] of Object.entries(JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8')))) {
      const prev = seen.get(ru);
      if (prev && JSON.stringify(prev.v) !== JSON.stringify(v)) clash.push(`${JSON.stringify(ru).slice(0, 80)}: ${prev.f} / ${f}`);
      seen.set(ru, { f, v });
    }
  }
  assert.deepEqual(clash, [], `the same text is translated twice, differently — keep one entry:\n${clash.join('\n')}`);
});
