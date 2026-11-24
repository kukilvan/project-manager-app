// «🗺 План»: the project's drawing with points colored by progress (pink — pulled, then yellow → green); tapping a point opens its card, and «📍 На чертеже» on a card opens the plan there.
// Draws the sheets with the planview.js viewer through the tohnit worker (MuPDF), reads and writes drawings with drawings.js, and saves points through repo.save;
// the tools on the plan call planversion.js (new drawing version), planlink.js (link points), plannumbers.js (PDF with numbers), tohnitview.js (parse, icons) and pointmerge.js.
// It remembers on this device the last drawing and each drawing's place and zoom (`pz.planView.<projectId>`, planmemory.js), so the plan opens where the owner left it.
//
// Contents:
// - shOf(), tagOf(), outline(), placeTags(), iconImg() — drawing helpers: door short labels, frames, non-overlapping tags, type icons
// - planModal() — the plan screen: sheet pages, several-value filters (types with the two modes, door configurations, racks — shared with «Точки» through
//   sharedfilters.js; stages: what is left, works, problems), the focus point shown through the filters, the legend, layers, the «🚪 Двери» wizard and the brush
// - addPdf() — add a drawing to the project from a PDF
// - tap handling and addCard(), existingCard(), pickGroup() — «➕ Точка на плане»: add a point, link a place to a point, draw or remove a type icon
// - markCard(), moveMark(), chooseFor(), hideArea() — an unlinked caption («Не размеченая»): hide it or link it to a project point
// - the type-icons tool «📌 Значки типов» and the drawing layers (AutoCAD) switcher
// - namesModal() — the user's own drawing names and their order
import { matchesPanelQuery } from '../../domain/rack.js';
import { pickPdf } from './pdfpick.js';
import { h, openModal, toast, confirmDialog, mousePc } from '../ui.js';
import { info } from '../../log.js';
import { state, currentProject, infoOf, getRepo, subscribe } from '../store.js';
import { drawingsOf, drawingTitle, drawingFor, loadDrawing, addDrawing, pushDrawing, removeDrawing, updateDrawing, patchDrawings, posKey } from '../drawings.js';
import { comparePoints, nextLabel, combineLabels, sameLabelClash } from '../../domain/index.js';
import { newId } from '../repo.js';
import { typePicker } from './tohnitview.js';
import { cablesPicker } from './cablespick.js';
import { addWorkForPoints } from './doh.js';
import { makeWorker, pointsFromDrawing } from './tohnitview.js';
import { newVersion, reviewOf, reviewModal } from './planversion.js';
import { sameGroups, mergeModal } from './pointmerge.js';
import { createViewer } from './planview.js';
import { parsePlanMemory, viewFor, rememberView, drawingToOpen } from '../../domain/planmemory.js';
import { exportNumberedPdf, publishNumbered } from './plannumbers.js';
import { linkPoints } from './planlink.js';
import { choosePoint } from './pointchooser.js';
import { bulkEditForm, renameForm } from './points.js';
import { problemButtons } from './problems.js';
import { editForm as historyEditForm } from './journal.js';
import { doorCfgOf, doorCfgShort, usesConfig } from '../../domain/index.js';
import { latinKey } from '../../domain/index.js';
import { cfgOptions, cfgSetMatch } from '../cfgfilter.js';
import { rackMatch, typeSetMatch, rackOptions, missingValues, isOff, prune } from '../../domain/filters.js';
import { stageOptions, stageMatch, shownPoints, noneUnderFilters } from '../../domain/planfilters.js';
import { sharedFilters, setShared, clearShared } from '../sharedfilters.js';
import { multiFilter, resetButton } from './multifilter.js';
import { allDoorCfgs, pinsOf as doorPins, ensureDoorCfg } from '../doorpool.js';
import { doorPicker } from './doorcfgview.js';
import { doorChips } from './doorchips.js';
import { doorShortColor } from '../../domain/index.js';
// the point's tag on the plan: a door with a configuration also gets «ЭМ» / «МХ»
export const shOf = (p) => { const c = doorCfgOf(p, state.ctx); const t = c ? doorCfgShort(state.ctx, c) : ''; return t ? { text: t, color: doorShortColor(state.ctx, c) || '#111' } : null; };
export const tagOf = (p) => { const c = doorCfgOf(p, state.ctx); const sh = c ? doorCfgShort(state.ctx, c) : ''; return sh ? `${p.label} ${sh}` : p.label; };
import { typeOptions } from '../typegroups.js';

import { markColor, gradientColor, PLAN_LEGEND, planFilterGroups, problemName } from '../../domain/index.js';
import { lang, tr } from '../../i18n/index.js';
// a caption on the drawing — a frame around the text; an icon without a caption — a circle of its size
export const isText = (pos) => { const w = pos.w || 0; const hh = pos.h || 0; return w && hh && Math.max(w, hh) / Math.min(w, hh) > 1.6; };
export function outline(g, api, pos, color, { width = 1.5, pad = 1.5, fill = null } = {}) {
  const s = api.view.s; const [x, y] = api.toScr(pos.x, pos.y);
  g.strokeStyle = color; g.lineWidth = width; g.beginPath();
  if (isText(pos)) { const w = (pos.w / 2 + pad) * s; const hh = (pos.h / 2 + pad) * s; g.rect(x - Math.max(w, 4), y - Math.max(hh, 3), 2 * Math.max(w, 4), 2 * Math.max(hh, 3)); }
  else g.arc(x, y, Math.max(5, (Math.max(pos.w || 8, pos.h || 8) / 2 + pad) * s), 0, Math.PI * 2);
  if (fill) { g.fillStyle = fill; g.fill(); }
  g.stroke();
}
// the font of the tags and the pull circles: they grow with the zoom
const tagFont = (api) => Math.round(Math.min(26, Math.max(12, 5.5 * api.view.s)));
// the circles of an unfinished pull: one per cable (at most 10 shown), filled for a pulled one
const PULL_DOT = '#A8285F';
const dotsRad = (fs) => Math.max(2.5, fs * 0.22);
const dotsRow = (fs) => 2 * dotsRad(fs) + 3;
const dotsCount = (pull) => Math.min(pull.total, 10);
const dotsWidth = (pull, fs) => dotsCount(pull) * (2 * dotsRad(fs) + 2) - 2;
function drawPullDots(g, pull, x0, cy, fs) {
  const rad = dotsRad(fs); const n = dotsCount(pull);
  const filled = n === pull.total ? pull.done : Math.min(n - 1, Math.max(pull.done > 0 ? 1 : 0, Math.round((pull.done / pull.total) * n)));
  g.lineWidth = 1; g.strokeStyle = PULL_DOT;
  for (let i = 0; i < n; i++) { g.beginPath(); g.arc(x0 + rad + i * (2 * rad + 2), cy, rad - 0.5, 0, Math.PI * 2); g.fillStyle = i < filled ? PULL_DOT : '#fff'; g.fill(); g.stroke(); }
}
const labelLike = (t = '') => /\d/.test(t) && !/[\u0590-\u05FF]/.test(t) && t.length <= 24 && !/\s{2,}/.test(t);
// tags of icons (points with no caption on the drawing): they grow with the zoom, sit in a frame of the point's color,
// and are placed where they do not cover icons and other tags; t.width thickens the frame (a finished point), t.line — all lines (2 on a computer, 0.75 on a phone);
// t.pull ({ done, total }) adds a row of circles to the tag, one per cable of an unfinished pull
export function placeTags(g, api, tags, circles, frames = []) {
  const fs = tagFont(api);
  g.font = `bold ${fs}px system-ui`; g.textBaseline = 'middle';
  const placed = [...frames]; const padX = 4;
  const hitsBox = (b) => placed.some((q) => b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1]);
  const hitsCircle = (b) => circles.some(([cx, cy, cr]) => { const dx = Math.max(b[0] - cx, 0, cx - b[2]); const dy = Math.max(b[1] - cy, 0, cy - b[3]); return dx * dx + dy * dy < cr * cr; });
  for (const t of tags.sort((a, b) => a.y - b.y || a.x - b.x)) {
    const lines = combineLabels(t.labels || [t.p.label]); const lh = fs + 2; const hh = lines.length * lh + 4 + (t.pull ? dotsRow(fs) : 0);
    const w = Math.max(...lines.map((l) => g.measureText(l).width), t.pull ? dotsWidth(t.pull, fs) : 0) + 2 * padX; const gap = 3; const r = t.r;
    const opts = [[t.x + r + gap, t.y - r - hh + 4], [t.x + r + gap, t.y - hh / 2], [t.x + r + gap, t.y + r - 4], [t.x - w / 2, t.y - r - hh - gap], [t.x - w / 2, t.y + r + gap],
      [t.x - r - gap - w, t.y - r - hh + 4], [t.x - r - gap - w, t.y - hh / 2], [t.x - r - gap - w, t.y + r - 4],
      [t.x + r + gap, t.y - r - 2 * hh], [t.x - w / 2, t.y + r + gap + hh], [t.x - w / 2, t.y - r - 2 * hh - gap], [t.x + r + gap, t.y + r + hh]];
    const box = ([x0, y0]) => [x0, y0, x0 + w, y0 + hh];
    const best = opts.map(box).find((b) => !hitsBox(b) && !hitsCircle(b)) || opts.map(box).find((b) => !hitsCircle(b)) || box(opts[0]);
    placed.push(best);
    // a line from the icon to its tag when the tag is moved aside
    const cx = Math.max(best[0], Math.min(t.x, best[2])); const cy = Math.max(best[1], Math.min(t.y, best[3]));
    if (Math.hypot(cx - t.x, cy - t.y) > r + gap + 4) { g.strokeStyle = t.col; g.lineWidth = t.line || 1; g.beginPath(); g.moveTo(t.x, t.y); g.lineTo(cx, cy); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,.92)'; g.fillRect(best[0], best[1], w, hh);
    g.strokeStyle = t.col; g.lineWidth = 2 * (t.width || 1) * (t.line || 1); g.strokeRect(best[0], best[1], w, hh);
    g.fillStyle = '#111'; lines.forEach((l, i) => {
      const yy = best[1] + 2 + lh * i + lh / 2 + 1;
      if (t.sh && lines.length === 1 && l.endsWith(` ${t.sh.text}`)) {  // «ЭМ» / «МХ» — by color
        const main = l.slice(0, -t.sh.text.length); g.fillText(main, best[0] + padX, yy);
        g.fillStyle = t.sh.color; g.fillText(t.sh.text, best[0] + padX + g.measureText(main).width, yy); g.fillStyle = '#111'; return;
      }
      g.fillText(l, best[0] + padX, yy);
    });
    if (t.pull) drawPullDots(g, t.pull, best[0] + padX, best[1] + 2 + lines.length * lh + dotsRad(fs) + 1, fs);
  }
  g.textBaseline = 'alphabetic';
}
const UNL = '__unlinked'; const HID = '__hidden';

