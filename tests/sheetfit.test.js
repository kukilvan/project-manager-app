// Новая версия чертежа: пересчёт координат со старого листа на новый и проверка каждой точки.
import test from 'node:test';
import assert from 'node:assert/strict';
import { uniquePairs, fitSheets, fitManual, planMove, moveSummary, movePos, versionName, applyFit } from '../src/domain/sheetfit.js';

// старый лист — кусок нового в другом масштабе: новый = 0.48·старый + (1200, 150)
const T = (x, y) => ({ x: 0.48 * x + 1200, y: 0.48 * y + 150 });
const mk = (t, x, y, w = 40, h = 8, page = 0) => ({ t, x, y, w, h, page });
function sheets() {
  const old = []; const neu = [];
  for (let i = 0; i < 30; i++) {   // 30 номеров, по разу на каждом листе
    const x = 100 + (i % 6) * 400; const y = 200 + Math.floor(i / 6) * 350; const t = `FA/C-${String(i + 1).padStart(2, '0')}`;
    old.push(mk(t, x, y)); const n = T(x, y); neu.push(mk(t, n.x + (i % 3) * 0.4, n.y, 19.2, 3.8));
  }
  // значки CR без номеров (повторяются)
  [[300, 500], [900, 500], [1500, 900]].forEach(([x, y]) => { old.push(mk('CR', x, y, 12, 8)); const n = T(x, y); neu.push(mk('CR', n.x, n.y, 5.8, 3.8)); });
  neu.push(mk('CR', 400, 400, 5.8, 3.8));   // новый CR в новой части листа
  // случайные совпадения текста (номер помещения, который на новом листе в другом месте) — не должны сбить пересчёт
  old.push(mk('ROOM-101', 50, 50)); neu.push(mk('ROOM-101', 2700, 1600));
  return { old, neu };
}

test('новая версия чертежа: пересчёт находится по общим надписям, случайные совпадения отброшены', () => {
  const { old, neu } = sheets();
  const pairs = uniquePairs(old, neu);
  assert.equal(pairs.length, 31);   // 30 номеров + ROOM-101 (CR повторяется — не годится)
  const fits = fitSheets(pairs, [{ w: 2863, h: 1757 }]);
  const f = fits.get(0);
  assert.ok(f.ok); assert.equal(f.newPage, 0); assert.equal(f.inliers, 30);
  assert.ok(Math.abs(f.scale - 0.48) < 0.001); assert.ok(Math.abs(f.angle) < 0.05);
  const w = applyFit(f, 1000, 1000); assert.ok(Math.abs(w.x - 1680) < 1 && Math.abs(w.y - 630) < 1);
});

