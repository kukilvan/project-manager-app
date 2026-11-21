// Stage 7 (spec § 5): every built-in Cyrillic name reads in English with no Russian left, and the owner's own English names (`nameEn`) win over the dictionary in English only.
// Names come from the seed, the starter pool, the example problems, the label colors and the door words; they go through the real tr() (loader of tests/i18n-loader.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CATALOG, POINT_TYPES, composedTypes, DEVICES, CABLES, UNITS, CULPRITS, DELAY_REASONS } from '../src/domain/seed.js';
import { EXAMPLE_PROBLEMS } from '../src/domain/problems.js';
import { SHILUT_COLORS } from '../src/domain/rack.js';
import { DOOR_PART_NAMES, doorShortOf } from '../src/domain/doorcfg.js';
import { nameEnPatch, ownNameMap } from '../src/domain/ownnames.js';
import { poolHash } from '../src/domain/pool.js';
import { loadI18n } from './i18n-loader.js';

const CYR = /[А-Яа-яЁё]/;
const json = (f) => JSON.parse(fs.readFileSync(new URL(f, import.meta.url), 'utf8'));
const en = json('../src/i18n/en.json'); const he = json('../src/i18n/he.json');
const pool = json('../src/data/starter-pool.json').pool;

// The short words and the plural of doorcfg.js are not exported: read the Russian words of their two maps from the source
const doorSrc = fs.readFileSync(new URL('../src/domain/doorcfg.js', import.meta.url), 'utf8');
const mapWords = (name) => [...(doorSrc.match(new RegExp(`const ${name} = \{([^}]*)\}`))?.[1] || '').matchAll(/'([^']*)'/g)].map((m) => m[1]);

/** Every built-in text that shows as a name: label → text */
function builtInNames() {
  const out = new Map(); const add = (label, v) => { if (typeof v === 'string' && CYR.test(v)) out.set(`${label}: ${v}`, v); };
  CATALOG.forEach((x) => add('catalog', x.name));
  composedTypes(POINT_TYPES).forEach((x) => add('type', x.id));
  DEVICES.forEach((x) => { add('device', x.name); add('device short', doorShortOf(x)); });
  CABLES.forEach((x) => add('cable', x.id));
  UNITS.forEach((x) => add('unit', x.id));
  CULPRITS.forEach((x) => add('culprit', x.id));
  DELAY_REASONS.forEach((x) => add('delay reason', x.id));
  for (const p of pool.types || []) add('pool type', p.id);
  for (const p of pool.devices || []) add('pool device', p.name);
  for (const p of pool.cables || []) add('pool cable', p.id);
  for (const p of pool.catalog || []) add('pool work', p.name);
  for (const p of pool.doorcfg || []) add('pool door configuration', p.name);
  for (const p of pool.delayReasons || []) add('pool delay reason', p.id);
  for (const p of pool.culprits || []) add('pool culprit', p.id);
  for (const p of [...EXAMPLE_PROBLEMS, ...(pool.problems || [])]) { add('problem', p.name); (p.descs || []).forEach((d) => add('problem description', d.ru)); }
  SHILUT_COLORS.forEach((x) => add('label color', x.ru));
  Object.values(DOOR_PART_NAMES).forEach((x) => add('door part', x));
  [...mapWords('SHORT'), ...mapWords('PLURAL')].forEach((x) => add('door word', x));
  add('door name', 'пустая дверь');
  return out;
}

test('every built-in name reads in English with no Cyrillic letters', async () => {
  const { tr } = await loadI18n('en', en, he);
  const names = builtInNames();
  assert.ok(names.size > 100, 'the name list is not empty');
  const bad = [...names].filter(([, text]) => CYR.test(tr(text))).map(([label, text]) => `${label} → ${tr(text)}`);
  assert.deepEqual(bad, []);
});

test('door configuration names built from short words read in English', async () => {
  const { tr } = await loadI18n('en', en, he);
  for (const s of ['ЭМ · коре · птиха · нипуц · магнит · 6005×2', 'МХ · 2 магнита · 6005×2', 'пустая дверь']) assert.ok(!CYR.test(tr(s)), `${s} → ${tr(s)}`);
});

test('the example problem «Замок» reads «Lock»', async () => {
  const { tr } = await loadI18n('en', en, he);
  assert.equal(tr('Замок'), 'Lock');
  assert.equal(tr('Проблема: Замок (Нет питания на замке)'), 'Problem: Lock (No power at the lock)');
});

