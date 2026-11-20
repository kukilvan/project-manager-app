// The several-value point filter control: a button that opens a window with checkboxes, and the «✖ Сбросить фильтры» button (spec 7 § 1.7).
// The rules (ticking, group lines, special lines, «all ticked = off», button text) are the pure functions of src/domain/filters.js.
// The ticks are applied once, when the window closes by any way («Готово», ✕, a tap outside); `onChange` runs only when the stored set changed.
//
// - multiFilter({ title, allText, prefix, options, get, set, covering, missing, onChange }) → { el, refresh() }
//   options: () => [{ value, text, label?, count?, kind?, members? }]; get/set: the stored Set; covering: racks and types (D1);
//   missing: () => [{ value, text, label }] — ticked shared values not among the options (D2): shown greyed at the end, named last in the button.
// - resetButton({ active, onReset }) → { el, refresh() } — hidden while active() is false.
import { h, openModal } from '../ui.js';
import { tr } from '../../i18n/index.js';
import { toggleValue, tickAll, clearAll, normalize, isOff, buttonText, groupState } from '../../domain/filters.js';

const sameSet = (a, b) => a.size === b.size && [...a].every((v) => b.has(v));

export function multiFilter({ title, allText, prefix, options, get, set, covering = false, missing = () => [], onChange }) {
  const txt = h('span', { class: 'mf-txt' });
  const el = h('button', { type: 'button', class: 'sec mf', onclick: () => openWindow() }, txt, h('span', { class: 'mf-arrow', 'aria-hidden': 'true' }, '▾'));

  function refresh() {
    const opts = options(); const cur = get() || new Set(); const miss = missing();
    // names in the button are translated one by one (rule 12: a sentence from parts); the prefix pattern «Шкафы: {}» is translated by the layer
    const named = opts.map((o) => ({ ...o, label: tr(o.label || o.text) }));
    txt.textContent = buttonText({ set: cur, options: named, allText, prefix, missing: miss.map((m) => tr(m.label || m.text)), covering });
    el.classList.toggle('on', miss.length > 0 || !isOff(cur, opts, { covering }));
  }

  function openWindow() {
    const opts = options(); const miss = missing();
    const start = new Set(get() || []); let copy = new Set(start);
    const lines = [];   // [option, checkbox]
    const all = [...opts, ...miss.map((m) => ({ ...m, kind: 'missing' }))];
    const sync = () => lines.forEach(([o, cb]) => { cb.checked = o.kind === 'group' ? groupState(copy, o, opts) : copy.has(o.value); });
    // a missing value is a plain value of another screen: ticking it again unticks the modes, and ticking a mode unticks it (spec 7 § 1.3)
    const modes = opts.filter((o) => o.kind === 'mode').map((o) => o.value);
    const tap = (o) => {
      if (o.kind === 'missing') {
        if (copy.has(o.value)) copy.delete(o.value); else { copy.add(o.value); modes.forEach((v) => copy.delete(v)); }
      } else {
        copy = toggleValue(copy, o, opts);
        if (o.kind === 'mode' && copy.has(o.value)) miss.forEach((m) => copy.delete(m.value));
      }
      sync();
    };
    const rows = h('div', { class: 'mf-rows' }, all.map((o) => {
      if (o.kind === 'head') return h('div', { class: 'mf-head' }, o.text);
      const cb = h('input', { type: 'checkbox', onchange: () => tap(o) });
      lines.push([o, cb]);
      return h('label', { class: `mf-row ${o.kind || 'plain'}` }, cb, h('span', { class: 'mf-t' }, o.text),
        typeof o.count === 'number' ? h('span', { class: 'mf-n' }, String(o.count)) : null);
    }));
    sync();
    const apply = () => {
      if (sameSet(copy, start)) return;   // nothing changed in the window (also «Готово» twice)
      const next = normalize(copy, opts, { covering });
      if (sameSet(next, get() || new Set())) { refresh(); return; }
      set(next); refresh(); onChange?.();
    };
    const close = openModal(title, h('div', {},
      rows,
      h('div', { class: 'mf-actions' },
        h('button', { type: 'button', class: 'sec', onclick: () => { copy = tickAll(opts); sync(); } }, 'Отметить все'),
        h('button', { type: 'button', class: 'sec', onclick: () => { copy = clearAll(); sync(); } }, 'Снять все'),
        h('button', { type: 'button', class: 'mf-done', onclick: () => close() }, 'Готово'))), { onClose: apply });
  }

  refresh();
  return { el, refresh };
}

export function resetButton({ active, onReset }) {
  const el = h('button', { type: 'button', class: 'sec mf-reset', onclick: () => { onReset(); refresh(); } }, '✖ Сбросить фильтры');
  function refresh() { el.style.display = active() ? '' : 'none'; }
  refresh();
  return { el, refresh };
}
