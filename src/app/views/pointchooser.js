// Dialog to choose a point of the project: search, several-value type and rack filters, «only without a place on the drawing» and a reset button; on choice it calls onPick(point, { rename }).
// Reads points from state.ctx; drawingFor (src/app/drawings.js) tells whether a point is already on a drawing, typegroups.js builds the type options, src/domain/filters.js holds the matching.
import { h, openModal } from '../ui.js';
import { state } from '../store.js';
import { comparePoints, latinKey } from '../../domain/index.js';
import { drawingFor } from '../drawings.js';
import { typeOptions } from '../typegroups.js';
import { rackMatch, typeSetMatch, rackOptions, normalize } from '../../domain/filters.js';
import { multiFilter, resetButton } from './multifilter.js';

// onPickMany(points) — several points can be chosen for one mark on the plan (a double icon etc.)
export function choosePoint({ title, typeId = '', exclude = null, renameLabel = '', onPick, onPickMany = null }) {
  const all = [...state.ctx.points.values()].filter((p) => p.id !== exclude);
  const q = h('input', { type: 'search', placeholder: 'Поиск по названию', style: { flex: 1, minWidth: '120px' } });
  // types and racks: several values; the call may open with one type ticked (a full set counts as off, D1)
  const typeN = new Map(); all.forEach((p) => typeN.set(p.typeId, (typeN.get(p.typeId) || 0) + 1));
  const typeOpts = typeOptions([...typeN.keys()], (t) => typeN.get(t));
  const cabOpts = rackOptions(all);
  let fType = normalize(new Set(typeId && typeN.has(typeId) ? [typeId] : []), typeOpts, { covering: true }); let fCab = new Set();
  const noPos = h('input', { type: 'checkbox', checked: true });
  const ren = renameLabel ? h('input', { type: 'checkbox', checked: false }) : null;
  const multi = onPickMany ? h('input', { type: 'checkbox', checked: false }) : null;
  const picked = new Map();
  const goMany = h('button', { style: { display: 'none' }, onclick: async () => { if (!picked.size) return; if ((await onPickMany([...picked.values()].sort(comparePoints))) !== false) c(); } });
  const updGo = () => { goMany.style.display = multi?.checked ? '' : 'none'; goMany.disabled = !picked.size; goMany.textContent = `🔗 Привязать выбранные (${picked.size})${picked.size ? `: ${[...picked.values()].sort(comparePoints).map((p) => p.label).join(', ')}` : ''}`; };
  const listEl = h('div', { class: 'card', style: { padding: 0, maxHeight: '45vh', overflow: 'auto' } });
  const fill = () => {
    const s = q.value.trim().toLowerCase();
    reset.refresh();
    const rows = all.filter((p) => (!s || latinKey(`${p.label} ${p.planName || ''}`).includes(latinKey(s))) && typeSetMatch(fType, p) && rackMatch(fCab, p) && (!noPos.checked || !drawingFor(p)))
      .sort(comparePoints).slice(0, 200);
    listEl.replaceChildren(...(rows.length ? rows.map((p) => { const cb = multi?.checked ? h('input', { type: 'checkbox', checked: picked.has(p.id), style: { width: '22px', height: '22px', flex: 'none' } }) : null; return h('div', { class: 'item', onclick: async () => {
      if (cb) { if (picked.has(p.id)) picked.delete(p.id); else picked.set(p.id, p); cb.checked = picked.has(p.id); updGo(); return; }
      if ((await onPick(p, { rename: !!ren?.checked })) !== false) c(); } }, cb,
      h('div', { class: 'name' }, p.label, h('div', { class: 'sub' }, `${p.typeId}${p.cabinet ? ` · шкаф ${p.cabinet}` : ''}${drawingFor(p) ? ' · уже на чертеже' : ''}`))); }) : [h('div', { class: 'empty' }, 'Ничего не найдено')]));
  };
  const typeF = multiFilter({ title: 'Типы', allText: 'Все типы', prefix: 'Типы', options: () => typeOpts, covering: true, get: () => fType, set: (v) => { fType = v; }, onChange: fill });
  const cabF = cabOpts.some((o) => o.value !== '__none')
    ? multiFilter({ title: 'Шкафы', allText: 'Все шкафы', prefix: 'Шкафы', options: () => cabOpts, covering: true, get: () => fCab, set: (v) => { fCab = v; }, onChange: fill }) : null;
  // reset: clears the search and both sets and ticks «only without a place» again, as when the dialog opens
  const reset = resetButton({ active: () => !!(q.value.trim() || fType.size || fCab.size || !noPos.checked), onReset: () => {
    q.value = ''; fType = new Set(); fCab = new Set(); noPos.checked = true; typeF.refresh(); cabF?.refresh(); fill();
  } });
  [q, noPos].forEach((el) => el.addEventListener('input', fill));
  multi?.addEventListener('change', () => { if (ren) { ren.checked = false; ren.disabled = multi.checked; } fill(); updGo(); });
  const c = openModal(title, h('div', {},
    h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, q, typeF.el, cabF?.el),
    h('label', { class: 'pickrow' }, noPos, h('span', {}, 'Только точки без места на чертеже')),
    reset.el,
    ren ? h('label', { class: 'pickrow' }, ren, h('span', {}, `Переименовать выбранную точку в «${renameLabel}» (как на чертеже)`)) : null,
    multi ? h('label', { class: 'pickrow' }, multi, h('span', {}, '☑ Несколько точек на эту отметку (например, двойной значок)')) : null,
    listEl, onPickMany ? h('div', { class: 'btns' }, goMany) : null), { sticky: true });
  fill();
  return c;
}
