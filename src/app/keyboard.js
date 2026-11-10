// Keeps input windows visible above the iPhone on-screen keyboard, which covers the page instead of shrinking it.
// Watches the visible area (visualViewport): while the keyboard is open, windows are fitted to the visible part
// and the focused field is scrolled to the centre. Called once from main.js.
const vv = window.visualViewport;
const root = document.documentElement;
const isField = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') && el.type !== 'checkbox' && el.type !== 'radio' && el.type !== 'button';

function update() {
  if (!vv) return;
  const open = window.innerHeight - vv.height > 120; // the keyboard takes more than 120 px
  root.classList.toggle('kb', open);
  root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
  root.style.setProperty('--vvt', `${Math.round(vv.offsetTop)}px`);
}
const reveal = (el) => { try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch { /* old browser */ } };

export function initKeyboard() {
  if (!vv) return;
  vv.addEventListener('resize', update); vv.addEventListener('scroll', update);
  window.addEventListener('orientationchange', () => setTimeout(update, 300));
  document.addEventListener('focusin', (e) => {
    if (!isField(e.target)) return;
    // the keyboard slides in with a delay, so scroll several times
    [60, 350, 700].forEach((t) => setTimeout(() => { update(); if (document.activeElement === e.target) reveal(e.target); }, t));
  });
  document.addEventListener('focusout', () => setTimeout(update, 150));
  update();
}
