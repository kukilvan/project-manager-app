// «🔄 Новая версия чертежа»: прислали обновлённый тохнит (другого размера, обрезан иначе, дорисованы другие части здания) —
// точки переезжают со старого листа на новый с пересчётом координат. Пересчёт находится сам по надписям, которые есть на обоих
// листах (номера точек); если общих надписей мало — человек показывает два одинаковых места на обоих листах.
// Каждая точка проверяется: на месте / сдвинута на новом чертеже / нет на новом чертеже / значок не найден — сомнительные остаются
// на пересчитанном месте и попадают в список «⚠ Проверить» в плане. Старый чертёж остаётся в проекте («… (старая версия)»).
// Дальше — обычный разбор нового листа: новые номера и новые значки без номеров (уже отмеченные значки не перенумеровываются).
import { h, openModal, toast } from '../ui.js';
import { state, getRepo, currentProject, subscribe } from '../store.js';
import { makeWorker, pointsFromDrawing } from './tohnitview.js';
import { pickPdf } from './pdfpick.js';
import { createViewer, mark } from './planview.js';
import { loadDrawing, drawingsOf, drawingFor, drawingTitle, addDrawingVersion, updateDrawing } from '../drawings.js';
import { uniquePairs, fitSheets, fitManual, planMove, moveSummary, movePos, versionName, offSheet } from '../../domain/sheetfit.js';
import { info, warn } from '../../log.js';

export const KIND = {
  ok: ['на месте', '#34c759'], plain: ['по пересчёту', '#0a84ff'], moved: ['сдвинута на новом чертеже', '#ff9500'],
  missing: ['нет на новом чертеже', '#ff3b30'], lost: ['значок не найден на прежнем месте', '#ff9500'], nofit: ['не перенесена', '#8e8e93'],
};
const REVIEW = ['moved', 'missing', 'lost'];

export async function newVersion(oldD, { onDone } = {}) {
  const r = await pickPdf({ title: `🔄 Новая версия: ${drawingTitle(oldD)}`, project: false }); if (!r) return;
  const status = h('div', { class: 'mut', style: { margin: '6px 0' } }, 'Читаю оба чертежа…');
  const body = h('div', {});
  let wkO = null; let wkN = null;
  const close = openModal('🔄 Новая версия чертежа', h('div', {},
    h('div', { class: 'mut' }, `Было: «${drawingTitle(oldD)}». Стало: «${r.name}». Точки переедут на новый лист с пересчётом (лист может быть другого размера и масштаба). Записи и работы по точкам не меняются. Старый чертёж останется в проекте.`),
    status, body), { sticky: true, wide: true, onClose: () => { wkO?.stop(); wkN?.stop(); } });
  try {
    const oldBuf = await loadDrawing(oldD);
    wkO = makeWorker(); wkN = makeWorker();
    const t0 = Date.now();
    await Promise.all([wkO.call('open', { data: oldBuf.slice(0) }), wkN.call('open', { data: r.buf.slice(0) })]);
    const [sO, sN] = await Promise.all([wkO.call('spans'), wkN.call('spans')]);
    const pts = [...state.ctx.points.values()].filter((p) => p.pos && drawingFor(p)?.id === oldD.id);
    const pairs = uniquePairs(sO.spans, sN.spans);
    const fits = fitSheets(pairs, sN.pages);
    info(`Новая версия чертежа: ${oldD.name} → ${r.name}, общих надписей ${pairs.length}, ${[...fits].map(([pg, f]) => `стр.${pg + 1}→${f.newPage + 1}: совпало ${f.inliers}/${f.total}, ×${f.scale}, ${f.angle}°, ±${f.rms}`).join('; ') || 'пересчёта нет'} (${Date.now() - t0} мс)`);
    const name = versionName(r.name, drawingsOf().flatMap((d) => [d.name, ...(d.aliases || [])]));
    const sheet = { name, pages: sN.pages };
    const pagesWithPts = [...new Set(pts.map((p) => p.pos.page || 0))].sort((a, b) => a - b);
    const ctx = { oldD, r, sO, sN, wkO, wkN, pts, fits, sheet, status, body, close, onDone };
    for (const pg of pagesWithPts) {
      if (fits.get(pg)?.ok) continue;
      status.textContent = pagesWithPts.length > 1 ? `Лист ${pg + 1} старого чертежа: общих номеров мало — покажите два одинаковых места.` : 'Общих номеров на листах мало — покажите два одинаковых места на старом и новом листе.';
      const f = await manualFit(ctx, pg); if (!f) { close(); return; }
      fits.set(pg, f);
    }
    preview(ctx);
  } catch (e) { status.textContent = `Не получилось: ${e.message}`; warn('Новая версия чертежа', e.message); }
}