test('новая версия чертежа: точки — на месте, сдвинута, пропала, значок, вручную', () => {
  const { old, neu } = sheets();
  // FA/C-05 на новом листе сдвинули, FA/C-07 убрали
  const i5 = neu.findIndex((s) => s.t === 'FA/C-05'); neu[i5] = { ...neu[i5], x: neu[i5].x + 60 };
  const i7 = neu.findIndex((s) => s.t === 'FA/C-07'); neu.splice(i7, 1);
  const fits = fitSheets(uniquePairs(old, neu), [{ w: 2863, h: 1757 }]);
  const pos = (t) => { const s = old.find((x) => x.t === t); return { page: 0, x: s.x, y: s.y, w: s.w, h: s.h, sheet: 'old.pdf' }; };
  const points = [
    { id: 'p1', label: 'FA/C-01', pos: pos('FA/C-01') },
    { id: 'p5', label: 'FA/C-05', pos: pos('FA/C-05') },
    { id: 'p7', label: 'FA/C-07', pos: pos('FA/C-07') },
    { id: 'c1', label: 'CR01', pos: { page: 0, x: 300, y: 500, w: 12, h: 8, sheet: 'old.pdf', text: 'CR' } },
    { id: 'c2', label: 'CR02', pos: { page: 0, x: 900, y: 520, w: 12, h: 12, sheet: 'old.pdf' } },  // рядом с CR, но не на нём
    { id: 'm1', label: 'X-1', pos: { page: 0, x: 2000, y: 1500, w: 8, h: 8, sheet: 'old.pdf' } },
  ];
  const sheet = { name: 'new.pdf', pages: [{ w: 2863, h: 1757 }] };
  const plan = planMove(points, fits, old, neu, sheet);
  const by = Object.fromEntries(plan.map((x) => [x.id, x]));
  assert.equal(by.p1.kind, 'ok'); assert.equal(by.p1.pos.sheet, 'new.pdf'); assert.equal(by.p1.pos.pw, 2863);
  assert.ok(Math.abs(by.p1.pos.x - T(100, 200).x) < 1);
  assert.equal(by.p5.kind, 'moved'); assert.ok(by.p5.to.x - by.p5.pos.x > 50);
  assert.equal(by.p7.kind, 'missing'); assert.ok(Math.abs(by.p7.pos.x - T(pos('FA/C-07').x, 0).x) < 1);
  assert.equal(by.c1.kind, 'ok'); assert.equal(by.c1.under, 'CR'); assert.equal(by.c1.pos.text, 'CR');
  assert.equal(by.c2.kind, 'plain');   // под точкой надписи не было — только пересчёт
  assert.equal(by.m1.kind, 'plain'); assert.ok(Math.abs(by.m1.pos.x - T(2000, 1500).x) < 1); assert.ok(Math.abs(by.m1.pos.w - 3.84) < 0.1);
  assert.deepEqual(moveSummary(plan), { ok: 2, moved: 1, missing: 1, lost: 0, plain: 2, nofit: 0 });
});

test('новая версия чертежа: значок исчез с прежнего места — «проверить», с подсказкой ближайшего', () => {
  const { old, neu } = sheets();
  const k = neu.findIndex((s) => s.t === 'CR' && Math.abs(s.x - T(1500, 900).x) < 1); neu[k] = { ...neu[k], x: neu[k].x + 30 };
  const fits = fitSheets(uniquePairs(old, neu), [{ w: 2863, h: 1757 }]);
  const plan = planMove([{ id: 'c3', label: 'CR03', pos: { page: 0, x: 1500, y: 900, w: 12, h: 8 } }], fits, old, neu, { name: 'new.pdf', pages: [{ w: 2863, h: 1757 }] });
  assert.equal(plan[0].kind, 'lost'); assert.equal(plan[0].under, 'CR'); assert.ok(plan[0].to && Math.abs(plan[0].to.x - (T(1500, 900).x + 30)) < 1);
});

test('новая версия чертежа: мало общих надписей — пересчёт ненадёжен; ручной — по двум местам', () => {
  const pairs = [{ t: 'A1', a: { page: 0, x: 0, y: 0 }, b: { page: 0, x: 10, y: 10 } }, { t: 'B1', a: { page: 0, x: 100, y: 0 }, b: { page: 0, x: 60, y: 10 } }];
  assert.equal(fitSheets(pairs, [{ w: 1000, h: 1000 }]).get(0).ok, false);
  const f = fitManual(pairs); assert.ok(f.ok); assert.equal(f.scale, 0.5);
  const p = movePos({ page: 0, x: 50, y: 20, w: 10, h: 10, icon: true }, f, { name: 'n.pdf', pages: [{ w: 500, h: 400 }] }, 0);
  assert.deepEqual(p, { page: 0, x: 35, y: 20, w: 5, h: 5, icon: true, sheet: 'n.pdf', pw: 500, ph: 400 });
});

test('новая версия чертежа: имя файла не совпадает с уже добавленными', () => {
  assert.equal(versionName('План.pdf', ['Другой.pdf']), 'План.pdf');
  assert.equal(versionName('План.pdf', ['План.pdf']), 'План (версия 2).pdf');
  assert.equal(versionName('План.pdf', ['План.pdf', 'План (версия 2).pdf']), 'План (версия 3).pdf');
});

