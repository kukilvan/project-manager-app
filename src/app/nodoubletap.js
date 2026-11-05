// Двойное касание не должно увеличивать экран (iPhone, приложение со значка «Домой»).
// Одного CSS (touch-action) для окон с текстом мало, поэтому второе касание, пришедшее сразу за первым, перехватывается:
// увеличение не происходит, а нажатие на кнопку (быстрые цифры «11» на клавиатуре) всё равно срабатывает.
const GAP = 350;   // мс между касаниями
export function initNoDoubleTap() {
  let last = 0;
  document.addEventListener('touchend', (e) => {
    const t = e.target; const now = Date.now();
    if (!(t instanceof Element) || t.closest('input, textarea, select, [contenteditable], canvas, a[href]')) { last = 0; return; }   // поля ввода и чертёж управляют касаниями сами
    const dbl = now - last < GAP && e.changedTouches.length === 1 && e.touches.length === 0;
    last = now;
    if (!dbl) return;
    e.preventDefault();   // без этого iPhone увеличивает; заодно отменяется «щелчок», поэтому делаем его сами (как при обычном касании)
    last = 0;
    t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY }));
  }, { passive: false });
}
