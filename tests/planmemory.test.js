// Checks the plan's view memory (src/domain/planmemory.js, spec 8 § 2 and § 6): parsing and dropping of broken records, the remembered view of a drawing,
// the stored record, the choice of the drawing to open and the centre ↔ corner conversion of the viewer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePlanMemory, viewFor, rememberView, drawingToOpen, centreOf, cornerOf } from '../src/domain/index.js';

const V = { page: 0, x: 812.4, y: 433.1, s: 2.5 };
const rec = (views, last = 'A') => JSON.stringify({ last, views });
const NONE = { last: null, views: {} };

test('parsePlanMemory: a good record is read as it is', () => {
  assert.deepEqual(parsePlanMemory(rec({ A: V })), { last: 'A', views: { A: V } });
});

test('parsePlanMemory: broken JSON, null, a non-object, an array → empty record', () => {
  [undefined, null, '', '{oops', 'null', '7', '"x"', '[]'].forEach((t) => assert.deepEqual(parsePlanMemory(t), NONE, String(t)));
});

test('parsePlanMemory: a bad `last` is dropped, the views stay', () => {
  [JSON.stringify({ last: 5, views: { A: V } }), JSON.stringify({ last: '', views: { A: V } }), JSON.stringify({ views: { A: V } })]
    .forEach((t) => assert.deepEqual(parsePlanMemory(t), { last: null, views: { A: V } }));
});

test('parsePlanMemory: views that are not an object are dropped', () => {
  assert.deepEqual(parsePlanMemory('{"last":"A","views":[1]}'), { last: 'A', views: {} });
  assert.deepEqual(parsePlanMemory('{"last":"A","views":"x"}'), { last: 'A', views: {} });
});

test('parsePlanMemory: zoom out of 0.05–20 or not a number, a negative or fractional page, a missing coordinate → the entry is dropped', () => {
  const bad = [{ ...V, s: 0.01 }, { ...V, s: 25 }, { ...V, s: NaN }, { ...V, s: null }, { ...V, s: '2' }, { ...V, page: -1 }, { ...V, page: 0.5 }, { ...V, page: '0' },
    { ...V, x: undefined }, { ...V, y: 'a' }, { page: 0, x: 1, y: 1 }, null, 3];
  bad.forEach((v, i) => assert.deepEqual(parsePlanMemory(rec({ A: v })).views, {}, `case ${i}`));
  const edges = { B: { ...V, s: 0.05 }, C: { ...V, s: 20 } };
  assert.deepEqual(parsePlanMemory(rec({ A: { ...V, s: 25 }, ...edges })).views, edges, 'the good ones stay, the limits are inclusive');
});

test('parsePlanMemory: unknown fields of an entry are not kept; a drawing id like __proto__ stays an own entry', () => {
  assert.deepEqual(parsePlanMemory(rec({ A: { ...V, extra: 1 } })).views.A, V);
  const p = parsePlanMemory('{"last":"A","views":{"__proto__":{"page":0,"x":1,"y":2,"s":1}}}');
  assert.deepEqual(Object.keys(p.views), ['__proto__']);
  assert.equal(Object.getPrototypeOf(p.views), Object.prototype);
});

const PAGES = [{ w: 600, h: 400 }, { w: 300, h: 200 }];
const VP = { page: 0, x: 312.4, y: 233.1, s: 2.5 };   // inside the first page

test('viewFor: the remembered view; a missing record, drawing or entry → null', () => {
  assert.deepEqual(viewFor({ last: 'A', views: { A: VP } }, 'A', PAGES), VP);
  assert.equal(viewFor({ last: 'A', views: { A: VP } }, 'B', PAGES), null);
  assert.equal(viewFor(NONE, 'A', PAGES), null);
  assert.equal(viewFor(null, 'A', PAGES), null);
  assert.equal(viewFor({ views: { A: VP } }, 'A', undefined), null);
});

test('viewFor: a page that no longer exists → null; the page of the entry decides the clamping', () => {
  assert.equal(viewFor({ views: { A: { ...VP, page: 2 } } }, 'A', PAGES), null);
  assert.deepEqual(viewFor({ views: { A: { ...V, page: 1, x: 250, y: 150 } } }, 'A', PAGES), { page: 1, x: 250, y: 150, s: 2.5 });
  assert.equal(viewFor({ views: { A: VP } }, 'A', []), null);
});

test('viewFor: x and y are clamped to the page (a replaced file with a smaller sheet)', () => {
  assert.deepEqual(viewFor({ views: { A: { ...V, x: 900, y: 700 } } }, 'A', PAGES), { page: 0, x: 600, y: 400, s: 2.5 });
  assert.deepEqual(viewFor({ views: { A: { ...V, x: -5, y: -1 } } }, 'A', PAGES), { page: 0, x: 0, y: 0, s: 2.5 });
  assert.deepEqual(viewFor({ views: { A: { page: 1, x: 812.4, y: 433.1, s: 1 } } }, 'A', PAGES), { page: 1, x: 300, y: 200, s: 1 });
});

