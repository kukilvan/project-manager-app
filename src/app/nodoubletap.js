// Stops a double tap from zooming the screen on iPhone (app opened from the home-screen icon).
// CSS `touch-action` alone is not enough for text windows, so a second tap that follows the first at once is intercepted:
// no zoom happens, but the button press still fires (e.g. the quick digits «11» on the keyboard).
const GAP = 350;   // ms between taps
export function initNoDoubleTap() {
  let last = 0;
  document.addEventListener('touchend', (e) => {
    const t = e.target; const now = Date.now();
    if (!(t instanceof Element) || t.closest('input, textarea, select, [contenteditable], canvas, a[href]')) { last = 0; return; }   // input fields and the drawing handle taps themselves
    const dbl = now - last < GAP && e.changedTouches.length === 1 && e.touches.length === 0;
    last = now;
    if (!dbl) return;
    e.preventDefault();   // without this iPhone zooms; the click is cancelled too, so we dispatch it ourselves (as for an ordinary tap)
    last = 0;
    t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY }));
  }, { passive: false });
}
