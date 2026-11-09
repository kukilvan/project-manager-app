// Новая версия чертежа (тохнита): как перенести точки со старого листа на новый, если лист другого размера,
// обрезан иначе или в другом масштабе. Пересчёт находится сам — по надписям, которые есть на обоих листах ровно по разу
// (номера точек, названия помещений): масштаб + поворот + сдвиг (подобие), с отбрасыванием случайных совпадений (RANSAC).
// Потом каждая точка проверяется: стоит ли на новом листе на её месте то же, что стояло на старом (её номер или значок).

const norm = (t) => String(t ?? '').trim().replace(/\s+/g, ' ');
const usable = (t) => t.length >= 3 && /[A-Za-z0-9]/.test(t) && /\d/.test(t);   // «FA/C-12», «A02», «H=400»… одиночные буквы/«2» — нет

/** Пары одинаковых надписей, которые встречаются ровно один раз и на старом, и на новом листе.
 * spans: [{ t, page, x, y }] (x, y — центр надписи). */
export function uniquePairs(oldSpans, newSpans) {
  const count = (list) => { const m = new Map(); for (const s of list) { const k = norm(s.t); if (usable(k)) m.set(k, (m.get(k) || 0) + 1); } return m; };
  const ca = count(oldSpans); const cb = count(newSpans);
  const firstOf = (list, c) => { const m = new Map(); for (const s of list) { const k = norm(s.t); if (c.get(k) === 1) m.set(k, s); } return m; };
  const fa = firstOf(oldSpans, ca); const fb = firstOf(newSpans, cb);
  const out = [];
  for (const [k, a] of fa) { const b = fb.get(k); if (b) out.push({ t: k, a: { page: a.page || 0, x: a.x, y: a.y }, b: { page: b.page || 0, x: b.x, y: b.y } }); }
  return out;
}

// подобие через комплексные числа: w = z·v + t (z — масштаб и поворот, t — сдвиг)
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
 * Пересчёт для одной пары страниц. pairs — из uniquePairs (одной страницы старого и одной нового).
 * thr — допуск (в единицах нового листа), с которым пара считается совпавшей.
 * → { zr, zi, tx, ty, inliers, total, rms, scale, angle } или null
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
  // уточнение по всем совпавшим (два прохода)
  let f = best.f; let inl = [];
  for (let pass = 0; pass < 2; pass++) {
    inl = pairs.filter((p) => { const w = applyFit(f, p.a.x, p.a.y); return Math.hypot(w.x - p.b.x, w.y - p.b.y) <= thr; });
    if (inl.length >= 2) f = lsq(inl) || f;
  }
  const res = inl.map((p) => { const w = applyFit(f, p.a.x, p.a.y); return Math.hypot(w.x - p.b.x, w.y - p.b.y); });
  const rms = res.length ? Math.sqrt(res.reduce((s, r) => s + r * r, 0) / res.length) : 0;
  return { ...f, inliers: inl.length, total: pairs.length, rms: +rms.toFixed(2), scale: +fitScale(f).toFixed(4), angle: +fitAngle(f).toFixed(2) };
}

/** Надёжен ли пересчёт: хотя бы 4 совпавших надписи и не меньше трети от всех общих */
export const fitOk = (f) => !!f && f.inliers >= 4 && f.inliers >= f.total * 0.33;

/**
 * Пересчёт для всех страниц старого чертежа: каждой старой странице — новая, с которой больше всего общих надписей.
 * newPages: [{ w, h }] — размеры страниц нового листа (для допуска).
 * → Map(старая страница → { newPage, ...fit }) — только надёжные
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

/** Пересчёт по двум парам мест, которые человек указал сам (когда общих надписей мало) */
export function fitManual(pairs) {
  if (pairs.length < 2) return null;
  const f = lsq(pairs); if (!f) return null;
  return { ...f, inliers: pairs.length, total: pairs.length, rms: 0, scale: +fitScale(f).toFixed(4), angle: +fitAngle(f).toFixed(2), ok: true, manual: true };
}

