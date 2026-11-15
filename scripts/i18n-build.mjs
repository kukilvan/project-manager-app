// Builds the translation dictionaries: src/i18n/src/*.json ({ "<Russian text>": ["English", "Hebrew"] }) → src/i18n/en.json and he.json.
// Run after adding UI strings (`node scripts/i18n-build.mjs`); it reads and writes only files under src/i18n/ and prints the number of translations.
import fs from 'node:fs';
import path from 'node:path';
const dir = 'src/i18n/src'; const en = {}; const he = {};
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
  const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  for (const [ru, [e, h]] of Object.entries(j)) { if (e) en[ru] = e; if (h) he[ru] = h; }
}
fs.writeFileSync('src/i18n/en.json', JSON.stringify(en, null, 0));
fs.writeFileSync('src/i18n/he.json', JSON.stringify(he, null, 0));
console.log(`Переводов: en ${Object.keys(en).length}, he ${Object.keys(he).length}`);
