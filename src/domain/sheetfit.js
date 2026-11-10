// New drawing version («тохнит»): moving points from the old sheet to the new one when the new sheet has another size, a different crop or another scale.
// The transform is found by itself — from captions that occur exactly once on both sheets (point numbers, room names):
// scale + rotation + shift (a similarity), discarding chance matches (RANSAC).
// Then each point is checked: whether what stood in its place on the old sheet (its number or icon) stands in its place on the new one.
// Pure; used by the new-version view (src/app/views/planversion.js).

const norm = (t) => String(t ?? '').trim().replace(/\s+/g, ' ');
const usable = (t) => t.length >= 3 && /[A-Za-z0-9]/.test(t) && /\d/.test(t);   // «FA/C-12», «A02», «H=400»… single letters and «2» are not usable

/** Pairs of identical captions that occur exactly once on both the old and the new sheet.
 * spans: [{ t, page, x, y }] (x, y — the centre of the caption). */
export function uniquePairs(oldSpans, newSpans) {
  const count = (list) => { const m = new Map(); for (const s of list) { const k = norm(s.t); if (usable(k)) m.set(k, (m.get(k) || 0) + 1); } return m; };
  const ca = count(oldSpans); const cb = count(newSpans);
  const firstOf = (list, c) => { const m = new Map(); for (const s of list) { const k = norm(s.t); if (c.get(k) === 1) m.set(k, s); } return m; };
  const fa = firstOf(oldSpans, ca); const fb = firstOf(newSpans, cb);
  const out = [];
  for (const [k, a] of fa) { const b = fb.get(k); if (b) out.push({ t: k, a: { page: a.page || 0, x: a.x, y: a.y }, b: { page: b.page || 0, x: b.x, y: b.y } }); }
  return out;
}

// a similarity through complex numbers: w = z·v + t (z — scale and rotation, t — shift)
function lsq(ps) {
  const n = ps.length; let ax = 0; let ay = 0; let bx = 0; let by = 0;
  for (const p of ps) { ax += p.a.x; ay += p.a.y; bx += p.b.x; by += p.b.y; }
  ax /= n; ay /= n; bx /= n; by /= n;
  let nr = 0; let ni = 0; let den = 0;
  for (const p of ps) {
    const ux = p.a.x - ax; const uy = p.a.y - ay; const vx = p.b.x - bx; const vy = p.b.y - by;
    nr += vx * ux + vy * uy; ni += vy * ux - vx * uy; den += ux * ux + uy * uy;
  }
  if (!(den > 0)) return null;
  const zr = nr / den; const zi = ni / den;
  return { zr, zi, tx: bx - (zr * ax - zi * ay), ty: by - (zi * ax + zr * ay) };
}
export const applyFit = (f, x, y) => ({ x: f.zr * x - f.zi * y + f.tx, y: f.zi * x + f.zr * y + f.ty });
export const fitScale = (f) => Math.hypot(f.zr, f.zi);
export const fitAngle = (f) => Math.atan2(f.zi, f.zr) * 180 / Math.PI;

function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/**
 * The transform for one pair of pages. pairs — from uniquePairs (one page of the old drawing and one of the new).
 * thr — the tolerance (in units of the new sheet) within which a pair counts as matched.
 * → { zr, zi, tx, ty, inliers, total, rms, scale, angle } or null
 */
