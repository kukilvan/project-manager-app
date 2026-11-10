// Racks and port labels: panel ports of cat7 points, the rack plan, automatic port assignment, label colours and caption texts.
// «Порт в панели» (panel U + port 1–24) for points with cat7 cables.
// A point has the field panel: [{ u, p, label? }] — one per cat7 cable (label — the port's own caption on the label).
// Built on status.js; used by the rack and point views, the daily report view, report.js and shilutsheet.js.
import { effectiveCablesOf, pointInfo } from './status.js';

export const PANEL_PORTS = 24;
// «cat7» is a conventional name for cables that go into patch panels (whatever the cable really is)
export const isRackCable = (cableId) => /cat\s*-?\s*7/i.test(String(cableId || ''));
// How many panel ports the point takes (= its cat7 cables)
export const rackPortsOf = (point, ctx) => effectiveCablesOf(point, ctx).filter((c) => isRackCable(c.cable)).reduce((n, c) => n + c.count, 0);

/** Which of the point's ports (numbers in order) are already stuck: all of them if the point's port labels are marked as a whole; otherwise only those marked with the «Поклеил» button */
export function stuckPortsOf(point, ctx) {
  const n = rackPortsOf(point, ctx);
  if (pointInfo(point, ctx).shilut) return new Set(Array.from({ length: n }, (_, i) => i));
  const any = (ctx.journalByPoint.get(point.id) || []).some((r) => r.action === 'Шилют');
  return any ? new Set((point.shStuck || []).filter((i) => i < n)) : new Set();
}
/** The point's ports whose label is already printed («есть») or stuck: after the caption is changed it becomes outdated */
export function printedPortsOf(point, ctx) {
  const have = (point.shHave || []).filter((i) => i >= 0);
  return [...new Set([...have, ...stuckPortsOf(point, ctx)])];
}
const pad2 = (n) => String(n).padStart(2, '0');
// A point's port: { u, p, s?, label? } — s: the section (one «rack» of points may consist of several physical racks), '' — the first
export const slotKey = (x) => `${x.s || ''}|${x.u}|${x.p}`;
export const fmtPanelPort = (x, subName = '') => (x && x.u ? `${subName ? `${subName} ` : ''}U${pad2(x.u)}-${pad2(x.p)}` : '');
export const panelOf = (point) => (Array.isArray(point?.panel) ? point.panel.filter((x) => x && x.u > 0 && x.p > 0) : []);
// Name of the port's section (only if the rack has several sections)
export const subNameOf = (project, cabinet, sid) => { const subs = project?.racks?.[cabinet]?.subs; return subs?.length > 1 ? (subs.find((x) => (x.id || '') === (sid || ''))?.name || '') : ''; };
export const panelText = (point, project = null) => panelOf(point).map((x) => fmtPanelPort(x, subNameOf(project, point.cabinet || '', x.s))).join(', ');

// «U38-05, 38-6, 38/7», with a section: «CCTV1-A U38-05» or «CCTV1-A: U38-05» → [{ u, p, sub? }]; errors as text
export function parsePanelPorts(text) {
  const out = []; const errors = [];
  const pieces = [];
  String(text || '').split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean).forEach((x) => {
    if (/^(U?\s*\d{1,3}\s*[-/.]\s*\d{1,2}\s+)+U?\s*\d{1,3}\s*[-/.]\s*\d{1,2}$/i.test(x)) pieces.push(...x.split(/\s+(?=U?\s*\d)/i)); else pieces.push(x);
  });
  pieces.forEach((s) => {
    const m = s.match(/^(?:(.+?)\s*(?::|\s)\s*)?U?\s*(\d{1,3})\s*[-/.:]\s*(\d{1,2})$/i);
    if (!m) { errors.push(`«${s}» — нужно вида U38-05`); return; }
    const sub = (m[1] || '').trim(); const u = Number(m[2]); const p = Number(m[3]);
    if (u < 1) { errors.push(`«${s}»: U с 1`); return; }
    if (p < 1 || p > PANEL_PORTS) { errors.push(`«${s}»: порт панели от 1 до ${PANEL_PORTS}`); return; }
    if (out.some((x) => x.u === u && x.p === p && (x.sub || '') === sub)) { errors.push(`«${s}» повторяется`); return; }
    out.push(sub ? { u, p, sub } : { u, p });
  });
  return { list: out, errors };
}