// Два одинаковых места на старом и новом листе → пересчёт. Возвращает fit (с newPage) или null (отмена).
function manualFit(ctx, oldPage) {
  const { wkO, wkN, sO, sN, body } = ctx;
  return new Promise((resolve) => {
    const taps = []; let newPage = 0;
    const STEPS = ['1 из 4. СТАРЫЙ лист: нажмите на заметное место (номер точки, угол стены)', '2 из 4. НОВЫЙ лист: нажмите на то же место',
      '3 из 4. СТАРЫЙ лист: второе место — подальше от первого', '4 из 4. НОВЫЙ лист: то же второе место'];
    const msg = h('div', { style: { fontWeight: 600, margin: '6px 0' } });
    const step = () => taps.length;
    const drawMarks = (g, api, which) => taps.forEach((t, i) => { const it = which === 'old' ? (i % 2 === 0 ? t : null) : (i % 2 === 1 ? t : null); if (it && (it.page || 0) === api.page) mark(g, api, { ...it, w: 10, h: 10 }, '#e0007a', i < 2 ? 'A' : 'B'); });
    const tap = (which, x, y, page) => {
      const want = step() % 2 === 0 ? 'old' : 'new'; if (step() >= 4) return;
      if (which !== want) { toast(want === 'old' ? 'Сейчас — на старом листе (верхний)' : 'Сейчас — на новом листе (нижний)'); return; }
      taps.push({ x, y, page }); vO.draw(); vN.draw(); upd();
    };
    const vO = createViewer({ wk: wkO, pages: sO.pages, height: '30vh', onTap: (x, y, pg) => tap('old', x, y, pg), overlay: (g, api) => drawMarks(g, api, 'old') });
    const vN = createViewer({ wk: wkN, pages: sN.pages, height: '30vh', onTap: (x, y, pg) => tap('new', x, y, pg), overlay: (g, api) => drawMarks(g, api, 'new') });
    const again = h('button', { class: 'sec', onclick: () => { taps.length = 0; vO.draw(); vN.draw(); upd(); } }, '↺ Заново');
    const ok = h('button', { disabled: true, onclick: () => {
      const pairs = [{ a: taps[0], b: taps[1] }, { a: taps[2], b: taps[3] }];
      const f = fitManual(pairs); if (!f) { toast('Места слишком близко — выберите подальше друг от друга'); return; }
      const sz = sN.pages[newPage] || {}; resolve({ ...f, newPage, thr: Math.max(3, Math.hypot(sz.w || 0, sz.h || 0) * 0.0015) });
    } }, '✔ Готово');
    const cancel = h('button', { class: 'sec', onclick: () => resolve(null) }, 'Отмена');
    function upd() { msg.textContent = step() < 4 ? STEPS[step()] : 'Оба места отмечены — «Готово».'; ok.disabled = step() < 4; }
    const pageSel = sN.pages.length > 1 ? h('select', { onchange: (e) => { newPage = +e.target.value; taps.length = 0; vN.load(newPage); upd(); } }, sN.pages.map((_, i) => h('option', { value: i }, `Новый: лист ${i + 1}`))) : null;
    body.replaceChildren(...[msg,
      h('div', { class: 'mut', style: { fontSize: '12px' } }, `Старый лист${sO.pages.length > 1 ? ` ${oldPage + 1}` : ''}`), h('div', { class: 'btns', style: { marginTop: 0 } }, ...vO.zoomBtns()), vO.el,
      h('div', { class: 'mut', style: { fontSize: '12px', marginTop: '8px' } }, 'Новый лист'), h('div', { class: 'btns', style: { marginTop: 0 } }, pageSel, ...vN.zoomBtns()), vN.el,
      h('div', { class: 'btns' }, ok, again, cancel)].filter(Boolean));
    upd();
    vO.start().then(() => (oldPage ? vO.load(oldPage) : null)).catch(() => {});
    vN.start().catch(() => {});
  });
}