export function fitPairs(pairs, { thr = 5, iters = 600, seed = 7 } = {}) {
  if (pairs.length < 2) return null;
  const rnd = rng(seed); let best = null;
  const tries = pairs.length <= 40 ? null : iters;
  const consider = (i, j) => {
    const a = pairs[i]; const b = pairs[j];
    if (Math.hypot(a.a.x - b.a.x, a.a.y - b.a.y) < 1e-6) return;
    const f = lsq([a, b]); if (!f) return;
    const sc = fitScale(f); if (!(sc > 0.02 && sc < 50)) return;
    let n = 0; for (const p of pairs) { const w = applyFit(f, p.a.x, p.a.y); if (Math.hypot(w.x - p.b.x, w.y - p.b.y) <= thr) n++; }
    if (!best || n > best.n) best = { f, n };
  };
  if (tries === null) { for (let i = 0; i < pairs.length; i++) for (let j = i + 1; j < pairs.length; j++) consider(i, j); }
  else for (let k = 0; k < tries; k++) { const i = Math.floor(rnd() * pairs.length); let j = Math.floor(rnd() * pairs.length); if (j === i) j = (j + 1) % pairs.length; consider(i, j); }
  if (!best || best.n < 2) return null;
  // refinement over all the matched ones (two passes)
  let f = best.f; let inl = [];
  for (let pass = 0; pass < 2; pass++) {
    inl = pairs.filter((p) => { const w = applyFit(f, p.a.x, p.a.y); return Math.hypot(w.x - p.b.x, w.y - p.b.y) <= thr; });
    if (inl.length >= 2) f = lsq(inl) || f;
  }
  const res = inl.map((p) => { const w = applyFit(f, p.a.x, p.a.y); return Math.hypot(w.x - p.b.x, w.y - p.b.y); });
  const rms = res.length ? Math.sqrt(res.reduce((s, r) => s + r * r, 0) / res.length) : 0;
  return { ...f, inliers: inl.length, total: pairs.length, rms: +rms.toFixed(2), scale: +fitScale(f).toFixed(4), angle: +fitAngle(f).toFixed(2) };
}

/** Whether the transform is reliable: at least 4 matched captions and not less than a third of all the common ones */
export const fitOk = (f) => !!f && f.inliers >= 4 && f.inliers >= f.total * 0.33;

/**
 * The transform for all pages of the old drawing: each old page gets the new one with which it has the most common captions.
 * newPages: [{ w, h }] — the sizes of the new sheet's pages (for the tolerance).
 * → Map(old page → { newPage, ...fit }) — only the reliable ones
 */
export function fitSheets(pairs, newPages = [], opts = {}) {
  const byOld = new Map();
  for (const p of pairs) { if (!byOld.has(p.a.page)) byOld.set(p.a.page, []); byOld.get(p.a.page).push(p); }
  const out = new Map();
  for (const [op, list] of byOld) {
    const cnt = new Map(); list.forEach((p) => cnt.set(p.b.page, (cnt.get(p.b.page) || 0) + 1));
    const np = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const sz = newPages[np] || {}; const diag = Math.hypot(sz.w || 0, sz.h || 0);
    const thr = opts.thr ?? Math.max(3, diag * 0.0015);
    const f = fitPairs(list.filter((p) => p.b.page === np), { thr, seed: opts.seed ?? 7 });
    if (f) out.set(op, { newPage: np, thr, ...f, ok: fitOk(f) });
  }
  return out;
}

/** The transform from two pairs of places that the person pointed out themselves (when there are few common captions) */
export function fitManual(pairs) {
  if (pairs.length < 2) return null;
  const f = lsq(pairs); if (!f) return null;
  return { ...f, inliers: pairs.length, total: pairs.length, rms: 0, scale: +fitScale(f).toFixed(4), angle: +fitAngle(f).toFixed(2), ok: true, manual: true };
}

