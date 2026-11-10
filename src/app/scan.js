// Barcode and QR scanner for a serial number / MAC: the live camera or a photo from the gallery.
// The library (zxing) is loaded only when the scanner is first opened; candidate values come from src/domain (`candidatesFor`).
import { h, openModal } from './ui.js';
import { candidatesFor, normalizeMac } from '../domain/index.js';

async function lib() {
  const [z, b] = await Promise.all([import('@zxing/library'), import('@zxing/browser')]);
  const hints = new Map();
  hints.set(z.DecodeHintType.TRY_HARDER, true);
  // only the formats serial numbers and MACs are printed in; extra formats give random «numbers» out of noise
  hints.set(z.DecodeHintType.POSSIBLE_FORMATS, [z.BarcodeFormat.QR_CODE, z.BarcodeFormat.CODE_128, z.BarcodeFormat.DATA_MATRIX]);
  return { z, b, hints };
}

// Read a code, paint it white and look for the next one: this finds both the barcode and the QR on one sticker
function decodeAll(c, reader, L, found) {
  const g = c.getContext('2d');
  for (let n = 0; n < 5; n += 1) {
    let res = null;
    for (const inv of [false, true]) {
      try {
        const src = new L.z.HTMLCanvasElementLuminanceSource(c);
        res = reader.decode(new L.z.BinaryBitmap(new L.z.HybridBinarizer(inv ? src.invert() : src))); break;
      } catch { res = null; }
    }
    if (!res) return;
    const t = res.getText(); if (t && !found.includes(t)) found.push(t);
    const pts = res.getResultPoints() || [];
    if (!pts.length) return;
    const xs = pts.map((q) => q.getX()); const ys = pts.map((q) => q.getY());
    const len = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    const pad = Math.max(12, len * 0.3);
    g.fillStyle = '#fff';
    g.fillRect(Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + 2 * pad, Math.max(...ys) - Math.min(...ys) + 2 * pad);
  }
}
const newReader = (L) => { const r = new L.z.MultiFormatReader(); r.setHints(L.hints); return r; };

// All codes in a photo: the whole image and by parts
async function decodePhoto(file, L) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Не удалось открыть фото')); i.src = url; });
    const scale = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
    const W = Math.round(img.naturalWidth * scale); const H = Math.round(img.naturalHeight * scale);
    const reader = newReader(L); const found = [];
    const tile = (x, y, w, hh) => {
      const c = document.createElement('canvas'); c.width = Math.round(w); c.height = Math.round(hh);
      c.getContext('2d').drawImage(img, x / scale, y / scale, w / scale, hh / scale, 0, 0, c.width, c.height);
      decodeAll(c, reader, L, found);
    };
    const tiles = [[0, 0, W, H], [0, 0, W / 2, H], [W / 2, 0, W / 2, H], [0, 0, W, H / 2], [0, H / 2, W, H / 2],
      [0, 0, W / 2, H / 2], [W / 2, 0, W / 2, H / 2], [0, H / 2, W / 2, H / 2], [W / 2, H / 2, W / 2, H / 2],
      [W / 4, H / 4, W / 2, H / 2]];
    for (const t of tiles) { tile(...t); await new Promise((r) => setTimeout(r, 0)); }
    return found;
  } finally { URL.revokeObjectURL(url); }
}