// Предпросмотр: точки на новом листе по цветам; сводка; «Перенести»
function preview(ctx) {
  const { pts, fits, sO, sN, sheet, wkN, status, body } = ctx;
  const plan = planMove(pts, fits, sO.spans, sN.spans, sheet);
  const c = moveSummary(plan);
  const movable = plan.filter((x) => x.pos);
  const fitLine = [...fits].filter(([pg]) => pts.some((p) => (p.pos.page || 0) === pg)).map(([pg, f]) => `${fits.size > 1 ? `лист ${pg + 1} → ${f.newPage + 1}: ` : ''}${f.manual ? 'по двум местам' : `совпало номеров ${f.inliers} из ${f.total}`}, масштаб ×${f.scale}${Math.abs(f.angle) > 0.05 ? `, поворот ${f.angle}°` : ''}${f.manual ? '' : `, точность ±${f.rms}`}`).join('; ');
  const off = offSheet(plan, sN.pages);
  status.textContent = `Пересчёт: ${fitLine}. Посмотрите на плане, что точки встали на свои места.`;
  if (off) status.append(h('div', { style: { color: '#ff3b30', fontWeight: 600, marginTop: '4px' } }, `${off} из ${plan.length} точек оказались за краем нового листа — похоже, лист сопоставлен неверно. Нажмите «📍 Не совпало — указать места вручную».`));
  const pageNow = () => vN.page;
  const vN = createViewer({ wk: wkN, pages: sN.pages, height: '52vh', overlay: (g, api) => {
    for (const x of movable) {
      if ((x.pos.page || 0) !== api.page) continue;
      const [, col] = KIND[x.kind]; const bad = REVIEW.includes(x.kind);
      mark(g, api, x.pos, col, bad && api.view.s > 0.5 ? x.label : '', { fill: bad });
      if (x.to && (x.to.page || 0) === api.page) { const [ax, ay] = api.toScr(x.pos.x, x.pos.y); const [bx, by] = api.toScr(x.to.x, x.to.y); g.setLineDash([4, 3]); g.strokeStyle = col; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); g.setLineDash([]); }
    }
  } });
  const legend = h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '13px', margin: '6px 2px' } },
    ...['ok', 'plain', 'moved', 'lost', 'missing', 'nofit'].filter((k) => c[k]).map((k) => h('span', {}, h('span', { style: { color: KIND[k][1] } }, '● '), `${KIND[k][0]}: ${c[k]}`)));
  const doubt = plan.filter((x) => REVIEW.includes(x.kind) || x.kind === 'nofit');
  const listBox = doubt.length ? h('details', { style: { margin: '6px 0' } }, h('summary', {}, `Требуют проверки: ${doubt.length}`),
    ...doubt.map((x) => h('div', { class: 'item', onclick: () => { if (x.pos && (x.pos.page || 0) === pageNow()) vN.focus(x.pos.x, x.pos.y, x.pos.page || 0); } },
      h('div', { class: 'name' }, x.label || '(без номера)', h('div', { class: 'sub', style: { color: KIND[x.kind][1] } }, `${KIND[x.kind][0]}${x.under ? ` (значок «${x.under}»)` : ''}${x.kind === 'moved' && x.d ? ` — на ${Math.round(x.d)} ед. старого листа` : ''}`))))) : null;
  const go = h('button', { disabled: !movable.length, onclick: () => apply(ctx, plan) }, `✔ Перенести точки (${movable.length})`);
  const manual = h('button', { class: 'sec', onclick: async () => {
    const pages = [...new Set(pts.map((p) => p.pos.page || 0))];
    for (const pg of pages) { const f = await manualFit(ctx, pg); if (!f) { preview(ctx); return; } fits.set(pg, f); }
    preview(ctx);
  } }, '📍 Не совпало — указать места вручную');
  body.replaceChildren(...[
    pts.length ? null : h('div', { class: 'card' }, 'На старом чертеже нет точек — новый просто добавится в проект.'),
    legend, h('div', { class: 'btns', style: { marginTop: 0 } }, ...vN.zoomBtns()), vN.el, listBox,
    h('div', { class: 'mut', style: { fontSize: '13px', margin: '6px 2px' } }, 'Сомнительные точки остаются на пересчитанном месте и попадут в список «⚠ Проверить» в плане нового чертежа — там их можно перенести, оставить или снять с плана.'),
    h('div', { class: 'btns' }, pts.length ? go : h('button', { onclick: () => apply(ctx, plan) }, '✔ Добавить чертёж'), pts.length ? manual : null, h('button', { class: 'sec', onclick: () => ctx.close() }, 'Отмена'))].filter(Boolean));
  vN.start().catch((e) => { status.textContent = `Не получилось показать лист: ${e.message}`; });
}