/** The point's place on the new sheet (the frame size — with the same scale) */
export function movePos(pos, fit, sheet, newPage) {
  const w = applyFit(fit, pos.x, pos.y); const sc = fitScale(fit);
  const out = { ...pos, page: newPage, x: +w.x.toFixed(1), y: +w.y.toFixed(1), sheet: sheet.name };
  if (typeof pos.w === 'number') out.w = +(pos.w * sc).toFixed(1);
  if (typeof pos.h === 'number') out.h = +(pos.h * sc).toFixed(1);
  const sz = sheet.pages?.[newPage]; if (sz) { out.pw = sz.w; out.ph = sz.h; } else { delete out.pw; delete out.ph; }
  return out;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
/** A caption of several labels in one line («FC/B13-14 FC/B15-16»): each one separately, the place — by the share of characters */
export function withTokens(spans) {
  const out = [];
  for (const s of spans) {
    out.push(s);
    const t = String(s.t ?? ''); const parts = t.trim().split(/\s+/); if (parts.length < 2) continue;
    const L = t.length; const vert = (s.h || 0) > (s.w || 0) * 1.5; const len = vert ? s.h : s.w; let at = 0;
    for (const w of parts) {
      const i = t.indexOf(w, at); at = i + w.length; const mid = (i + w.length / 2) / L - 0.5;
      const sz = (len || 0) * (w.length / L);
      out.push(vert ? { ...s, t: w, y: s.y + mid * len, h: sz, part: true } : { ...s, t: w, x: s.x + mid * len, w: sz, part: true });
    }
  }
  return out;
}
const inside = (s, x, y, pad) => Math.abs(s.x - x) <= (s.w || 0) / 2 + pad && Math.abs(s.y - y) <= (s.h || 0) / 2 + pad;

/**
 * Moving the points. points — the points of the old sheet (pos on it). fits — from fitSheets/fitManual (Map old page → fit).
 * oldSpans/newSpans — all short captions of the sheets: [{ t, page, x, y, w, h }]. sheet — the new drawing { name, pages }.
 * For each point:
 *  ok      — on the new sheet what stands in its place is the same as on the old one (its number or an icon with the same caption); the place — by the new sheet
 *  moved   — its number is on the new sheet but in another place (to — where); the point stays at the recomputed place
 *  missing — its number is not on the new sheet; the point stays at the recomputed place
 *  lost    — the icon with a caption (CR, WIFI…) is not found at the recomputed place (to — the nearest identical free one, if any)
 *  plain   — there was no caption under the point on the old sheet (placed by hand, a vector icon): only the transform
 *  nofit   — there is no transform for its page (the point is not moved)
 */
export function planMove(points, fits, oldSpans0, newSpans0, sheet) {
  const oldSpans = withTokens(oldSpans0); const newSpans = withTokens(newSpans0);
  const byText = new Map(); for (const s of newSpans) { const k = norm(s.t); if (!byText.has(k)) byText.set(k, []); byText.get(k).push(s); }
  const oldByPage = new Map(); for (const s of oldSpans) { const pg = s.page || 0; if (!oldByPage.has(pg)) oldByPage.set(pg, []); oldByPage.get(pg).push(s); }
  const used = new Set();   // occupied captions of the new sheet (two marks do not stick to one)
  const newCount = new Map(); for (const sp of newSpans) { const k = norm(sp.t); newCount.set(k, (newCount.get(k) || 0) + 1); }
  const r1 = (v) => +(+v).toFixed(1);

  function classify(p) {
    const pg = p.pos.page || 0; const f = fits.get(pg);
    if (!f) return { kind: 'nofit' };
    const pos = movePos(p.pos, f, sheet, f.newPage); const sc = fitScale(f);
    const near = Math.max((f.thr ?? 5) * 2, 6);
    const pick = (list) => { let best = null; let bd = Infinity; for (const s of list || []) { if ((s.page || 0) !== f.newPage || used.has(s)) continue; const d = dist(s, pos); if (d < bd) { bd = d; best = s; } } return best ? { s: best, d: bd, far: bd > near } : null; };
    const snapTo = (s) => ({ ...pos, x: r1(s.x), y: r1(s.y), ...(typeof s.w === 'number' ? { w: r1(s.w) } : {}), ...(typeof s.h === 'number' ? { h: r1(s.h) } : {}) });
    const lab = labelOn(p); const olds = oldByPage.get(pg) || [];
    // 1) the point's number, if on the old sheet it stood in its place
    if (lab) {
      const m = pick(byText.get(lab));
      if (m && !m.far) { used.add(m.s); return { kind: 'ok', pos: snapTo(m.s) }; }
      if (m) return { kind: 'moved', pos, to: snapTo(m.s), d: +(m.d / sc).toFixed(1) };
      // in this place on the new sheet there is another label (the point was renamed: FA/C-62 → FC/C-62)
      const other = newSpans.filter((sp) => (sp.page || 0) === f.newPage && !used.has(sp) && usable(norm(sp.t)) && norm(sp.t) !== lab && (newCount.get(norm(sp.t)) || 0) === 1 && dist(sp, pos) <= near)
        .sort((a, b) => dist(a, pos) - dist(b, pos))[0];
      if (other) return { kind: 'missing', pos: snapTo(other), newLabel: norm(other.t) };
      return { kind: 'missing', pos };
    }
    // 2) what was under the point on the old sheet (an icon caption: CR, WIFI, BRFC…)
    const under = olds.filter((s) => inside(s, p.pos.x, p.pos.y, 2)).sort((a, b) => (a.w * a.h) - (b.w * b.h))[0];
    if (under) {
      const k = norm(under.t); const m = pick(byText.get(k));
      if (m && !m.far) { used.add(m.s); return { kind: 'ok', pos: snapTo(m.s), under: k }; }
      return { kind: 'lost', pos, under: k, ...(m && m.d <= near * 15 ? { to: snapTo(m.s) } : {}) };
    }
    return { kind: 'plain', pos };
  }

  // several points on one mark (doubles, triples): one decision for the whole mark
  const keyOf = (p) => `${p.pos.page || 0}|${Math.round(p.pos.x)}|${Math.round(p.pos.y)}`;
  const groups = new Map();
  [...points].sort((a, b) => String(a.label || '').localeCompare(String(b.label || ''), 'ru', { numeric: true }))
    .forEach((p) => { const k = keyOf(p); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); });
  // first the marks whose number stands on the sheet (they are more reliable), then icons and the rest
  // which text the point is captioned with on the sheet: its number, and if the drawing writes it differently — pos.text / planName
  const namesOf = (p) => [...new Set([p.label, p.pos?.text, p.planName].map(norm).filter(Boolean))];
  // a number is only a caption that is single on the old sheet (repeated CR, WIFI are icons, they are looked for nearby, not over the whole sheet)
  const oldCount = new Map(); for (const sp of oldSpans) { const k = `${sp.page || 0}|${norm(sp.t)}`; oldCount.set(k, (oldCount.get(k) || 0) + 1); }
  const labelOn = (p) => namesOf(p).find((nm) => (oldCount.get(`${p.pos.page || 0}|${nm}`) || 0) === 1 && (oldByPage.get(p.pos.page || 0) || []).some((s) => norm(s.t) === nm && dist(s, p.pos) <= Math.max(8, (p.pos.w || 0) / 2 + 6))) || null;
  const labelHere = (p) => !!labelOn(p);
  const list = [...groups.values()].map((g) => { const l = g.find(labelHere); return { g, l: l || g[0], lab: !!l }; });
  list.sort((a, b) => Number(b.lab) - Number(a.lab));
  const out = [];
  for (const { g, l } of list) { const r = classify(l); for (const p of g) out.push({ id: p.id, label: p.label, ...r }); }
  return out;
}

/** How many moved points ended up beyond the edge of the new sheet (a sign of wrongly specified places) */
export function offSheet(plan, pages) {
  return plan.filter((x) => { if (!x.pos) return false; const sz = pages[x.pos.page || 0]; return sz && (x.pos.x < -5 || x.pos.y < -5 || x.pos.x > sz.w + 5 || x.pos.y > sz.h + 5); }).length;
}

/** A summary for the screen */
export function moveSummary(plan) {
  const c = { ok: 0, moved: 0, missing: 0, lost: 0, plain: 0, nofit: 0 };
  plan.forEach((x) => { c[x.kind] = (c[x.kind] || 0) + 1; });
  return c;
}

/** The new drawing's file name must not coincide with those already added (points are tied to a drawing by name) */
export function versionName(name, taken) {
  const set = new Set(taken); if (!set.has(name)) return name;
  const m = String(name).match(/^(.*?)(\.pdf)?$/i); const base = m[1]; const ext = m[2] || '.pdf';
  for (let i = 2; i < 100; i++) { const n = `${base} (версия ${i})${ext}`; if (!set.has(n)) return n; }
  return `${base} (${Date.now()})${ext}`;
}