test('новая версия чертежа: два обозначения в одной надписи разбираются по отдельности', async () => {
  const { withTokens } = await import('../src/domain/sheetfit.js');
  const t = withTokens([{ t: 'FC/B13-14 FC/B15-16', x: 100, y: 50, w: 190, h: 8, page: 0 }]);
  assert.equal(t.length, 3); assert.equal(t[2].t, 'FC/B15-16'); assert.ok(t[2].x > 140 && t[2].x < 160); assert.ok(t[1].x < 60);
});

test('новая версия чертежа: две точки на одной отметке переносятся вместе', () => {
  const old = [{ t: 'D-01', x: 100, y: 100, w: 30, h: 8, page: 0 }, ...Array.from({ length: 8 }, (_, i) => ({ t: `R-${i}0`, x: 300 + i * 100, y: 400 + (i % 3) * 90, w: 30, h: 8, page: 0 }))];
  const neu = old.map((s) => ({ ...s, x: s.x * 0.5 + 10, y: s.y * 0.5 + 20, w: s.w / 2, h: s.h / 2 }));
  const fits = fitSheets(uniquePairs(old, neu), [{ w: 1000, h: 800 }]);
  const pos = { page: 0, x: 100, y: 100, w: 30, h: 8 };
  const plan = planMove([{ id: 'a', label: 'D-01', pos }, { id: 'b', label: 'D-01.2', pos }], fits, old, neu, { name: 'n.pdf', pages: [{ w: 1000, h: 800 }] });
  assert.deepEqual(plan.map((x) => [x.id, x.kind, x.pos.x, x.pos.y]), [['a', 'ok', 60, 70], ['b', 'ok', 60, 70]]);
});

test('новая версия чертежа: точка, подписанная на листе иначе (pos.text), находится по этой надписи; за краем листа — счёт', async () => {
  const { offSheet } = await import('../src/domain/sheetfit.js');
  const old = [{ t: 'X/01', x: 100, y: 100, w: 20, h: 6, page: 0 }, ...Array.from({ length: 6 }, (_, i) => ({ t: `K-${i}5`, x: 200 + i * 90, y: 300 + (i % 2) * 120, w: 20, h: 6, page: 0 }))];
  const neu = old.map((s) => ({ ...s, x: s.x + 50, y: s.y + 10 }));
  const fits = fitSheets(uniquePairs(old, neu), [{ w: 1000, h: 800 }]);
  const plan = planMove([{ id: 'a', label: 'ДВЕРЬ-1', pos: { page: 0, x: 100, y: 100, w: 20, h: 6, text: 'X/01' } }], fits, old, neu, { name: 'n.pdf', pages: [{ w: 1000, h: 800 }] });
  assert.equal(plan[0].kind, 'ok'); assert.equal(plan[0].pos.x, 150);
  assert.equal(offSheet([{ pos: { page: 0, x: 1200, y: 10 } }, { pos: { page: 0, x: 10, y: 10 } }, { kind: 'nofit' }], [{ w: 1000, h: 800 }]), 1);
});

test('новая версия чертежа: номер точки на новом листе заменён другим на том же месте — подсказка нового названия', () => {
  const { old, neu } = sheets();
  const i = neu.findIndex((s) => s.t === 'FA/C-07'); neu[i] = { ...neu[i], t: 'FC/C-07' };
  const fits = fitSheets(uniquePairs(old, neu), [{ w: 2863, h: 1757 }]);
  const s7 = old.find((x) => x.t === 'FA/C-07');
  const plan = planMove([{ id: 'p7', label: 'FA/C-07', pos: { page: 0, x: s7.x, y: s7.y, w: s7.w, h: s7.h } }], fits, old, neu, { name: 'n.pdf', pages: [{ w: 2863, h: 1757 }] });
  assert.equal(plan[0].kind, 'missing'); assert.equal(plan[0].newLabel, 'FC/C-07');
});