async function apply(ctx, plan) {
  const { oldD, r, sN, fits, sheet, status, body, close, onDone } = ctx;
  status.textContent = 'Сохраняю…'; body.replaceChildren();
  try {
    const hidden = (oldD.hidden || []).map((m) => { const f = fits.get(m.pos?.page || 0); return f && m.pos ? { ...m, pos: movePos(m.pos, f, sheet, f.newPage) } : null; }).filter(Boolean);
    const review = plan.filter((x) => REVIEW.includes(x.kind)).map((x) => ({ id: x.id, label: x.label || '', kind: x.kind, ...(x.to ? { to: x.to } : {}), ...(x.under ? { under: x.under } : {}) }));
    const entry = await addDrawingVersion(r.buf, oldD, { name: sheet.name, title: oldD.title || '', floor: oldD.floor || '', pages: sN.pages, fileId: r.fileId || null,
      hidden, review, versionOf: { id: oldD.id, name: oldD.name, at: new Date().toISOString() } });
    // точки — после чертежа (иначе на мгновение они ссылались бы на чертёж, которого ещё нет)
    const ops = plan.filter((x) => x.pos).map((x) => ({ coll: 'points', id: x.id, data: { pos: x.pos } }));
    if (ops.length) getRepo().save(currentProject().id, ops);
    await new Promise((res) => { const t = setTimeout(res, 2000); const un = subscribe(() => { if (drawingsOf().some((d) => d.id === entry.id)) { clearTimeout(t); un(); res(); } }); });
    const c = moveSummary(plan);
    info(`Новая версия чертежа сохранена: ${sheet.name}, перенесено ${ops.length}, проверить ${review.length}`);
    status.textContent = '';
    const next = () => { close(); const d = drawingsOf().find((x) => x.id === entry.id) || entry; pointsFromDrawing({ drawing: d, buf: r.buf, lockIcons: true, onDone: () => onDone?.(entry.id) }); };
    body.replaceChildren(h('div', { class: 'card' },
      h('b', {}, `Готово: на новый чертёж перенесено точек — ${ops.length}.`),
      h('div', { style: { margin: '6px 0' } }, `На месте: ${c.ok}, по пересчёту: ${c.plain}.`),
      review.length ? h('div', { style: { margin: '6px 0', color: '#ff9500' } }, `Проверить: ${review.length} (сдвинуты на новом чертеже: ${c.moved}, нет на новом: ${c.missing}, значок не на месте: ${c.lost}) — кнопка «⚠ Проверить» в плане.`) : null,
      c.nofit ? h('div', { style: { margin: '6px 0' } }, `Не перенесены (лист без пересчёта): ${c.nofit} — остались на старом чертеже.`) : null,
      h('div', { class: 'mut', style: { margin: '6px 0' } }, `Старый чертёж остался в проекте: «${drawingTitle(oldD).replace(/\.pdf$/i, '')} (старая версия)».`),
      h('div', { style: { margin: '10px 0 4px', fontWeight: 600 } }, 'Дальше: новые номера и значки без номеров с нового листа (ваши значки сохраняют свои номера, новые продолжат нумерацию).')),
    h('div', { class: 'btns' }, h('button', { onclick: next }, '➕ Новые точки и значки'), h('button', { class: 'sec', onclick: () => { close(); onDone?.(entry.id); } }, '🗺 Открыть новый чертёж')));
  } catch (e) { status.textContent = `Не получилось сохранить: ${e.message}`; warn('Новая версия чертежа: сохранение', e.message); }
}