test('rememberView: sets last, keeps one entry per drawing, rounds x, y to 0.1 and s to 0.001', () => {
  const r1 = rememberView(NONE, 'A', { page: 0, x: 812.449, y: 433.151, s: 2.5004 }, ['A', 'B']);
  assert.deepEqual(r1, { last: 'A', views: { A: { page: 0, x: 812.4, y: 433.2, s: 2.5 } } });
  const r2 = rememberView(r1, 'B', { page: 1, x: 10, y: 20, s: 1.23456 }, ['A', 'B']);
  assert.equal(r2.last, 'B'); assert.deepEqual(Object.keys(r2.views).sort(), ['A', 'B']); assert.equal(r2.views.B.s, 1.235);
  const r3 = rememberView(r2, 'A', { page: 0, x: 1, y: 2, s: 3 }, ['A', 'B']);
  assert.deepEqual(r3.views.A, { page: 0, x: 1, y: 2, s: 3 }); assert.equal(Object.keys(r3.views).length, 2); assert.equal(r3.last, 'A');
});

test('rememberView: drops the entries of drawings that are gone; the input record is not changed', () => {
  const old = { last: 'Z', views: { A: V, Z: V } };
  const out = rememberView(old, 'A', { page: 0, x: 1, y: 1, s: 1 }, ['A', 'B']);
  assert.deepEqual(Object.keys(out.views), ['A']);
  assert.deepEqual(old, { last: 'Z', views: { A: V, Z: V } });
});

test('rememberView: a view that is not valid is not stored, last still follows', () => {
  const out = rememberView({ last: 'A', views: { A: V } }, 'B', { page: 0, x: NaN, y: 1, s: 1 }, ['A', 'B']);
  assert.deepEqual(out, { last: 'B', views: { A: V } });
  assert.deepEqual(rememberView({ last: 'A', views: { A: V } }, 'B', V, ['A']), { last: 'A', views: { A: V } }, 'a removed drawing keeps nothing and is not `last`');
  assert.deepEqual(rememberView(NONE, 'A', V, undefined), NONE, 'no live list: nothing is kept');
});

test('drawingToOpen: each level wins over the next (select > point > place > current > last > first)', () => {
  const ids = ['A', 'B', 'C', 'D', 'E', 'F'];
  const all = { selectId: 'A', pointId: 'B', placeId: 'C', currentId: 'D', last: 'E' };
  assert.equal(drawingToOpen({ ids, ...all }), 'A');
  assert.equal(drawingToOpen({ ids, ...all, selectId: undefined }), 'B');
  assert.equal(drawingToOpen({ ids, ...all, selectId: undefined, pointId: null }), 'C');
  assert.equal(drawingToOpen({ ids, ...all, selectId: undefined, pointId: null, placeId: '' }), 'D');
  assert.equal(drawingToOpen({ ids, ...all, selectId: undefined, pointId: null, placeId: '', currentId: undefined }), 'E');
  assert.equal(drawingToOpen({ ids, last: null }), 'A', 'nothing chosen → the first');
});

test('drawingToOpen: ids that are not in the list are skipped; an empty list → null', () => {
  assert.equal(drawingToOpen({ ids: ['A', 'B'], selectId: 'X', pointId: 'Y', last: 'B' }), 'B');
  assert.equal(drawingToOpen({ ids: ['A', 'B'], selectId: 'X', last: 'gone' }), 'A');
  assert.equal(drawingToOpen({ ids: [], selectId: 'A', last: 'A' }), null);
  assert.equal(drawingToOpen({}), null);
  assert.equal(drawingToOpen(), null);
});

test('centreOf / cornerOf: the round trip for 420×700 and 1280×800', () => {
  for (const [w, h] of [[420, 700], [1280, 800]]) {
    const view = { s: 2.5, ox: 123.4, oy: 56.7 };
    const c = centreOf(view, w, h);
    assert.ok(Math.abs(c.x - (123.4 + w / 5)) < 1e-9 && Math.abs(c.y - (56.7 + h / 5)) < 1e-9 && c.s === 2.5);
    const k = cornerOf(c, w, h);
    assert.ok(Math.abs(k.ox - view.ox) < 1e-9 && Math.abs(k.oy - view.oy) < 1e-9 && k.s === view.s, `${w}×${h}`);
    const back = centreOf(cornerOf({ x: 300, y: 200, s: 0.7 }, w, h), w, h);
    assert.ok(Math.abs(back.x - 300) < 1e-9 && Math.abs(back.y - 200) < 1e-9 && back.s === 0.7);
  }
});

test('centreOf / cornerOf: the same centre gives different corners for the two sizes (a turned phone)', () => {
  const c = { x: 300, y: 200, s: 1.5 };
  const a = cornerOf(c, 420, 700); const b = cornerOf(c, 1280, 800);
  assert.notEqual(a.ox, b.ox); assert.notEqual(a.oy, b.oy);
  assert.equal(a.s, b.s);
  assert.deepEqual(centreOf(a, 420, 700), c); assert.ok(Math.abs(centreOf(b, 1280, 800).x - 300) < 1e-9);
});