// type icons (an image taken from the drawing): they draw the points added on site, on the plan and in the «PDF с номерами»
const iconImgs = new Map();
function iconImg(t, png, redraw) {
  const k = `${t}|${png.length}`; if (iconImgs.has(k)) return iconImgs.get(k);
  const im = new Image(); im.onload = redraw; im.src = png; iconImgs.set(k, im); return im;
}
const toDataUrl = (bytes) => { let s = ''; const u = new Uint8Array(bytes); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return `data:image/png;base64,${btoa(s)}`; };

// the swatch of a legend line: a frame in the color, a strip for the gradient, two circles (filled and empty) for the cables
function legendSwatch(x) {
  if (x.gradient) return h('span', { style: { display: 'inline-block', width: '34px', height: '11px', borderRadius: '2px', background: `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1].map((t) => gradientColor(t)).join(', ')})` } });
  if (x.circles) { const dot = (fill) => h('span', { style: { display: 'inline-block', width: '9px', height: '9px', boxSizing: 'border-box', border: `1px solid ${PULL_DOT}`, background: fill, borderRadius: '50%' } }); return h('span', { style: { display: 'inline-flex', gap: '2px' } }, dot(PULL_DOT), dot('#fff')); }
  return h('span', { style: { display: 'inline-block', width: '11px', height: '11px', border: `${x.thick ? 3.5 : 2}px solid ${x.color}`, background: '#fff', borderRadius: '2px' } });
}