// ---------- после переноса: список «⚠ Проверить» в плане ----------
/** Пункты проверки, ещё актуальные (точка есть и всё ещё на этом чертеже) */
export function reviewOf(d) {
  return (d?.review || []).filter((x) => { const p = state.ctx.points.get(x.id); return p && p.pos && drawingFor(p)?.id === d.id; });
}

export function reviewModal(d, { onFocus, onChange } = {}) {
  const list = h('div', {});
  const drop = (id) => updateDrawing(d.id, (x) => ({ review: (x.review || []).filter((y) => y.id !== id) }));
  const saveP = (id, data) => getRepo().save(currentProject().id, [{ coll: 'points', id, data }]);
  let items = reviewOf(d);
  const paint = () => {
    list.replaceChildren(...items.map((x) => {
      const done = (fn) => () => { fn(); drop(x.id); items = items.filter((y) => y !== x); paint(); onChange?.(); if (!items.length) c(); };
      return h('div', { class: 'card', style: { margin: '6px 0', padding: '8px' } },
        h('div', {}, h('b', {}, x.label || '(без номера)'), ' — ', h('span', { style: { color: KIND[x.kind]?.[1] } }, KIND[x.kind]?.[0] || x.kind), x.under ? ` (значок «${x.under}»)` : ''),
        h('div', { class: 'btns', style: { marginTop: '6px' } },
          h('button', { class: 'sec', onclick: () => { c(); onFocus?.(x.id, x.to || null); } }, '👁 Показать'),
          x.to ? h('button', { onclick: done(() => saveP(x.id, { pos: x.to })) }, '↪ На новое место') : null,
          h('button', { class: 'sec', onclick: done(() => {}) }, '✔ Оставить'),
          x.kind === 'missing' ? h('button', { class: 'sec', onclick: done(() => saveP(x.id, { pos: null })) }, '🚫 Снять с плана') : null));
    }));
  };
  paint();
  const c = openModal(`⚠ Проверить после новой версии (${items.length})`, h('div', {},
    h('div', { class: 'mut' }, 'Эти точки перенесены с прежней версии чертежа, но на новом листе их место изменилось или их там нет. Точка стоит на пересчитанном прежнем месте. «На новое место» — туда, где этот номер (значок) стоит на новом листе.'),
    list, h('div', { class: 'btns' }, h('button', { class: 'sec', onclick: () => { updateDrawing(d.id, { review: [] }); onChange?.(); c(); } }, '✔ Всё проверено — очистить список'))), { sticky: true });
}
