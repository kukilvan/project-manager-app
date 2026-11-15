// Background drawing parsing (a Web Worker): heavy PDF reading does not slow the screen down. Messages arrive from src/app/views/tohnitview.js and the plan screens; MuPDF is loaded here.
// Commands (the main ones): open {data} → {pages, ms}; parse {catalog, opts} → the autoParse result; crop {page, clip, zoom} → PNG (Uint8Array); pick {page, x, y} → the same icons.
// Uses extract.js, engine.js, icons.js and numbered.js.
import { extractPdf, loadMupdf } from './extract.js';
import { autoParse, scanPages, labelish } from './engine.js';
import { pickSimilar, snapAt } from './icons.js';
import { numberedPdf } from './numbered.js';

let extracted = null; let doc = null; let hiddenSet = null; let scanned = null; let raw = null;
const ensureExtracted = async () => { if (!extracted && raw) extracted = await extractPdf(raw.slice()); };  // the plan is open without parsing: text and lines are read on demand
let lists = new Map();  // page → a ready «display list» (drawing sheet pieces from it is 2–3 times faster)

self.onmessage = async (e) => {
  const { id, cmd, ...a } = e.data;
  try {
    let res;
    if (cmd === 'warm') {  // load and start the PDF reader module ahead of time (while the drawing file is being read)
      await loadMupdf(); res = true;
    } else if (cmd === 'open') {
      const t0 = Date.now(); const mupdf = await loadMupdf();
      const bytes = new Uint8Array(a.data);
      extracted = await extractPdf(bytes.slice());
      doc = mupdf.Document.openDocument(bytes, 'application/pdf'); hiddenSet = null; scanned = null; lists = new Map();
      res = { pages: extracted.pages.map((p) => ({ w: p.w, h: p.h })), ms: Date.now() - t0 };
    } else if (cmd === 'openDoc') {  // display only (the plan): no text parsing
      const mupdf = await loadMupdf(); raw = new Uint8Array(a.data); doc = mupdf.Document.openDocument(raw.slice(), 'application/pdf'); extracted = null; scanned = null; hiddenSet = null; lists = new Map();
      res = { pages: Array.from({ length: doc.countPages() }, (_, i) => { const b = doc.loadPage(i).getBounds(); return { w: b[2] - b[0], h: b[3] - b[1] }; }) };
    } else if (cmd === 'parse') {
      res = autoParse(extracted, a.catalog, a.opts);
      if (doc && JSON.stringify(res.hiddenLayers) !== JSON.stringify(hiddenSet)) {  // junk layers: hide them in the pictures too
        hiddenSet = res.hiddenLayers; const pdf = doc.asPDF?.() || doc; const hs = new Set(hiddenSet);
        try { for (let i = 0; i < pdf.countLayers(); i++) pdf.setLayerVisible(i, !hs.has(pdf.getLayerName(i))); } catch { /* no layers */ }
        lists = new Map();
      }
      delete res.report.taken; delete res.report.unknown;
    } else if (cmd === 'pick') {  // what is under the finger and where else there is the same
      scanned ??= scanPages(extracted.pages).spans;
      const hs = new Set(hiddenSet || []);
      res = pickSimilar(scanned, extracted.pages, a.page, a.x, a.y, { hidden: (l) => hs.has(l), pad: a.pad ?? 3 });
    } else if (cmd === 'snap') {  // the nearest caption or icon under the finger
      await ensureExtracted();
      scanned ??= scanPages(extracted.pages).spans; const hs = new Set(hiddenSet || []);
      res = snapAt(scanned, extracted.pages, a.page, a.x, a.y, { hidden: (l) => hs.has(l), r: a.r ?? 12 });
    } else if (cmd === 'png') {  // a small picture of a piece of the sheet (a type icon)
      const mupdf = await loadMupdf(); const z = a.zoom || 4;
      if (a.rot) {  // a rotated piece (a tilted caption in a frame): center, length, height, angle → a horizontal picture
        const { cx, cy, w, h, angle } = a.rot; const W = Math.ceil(w * z); const H = Math.ceil(h * z);
        let m = mupdf.Matrix.translate(-cx, -cy); m = mupdf.Matrix.concat(m, mupdf.Matrix.rotate(-angle)); m = mupdf.Matrix.concat(m, mupdf.Matrix.scale(z, z)); m = mupdf.Matrix.concat(m, mupdf.Matrix.translate(W / 2, H / 2));
        const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, W, H], false);
        pix.clear(255); const dev = new mupdf.DrawDevice(mupdf.Matrix.identity, pix); doc.loadPage(a.page).run(dev, m); dev.close(); res = pix.asPNG();
      } else {
        const [x0, y0, x1, y1] = a.clip;
        const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [Math.floor(x0 * z), Math.floor(y0 * z), Math.ceil(x1 * z), Math.ceil(y1 * z)], false);
        pix.clear(255); const dev = new mupdf.DrawDevice(mupdf.Matrix.identity, pix); doc.loadPage(a.page).run(dev, mupdf.Matrix.scale(z, z)); dev.close(); res = pix.asPNG();
      }
    } else if (cmd === 'texts') {  // all short captions that look like labels (for linking to project points, even if the catalog does not know them)
      scanned ??= scanPages(extracted.pages).spans;
      res = scanned.filter((s) => !String(s.c || '').startsWith('sym:') && s.t.trim().length <= 30 && (labelish(s.t.trim()) || /\d/.test(s.t)))
        .map((s) => ({ label: s.t.trim(), pos: { page: s.page || 0, x: +((s.x0 + s.x1) / 2).toFixed(1), y: +((s.y0 + s.y1) / 2).toFixed(1), w: +(s.x1 - s.x0).toFixed(1), h: +(s.y1 - s.y0).toFixed(1) } }));
    } else if (cmd === 'spans') {  // all short captions of the sheet (a new drawing version: match the old and the new sheet)
      await ensureExtracted();
      scanned ??= scanPages(extracted.pages).spans;
      res = { pages: extracted.pages.map((p) => ({ w: p.w, h: p.h })), spans: scanned.filter((s) => !String(s.c || '').startsWith('sym:') && s.t.trim() && s.t.trim().length <= 40)
        .map((s) => ({ t: s.t.trim(), page: s.page || 0, x: +((s.x0 + s.x1) / 2).toFixed(2), y: +((s.y0 + s.y1) / 2).toFixed(2), w: +(s.x1 - s.x0).toFixed(2), h: +(s.y1 - s.y0).toFixed(2) })) };
    } else if (cmd === 'layers') {  // drawing layers (AutoCAD): [{ name, on }]
      const pdf = doc.asPDF?.() || doc; res = [];
      try { for (let i = 0; i < pdf.countLayers(); i++) res.push({ name: pdf.getLayerName(i), on: pdf.isLayerVisible(i) }); } catch { /* no layers */ }
    } else if (cmd === 'setLayers') {  // turn layers off by name (and the others on)
      const pdf = doc.asPDF?.() || doc; const off = new Set(a.off || []);
      try { for (let i = 0; i < pdf.countLayers(); i++) pdf.setLayerVisible(i, !off.has(pdf.getLayerName(i))); } catch { /* no layers */ }
      lists = new Map(); res = true;
    } else if (cmd === 'numbered') {  // «PDF с номерами»
      res = numberedPdf(await loadMupdf(), new Uint8Array(a.data), a.points, { title: a.title, icons: a.icons || {}, hidden: a.hidden || [], lang: a.lang || 'ru', typeNames: a.typeNames || {}, updated: a.updated || '' });
    } else if (cmd === 'crop') {
      const mupdf = await loadMupdf(); const z = a.zoom || 4;
      if (!lists.has(a.page)) lists.set(a.page, doc.loadPage(a.page).toDisplayList());
      const M = mupdf.Matrix.scale(z, z); const [x0, y0, x1, y1] = a.clip;
      const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [Math.floor(x0 * z), Math.floor(y0 * z), Math.ceil(x1 * z), Math.ceil(y1 * z)], !!a.raw);
      pix.clear(255); const dev = new mupdf.DrawDevice(mupdf.Matrix.identity, pix); lists.get(a.page).run(dev, M); dev.close();
      if (a.raw) {  // raw RGBA pixels: no PNG compression and decompression, so it is faster
        const px = pix.getPixels(); const out = new Uint8ClampedArray(px.length); out.set(px);
        self.postMessage({ id, ok: true, res: { w: pix.getWidth(), h: pix.getHeight(), data: out } }, [out.buffer]); return;
      }
      res = pix.asPNG();
    }
    self.postMessage({ id, ok: true, res });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message || err) });
  }
};