// Default port captions of a point: one cable — the point's name; a pair «…25-26» on 2 ports — «…25» and «…26»; otherwise «name.1», «name.2»…
export function defaultPortLabels(label, n) {
  const l = String(label || '');
  if (n <= 1) return [l];
  const m = l.match(/^(.*?)(\d+)-(\d+)$/);
  if (m) {
    const a = Number(m[2]); const b = Number(m[3]);
    if (b > a && b - a + 1 === n) return Array.from({ length: n }, (_, i) => `${m[1]}${String(a + i).padStart(m[2].length, '0')}`);
  }
  return Array.from({ length: n }, (_, i) => `${l}.${i + 1}`);
}

// Occupied ports: «rack|U|port» → [{ point, i }]; conflicts — where there is more than one point
export function panelOccupancy(points) {
  const map = new Map();
  for (const pt of points) panelOf(pt).forEach((x, i) => {
    const k = `${pt.cabinet || ''}|${slotKey(x)}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push({ point: pt, i });
  });
  return map;
}
export function panelConflicts(points) {
  return [...panelOccupancy(points).entries()].filter(([, v]) => v.length > 1)
    .map(([k, v]) => { const [cabinet, s, u, p] = k.split('|'); return { cabinet, s, u: Number(u), p: Number(p), points: v.map((x) => x.point) }; });
}
// Whether the point matches a search by panel port: «U38-05», «38-05», «38-5»
export function matchesPanelQuery(point, q) {
  const { list, errors } = parsePanelPorts(q);
  if (errors.length || list.length !== 1) return false;
  return panelOf(point).some((x) => x.u === list[0].u && x.p === list[0].p);
}

// ---------- rack plan ----------
// project.racks[rack] = { height, bottomUp (U1 at the bottom), panels: [{ u, s? }], subs?: [{ id, name, height, bottomUp }] }
// subs — if a «rack» of points is really several physical racks (sections); the first section has id '' (old data without sections — the same one)
export const rackOf = (project, cabinet) => project?.racks?.[cabinet] || null;
export const subsOf = (rack, cabinet = '') => (rack?.subs?.length ? rack.subs.map((x) => ({ ...x, id: x.id || '' }))
  : [{ id: '', name: cabinet, height: Number(rack?.height) || 0, bottomUp: rack?.bottomUp !== false }]);
// U from top to bottom, as in the rack (sections)
export const uOrder = (sub) => { const n = Number(sub?.height) || 0; return Array.from({ length: n }, (_, i) => (sub.bottomUp === false ? i + 1 : n - i)); };
export const panelsInOrder = (rack, sub = subsOf(rack)[0]) => { const pos = new Map(uOrder(sub).map((u, i) => [u, i]));
  return [...(rack?.panels || [])].filter((x) => (x.s || '') === (sub?.id || '')).sort((a, b) => (pos.get(a.u) ?? 1e9) - (pos.get(b.u) ?? 1e9)); };
// The rack's points that need panel ports
export const rackPointsOf = (points, ctx, cabinet) => [...points].filter((p) => (p.cabinet || '') === cabinet && rackPortsOf(p, ctx) > 0);
// The floor of a rack — the one most of its points are on
export function cabinetFloor(points) {
  const n = new Map(); points.forEach((p) => { const f = String(p.floor ?? '').trim(); if (f) n.set(f, (n.get(f) || 0) + 1); });
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}
// Lay the points (already in the right order) out over the panels (in the right order) from port start of the first panel; occupied ports are skipped.
// A point's ports are consecutive in one panel (if they do not fit in what is left of the panel — in the next one). → { assign: Map(id → [{u,p}]), left: [points] }
export function autoFill(points, ctx, panels, occupied, { start = 1, blocked = [] } = {}) {
  const busy = new Set([...occupied, ...blocked]); const assign = new Map(); const left = [];
  let pi = 0; let port = start;
  for (const pt of points) {
    const n = rackPortsOf(pt, ctx); let done = false;
    while (pi < panels.length && !done) {
      const u = panels[pi].u; const sec = panels[pi].s || '';
      let s = port;
      while (s + n - 1 <= PANEL_PORTS) {
        const ok = Array.from({ length: n }, (_, k) => !busy.has(slotKey({ s: sec, u, p: s + k }))).every(Boolean);
        if (ok) break; s++;
      }
      if (s + n - 1 <= PANEL_PORTS) {
        const list = Array.from({ length: n }, (_, k) => (sec ? { s: sec, u, p: s + k } : { u, p: s + k }));
        list.forEach((x) => busy.add(slotKey(x))); assign.set(pt.id, list); port = s + n; done = true;
      } else { pi++; port = 1; }
    }
    if (!done) left.push(pt);
  }
  return { assign, left };
}
// ---------- blocked ports (a cross: no points are put on them) ----------
// rack.blocked = [{ u, p, s? }]
export const blockedOf = (rack) => new Set((rack?.blocked || []).map(slotKey));
export const isBlocked = (rack, x) => blockedOf(rack).has(slotKey(x));
export const unblockPort = (rack, x) => ({ ...rack, blocked: (rack.blocked || []).filter((b) => slotKey(b) !== slotKey(x)) });
// Block a panel port. The panel's points that stood on it or are in the way move forward to the nearest free ports
// (the order is kept). Those that did not fit go to the start of the next panel (in rack order) with points of the same type
// (its points move further if needed, the extra ones go still further); if there are no suitable panels left, they become unassigned.
// → { rack, writes: Map(id → panel[]), dropped: [points without a place], moved: [points that went to another panel] }
export function blockPort(rack, points, cabinet, { s = '', u, p }) {
  const sec = s || '';
  const nb = sec ? { s: sec, u, p } : { u, p };
  const nextRack = { ...rack, blocked: [...(rack?.blocked || []).filter((b) => slotKey(b) !== slotKey(nb)), nb] };
  const blocked = blockedOf(nextRack);
  const cabPts = points.filter((pt) => (pt.cabinet || '') === cabinet);
  const work = new Map(cabPts.map((pt) => [pt.id, panelOf(pt).map((x) => ({ ...x }))]));
  const order = subsOf(rack, cabinet).flatMap((sub) => panelsInOrder(rack, sub)).map((x) => ({ s: x.s || '', u: x.u }));
  const inPanel = (e, pn) => (e.s || '') === pn.s && e.u === pn.u;
  const unitsOf = (pn) => cabPts.filter((pt) => work.get(pt.id).some((e) => inPanel(e, pn))).map((pt) => {
    const arr = work.get(pt.id);
    const idx = arr.map((x, i) => (inPanel(x, pn) ? i : -1)).filter((i) => i >= 0).sort((a, b) => arr[a].p - arr[b].p);
    return { pt, arr, idx, first: arr[idx[0]].p };
  }).sort((a, b) => a.first - b.first);
  // Layout of one panel: each point stays on its ports if they are free and not blocked, otherwise on the nearest free ones further on
  const layout = (pn) => {
    const taken = new Set(); const dropped = [];
    for (const un of unitsOf(pn)) {
      const k = un.idx.length;
      const ok = (ports) => ports.every((q) => q >= 1 && q <= PANEL_PORTS && !taken.has(q) && !blocked.has(slotKey({ s: pn.s, u: pn.u, p: q })));
      let ports = un.idx.map((i) => un.arr[i].p);
      if (!ok(ports)) {
        let st = Math.max(un.first, 1); while (st + k - 1 <= PANEL_PORTS && !ok(Array.from({ length: k }, (_, j) => st + j))) st++;
        ports = st + k - 1 <= PANEL_PORTS ? Array.from({ length: k }, (_, j) => st + j) : null;
      }
      if (!ports) { dropped.push(un); continue; }
      ports.forEach((q) => taken.add(q));
      un.idx.forEach((i, j) => { un.arr[i].p = ports[j]; });
    }
    return dropped;
  };
  const finalDropped = []; const queue = new Map();
  const spill = (dropped, from) => {
    for (const un of dropped) {
      let t = -1;
      for (let k = from + 1; k < order.length && t < 0; k++) {
        if (cabPts.some((pt) => pt.id !== un.pt.id && pt.typeId === un.pt.typeId && work.get(pt.id).some((e) => inPanel(e, order[k])))) t = k;
      }
      if (t < 0) { finalDropped.push(un.pt); work.set(un.pt.id, []); continue; }
      un.idx.forEach((i) => { const e = un.arr[i]; e.u = order[t].u; if (order[t].s) e.s = order[t].s; else delete e.s; e.p = 0; });
      if (!queue.has(t)) queue.set(t, []);
      queue.get(t).push(un);
    }
  };
  const startPn = { s: sec, u };
  spill(layout(startPn), order.findIndex((x) => x.s === sec && x.u === u));
  while (queue.size) {
    const t = Math.min(...queue.keys()); queue.delete(t);
    spill(layout(order[t]), t);
  }
  const writes = new Map(); const moved = [];
  cabPts.forEach((pt) => {
    const a = work.get(pt.id); const o = panelOf(pt);
    if (JSON.stringify(a) === JSON.stringify(o)) return;
    writes.set(pt.id, a);
    if (a.length && a.some((e, i) => (e.s || '') !== (o[i]?.s || '') || e.u !== o[i]?.u)) moved.push(pt);
  });
  return { rack: nextRack, writes, dropped: finalDropped, moved };
}

// Checks of the rack plan: ports used twice, points on panels that do not exist, panels outside the rack or on the same U, number of ports ≠ cat7
export function rackProblems(rack, points, ctx, cabinet = '') {
  const out = [];
  const subs = subsOf(rack, cabinet); const subById = new Map(subs.map((x) => [x.id, x]));
  const nm = (sid) => (subs.length > 1 ? `${subById.get(sid || '')?.name || '?'} ` : '');
  const us = new Set((rack?.panels || []).map((x) => `${x.s || ''}|${x.u}`));
  const seenU = new Set();
  (rack?.panels || []).forEach((x) => {
    const k = `${x.s || ''}|${x.u}`; const sub = subById.get(x.s || '');
    if (!sub) out.push(`Панель U${x.u}: такой секции шкафа нет`);
    if (seenU.has(k)) out.push(`Две панели на ${nm(x.s)}U${x.u}`); seenU.add(k);
    if (sub?.height && (x.u < 1 || x.u > sub.height)) out.push(`Панель ${nm(x.s)}U${x.u} вне шкафа (${sub.height}U)`);
  });
  panelConflicts(points).forEach((c) => out.push(`Порт ${fmtPanelPort(c, nm(c.s).trim())} занят несколькими точками: ${c.points.map((p) => p.label).join(', ')}`));
  const blockedSet = blockedOf(rack);
  points.forEach((pt) => {
    const pl = panelOf(pt); if (!pl.length) return;
    const onX = pl.filter((x) => blockedSet.has(slotKey(x))); if (onX.length) out.push(`${pt.label}: ${onX.map((x) => fmtPanelPort(x, nm(x.s).trim())).join(', ')} — порт закрыт крестиком`);
    const bad = pl.filter((x) => !us.has(`${x.s || ''}|${x.u}`)); if (bad.length) out.push(`${pt.label}: ${bad.map((x) => fmtPanelPort(x, nm(x.s).trim())).join(', ')} — такой панели в плане нет`);
    const n = rackPortsOf(pt, ctx); if (pl.length !== n) out.push(`${pt.label}: портов в панели ${pl.length}, а кабелей cat7 ${n}`);
  });
  return out;
}

// ---------- port label colours ----------
// Standard colours (own colours are added in the user's settings: { id, ru, he, bg?, fg? })
export const SHILUT_COLORS = [
  { id: 'yellow', ru: 'жёлтый', he: 'צהוב', bg: '#ffd60a', fg: '#000' },
  { id: 'green', ru: 'зелёный', he: 'ירוק', bg: '#2fb350', fg: '#000' },
  { id: 'blue', ru: 'синий', he: 'כחול', bg: '#0a84ff', fg: '#fff' },
  { id: 'red', ru: 'красный', he: 'אדום', bg: '#ff3b30', fg: '#fff' },
  { id: 'black', ru: 'чёрный', he: 'שחור', bg: '#111111', fg: '#fff' },
];
// Default colour by type name: cameras — green, biometrics/doors (core) — blue, controllers — yellow, Wi-Fi — red, points — black
export function defaultTypeColor(typeId) {
  const t = String(typeId || '').toLowerCase();
  if (/камер|camera|cctv/.test(t)) return 'green';
  if (/биометр|biometr|core|кор\b|двер/.test(t)) return 'blue';
  if (/бакар|bms|контрол/.test(t)) return 'yellow';
  if (/вайфа|wi-?fi|\bap\b|точка доступа/.test(t)) return 'red';
  if (/^точк/.test(t)) return 'black';
  return '';
}
// The type's colour in the project: its own (project.shilut.typeColors) or the default → a colour object or null
export function typeColorOf(project, typeId, extraColors = []) {
  const id = project?.shilut?.typeColors?.[typeId] || defaultTypeColor(typeId);
  return [...SHILUT_COLORS, ...extraColors].find((c) => c.id === id) || null;
}
// Text colour on a given background (black/white)
export function contrastFg(bg) {
  const m = String(bg || '').match(/^#?([0-9a-f]{6})$/i); if (!m) return '#fff';
  const n = parseInt(m[1], 16); const r = n >> 16; const g = (n >> 8) & 255; const b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#000' : '#fff';
}

// ---------- captions and names for the port labels ----------
// project.shilut = { panelModel, typeColors: {type: colour id}, cabNames: {'rack|section': name}, dropCab, tpl: {type: template} }
// In the user's prefs: panelModels: [{ id, name }], shilutColors: [{ id, ru, he, bg, fg }]
export const shilutOf = (project) => project?.shilut || {};
// Whether to drop the rack name from captions: each rack has its own setting (dropCabs), the general dropCab is the fallback
export const dropCabOf = (project, cab) => { const sh = shilutOf(project); return sh.dropCabs?.[cab] ?? !!sh.dropCab; };
export const shilutCabName = (project, cabinet, sid = '') => shilutOf(project).cabNames?.[`${cabinet}|${sid || ''}`]
  || subNameOf(project, cabinet, sid) || subsOf(project?.racks?.[cabinet], cabinet).find((x) => (x.id || '') === (sid || ''))?.name || cabinet;
const stripCab = (txt, cab) => (cab && (txt.startsWith(`${cab}-`) || txt.startsWith(`${cab}/`)) ? txt.slice(cab.length + 1) : txt);
// Only the number from a port label (after the rack name): the last group of digits, «25-26» stays a pair:
// B16 → 16, 1A-25 → 25, 2B/27 → 27, 05 → 05, CCTV1-TV01 → 01; no digits — the label as it is
export const numPart = (txt, cab = '') => { const t = stripCab(String(txt), cab); const m = t.match(/\d+(?:\s*[-–/]\s*\d+)*/g); return m ? m[m.length - 1].replace(/\s+/g, '') : t; };
const hasCab = (txt, names) => names.some((n) => n && String(txt).toLowerCase().startsWith(String(n).toLowerCase()));
// Port caption on the label. While «drop the rack name» is off, the caption always starts with the rack name:
// if the point's label has no rack of its own, one is added (the rack/section name or the custom one from the settings), if it has one it stays as written
// (a custom name from the settings replaces it). A template gives flexibility: «{имя}» — the port label, «{номер}» — without the rack, «{№}» — only the digits of the number, «{шкаф}», «{U}», «{порт}»;
// if the template has «{шкаф}», the template decides where the rack name goes and no prefix is added.
export function shilutLabel(point, i, project, ctx) {
  const e = panelOf(point)[i]; if (e?.label) return e.label;
  const sh = shilutOf(project); const cab = point.cabinet || ''; const sid = e?.s || '';
  const name = shilutCabName(project, cab, sid);
  const custom = String(sh.cabNames?.[`${cab}|${sid}`] || '').trim();
  const drop = dropCabOf(project, cab);
  let base = defaultPortLabels(point.label, rackPortsOf(point, ctx))[i] ?? point.label;
  const num = numPart(base, cab);
  if (drop) base = stripCab(base, cab);
  else if (cab && custom && custom !== cab && stripCab(base, cab) !== base) base = `${custom}${base.slice(cab.length)}`;
  const tpl = String(sh.tpl?.[point.typeId] || '').trim() || '{имя}';
  let out = tpl.replace(/\{имя\}/g, base).replace(/\{№\}/g, num).replace(/\{номер\}/g, stripCab(base, cab)).replace(/\{шкаф\}/g, name)
    .replace(/\{U\}/g, String(e?.u ?? '')).replace(/\{порт\}/g, String(e?.p ?? ''));
  if (!drop && cab && !tpl.includes('{шкаф}') && !hasCab(out, [cab, name, custom])) out = `${name}-${out}`;
  return out;
}
