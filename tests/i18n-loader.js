// Loads tr() and addOwnNames() of src/i18n/index.js for a language over given dictionaries (the module imports JSON, so it is rewritten and loaded from a temp file).
// Shared by tests/i18n-coverage.test.js and tests/catalog-en.test.js; not a test itself.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const I18N = new URL('../src/i18n/', import.meta.url);
let n = 0;

/** The module's exports ({ tr, addOwnNames, … }) for `lang`; each call loads a fresh copy, so its own-name map starts empty */
export async function loadI18n(lang, en, he) {
  globalThis.localStorage = { getItem: () => lang, setItem() {}, length: 0, key: () => null };
  const src = fs.readFileSync(new URL('index.js', I18N), 'utf8')
    .replace("import en from './en.json';", `const en = ${JSON.stringify(en)};`)
    .replace("import he from './he.json';", `const he = ${JSON.stringify(he)};`);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-load-')), `i18n-${lang}-${n++}.mjs`);
  fs.writeFileSync(file, src);
  return import(pathToFileURL(file).href);
}

/** tr() alone, as the coverage test uses it */
export async function loadTr(lang, en, he) { return (await loadI18n(lang, en, he)).tr; }