test('own English names win in English, in names and in sentences with a name', async () => {
  const { tr, addOwnNames } = await loadI18n('en', en, he);
  assert.equal(tr('Датчик протечки'), 'Датчик протечки', 'no nameEn → the Russian name stays');
  addOwnNames({ 'Датчик протечки': 'Leak sensor', 'Камера': 'CCTV camera' });
  assert.equal(tr('Датчик протечки'), 'Leak sensor');
  assert.equal(tr('Камера'), 'CCTV camera', 'own name wins over the dictionary (D6)');
  assert.equal(tr('Проблема: Датчик протечки (3)'), 'Problem: Leak sensor (3)');
  assert.equal(tr('Датчик протечки · Камера'), 'Leak sensor · CCTV camera');
  assert.equal(tr('➕ Датчик протечки'), '➕ Leak sensor', 'an icon before the name');
  addOwnNames({});
  assert.equal(tr('Датчик протечки'), 'Датчик протечки', 'a cleared name goes away');
  assert.equal(tr('Камера'), 'Camera');
});

test('own names of cables and types by id, a Latin id too', async () => {
  const { tr, addOwnNames } = await loadI18n('en', en, he);
  addOwnNames({ cat7: 'Cat 7 cable', 'Оптика': 'Fiber' });
  assert.equal(tr('cat7'), 'Cat 7 cable');
  assert.equal(tr('Оптика'), 'Fiber');
});

test('Hebrew ignores own English names; the Hebrew order is unchanged', async () => {
  const { tr, addOwnNames } = await loadI18n('he', en, he);
  addOwnNames({ 'Камера': 'CCTV camera' });
  assert.equal(tr('Камера'), he['Камера']);
  assert.notEqual(tr('Камера'), 'CCTV camera');
});

test('nameEnPatch: written only when not empty, "" clears, no key for an item that never had one', () => {
  assert.deepEqual(nameEnPatch('  Leak sensor ', {}), { nameEn: 'Leak sensor' });
  assert.deepEqual(nameEnPatch('Leak sensor', { nameEn: 'Old' }), { nameEn: 'Leak sensor' });
  assert.deepEqual(nameEnPatch('', { nameEn: 'Old' }), { nameEn: '' });
  assert.deepEqual(nameEnPatch('   ', { nameEn: 'Old' }), { nameEn: '' });
  assert.deepEqual(nameEnPatch('', {}), {});
  assert.deepEqual(nameEnPatch(undefined, undefined), {});
  assert.deepEqual(nameEnPatch('', { name: 'x' }), {});
});

test('ownNameMap: works, devices and problems by name, types and cables by id, only non-empty nameEn', () => {
  const ctx = {
    catalog: new Map([['W1', { id: 'W1', name: 'Датчик протечки', nameEn: 'Leak sensor' }], ['W2', { id: 'W2', name: 'Без английского' }], ['W3', { id: 'W3', name: 'Пусто', nameEn: '' }]]),
    devices: new Map([['D1', { id: 'D1', name: 'Камера', nameEn: 'CCTV camera' }]]),
    problems: new Map([['p1', { id: 'p1', name: 'Замок', nameEn: 'Door lock' }], ['p2', { id: 'p2', name: 'Старая', nameEn: 'Old', deleted: true }]]),
    types: new Map([['Оптика', { id: 'Оптика', nameEn: 'Fiber'
 }]]),
    cables: new Map([['cat7', { id: 'cat7', nameEn: 'Cat 7' }]]),
  };
  assert.deepEqual(ownNameMap(ctx), { 'Датчик протечки': 'Leak sensor', 'Камера': 'CCTV camera', 'Замок': 'Door lock', 'Оптика': 'Fiber', cat7: 'Cat 7' });
  assert.deepEqual(ownNameMap(null), {});
});

test('nameEn travels in the pool fingerprint; an empty nameEn leaves it as it was', () => {
  const a = { id: 'W1', name: 'Работа', nameHe: 'עבודה' };
  assert.equal(poolHash({ ...a, nameEn: '' }), poolHash(a), 'cleared name = never had one');
  assert.notEqual(poolHash({ ...a, nameEn: 'Work' }), poolHash(a), 'a name changes the item the admin sees in the inbox');
});