// kind: 'mac' | 'serial'; onPick(value) is called when a value is chosen
export function scanDevice({ kind, onPick, title }) {
  const texts = [];
  let controls = null; let closed = false;
  const status = h('div', { class: 'mut', style: { margin: '8px 0' } }, 'Запускаю камеру…');
  const list = h('div', {});
  const video = h('video', { playsinline: true, muted: true, autoplay: true, style: { width: '100%', maxHeight: '45vh', background: '#000', borderRadius: '10px', objectFit: 'cover' } });
  video.setAttribute('playsinline', ''); video.muted = true;
  const fileIn = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
  const pick = (value) => { stop(); close(); onPick(value); };
  const refresh = () => {
    const c = candidatesFor(kind, texts);
    list.replaceChildren(...c.map((x) => h('button', { type: 'button', class: x.sure ? '' : 'sec', style: { display: 'block', width: '100%', textAlign: 'start', margin: '6px 0' }, onclick: () => pick(x.value) },
      x.value, h('small', { style: { display: 'block', opacity: 0.7 } }, x.note))));
    return c;
  };
  const add = (t, live = false) => {
    if (!t || texts.includes(t)) return;
    texts.push(t);
    const c = refresh();
    status.textContent = `Считано кодов: ${texts.length}. Нажмите нужное значение${kind === 'mac' ? '' : ' (или наведите на другой код)'}.`;
    // serial number from the camera: a code like «GE4198747» is filled in at once, the rest is chosen by a tap
    if (live && kind === 'serial' && /^[A-Za-z0-9\-_.]{6,32}$/.test(t) && !normalizeMac(t)) { pick(t); return; }
    if (kind === 'mac' && c[0]?.sure && c.filter((x) => x.sure).length === 1) pick(c[0].value); // the MAC is found unambiguously
  };
  function stop() { try { controls?.stop(); } catch { /* already stopped */ } controls = null; }
  const photoBtn = h('button', { type: 'button', class: 'sec', onclick: () => fileIn.click() }, '🖼 Из фото');
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files?.[0]; if (!f) return;
    status.textContent = 'Ищу коды на фото…';
    try {
      const L = await lib(); const res = await decodePhoto(f, L);
      res.forEach(add);
      if (!res.length) status.textContent = 'На фото код не найден. Снимите ближе и ровнее или введите вручную.';
    } catch (e) { status.textContent = String(e.message || e); }
    fileIn.value = '';
  });
  const close = openModal(title || (kind === 'mac' ? 'Сканировать MAC' : 'Сканировать серийный номер'),
    h('div', {}, video, status, list, h('div', { class: 'btns' }, photoBtn, h('button', { type: 'button', class: 'sec', onclick: () => { stop(); close(); } }, 'Закрыть')), fileIn),
    { onClose: () => { closed = true; stop(); } });
  (async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Камера недоступна. Используйте «Из фото» или введите вручную.');
      const L = await lib();
      if (closed) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
      if (closed) { stream.getTracks().forEach((t) => t.stop()); return; }
      video.srcObject = stream; await video.play().catch(() => {});
      try { await stream.getVideoTracks()[0].applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch { /* not supported */ }
      const reader = newReader(L); const cv = document.createElement('canvas'); let busy = false; let frame = 0; const votes = new Map();
      const timer = setInterval(() => {
        if (busy || closed || !video.videoWidth) return;
        busy = true;
        try {
          const k = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
          cv.width = Math.round(video.videoWidth * k); cv.height = Math.round(video.videoHeight * k);
          cv.getContext('2d').drawImage(video, 0, 0, cv.width, cv.height);
          const found = []; decodeAll(cv, reader, L, found);
          // every second frame — the central part of the frame at full resolution (a small barcode reads better)
          frame += 1;
          if (frame % 2 === 0 || !found.length) {
            const cw = Math.round(video.videoWidth * 0.6); const ch = Math.round(video.videoHeight * 0.6);
            const k2 = Math.min(1, 1600 / Math.max(cw, ch)); cv.width = Math.round(cw * k2); cv.height = Math.round(ch * k2);
            cv.getContext('2d').drawImage(video, (video.videoWidth - cw) / 2, (video.videoHeight - ch) / 2, cw, ch, 0, 0, cv.width, cv.height);
            decodeAll(cv, reader, L, found);
          }
          // accept a code only if it was read in two frames (protection against random reads)
          found.filter((t) => t.length >= 5).forEach((t) => { votes.set(t, (votes.get(t) || 0) + 1); if (votes.get(t) >= 2) add(t, true); });
        } finally { busy = false; }
      }, 350);
      controls = { stop: () => { clearInterval(timer); stream.getTracks().forEach((t) => t.stop()); video.srcObject = null; } };
      status.textContent = 'Наведите камеру на штрихкод или QR на наклейке.';
    } catch (e) {
      status.textContent = e?.name === 'NotAllowedError' ? 'Нет доступа к камере. Разрешите его в настройках или используйте «Из фото».'
        : e?.name === 'NotFoundError' ? 'Камера не найдена. Используйте «Из фото» или введите вручную.' : String(e.message || e);
    }
  })();
}