export function planModal({ point = null, placeFor = null } = {}) {
  const box = h('div', {});
  let wk = null; let viewer = null; let current = null; let focusId = point?.id || null;
  // filters: racks, types and door configurations are the shared sets of «Точки» (sharedfilters.js); the stage set and the mode («❔ Не размеченые» / «🙈 Скрытые») live while the plan is open
  let fStage = new Set(); let fMode = '';
  let dimDrawing = false; let selMode = false; let rectSel = false; const sel = new Set(); let selBar = () => {};
  let openCard = null; let doorPts = () => []; let goDoor = () => {}; let brushTap = () => {};
  const doorSkip = new Set(); let doorCur = null; let doorMode = 'wizard'; let brushId = ''; let pipette = false;  // «Кисть»: a configuration applied by a tap; the pipette takes it from a door  // the «🚪 Двери» wizard: skipped doors and the current door
  let tool = placeFor ? 'place' : null; let iconType = ''; let temp = null; let toolBar = () => {};  // tool: add — «➕ Точка на плане», icon — «📌 Значки типов», place — «📍 Отметить на плане»
  let updateInfo = () => {}; const unsub = subscribe(() => { viewer?.draw(); updateInfo(); if (tool === 'doors') toolBar(); });  // statuses and numbers change — the plan follows
  // the view memory of this device (spec 8 § 2): the place and zoom are kept 0.5 s after the view stops changing, when the plan closes and when the page is hidden
  const memKey = `pz.planView.${currentProject()?.id}`; let pendingView = null; let viewTimer = null; let openPoint = point; let placeFresh = !!placeFor;
  const readMem = () => { try { return parsePlanMemory(localStorage.getItem(memKey)); } catch { return parsePlanMemory(null); } };
  function flushView() {
    clearTimeout(viewTimer); viewTimer = null; const p = pendingView; pendingView = null; if (!p) return;
    try { localStorage.setItem(memKey, JSON.stringify(rememberView(readMem(), p.id, p.view, drawingsOf().map((x) => x.id)))); } catch { /* storage blocked or full: the plan works without it */ }
  }
  const queueView = (id, view) => { pendingView = { id, view }; clearTimeout(viewTimer); viewTimer = setTimeout(flushView, 500); };
  function onHide() { if (document.visibilityState === 'hidden') flushView(); }
  document.addEventListener('visibilitychange', onHide);
  const close = openModal('🗺 План', box, { sticky: true, wide: true, onClose: () => { unsub(); wk?.stop(); flushView(); document.removeEventListener('visibilitychange', onHide); } });
  const sheetPts = (d) => [...state.ctx.points.values()].filter((p) => p.pos && drawingFor(p)?.id === d.id);

  function addPdf() {
    (async () => {
      const r = await pickPdf({ title: '➕ Чертёж в план', project: false }); if (!r) return;
      const f = { name: r.name }; const buf = r.buf;
      const dup = drawingsOf().find((x) => x.name === f.name);
      if (dup && !(await confirmDialog(`Этот файл уже добавлен: «${drawingTitle(dup)}» (файл ${f.name}). Заменить чертёж новым файлом? Точки и отметки останутся.`, { yes: 'Заменить' }))) return;
      // points whose drawing is not added yet: offer to link them to this file
      const orphan = [...new Set([...state.ctx.points.values()].filter((p) => p.pos?.sheet && !drawingFor(p)).map((p) => p.pos.sheet))];
      let alias = null;
      if (orphan.length && !orphan.includes(f.name)) {
        alias = await new Promise((res) => {
          const c = openModal('Чей это чертёж?', h('div', {},
            h('div', { class: 'mut' }, `Точки проекта ссылаются на чертежи: ${orphan.join(', ')}. Если «${f.name}» — один из них (переименованный), выберите его — точки появятся на плане.`),
            ...orphan.map((o) => h('button', { class: 'wide', style: { margin: '6px 0' }, onclick: () => { c(); res(o); } }, `Это «${o}» (${[...state.ctx.points.values()].filter((p) => p.pos?.sheet === o).length} точек)`)),
            h('button', { class: 'sec wide', onclick: () => { c(); res(null); } }, 'Нет, это другой чертёж')), { onClose: () => res(null) });
        });
      }
      toast('Сохраняю чертёж…');
      try {
        const tmp = makeWorker(); const o = await tmp.call('openDoc', { data: buf.slice(0) }); tmp.stop();
        const fl = [...state.ctx.points.values()].find((p) => p.pos?.sheet === (alias || f.name))?.floor || '';
        let d = await addDrawing(buf, { name: f.name, floor: fl, pages: o.pages, fileId: r.fileId || null }).catch((e) => { toast(`Чертёж сохранён на этом устройстве, на Диск — не получилось: ${e.message}`); return null; });
        d = d || drawingsOf().find((x) => x.name === f.name);
        if (alias && d) updateDrawing(d.id, (x) => ({ aliases: [...new Set([...(x.aliases || []), alias])] }));
        toast('Чертёж добавлен'); setTimeout(() => draw(d?.id), 300);
        if (d && state.ctx.points.size) linkPoints(d, buf, { onDone: () => draw(d.id) }).catch((e) => toast(`Связать точки не получилось: ${e.message}`));
      } catch (e) { toast(`Не получилось: ${e.message}`); }
    })();
  }

  async function show(d) {
    flushView(); current = d; wk?.stop(); wk = makeWorker(); sel.clear(); selMode = false; temp = null; doorCur = null;
    const status = h('div', { class: 'mut', style: { margin: '6px 0' } }, 'Открываю чертёж…');
    const perf = h('div', { class: 'mut', style: { fontSize: '12px', margin: '0 0 4px' } });
    const holder = h('div', {}); body.replaceChildren(status, perf, holder);
    try {
      // the PDF reader module loads and starts at the same time as the drawing file is read
      const t0 = performance.now(); const warm = wk.call('warm').then(() => performance.now() - t0, () => 0);
      const buf = await loadDrawing(d); const from = loadDrawing.from || 'устройства'; const t1 = performance.now();
      if (from === 'Диска') status.textContent = 'Чертёж скачан с Google Диска (раньше на этом устройстве не был)…';
      const o = await wk.call('openDoc', { data: buf.slice(0) }); const t2 = performance.now();
      const tw = await warm;
      const offLayers = (() => { try { return JSON.parse(localStorage.getItem(`pz.layers.${d.id}`) || '[]'); } catch { return []; } })();
      if (offLayers.length) await wk.call('setLayers', { off: offLayers });
      const cur = () => drawingsOf().find((x) => x.id === d.id) || d;
      const unl = () => (cur().unlinked || []); const hid = () => (cur().hidden || []);
      // a point passes the type, rack and door-configuration filters (the shared sets; values of one filter add up)
      const pass = (p) => { const f = sharedFilters(); return rackMatch(f.cab, p) && typeSetMatch(f.type, p) && cfgSetMatch(f.cfg, p); };
      // the stage filter (sections «Осталось», «Работа», «Проблемы»): points matching any ticked value stay bright
      const stageOk = (p) => stageMatch(fStage, p, state.ctx, infoOf);
      // drawn points: those passing the filters and the point in focus even when the filters hide it; it is bright and tappable
      const pts = () => (fMode ? [] : shownPoints(sheetPts(d), pass, focusId));
      const lit = (p) => stageOk(p) || p.id === focusId;
      const marks = () => (fMode === UNL ? unl() : fMode === HID ? hid() : []);
      // hit test: inside the frame or circle with a 10 px margin; of several, the nearest edge wins
      const hitDist = (pos, x, y) => { const s = viewer.view.s; const pad = 2 + 10 / s;
        if (isText(pos)) { const dx = Math.max(0, Math.abs(x - pos.x) - pos.w / 2 - pad); const dy = Math.max(0, Math.abs(y - pos.y) - pos.h / 2 - pad); return Math.hypot(dx, dy); }
        return Math.max(0, Math.hypot(x - pos.x, y - pos.y) - Math.max(pos.w || 8, pos.h || 8) / 2 - pad); };
      const nearest = (list, getPos, x, y, page) => { let best = null; let bd = Infinity; for (const it of list) { const pos = getPos(it); if ((pos.page || 0) !== page) continue; const dd = hitDist(pos, x, y); if (dd < bd) { bd = dd; best = it; } } return bd === 0 ? best : null; };
      viewer = createViewer({ wk, pages: o.pages, height: '62vh', dim: () => (dimDrawing ? 0.35 : 1), rectMode: () => selMode && rectSel,
        onView: () => { if (current !== d) return; const c = viewer?.centre(); if (c) queueView(d.id, c); },
        onRect: (b, page) => { pts().filter((p) => lit(p) && (p.pos.page || 0) === page && p.pos.x >= b[0] && p.pos.x <= b[2] && p.pos.y >= b[1] && p.pos.y <= b[3]).forEach((p) => sel.add(p.id)); selBar(); viewer.draw(); },
        onTap: (x, y, page) => {
          if (tool === 'doors') { const p = nearest(doorPts(), (q) => q.pos, x, y, page); if (p) (doorMode === 'brush' ? brushTap(p) : goDoor(p)); else if (nearest(sheetPts(d), (q) => q.pos, x, y, page)) toast('Это не дверь'); return; }
          if (tool) { toolTap(d, o.pages, x, y, page, nearest); return; }
          if (fMode) { const m = nearest(marks(), (it) => it.pos, x, y, page); if (m) markCard(d, m, fMode === HID); return; }
          const best = nearest(pts().filter(lit), (p) => p.pos, x, y, page); if (!best) { if (focusId) { focusId = null; viewer.draw(); } return; }  // a tap on an empty spot drops the focus frame
          if (selMode) sel.has(best.id) ? sel.delete(best.id) : sel.add(best.id);
          const group = pts().filter((p) => p.id !== best.id && posKey(p.pos) === posKey(best.pos));
          if (selMode) { [best, ...group].forEach((p) => (sel.has(best.id) ? sel.add(p.id) : sel.delete(p.id))); selBar(); viewer.draw(); return; }
          focusId = best.id; viewer.draw();
          if (group.length) { const all = [best, ...group].sort(comparePoints); const cc = openModal('Точки на этой отметке', h('div', { class: 'card', style: { padding: 0 } }, all.map((p) => h('div', { class: 'item', onclick: () => { cc(); openCard?.(p); } }, h('div', { class: 'name' }, p.label, h('div', { class: 'sub' }, p.typeId))))), {}); return; }
          openCard?.(best);
        },
        overlay: (g, api) => {
          const big = api.view.s > 0.6;
          if (fMode) { for (const m of marks()) { if ((m.pos.page || 0) !== api.page) continue; if (fMode === HID) { outline(g, api, m.pos, '#c7c7cc', { width: 1, fill: 'rgba(255,255,255,.9)' }); } else outline(g, api, m.pos, '#ff9500', { width: 2 }); } return; }
          // hidden captions and icons are painted white so they do not get in the way
          for (const m of hid()) { if ((m.pos.page || 0) === api.page) outline(g, api, m.pos, '#ffffff', { width: 2, pad: 2, fill: '#ffffff' }); }
          const icons = currentProject()?.typeIcons || {}; const tags = []; const circles = []; const frames = [];
          // several points on one mark share one frame, color and tag: the color of the least finished point (markColor)
          const groups = new Map();
          // on a computer the colored lines are twice as thick: on a big screen without zooming in the color is hard to tell (the owner's wish); on a phone every point frame is a quarter thinner (ticket 6.8)
          const lineK = mousePc() ? 2 : 0.75; const capDots = [];
          for (const p of pts()) { if ((p.pos.page || 0) !== api.page) continue; const k = posKey(p.pos); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
          for (const grp of groups.values()) {
            const p = grp[0]; const on = grp.some(lit); const pc = markColor(grp, state.ctx, infoOf); const col = on ? pc.color : '#d0d0d0';
            for (const q of grp) {
              const ic = q.pos.icon && icons[q.typeId];
              if (ic) { const im = iconImg(q.typeId, ic.png, () => viewer?.draw()); if (im.complete && im.naturalWidth) { const [sx, sy] = api.toScr(q.pos.x, q.pos.y); const w = (ic.w || 12) * api.view.s; const hh = (ic.h || 12) * api.view.s; g.globalAlpha = on ? 1 : 0.4; g.drawImage(im, sx - w / 2, sy - hh / 2, w, hh); g.globalAlpha = 1; } }
            }
            outline(g, api, p.pos, col, { width: (on ? (big ? 1.5 : 2) * pc.width : 1) * lineK });
            if (grp.some((q) => sel.has(q.id))) outline(g, api, p.pos, '#00b7ff', { width: 3, pad: 1.5 + 3 / api.view.s });
            const labels = grp.map(tagOf); const [x, y] = api.toScr(p.pos.x, p.pos.y);
            if (!isText(p.pos)) {
              const r = Math.max(5, (Math.max(p.pos.w || 8, p.pos.h || 8) / 2 + 1.5) * api.view.s); circles.push([x, y, r]);
              if (on && big) tags.push({ p, col, x, y, r, labels, sh: shOf(p), width: pc.width, line: lineK, pull: pc.pull });
            } else {
              // a caption on the drawing: no tag of our own is needed if there is one point and it is named the same; otherwise (several points, another name) — a tag
              const hw = (p.pos.w / 2 + 2) * api.view.s; const hh2 = (p.pos.h / 2 + 2) * api.view.s;
              const need = grp.length > 1 || !!(p.pos.text && p.pos.text !== p.label);
              // no tag of its own: the circles of an unfinished pull go right under the caption's frame, and the tags keep that room
              const dots = on && big && !need && pc.pull; frames.push([x - hw, y - hh2, x + hw, y + hh2 + (dots ? dotsRow(tagFont(api)) : 0)]);
              if (dots) capDots.push({ pull: pc.pull, x: x - dotsWidth(pc.pull, tagFont(api)) / 2, y: y + hh2 + dotsRow(tagFont(api)) / 2 });
              if (on && big && need) tags.push({ p, col, x, y, r: Math.max(hw, hh2), labels, sh: shOf(p), width: pc.width, line: lineK, pull: pc.pull });
            }
          }
          placeTags(g, api, tags, circles, frames);
          capDots.forEach((c) => drawPullDots(g, c.pull, c.x, c.y, tagFont(api)));
          const rv = reviewOf(cur()); if (rv.length) { g.setLineDash([4, 3]); for (const x of rv) { const p = state.ctx.points.get(x.id); if (p?.pos && (p.pos.page || 0) === api.page) outline(g, api, p.pos, '#ff9500', { width: 2.5, pad: 3 + 4 / api.view.s }); } g.setLineDash([]); }
          const f = focusId && state.ctx.points.get(focusId);
          if (f?.pos && (f.pos.page || 0) === api.page && drawingFor(f)?.id === d.id) { outline(g, api, f.pos, '#e0007a', { width: 3, pad: 1.5 + 4 / api.view.s }); }
          if (tool === 'doors') for (const p of doorPts()) { if ((p.pos.page || 0) !== api.page || p.id === doorCur) continue; outline(g, api, p.pos, doorCfgOf(p, state.ctx) ? '#34c759' : doorSkip.has(p.id) ? '#8e8e93' : '#ff9500', { width: 3, pad: 1.5 + 3 / api.view.s }); }
          if (temp && (temp.page || 0) === api.page) { g.setLineDash([5, 3]); outline(g, api, temp, '#e0007a', { width: 2.5, pad: 2 + 3 / api.view.s, fill: 'rgba(224,0,122,.12)' }); g.setLineDash([]); }
        } });
      const search = h('input', { type: 'search', placeholder: 'Найти точку или порт U38-05', style: { flex: 1, minWidth: '120px' }, onchange: (e) => {
        const q = e.target.value.trim().toLowerCase(); if (!q) return;
        let p = sheetPts(d).find((x) => latinKey(x.label) === latinKey(q));
        if (!p) {  // by a panel port (U38-05): first in the chosen rack
          const byPort = sheetPts(d).filter((x) => matchesPanelQuery(x, q)).sort((a, b) => sharedFilters().cab.has(b.cabinet) - sharedFilters().cab.has(a.cabinet));
          if (byPort.length) { p = byPort[0]; toast(byPort.length > 1 ? `Порт ${q.toUpperCase()} есть в шкафах: ${byPort.map((x) => `${x.cabinet || '—'} (${x.label})`).join(', ')}. Показана ${p.label}` : `Порт в панели ${q.toUpperCase()}: ${p.label}`); }
        }
        p ??= sheetPts(d).find((x) => latinKey(x.label).includes(latinKey(q)));
        if (!p) { toast('Такой точки на этом чертеже нет'); return; }
        focusId = p.id; viewer.focus(p.pos.x, p.pos.y, p.pos.page || 0);
      } });
      // ---- the filter row: types (with the two modes), door configurations, racks, stages — several-value buttons (multifilter.js) ----
      // options are built from this drawing's points on every draw; counts are points of this drawing
      const countIn = (key) => { const n = new Map(); sheetPts(d).forEach((p) => { const k = key(p); n.set(k, (n.get(k) || 0) + 1); }); return n; };
      const typeOpts = () => { const n = countIn((p) => p.typeId);
        return [...typeOptions([...n.keys()], (t) => n.get(t)),
          { value: UNL, text: '❔ Не размеченые', kind: 'mode', count: unl().length }, { value: HID, text: '🙈 Скрытые', kind: 'mode', count: hid().length }]; };
      const cabOpts = () => rackOptions(sheetPts(d));
      const cfgOpts = () => cfgOptions(sheetPts(d));
      const stageOpts = () => stageOptions(planFilterGroups(sheetPts(d), state.ctx, infoOf), (id) => problemName(state.ctx.problems?.get(id), lang()));
      // a shared value absent on this drawing (rack FC ticked in «Точки») stays ticked, greyed at the end of the window (spec 7 D2); the plan never prunes shared sets
      const cfgName = (v) => (v === '__nolock' ? '⚠ Без запирания' : v === '__none' ? 'Без конфигурации' : allDoorCfgs().get(v)?.name || state.ctx.configs?.get(v)?.name || v);
      const missingOf = (key, opts, nameOf) => () => missingValues(sharedFilters()[key], opts()).map((v) => { const label = nameOf(v); return { value: v, label, text: `${label} — нет на этом чертеже` }; });
      const cabMissing = missingOf('cab', cabOpts, (v) => (v === '__none' ? 'Без шкафа' : v));
      const typeMissing = missingOf('type', typeOpts, (v) => v);
      const cfgMissing = missingOf('cfg', cfgOpts, cfgName);
      const changed = (clearSel) => { if (clearSel) { sel.clear(); selBar(); } refreshFilters(); viewer.draw(); };
      const shared = (key, title, allText, prefix, options, missing, covering, clearSel) => multiFilter({ title, allText, prefix, options, missing, covering,
        get: () => sharedFilters()[key], set: (s) => setShared(key, s), onChange: () => changed(clearSel) });
      // types: the shared set plus the plan-local mode; ticking a mode clears the shared type set (so «Точки» shows every type after it)
      const typeF = multiFilter({ title: 'Типы', allText: 'Все типы', prefix: 'Типы', options: typeOpts, missing: typeMissing, covering: true,
        get: () => { const s = new Set(sharedFilters().type); if (fMode) s.add(fMode); return s; },
        set: (s) => { fMode = s.has(UNL) ? UNL : s.has(HID) ? HID : ''; setShared('type', fMode ? new Set() : [...s].filter((v) => v !== UNL && v !== HID)); },
        onChange: () => changed(true) });
      const cfgF = shared('cfg', 'Конфигурации дверей', 'Все конфигурации дверей', 'Двери', cfgOpts, cfgMissing, false, true);
      // covering is against this drawing's racks: all of them ticked — the filter is off here, the button «Все шкафы»
      const cabF = shared('cab', 'Шкафы', 'Все шкафы', 'Шкафы', cabOpts, cabMissing, true, false);
      const stageF = multiFilter({ title: 'Этапы', allText: 'Все этапы', prefix: 'Этапы', options: stageOpts, get: () => fStage, set: (s) => { fStage = s; }, onChange: () => changed(false) });
      const active = () => { const f = sharedFilters();
        return !!fMode || fStage.size > 0 || f.cfg.size > 0 || !isOff(f.cab, cabOpts(), { covering: true }) || !isOff(f.type, typeOpts(), { covering: true }); };
      // «✖ Сбросить фильтры»: shared sets (for «Точки» too), stages and the mode; the selection is cleared as a type change clears it; «Найти точку» stays
      const reset = resetButton({ active, onReset: () => { clearShared(); fStage = new Set(); fMode = ''; sel.clear(); selBar(); refreshFilters(); viewer.draw(); } });
      const noneLine = h('div', { class: 'mut', style: { fontSize: '13px', margin: '6px 2px 0' } }, 'Под фильтры на этом чертеже точек нет');
      const refreshFilters = () => {
        fStage = prune(fStage, stageOpts());   // a gone work or problem (all done) is dropped silently
        cfgF.el.style.display = cfgOpts().length || cfgMissing().length ? '' : 'none';
        cabF.el.style.display = cabOpts().length || cabMissing().length ? '' : 'none';
        [typeF, cfgF, cabF, stageF, reset].forEach((x) => x.refresh());
        noneLine.style.display = noneUnderFilters(sheetPts(d), pass, { active: active(), mode: !!fMode }) ? '' : 'none';
      };
      const selBtn = h('button', { class: 'sec', onclick: () => { selMode = !selMode; rectSel = false; if (!selMode) sel.clear(); if (selMode) tool = null; toolBar(); selBar(); viewer.draw(); } });
      const addBtn = h('button', { class: 'sec', onclick: () => { tool = tool === 'add' ? null : 'add'; if (tool) { selMode = false; sel.clear(); selBar(); } temp = null; toolBar(); viewer.draw(); } });
      const iconBtn = h('button', { class: 'sec', onclick: () => { tool = tool === 'icon' ? null : 'icon'; if (tool) { selMode = false; sel.clear(); selBar(); } temp = null; toolBar(); viewer.draw(); } });
      const tbar = h('div', { class: 'card', style: { display: 'none', margin: '6px 0', padding: '8px', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } });
      const doorBar = h('div', { class: 'card', style: { display: 'none', margin: '6px 0', padding: '8px', gap: '6px', flexWrap: 'wrap', alignItems: 'center' } });  // under the plan: the door is visible above
      // ---- the «🚪 Двери» wizard: tap a door → choose a configuration → the next nearest unmarked one ----
      const isDoor = (p) => usesConfig(state.ctx.types.get(p.typeId));
      doorPts = () => sheetPts(d).filter(isDoor);
      const doorDone = (p) => !!doorCfgOf(p, state.ctx);
      const doorBtn = h('button', { class: 'sec', onclick: () => { tool = tool === 'doors' ? null : 'doors'; doorCur = null; if (tool) { selMode = false; sel.clear(); selBar(); } temp = null; toolBar(); viewer.draw(); if (tool) setTimeout(() => viewer.el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); } });
      const nextDoor = (from) => {
        const left = doorPts().filter((p) => p.id !== from?.id && !doorDone(p) && !doorSkip.has(p.id)); if (!left.length) return null;
        const pg = from?.pos?.page || 0; const dist = (p) => ((p.pos.page || 0) === pg ? 0 : 1e9) + (from ? Math.hypot(p.pos.x - from.pos.x, p.pos.y - from.pos.y) : 0);
        return left.sort((a, b) => dist(a) - dist(b))[0];
      };
      goDoor = (p) => { doorCur = p?.id || null; focusId = doorCur; toolBar(); if (p) viewer.focus(p.pos.x, p.pos.y, p.pos.page || 0, Math.max(viewer.view.s, 1.2)); else viewer.draw(); };
      const setDoor = (p, cfgId) => {
        const id = ensureDoorCfg(cfgId); if (!id) return;
        getRepo().save(currentProject().id, [{ coll: 'points', id: p.id, data: { configId: id, devices: null, cables: null, cableOverride: null } }]);
        doorSkip.delete(p.id); const nx = nextDoor({ ...p, configId: id }); toast(`${p.label}: ${allDoorCfgs().get(id)?.name || 'готово'}`);
        setTimeout(() => goDoor(nx), 250);
      };
      // all configurations in the order of the «Конфигурации дверей» tab: pinned ones first, then the rest (the more used ones higher)
      const cfgOrder = () => { const all = allDoorCfgs(); const pins = doorPins(); const used = (id) => [...state.ctx.points.values()].filter((q) => q.configId === id).length;
        return [...pins.map((id) => all.get(id)).filter(Boolean), ...[...all.values()].filter((c) => !pins.includes(c.id)).sort((a, b) => used(b.id) - used(a.id) || a.name.localeCompare(b.name, 'ru'))]; };
      brushTap = (p) => {
        focusId = p.id;
        if (pipette) { const c = doorCfgOf(p, state.ctx); if (!c) { toast(`У ${p.label} конфигурации нет`); return; } brushId = c.id; pipette = false; toast(`Кисть: ${c.name}`); toolBar(); viewer.draw(); return; }
        if (!brushId) { toast('Сначала выберите конфигурацию кисти'); return; }
        if (p.configId === brushId) { toast(`${p.label}: уже такая`); viewer.draw(); return; }
        const id = ensureDoorCfg(brushId); if (!id) return;
        getRepo().save(currentProject().id, [{ coll: 'points', id: p.id, data: { configId: id, devices: null, cables: null, cableOverride: null } }]);
        doorSkip.delete(p.id); toast(`${p.label} ✓`);
      };
      const brushPanel = (head) => {
        const list = cfgOrder(); if (!brushId || !list.some((c) => c.id === brushId)) brushId = list[0]?.id || '';
        const pins = new Set(doorPins());
        const selEl = h('select', { style: { flex: 1, minWidth: '200px' }, onchange: (e) => { brushId = e.target.value; pipette = false; toolBar(); } },
          h('optgroup', { label: '📌 Закреплённые' }, ...list.filter((c) => pins.has(c.id)).map((c) => h('option', { value: c.id, selected: c.id === brushId }, c.name))),
          h('optgroup', { label: 'Остальные' }, ...list.filter((c) => !pins.has(c.id)).map((c) => h('option', { value: c.id, selected: c.id === brushId }, c.name))));
        return [head,
          h('span', { style: { flexBasis: '100%', fontSize: '13px' } }, pipette ? '💧 Пипетка: нажмите дверь — её конфигурация станет кистью.' : 'Нажимайте двери — каждой сразу записывается выбранная конфигурация.'),
          selEl,
          brushId && allDoorCfgs().get(brushId) ? h('div', { style: { flexBasis: '100%' } }, doorChips(allDoorCfgs().get(brushId), { big: true })) : null,
          h('button', { class: pipette ? '' : 'sec', onclick: () => { pipette = !pipette; toolBar(); } }, pipette ? '💧 Пипетка (вкл.)' : '💧 Пипетка')];
      };
      const doorPanel = () => {
        const all = doorPts(); const done = all.filter(doorDone).length; const skipped = all.filter((p) => !doorDone(p) && doorSkip.has(p.id)).length;
        const head = h('div', { style: { flexBasis: '100%', fontSize: '13px' } }, h('b', {}, '🚪 Двери: '), `размечено ${done} из ${all.length}`, skipped ? ` · пропущено ${skipped}` : '',
          h('span', { class: 'mut' }, '  · зелёные — размечены, оранжевые — нет, серые — пропущены'));
        const modes = h('div', { style: { flexBasis: '100%', display: 'flex', gap: '6px' } },
          h('button', { class: doorMode === 'wizard' ? '' : 'sec', style: { flex: 1 }, onclick: () => { doorMode = 'wizard'; pipette = false; toolBar(); } }, '🧭 Мастер'),
          h('button', { class: doorMode === 'brush' ? '' : 'sec', style: { flex: 1 }, onclick: () => { doorMode = 'brush'; doorCur = null; toolBar(); viewer.draw(); } }, '🖌 Кисть'),
          h('button', { class: 'sec', onclick: () => { tool = null; doorCur = null; pipette = false; toolBar(); viewer.draw(); } }, 'Готово'));
        if (doorMode === 'brush') return [modes, ...brushPanel(head)];
        const p = doorCur && state.ctx.points.get(doorCur);
        if (!p) {
          const left = all.filter((x) => !doorDone(x) && !doorSkip.has(x.id)).length;
          return [modes, head, h('span', { style: { flexBasis: '100%' } }, !all.length ? 'На этом чертеже нет дверей (точек с типом двери).' : left ? 'Нажмите на дверь, с которой начать, — дальше приложение само поведёт к ближайшим неразмеченным.' : skipped ? 'Неразмеченных больше нет, остались пропущенные.' : 'Все двери на этом чертеже размечены ✅'),
            left ? h('button', { class: 'sec', onclick: () => goDoor(nextDoor(null)) }, '▶ С любой неразмеченной') : null,
            skipped ? h('button', { class: 'sec', onclick: () => { doorSkip.clear(); goDoor(nextDoor(null)); } }, `↩ К пропущенным (${skipped})`) : null];
        }
        const cur = doorCfgOf(p, state.ctx); const cfgs = allDoorCfgs();
        return [modes, head,
          h('div', { style: { flexBasis: '100%' } }, h('b', { style: { fontSize: '17px' } }, p.label), p.planName ? h('span', { class: 'mut' }, `  (${p.planName})`) : null,
            h('div', { class: 'mut', style: { fontSize: '13px', marginTop: '2px' } }, cur ? h('span', {}, 'Сейчас: ', doorChips(cur)) : 'Конфигурация не выбрана')),
          ...doorPins().map((id) => cfgs.get(id)).filter(Boolean).map((c) => h('div', { class: `wk ${cur?.id === c.id ? 'done' : 'cfg'}`, style: { cursor: 'pointer', margin: 0, padding: '6px 10px' }, onclick: () => setDoor(p, c.id) }, doorChips(c, { big: true }))),
          h('button', { class: 'sec', onclick: () => doorPicker({ current: cur?.id || null, title: `🚪 ${p.label}`, onPick: (id) => setDoor(p, id) }) }, '🧩 Другая / собрать…'),
          h('button', { class: 'sec', onclick: () => { doorSkip.add(p.id); goDoor(nextDoor(p)); } }, '⏭ Пропустить'),
          cur ? h('button', { class: 'sec', onclick: () => goDoor(nextDoor(p)) }, '▶ Следующая') : null,
          h('button', { class: 'sec', onclick: () => goDoor(null) }, '✖ Стоп')];
      };
      toolBar = () => {
        addBtn.textContent = tool === 'add' ? '✔ Точка на плане: нажмите место' : '➕ Точка на плане'; addBtn.className = tool === 'add' ? '' : 'sec';
        iconBtn.textContent = tool === 'icon' ? '✔ Значки типов' : '📌 Значки типов'; iconBtn.className = tool === 'icon' ? '' : 'sec';
        doorBtn.textContent = tool === 'doors' ? '✔ Двери' : '🚪 Двери'; doorBtn.className = tool === 'doors' ? '' : 'sec';
        tbar.style.display = tool && tool !== 'doors' ? 'flex' : 'none';
        doorBar.style.display = tool === 'doors' ? 'flex' : 'none'; if (tool === 'doors') doorBar.replaceChildren(...doorPanel().filter(Boolean)); else doorBar.replaceChildren();
        if (tool === 'add') tbar.replaceChildren(h('span', {}, 'Нажмите на значок, надпись или свободное место — приложение прицепится к ближайшему значку/надписи. Потом: оставить отметку, привязать к точке или создать новую.'));
        else if (tool === 'doors') tbar.replaceChildren();
        else if (tool === 'place') tbar.replaceChildren(h('span', {}, h('b', {}, `📍 Где точка «${placeFor?.label}»? `), drawingsOf().length > 1 ? 'Выберите чертёж сверху, если не этот, и ' : '', 'нажмите на её значок или надпись.'),
          h('button', { class: 'sec', onclick: () => { tool = null; placeFor = null; temp = null; toolBar(); viewer.draw(); } }, 'Отмена'));
        else if (tool === 'icon') {
          const icons = currentProject()?.typeIcons || {};
          const tp = typePicker({ onChange: (t) => { iconType = t; } }); const s = tp.querySelector('select'); if (iconType) s.value = iconType;
          tbar.replaceChildren(h('div', { style: { flexBasis: '100%' } }, 'Выберите тип и нажмите на его значок на чертеже. Этим значком будут нарисованы точки этого типа, добавленные на объекте (на плане и в «📄 PDF с номерами»).'),
            h('div', { style: { flex: 1, minWidth: '200px' } }, tp),
            ...Object.entries(icons).map(([t, ic]) => h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid #ddd', borderRadius: '6px', padding: '2px 6px' } },
              h('img', { src: ic.png, style: { height: '22px', background: '#fff' } }), t,
              h('button', { class: 'sec', style: { padding: '0 6px' }, title: 'Убрать значок', onclick: async () => { if (!(await confirmDialog(`Убрать значок типа «${t}»?`, { yes: 'Убрать' }))) return; const p = currentProject(); const n = { ...(p.typeIcons || {}) }; delete n[t]; getRepo().saveProject(p.id, { typeIcons: n }, { replace: true }); setTimeout(() => { toolBar(); viewer.draw(); }, 300); } }, '✕'))));
        } else tbar.replaceChildren();
      };
      selBar = () => {
        selBtn.textContent = selMode ? '✔ Выбор: нажимайте точки' : '☑ Выбрать на плане'; selBtn.className = selMode ? '' : 'sec';
        bar.style.display = selMode ? 'flex' : 'none';
        bar.replaceChildren(h('b', {}, `Выбрано: ${sel.size}`),
          h('button', { class: rectSel ? '' : 'sec', onclick: () => { rectSel = !rectSel; selBar(); } }, rectSel ? '▭ Рамкой (вкл.)' : '▭ Рамкой'),
          h('button', { disabled: !sel.size, onclick: () => { addWorkForPoints([...sel]); } }, `➕ Работа на выбранные (${sel.size})`),
          h('button', { disabled: !sel.size, onclick: () => historyEditForm([...sel], () => { selBar(); viewer.draw(); }) }, `✔ Работы: сделано / не сделано (${sel.size})`),
          h('button', { disabled: !sel.size, onclick: () => bulkEditForm([...sel], () => { selBar(); viewer.draw(); }) }, `✏️ Изменить (${sel.size})`),
          h('button', { disabled: !sel.size, onclick: () => renameForm([...sel], () => { selBar(); viewer.draw(); }) }, '🏷 Переименовать'),
          ...problemButtons([...sel], () => { selBar(); viewer.draw(); }),
          h('button', { class: 'sec', onclick: () => { sel.clear(); selBar(); viewer.draw(); } }, 'Снять'));
      };
      const bar = h('div', { class: 'card', style: { display: 'none', margin: '6px 0', padding: '8px', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } });
      const layersBtn = h('button', { class: 'sec', onclick: () => layersModal(d) }, '🗂 Слои чертежа');
      const dimBtn = h('button', { class: 'sec', onclick: () => { dimDrawing = !dimDrawing; dimBtn.textContent = dimDrawing ? '🌕 Чертёж ярче' : '🌗 Чертёж бледнее'; viewer.draw(); } }, dimDrawing ? '🌕 Чертёж ярче' : '🌗 Чертёж бледнее');
      // after a «Новая версия чертежа»: points to check (moved on the new sheet, missing from it, icon not in place)
      const revBtn = h('button', { style: { display: 'none', background: '#ff9500' }, onclick: () => reviewModal(cur(), {
        onFocus: (id) => { const p = state.ctx.points.get(id); focusId = id; if (p?.pos) viewer.focus(p.pos.x, p.pos.y, p.pos.page || 0); viewer.draw(); },
        onOpen: (id) => { const p = state.ctx.points.get(id); if (p) openCard?.(p); },
        onChange: () => setTimeout(() => { updateInfo(); viewer.draw(); }, 300) }) });
      updateInfo = () => {
        const nr = reviewOf(cur()).length; revBtn.style.display = nr ? '' : 'none'; revBtn.textContent = `⚠ Проверить после новой версии (${nr})`;
        const n = sheetPts(d).length;
        // each part is a text of its own, so the translation layer finds its pattern
        status.replaceChildren(...[drawingTitle(d), d.title ? h('span', {}, ` (файл ${d.name})`) : null, d.floor ? h('span', {}, ` · этаж ${d.floor}`) : null,
          h('span', {}, ` · точек на чертеже: ${n}`), unl().length ? h('span', {}, ` · не размеченых: ${unl().length}`) : null].filter(Boolean));
        refreshFilters();
      };
      updateInfo();
      holder.replaceChildren(
        h('div', { class: 'mf-bar', style: { margin: '0 0 6px' } }, search, typeF.el, cfgF.el, cabF.el, stageF.el), reset.el, noneLine,
        h('div', { class: 'btns', style: { marginTop: 0 } }, revBtn, ...viewer.zoomBtns(), selBtn, doorBtn, addBtn, iconBtn, dimBtn, layersBtn), bar, tbar, viewer.el, doorBar,
        // the legend: pink — pulled, yellow → green — the works after the pull, circles — the cables of an unfinished pull
        h('div', { style: { display: 'flex', gap: '6px 12px', flexWrap: 'wrap', alignItems: 'center', margin: '6px 2px', fontSize: '13px' } },
          h('span', {}, 'Цвет — протяжка и работы после неё:'),
          ...PLAN_LEGEND.map((x) => h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } }, legendSwatch(x), x.ru))),
        h('div', { class: 'btns' },
          h('button', { class: 'sec', onclick: () => linkPoints(d, buf, { onDone: () => draw(d.id) }).catch((e) => toast(e.message)) }, '🔗 Связать точки'),
          h('button', { class: 'sec', onclick: async () => { try { await exportNumberedPdf(cur(), buf); } catch (e) { toast(`Не получилось: ${e.message}`); } } }, '📄 Скачать PDF с номерами'),
          h('button', { class: 'sec', title: cur().numberedAt ? `На Диске с ${new Date(cur().numberedAt).toLocaleString('ru-RU')}` : '', onclick: async () => { if (!cur().fileId) { toast('Сначала «⬆ На Диск» — исходный чертёж'); return; } try { await publishNumbered(cur(), buf); } catch (e) { toast(`Не получилось: ${e.message}`); } } }, cur().numberedFileId ? '☁️ Обновить на Диске сейчас' : '☁️ PDF с номерами на Диск'),
          h('button', { class: 'sec', onclick: () => pointsFromDrawing({ drawing: d, buf }) }, '✏️ Редактировать'),
          h('button', { class: 'sec', onclick: () => pointsFromDrawing({ drawing: d, buf, iconsOnly: true, onDone: () => draw(d.id) }) }, '🔎 Значки без номеров'),
          h('button', { class: 'sec', onclick: () => newVersion(cur(), { onDone: (id) => setTimeout(() => draw(id), 300) }) }, '🔄 Новая версия чертежа'),
          (() => { const n = sameGroups().length; return n ? h('button', { onclick: () => mergeModal({ onDone: () => setTimeout(() => draw(d.id), 300) }) }, `🔀 Одинаковые точки: ${n}`) : null; })(),
          d.fileId ? null : h('button', { class: 'sec', onclick: async () => { try { toast('Отправляю на Диск…'); await pushDrawing(d); toast('Чертёж на Диске — откроется и на других устройствах'); draw(d.id); } catch (e) { toast(`Не получилось: ${e.message}`); } } }, '⬆ На Диск'),
          h('button', { class: 'sec', onclick: async () => { if (await confirmDialog(`Убрать чертёж «${drawingTitle(d)}» из проекта? Точки останутся, файл на Диске — тоже.`, { yes: 'Убрать', danger: true })) { removeDrawing(d); setTimeout(() => draw(), 300); } } }, '🗑 Убрать чертёж')));
      selBar(); toolBar();
      await viewer.start(); const t3 = performance.now();
      const sec = (a, b) => `${((b - a) / 1000).toFixed(1)} с`;
      const line = `Открытие плана: ${sec(t0, t3)} · файл чертежа с ${from} ${sec(t0, t1)} (${(buf.byteLength / 1048576).toFixed(1)} МБ) · модуль PDF ${(tw / 1000).toFixed(1)} с · открытие ${sec(t1, t2)} · лист ${sec(t2, t3)}`;
      perf.textContent = line; info(line);
      // the view: the opening point (once), else fitted for a plan opened to place a point (once), else the one remembered for this drawing (spec 8 D10)
      const f = openPoint && (state.ctx.points.get(openPoint.id) || openPoint);
      if (f?.pos && drawingFor(f)?.id === d.id) { openPoint = null; placeFresh = false; await viewer.focus(f.pos.x, f.pos.y, f.pos.page || 0); }
      else if (placeFresh) placeFresh = false;
      else { const v = viewFor(readMem(), d.id, o.pages); if (v) await viewer.restore(v); }
    } catch (e) { status.textContent = e.message; }
  }

  // a tap in a tool mode: snap to the nearest caption or icon, then act by the tool
  async function toolTap(d, pages, x, y, page, nearest) {
    const all = sheetPts(d);
    if (tool === 'add') { const hit = nearest(all, (p) => p.pos, x, y, page); if (hit) { focusId = hit.id; viewer.draw(); existingCard(d, hit); return; } }
    let sn = null; try { sn = await wk.call('snap', { page, x, y, r: 14 / viewer.view.s }); } catch { /* no snapping */ }
    if (sn?.kind === 'text' && !labelLike(sn.label)) sn = null;  // a foreign caption (Hebrew, long text) — not a point number
    if (tool !== 'icon' && sn?.kind === 'shape' && Math.max(sn.w || 0, sn.h || 0) > 24) sn = null;  // something large (a wall, a line, hatching) — not an icon: place it where tapped
    const pg = pages[page] || {}; const ic = (t) => currentProject()?.typeIcons?.[t];
    // icon — draw the type's icon (there is none on the drawing): the default when nothing was found nearby
    const at = (t, icon = !sn) => {
      const tap = { page, x: +x.toFixed(1), y: +y.toFixed(1) };
      const base = sn && !(icon && sn.kind === 'text') ? { page, x: sn.x, y: sn.y, w: sn.w, h: sn.h, ...(sn.kind === 'text' ? { text: sn.label } : {}) } : tap;
      return icon ? { ...base, w: ic(t)?.w || base.w || 10, h: ic(t)?.h || base.h || 10, icon: true } : { ...base, w: base.w || 10, h: base.h || 10 };
    };
    const posFor = (t, icon) => ({ ...at(t, icon), pw: pg.w, ph: pg.h, sheet: d.name });
    temp = at(''); viewer.draw();
    const done = () => { temp = null; viewer?.draw(); };
    if (tool === 'icon') return iconTap(d, sn, page, x, y, done);
    if (tool === 'place') {
      const p = placeFor; const ok = await confirmDialog(`Поставить «${p.label}» сюда${sn?.kind === 'text' ? ` (надпись «${sn.label}»)` : sn ? ' (значок)' : ''}?`, { yes: '📍 Сюда' });
      if (!ok) { done(); return; }
      getRepo().save(currentProject().id, [{ coll: 'points', id: p.id, data: { pos: posFor(p.typeId) } }]);
      toast(`«${p.label}» на чертеже`); focusId = p.id; tool = null; placeFor = null; temp = null; toolBar(); setTimeout(() => viewer?.draw(), 300); return;
    }
    addCard(d, sn, posFor, done);
  }

  // «➕ Точка на плане» on an already marked point: link this place to another point, or draw or remove the type icon
  function existingCard(d, p) {
    const ic = currentProject()?.typeIcons?.[p.typeId];
    const group = sheetPts(d).filter((q) => posKey(q.pos) === posKey(p.pos)).sort(comparePoints);
    const c = openModal(`«${combineLabels(group.map((q) => q.label)).join(', ')}» на плане`, h('div', {},
      h('div', { class: 'mut' }, group.length > 1 ? `На этой отметке точек: ${group.length}.` : `${p.typeId}${p.cabinet ? ` · шкаф ${p.cabinet}` : ''}. Здесь уже стоит эта точка.`),
      h('div', { class: 'btns' },
        h('button', { class: 'sec', onclick: () => { c(); choosePoint({ title: `🔗 Какая точка здесь вместо «${p.label}»?`, exclude: p.id, onPick: (q) => {
          getRepo().save(currentProject().id, [{ coll: 'points', id: q.id, data: { pos: { ...p.pos } } }, { coll: 'points', id: p.id, data: { pos: null } }]);
          toast(`Здесь теперь «${q.label}». «${p.label}» — без места на плане`); focusId = q.id; setTimeout(() => viewer?.draw(), 300); return true;
        } }); } }, '🔗 Привязать другую точку'),
        h('button', { class: 'sec', onclick: () => {
          const on = !p.pos.icon;
          const pos = on ? { ...p.pos, icon: true, w: ic?.w || p.pos.w || 10, h: ic?.h || p.pos.h || 10 } : { ...p.pos, icon: false };
          getRepo().save(currentProject().id, [{ coll: 'points', id: p.id, data: { pos } }]);
          toast(on ? (ic ? 'Значок типа нарисован' : 'У типа значок не задан — «📌 Значки типов»') : 'Значок убран'); c(); setTimeout(() => viewer?.draw(), 300);
        } }, p.pos.icon ? '🖼 Убрать значок типа' : '🖼 Значок по типу точки'),
        h('button', { class: 'sec', onclick: async () => {
          const list = await pickGroup(group, `Убрать с плана${group.length > 1 ? ' — какие точки этой отметки?' : ` «${p.label}»?`}`, 'Точки останутся в проекте (фильтр «📍 Нет на плане»), их можно будет отметить снова.', '🗑 Убрать'); if (!list) return;
          getRepo().save(currentProject().id, list.map((q) => ({ coll: 'points', id: q.id, data: { pos: null } }))); toast(`Убрано с плана: ${combineLabels(list.map((q) => q.label)).join(', ')}`); c(); setTimeout(() => viewer?.draw(), 300);
        } }, '🗑 Убрать с плана'),
        h('button', { class: 'sec', onclick: async () => {
          const list = await pickGroup(group, `Скрыть${group.length > 1 ? ' — какие точки этой отметки?' : ` «${p.label}»?`}`, 'Место закрасится белым, точки останутся в проекте без места на плане. Вернуть — фильтр «🙈 Скрытые».', '🙈 Скрыть'); if (!list) return;
          if (list.length === group.length) hideArea(d, { label: combineLabels(list.map((q) => q.label)).join(', '), typeId: p.typeId, pos: { ...p.pos } });
          getRepo().save(currentProject().id, list.map((q) => ({ coll: 'points', id: q.id, data: { pos: null } }))); toast(`Скрыто: ${combineLabels(list.map((q) => q.label)).join(', ')}`); c();
        } }, '🙈 Скрыть'),
        h('button', { class: 'sec', onclick: () => { c(); openCard?.(p); } }, '📋 Карточка точки'))), {});
  }
  // which of the mark's points (all by default); a single point — just a confirmation
  function pickGroup(group, title, note, yes) {
    if (group.length === 1) return confirmDialog(`${title} ${note}`, { yes }).then((ok) => (ok ? group : null));
    return new Promise((res) => {
      const boxes = group.map((q) => ({ q, cb: h('input', { type: 'checkbox', checked: true }) })); let done = false;
      const cc = openModal(title, h('div', {}, h('div', { class: 'mut' }, note),
        h('div', { class: 'picklist' }, boxes.map((b) => h('label', { class: 'pickrow' }, b.cb, h('span', {}, b.q.label)))),
        h('div', { class: 'btns' }, h('button', { onclick: () => { const l = boxes.filter((b) => b.cb.checked).map((b) => b.q); if (!l.length) { toast('Ничего не выбрано'); return; } done = true; cc(); res(l); } }, yes))),
      { onClose: () => { if (!done) res(null); } });
    });
  }
  // add the place to the drawing's «Скрытые» (and remove it from «Не размеченых» if it was there)
  function hideArea(d, m) {
    const k = posKey(m.pos); const pos = { ...m.pos }; delete pos.icon;
    updateDrawing(d.id, (x) => ({ unlinked: (x.unlinked || []).filter((y) => posKey(y.pos) !== k), hidden: [...(x.hidden || []).filter((y) => posKey(y.pos) !== k), { label: m.label, typeId: m.typeId || '', pos }] }));
    setTimeout(() => viewer?.draw(), 300);
  }

  // «➕ Точка на плане»: keep the mark / link it to a point / a new point
  function addCard(d, sn, posFor, done) {
    const what = sn?.kind === 'text' ? `Надпись «${sn.label}»` : sn ? 'Значок на чертеже' : 'Свободное место (рядом нет значка или надписи)';
    const area = h('div', {});
    let saved = false;
    const c = openModal('➕ Точка на плане', h('div', {}, h('div', { class: 'mut', style: { marginBottom: '6px' } }, what),
      h('div', { class: 'btns' },
        h('button', { class: 'sec', onclick: () => leaveMark() }, '❔ Оставить отметку'),
        h('button', { class: 'sec', onclick: () => bind() }, '🔗 Привязать к точке'),
        h('button', { onclick: () => fresh() }, '➕ Новая точка'),
        sn ? h('button', { class: 'sec', onclick: () => { const pos = posFor('', false); hideArea(d, { label: sn.label || '(значок)', typeId: '', pos }); toast('Скрыто — закрашено белым. Вернуть: фильтр «🙈 Скрытые»'); finish(); } }, '🙈 Скрыть') : null), area), { sticky: true, onClose: () => { if (!saved) done(); } });
    const finish = () => { saved = true; c(); done(); setTimeout(() => viewer?.draw(), 300); };
    function leaveMark() {
      const cap = h('input', { value: sn?.label || '', placeholder: 'Подпись отметки (например: «датчик над дверью?»)' });
      area.replaceChildren(h('div', { class: 'mut', style: { margin: '8px 0 4px' } }, 'Отметка попадёт в «❔ Не размеченые» (фильтр типов в плане) — потом её можно связать с точкой или скрыть.'), cap,
        h('div', { class: 'btns' }, h('button', { onclick: () => {
          const pos = posFor(''); delete pos.icon;
          updateDrawing(d.id, (x) => ({ unlinked: [...(x.unlinked || []), { label: cap.value.trim() || '(без подписи)', typeId: '', pos }] }));
          toast('Отметка сохранена — «❔ Не размеченые»'); finish();
        } }, 'Сохранить отметку')));
      cap.focus();
    }
    function bind() {
      choosePoint({ title: '🔗 Какая это точка?', renameLabel: sn?.kind === 'text' ? sn.label : '', onPick: (p, { rename }) => {
        if (rename && [...state.ctx.points.values()].some((x) => x.id !== p.id && sameLabelClash(x, { label: sn.label, cabinet: p.cabinet }))) { toast(`«${sn.label}» уже есть в этом шкафу — переименовать нельзя`); return false; }
        const data = { pos: posFor(p.typeId) };
        if (rename) { data.label = sn.label; data.planName = p.label; } else if (sn?.kind === 'text' && p.label !== sn.label) data.planName = sn.label;
        getRepo().save(currentProject().id, [{ coll: 'points', id: p.id, data }]);
        toast(`«${rename ? sn.label : p.label}» на чертеже`); focusId = p.id; finish(); return true;
      }, onPickMany: (list) => {
        getRepo().save(currentProject().id, list.map((p) => ({ coll: 'points', id: p.id, data: { pos: posFor(p.typeId) } })));
        toast(`На эту отметку: ${combineLabels(list.map((p) => p.label)).join(', ')}`); focusId = list[0].id; finish(); return true;
      } });
    }
    function fresh() {
      const pts = [...state.ctx.points.values()];
      const cabs = [...new Set(pts.map((p) => p.cabinet || ''))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
      const near = sheetPts(d).filter((p) => p.cabinet).sort((a, b) => Math.hypot(a.pos.x - temp.x, a.pos.y - temp.y) - Math.hypot(b.pos.x - temp.x, b.pos.y - temp.y))[0];
      const one = [...sharedFilters().cab].filter((c) => c !== '__none'); let tid = ''; let cab = (one.length === 1 ? one[0] : '') || near?.cabinet || ''; let edited = false;
      const name = h('input', { placeholder: 'Название точки', oninput: () => { edited = true; hint.textContent = ''; } });
      const hint = h('small', { class: 'mut' });
      const cabSel = h('select', { onchange: () => { cab = cabSel.value; cp.setType(tid, cab); suggest(); } }, h('option', { value: '' }, '— выберите шкаф —'), ...cabs.map((x) => h('option', { value: x, selected: x === cab }, `Шкаф ${x}`)));
      const cp = cablesPicker({ compact: true });
      const iconCb = h('input', { type: 'checkbox', checked: false });
      const iconNote = h('small', { class: 'mut' });
      const iconRow = h('label', { class: 'pickrow' }, iconCb, h('span', {}, '🖼 Нарисовать значок типа (на чертеже значка этой точки нет) ', iconNote));
      const iconInfo = () => { iconNote.textContent = tid && !currentProject()?.typeIcons?.[tid] ? '— у этого типа значок не задан («📌 Значки типов»), пока будет кружок' : ''; };
      const tp = typePicker({ onChange: (t) => { tid = t; cp.setType(t, cab); suggest(); iconInfo(); } });
      function suggest() {
        if (edited) return;
        if (sn?.kind === 'text') { name.value = sn.label; hint.textContent = 'Как надпись на чертеже'; return; }
        const n = tid ? nextLabel(pts, tid, cab) : '';
        name.value = n; hint.textContent = n ? `Предложено: следующий номер после последней точки этого типа${cab ? ` в шкафу ${cab}` : ''}. Можно исправить.` : (tid ? 'Таких точек ещё нет — впишите название.' : '');
      }
      area.replaceChildren(h('div', { class: 'form', style: { marginTop: '8px' } },
        h('label', {}, 'Шкаф'), cabSel, h('label', {}, 'Тип'), tp, h('label', {}, 'Название'), name, hint,
        h('label', {}, 'Кабели'), cp.el, iconRow,
        h('div', { class: 'btns' }, h('button', { onclick: () => {
          const label = name.value.trim();
          if (!tid) { toast('Выберите тип'); return; } if (!cab) { toast('Выберите шкаф — точка добавляется только с шкафом'); return; } if (!label) { toast('Впишите название'); return; }
          if (pts.some((p) => sameLabelClash(p, { label, cabinet: cab }))) { toast(cab ? `«${label}» уже есть в шкафу ${cab}` : `«${label}» уже есть среди точек без шкафа`); return; }
          const data = { label, typeId: tid, pos: posFor(tid, iconCb.checked), note: 'добавлено на плане' };
          if (cab) data.cabinet = cab; if (d.floor) data.floor = d.floor; const ov = cp.override(); if (ov) data.cableOverride = ov;
          const id = newId(); getRepo().save(currentProject().id, [{ coll: 'points', id, data }]);
          toast(`Точка «${label}» добавлена${data.pos.icon && !currentProject()?.typeIcons?.[tid] ? ' — значок этого типа можно задать в «📌 Значки типов»' : ''}`); focusId = id; finish();
        } }, '✔ Создать точку'))));
      suggest();
    }
  }

  // «📌 Значки типов»: a tap on an icon → its picture (a small PNG) is stored in the project
  async function iconTap(d, sn, page, x, y, done) {
    if (!iconType) { toast('Сначала выберите тип'); done(); return; }
    let png = null; let size;
    if (sn?.kind === 'text') {
      // a caption in a frame (e.g. «TV-140»): take the caption with its frame; a slanted one is turned horizontal
      const a = sn.angle || 0; const rad = a * Math.PI / 180; const c = Math.abs(Math.cos(rad)); const s = Math.abs(Math.sin(rad));
      const H = sn.size ? sn.size * 1.1 : Math.min(sn.w, sn.h);
      let L = c > 0.3 ? (sn.w - H * s) / c : (sn.h - H * c) / s; if (!(L > 0)) L = Math.max(sn.w, sn.h);
      size = { w: L + H * 1.4, h: H * 2.6 };
      for (const z of [6, 4, 3, 2]) { png = await wk.call('png', { page, rot: { cx: sn.x, cy: sn.y, w: size.w, h: size.h, angle: a }, zoom: Math.min(z, 200 / size.w) }); if (png.byteLength < 24000) break; }
    } else {
      const b = sn ? [sn.x - sn.w / 2, sn.y - sn.h / 2, sn.x + sn.w / 2, sn.y + sn.h / 2] : [x - 6, y - 6, x + 6, y + 6];
      const w = b[2] - b[0]; const hh = b[3] - b[1]; const pad = Math.max(0.5, Math.max(w, hh) * 0.06);
      const clip = [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad]; size = { w: clip[2] - clip[0], h: clip[3] - clip[1] };
      for (const z of [6, 4, 3, 2]) { png = await wk.call('png', { page, clip, zoom: Math.min(z, 160 / (clip[2] - clip[0])) }); if (png.byteLength < 24000) break; }
    }
    const url = toDataUrl(png);
    const ok = await confirmDialog(h('div', {}, h('div', {}, `Значок для типа «${iconType}»:`), h('img', { src: url, style: { maxHeight: '80px', background: '#fff', border: '1px solid #ddd', margin: '8px 0' } }), h('div', { class: 'mut' }, sn ? '' : 'Рядом не нашёлся значок — взят кусок вокруг нажатия.')), { yes: 'Сохранить значок' });
    done();
    if (!ok) return;
    const p = currentProject(); getRepo().saveProject(p.id, { typeIcons: { ...(p.typeIcons || {}), [iconType]: { png: url, w: +size.w.toFixed(1), h: +size.h.toFixed(1) } } });
    toast(`Значок типа «${iconType}» сохранён`); setTimeout(() => { toolBar(); viewer?.draw(); }, 300);
  }

  // drawing layers (AutoCAD): switch off what is extra — furniture, hatching, dimensions; remembered on this device
  async function layersModal(d) {
    const list = await wk.call('layers');
    if (!list.length) { toast('В этом чертеже нет слоёв'); return; }
    const boxes = list.map((l) => ({ l, cb: h('input', { type: 'checkbox', checked: l.on }) }));
    const c = openModal('🗂 Слои чертежа', h('div', {},
      h('div', { class: 'mut' }, 'Снимите галочки со слоёв, которые мешают (мебель, штриховки, размеры). Точки и номера не скрываются. Запоминается на этом устройстве.'),
      h('div', { class: 'btns' }, h('button', { class: 'sec', onclick: () => boxes.forEach((b) => { b.cb.checked = true; }) }, 'Все'), h('button', { class: 'sec', onclick: () => boxes.forEach((b) => { b.cb.checked = false; }) }, 'Ничего')),
      h('div', { class: 'picklist', style: { maxHeight: '50vh' } }, boxes.map((b) => h('label', { class: 'pickrow' }, b.cb, h('span', {}, b.l.name)))),
      h('div', { class: 'btns' }, h('button', { onclick: async () => {
        const off = boxes.filter((b) => !b.cb.checked).map((b) => b.l.name);
        try { localStorage.setItem(`pz.layers.${d.id}`, JSON.stringify(off)); } catch { /* ok */ }
        await wk.call('setLayers', { off }); c(); await viewer.refreshImage();
      } }, 'Применить'))), { sticky: true });
  }

  // an «Не размеченая» caption on the drawing: hide it or link it to a project point
  function markCard(d, m, isHidden) {
    const c = openModal(`«${m.label}» на чертеже`, h('div', {},
      h('div', { class: 'mut' }, isHidden ? 'Скрытая подпись: на плане почти не видна.' : `Подпись есть на чертеже, но не связана с точкой проекта.${m.typeId ? ` Похоже на: ${m.typeId}.` : ''}`),
      h('div', { class: 'btns' },
        isHidden ? h('button', { class: 'sec', onclick: () => { moveMark(d, m, 'hidden', 'unlinked'); c(); } }, '👁 Вернуть в «Не размеченые»')
          : h('button', { class: 'sec', onclick: () => { moveMark(d, m, 'unlinked', 'hidden'); c(); } }, '🙈 Скрыть'),
        h('button', { onclick: () => { c(); chooseFor(d, m); } }, '🔗 Связать с точкой'))), {});
  }
  function moveMark(d, m, from, to) {
    const k = posKey(m.pos);
    updateDrawing(d.id, (x) => ({ [from]: (x[from] || []).filter((y) => posKey(y.pos) !== k), [to]: [...(x[to] || []), m] }));
    setTimeout(() => viewer?.draw(), 300);
  }
  // choosing a project point for a caption: search, type, rack; by default the points with no place on the drawing
  function chooseFor(d, m) {
    choosePoint({ title: `🔗 Точка для «${m.label}»`, typeId: m.typeId, renameLabel: m.label, onPick: (p, { rename }) => {
      if (rename && [...state.ctx.points.values()].some((x) => x.id !== p.id && sameLabelClash(x, { label: m.label, cabinet: p.cabinet }))) { toast(`«${m.label}» уже есть в этом шкафу — переименовать нельзя`); return false; }
      const data = { pos: { ...m.pos, sheet: d.name } };
      if (rename) { data.label = m.label; data.planName = p.label; } else if (p.label !== m.label) data.planName = m.label;
      getRepo().save(currentProject().id, [{ coll: 'points', id: p.id, data }]);
      const k = posKey(m.pos); updateDrawing(d.id, (x) => ({ unlinked: (x.unlinked || []).filter((y) => posKey(y.pos) !== k), hidden: (x.hidden || []).filter((y) => posKey(y.pos) !== k) }));
      toast(`«${rename ? m.label : p.label}» связана с чертежом`); return true;
    }, onPickMany: (list) => {
      getRepo().save(currentProject().id, list.map((p) => ({ coll: 'points', id: p.id, data: { pos: { ...m.pos, sheet: d.name }, planName: m.label } })));
      const k = posKey(m.pos); updateDrawing(d.id, (x) => ({ unlinked: (x.unlinked || []).filter((y) => posKey(y.pos) !== k), hidden: (x.hidden || []).filter((y) => posKey(y.pos) !== k) }));
      toast(`На «${m.label}»: ${combineLabels(list.map((p) => p.label)).join(', ')}`); return true;
    } });
  }

  const body = h('div', {});
  function draw(selectId) {
    const list = drawingsOf();
    const want = drawingToOpen({ ids: list.map((x) => x.id), selectId, pointId: point && drawingFor(point)?.id, placeId: placeFor && list.find((x) => x.floor && x.floor === placeFor.floor)?.id, currentId: current?.id, last: readMem().last });
    const d = list.find((x) => x.id === want);
    const sel = list.length > 1 ? h('select', { onchange: (e) => show(list.find((x) => x.id === e.target.value)) }, list.map((x) => h('option', { value: x.id, selected: x.id === d?.id }, `${drawingTitle(x)}${x.floor ? ` (этаж ${x.floor})` : ''}`))) : null;
    box.replaceChildren(
      h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } }, sel, h('button', { class: list.length ? 'sec' : '', onclick: addPdf }, '➕ Чертёж (PDF)'),
        h('button', { class: 'sec', onclick: () => import('./tohnitview.js').then((m) => m.drawingsHub()) }, '📐 Добавить точки из чертежа'),
        list.length ? h('button', { class: 'sec', onclick: () => namesModal() }, '✏️ Названия и порядок') : null),
      list.length ? body : h('div', { class: 'empty', style: { marginTop: '10px' } }, 'Чертежей пока нет. Добавьте PDF тохнита — точки с местом на чертеже (после разбора «📐 Добавить точки из чертежа» или из файла) появятся на нём. Чертёж хранится на вашем Google Диске и открыт участникам проекта.'));
    if (d) show(d);
  }
  // the user's own drawing names and their order in the list (the file name does not change — points are linked and duplicates found by it)
  function namesModal() {
    const rows = drawingsOf().map((d) => ({ d, inp: h('input', { value: d.title || '', placeholder: d.name }) }));
    const list = h('div', {});
    const paint = () => list.replaceChildren(...rows.map((r, i) => h('div', { class: 'card', style: { margin: '6px 0', padding: '8px', display: 'flex', gap: '6px', alignItems: 'center' } },
      h('div', { style: { flex: 1, minWidth: 0 } }, r.inp, h('small', { class: 'mut' }, `Файл: ${r.d.name}${r.d.floor ? ` · этаж ${r.d.floor}` : ''}`)),
      h('button', { class: 'sec', style: { padding: '6px 10px' }, disabled: i === 0, title: 'Выше', onclick: () => { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; paint(); } }, '↑'),
      h('button', { class: 'sec', style: { padding: '6px 10px' }, disabled: i === rows.length - 1, title: 'Ниже', onclick: () => { [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]; paint(); } }, '↓'))));
    paint();
    const c = openModal('✏️ Названия и порядок чертежей', h('div', {},
      h('div', { class: 'mut' }, 'Впишите удобное название (пусто — как имя файла). Стрелками — порядок в списке чертежей. Имя файла остаётся: по нему приложение узнаёт этот же файл при повторном добавлении.'),
      list, h('div', { class: 'btns' }, h('button', { onclick: () => {
        const p = currentProject(); const pos = new Map(rows.map((r, i) => [r.d.id, { order: i, title: r.inp.value.trim() }]));
        patchDrawings(p.id, (list) => list.map((d) => (pos.has(d.id) ? { ...d, ...pos.get(d.id) } : d)));
        c(); toast('Сохранено'); setTimeout(() => draw(current?.id), 300);
      } }, 'Сохранить'))), { sticky: true });
  }

  // the card of a point opened from the plan: the focus frame goes (the owner acts on the point there; back on the plan it is not in the way)
  openCard = (p) => { focusId = null; viewer?.draw(); return import('./points.js').then((m) => m.pointCard(p, { fromPlan: true })); };
  draw();
  void close;
}