/** Место точки на новом листе (размер рамки — с тем же масштабом) */
export function movePos(pos, fit, sheet, newPage) {
  const w = applyFit(fit, pos.x, pos.y); const sc = fitScale(fit);
  const out = { ...pos, page: newPage, x: +w.x.toFixed(1), y: +w.y.toFixed(1), sheet: sheet.name };
  if (typeof pos.w === 'number') out.w = +(pos.w * sc).toFixed(1);
  if (typeof pos.h === 'number') out.h = +(pos.h * sc).toFixed(1);
  const sz = sheet.pages?.[newPage]; if (sz) { out.pw = sz.w; out.ph = sz.h; } else { delete out.pw; delete out.ph; }
  return out;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
/** Надпись из нескольких обозначений в одну строку («FC/B13-14 FC/B15-16»): каждое — отдельно, место — по доле символов */
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
 * Перенос точек. points — точки со старого листа (pos на нём). fits — из fitSheets/fitManual (Map старая страница → fit).
 * oldSpans/newSpans — все короткие надписи листов: [{ t, page, x, y, w, h }]. sheet — новый чертёж { name, pages }.
 * Для каждой точки:
 *  ok      — на новом листе на её месте то же, что на старом (её номер или значок с той же надписью); место — по новому листу
 *  moved   — её номер есть на новом листе, но в другом месте (to — где); точка остаётся на пересчитанном месте
 *  missing — её номера на новом листе нет; точка остаётся на пересчитанном месте
 *  lost    — значок с надписью (CR, WIFI…) на пересчитанном месте не найден (to — ближайший такой же свободный, если есть)
 *  plain   — под точкой на старом листе не было надписи (поставлена вручную, векторный значок): только пересчёт
 *  nofit   — для её страницы пересчёта нет (точка не переносится)
 */
export function planMove(points, fits, oldSpans0, newSpans0, sheet) {
  const oldSpans = withTokens(oldSpans0); const newSpans = withTokens(newSpans0);
  const byText = new Map(); for (const s of newSpans) { const k = norm(s.t); if (!byText.has(k)) byText.set(k, []); byText.get(k).push(s); }
  const oldByPage = new Map(); for (const s of oldSpans) { const pg = s.page || 0; if (!oldByPage.has(pg)) oldByPage.set(pg, []); oldByPage.get(pg).push(s); }
  const used = new Set();   // занятые надписи нового листа (две отметки не прилипают к одной)
  const r1 = (v) => +(+v).toFixed(1);

  function classify(p) {
    const pg = p.pos.page || 0; const f = fits.get(pg);
    if (!f) return { kind: 'nofit' };
    const pos = movePos(p.pos, f, sheet, f.newPage); const sc = fitScale(f);
    const near = Math.max((f.thr ?? 5) * 2, 6);
    const pick = (list) => { let best = null; let bd = Infinity; for (const s of list || []) { if ((s.page || 0) !== f.newPage || used.has(s)) continue; const d = dist(s, pos); if (d < bd) { bd = d; best = s; } } return best ? { s: best, d: bd, far: bd > near } : null; };
    const snapTo = (s) => ({ ...pos, x: r1(s.x), y: r1(s.y), ...(typeof s.w === 'number' ? { w: r1(s.w) } : {}), ...(typeof s.h === 'number' ? { h: r1(s.h) } : {}) });
    const lab = labelOn(p); const olds = oldByPage.get(pg) || [];
    // 1) номер точки, если на старом листе он стоял на её месте
    if (lab) {
      const m = pick(byText.get(lab));
      if (m && !m.far) { used.add(m.s); return { kind: 'ok', pos: snapTo(m.s) }; }
      if (m) return { kind: 'moved', pos, to: snapTo(m.s), d: +(m.d / sc).toFixed(1) };
      return { kind: 'missing', pos };
    }
    // 2) что было под точкой на старом листе (надпись значка: CR, WIFI, BRFC…)
    const under = olds.filter((s) => inside(s, p.pos.x, p.pos.y, 2)).sort((a, b) => (a.w * a.h) - (b.w * b.h))[0];
    if (under) {
      const k = norm(under.t); const m = pick(byText.get(k));
      if (m && !m.far) { used.add(m.s); return { kind: 'ok', pos: snapTo(m.s), under: k }; }
      return { kind: 'lost', pos, under: k, ...(m && m.d <= near * 15 ? { to: snapTo(m.s) } : {}) };
    }
    return { kind: 'plain', pos };
  }

  // несколько точек на одной отметке (двойные, тройные): решение одно на всю отметку
  const keyOf = (p) => `${p.pos.page || 0}|${Math.round(p.pos.x)}|${Math.round(p.pos.y)}`;
  const groups = new Map();
  [...points].sort((a, b) => String(a.label || '').localeCompare(String(b.label || ''), 'ru', { numeric: true }))
    .forEach((p) => { const k = keyOf(p); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); });
  // сначала отметки, у которых номер стоит на листе (они надёжнее), потом значки и прочие
  // каким текстом точка подписана на листе: её номер, а если на чертеже он записан иначе — pos.text / planName
  const namesOf = (p) => [...new Set([p.label, p.pos?.text, p.planName].map(norm).filter(Boolean))];
  // номер — только надпись, которая на старом листе одна (повторяющиеся CR, WIFI — это значки, их ищем рядом, а не по всему листу)
  const oldCount = new Map(); for (const sp of oldSpans) { const k = `${sp.page || 0}|${norm(sp.t)}`; oldCount.set(k, (oldCount.get(k) || 0) + 1); }
  const labelOn = (p) => namesOf(p).find((nm) => (oldCount.get(`${p.pos.page || 0}|${nm}`) || 0) === 1 && (oldByPage.get(p.pos.page || 0) || []).some((s) => norm(s.t) === nm && dist(s, p.pos) <= Math.max(8, (p.pos.w || 0) / 2 + 6))) || null;
  const labelHere = (p) => !!labelOn(p);
  const list = [...groups.values()].map((g) => { const l = g.find(labelHere); return { g, l: l || g[0], lab: !!l }; });
  list.sort((a, b) => Number(b.lab) - Number(a.lab));
  const out = [];
  for (const { g, l } of list) { const r = classify(l); for (const p of g) out.push({ id: p.id, label: p.label, ...r }); }
  return out;
}

/** Сколько перенесённых точек оказалось за краем нового листа (признак неверно указанных мест) */
export function offSheet(plan, pages) {
  return plan.filter((x) => { if (!x.pos) return false; const sz = pages[x.pos.page || 0]; return sz && (x.pos.x < -5 || x.pos.y < -5 || x.pos.x > sz.w + 5 || x.pos.y > sz.h + 5); }).length;
}

/** Сводка для экрана */
export function moveSummary(plan) {
  const c = { ok: 0, moved: 0, missing: 0, lost: 0, plain: 0, nofit: 0 };
  plan.forEach((x) => { c[x.kind] = (c[x.kind] || 0) + 1; });
  return c;
}

/** Имя файла нового чертежа не должно совпадать с уже добавленными (по имени к чертежу привязаны точки) */
export function versionName(name, taken) {
  const set = new Set(taken); if (!set.has(name)) return name;
  const m = String(name).match(/^(.*?)(\.pdf)?$/i); const base = m[1]; const ext = m[2] || '.pdf';
  for (let i = 2; i < 100; i++) { const n = `${base} (версия ${i})${ext}`; if (!set.has(n)) return n; }
  return `${base} (${Date.now()})${ext}`;
}
