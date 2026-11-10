// Dialogs «🔀 Одинаковые точки» (point merge) and «🔌 Кабели не по номеру»: merge a point recorded two ways, and fix cable counts that do not follow the label.
// The same point can be recorded as a double «FC/B05-06» and as singles «FC/B05» + «FC/B06». The user picks which form to keep; works (daily report entries, journal rows, pulls, meters) move to the kept point,
// and the extra points are removed (they can be restored through the history). What does not match is shown before merging:
// the quantity in the report (kept as it was by default), a work the kept point does not have, different meters.
// Logic comes from src/domain/merge.js (findSameGroups, previewMerge, mergeOps, cablesMismatch); everything is written through repo.save.
import { h, openModal, toast, confirmDialog } from '../ui.js';
import { state, getRepo, currentProject } from '../store.js';
import { findSameGroups, previewMerge, mergeOps, cablesMismatch } from '../../domain/merge.js';
import { cableListOf } from '../../domain/points.js';
import { info } from '../../log.js';

const liveOf = (c) => (state.data[c] || []).filter((x) => !x.deleted);
export const sameGroups = () => (state.ctx ? findSameGroups([...state.ctx.points.values()]) : []);

export function mergeModal({ onDone } = {}) {
  const groups = sameGroups();
  if (!groups.length) { toast('Одинаковых точек в разном виде не найдено'); return; }
  const data = { entries: liveOf('entries'), journal: liveOf('journal'), pulls: liveOf('pulls') };
  const ctx = state.ctx;
  let mode = 'double';
  const rows = groups.map((g) => ({ g, on: true, pv: null }));
  const calc = () => rows.forEach((r) => { r.pv = previewMerge(r.g, mode, data, ctx); });
  const list = h('div', {});
  const go = h('button', {});
  const unit = (x) => (x.workType === 'Протяжка' ? 'каб.' : 'шт');
  const paint = () => {
    calc();
    const card = (r) => {
      const { g, pv } = r;
      const ask = pv.entries.filter((x) => x.before !== x.after || x.unexpected);
      const cb = h('input', { type: 'checkbox', checked: r.on, onchange: (e) => { r.on = e.target.checked; r.off = !r.on; upd(); } });
      // there is no double point (the singles stand in a row on one mark): the first single will become the double
      const keepTxt = !g.double ? g.newLabel : mode === 'double' ? g.double.label : g.singles.map((s) => s.label).join(' + ');
      const goneTxt = !g.double ? `${g.singles.map((s) => s.label).join(' + ')} (станет двойной)` : mode === 'double' ? g.singles.map((s) => s.label).join(' + ') : g.double.label;
      return h('div', { class: 'card', style: { margin: '6px 0', padding: '8px' } },
        h('label', { class: 'pickrow', style: { margin: 0 } }, cb, h('span', {}, h('b', {}, keepTxt), h('span', { class: 'mut' }, ` ← ${goneTxt}`))),
        h('div', { class: 'mut', style: { fontSize: '13px' } }, pv.entries.length ? `Работ перейдёт: ${pv.entries.filter((x) => x.transfer).length}` : 'Работ нет'),
        ...ask.map((x) => h('div', { style: { margin: '6px 0 0', fontSize: '14px' } },
          h('div', {}, `${x.date ? `${x.date.split('-').reverse().join('.')} ` : ''}${x.name}: было ${x.before} ${unit(x)}, у ${mode === 'double' ? 'двойной' : 'одинарных'} будет ${x.after} ${unit(x)}${x.unexpected ? ' · этой работы нет в списке работ точки' : ''}`),
          x.unexpected ? h('label', { class: 'pickrow', style: { margin: '2px 0' } }, h('input', { type: 'checkbox', checked: x.transfer, onchange: (e) => { x.transfer = e.target.checked; } }), h('span', {}, 'Перенести эту работу')) : null,
          x.before !== x.after && mode === 'double' ? h('label', { class: 'pickrow', style: { margin: '2px 0' } }, h('input', { type: 'checkbox', checked: x.keepCount, onchange: (e) => { x.keepCount = e.target.checked; } }), h('span', {}, `Сохранить в отчёте как было (${x.before} ${unit(x)})`)) : null)),
        ...pv.notes.map((n) => h('div', { class: 'mut', style: { fontSize: '13px', marginTop: '4px' } }, `• ${n}`)));
    };
    // «keep singles»: groups without a double point have nothing to do (they are singles already)
    const act = rows.filter((r) => mode === 'double' || r.g.double);
    rows.forEach((r) => { if (!act.includes(r)) r.on = false; else if (r.off === undefined) r.on = true; });
    const withQ = act.filter((r) => r.pv.entries.some((x) => x.before !== x.after || x.unexpected) || r.pv.notes.length);
    const noQ = act.filter((r) => !withQ.includes(r));
    list.replaceChildren(...[
      withQ.length ? h('div', { class: 'group', style: { margin: '10px 2px 4px' } }, `С вопросами: ${withQ.length}`) : null,
      ...withQ.map(card),
      noQ.length ? h('details', { style: { margin: '8px 0' } }, h('summary', {}, `Без вопросов: ${noQ.length} (работы перейдут как есть)`), ...noQ.map(card)) : null].filter(Boolean));
    upd();
  };
  const upd = () => { const n = rows.filter((r) => r.on).length; go.textContent = `🔀 Объединить (${n})`; go.disabled = !n; };
  const modeSel = h('select', { onchange: (e) => { mode = e.target.value; paint(); } },
    h('option', { value: 'double' }, 'Двойные (FC/B05-06)'),
    h('option', { value: 'singles' }, 'Одинарные (FC/B05 + FC/B06)'));
  go.onclick = async () => {
    const chosen = rows.filter((r) => r.on); if (!chosen.length) return;
    const removeN = chosen.reduce((n, r) => n + r.pv.removed.length, 0);
    if (!(await confirmDialog(`Объединить ${chosen.length} точек? Работы перейдут на оставляемые точки, лишние точки (${removeN}) будут убраны — вернуть можно через «История и откат».`, { yes: 'Объединить' }))) return;
    const repo = getRepo(); const pid = currentProject().id; const now = Date.now(); const all = [];
    let moved = 0;
    for (const r of chosen) {
      const { ops, remove } = mergeOps(r.g, mode, r.pv, data, ctx);
      moved += r.pv.entries.filter((x) => x.transfer).length;
      all.push(...ops, ...remove.map((x) => ({ coll: x.coll, id: x.id, action: 'delete', data: { deleted: true, deletedAt: now, deletedBy: repo.by.uid, deletedByName: repo.by.name } })));
    }
    repo.save(pid, all);
    info(`Объединение одинаковых точек: ${chosen.length} (${mode === 'double' ? 'оставлены двойные' : 'оставлены одинарные'}), работ перенесено ${moved}, записей ${all.length}`);
    toast(`Объединено: ${chosen.length}, работ перенесено: ${moved}`);
    close(); onDone?.();
  };
  paint();
  const close = openModal('🔀 Одинаковые точки в разном виде', h('div', {},
    h('div', { class: 'mut' }, 'Одна и та же точка записана в проекте по-разному: двойной (FC/B05-06) и одинарными (FC/B05 + FC/B06) — например, старый разбор тохнита делил двойные на одинарные. Выберите, какой вид оставить: работы перейдут на оставляемые точки, лишние точки уберутся.'),
    h('label', { class: 'field' }, h('span', {}, 'Какой вид оставить'), modeSel),
    list, h('div', { class: 'btns' }, go, h('button', { class: 'sec', onclick: () => close() }, 'Отмена'))), { sticky: true });
}

// «🔌 Кабели не по номеру»: a single network point has 1 cable, a double one 2…; for points without an own value the cable count
// was taken from the type (2 for a «бакар»), so singles counted as doubles. Own values (exceptions) are left alone.
export const cablesToFix = () => (state.ctx ? cablesMismatch([...state.ctx.points.values()], state.ctx) : []);
export function cablesFixModal({ onDone } = {}) {
  const list = cablesToFix(); if (!list.length) { toast('Все точки с кабелями по номеру'); return; }
  const ctx = state.ctx;
  const now = (p) => cableListOf(p, ctx).map((c) => `${c.cable}×${c.count}`).join(' + ');
  const ids = new Set(list.map((x) => x.p.id));
  const touched = liveOf('entries').filter((e) => e.workType === 'Протяжка' && (e.pointIds || []).some((id) => ids.has(id)));
  const rows = list.map((x) => ({ ...x, on: true })).sort((a, b) => a.p.label.localeCompare(b.p.label, undefined, { numeric: true }));
  const go = h('button', { onclick: async () => {
    const chosen = rows.filter((r) => r.on); if (!chosen.length) return;
    getRepo().save(currentProject().id, chosen.map((r) => ({ coll: 'points', id: r.p.id, data: { cableOverride: r.want } })));
    info(`Кабели по номеру: исправлено ${chosen.length}`); toast(`Исправлено точек: ${chosen.length}`); c(); onDone?.();
  } }, `🔌 Исправить (${rows.length})`);
  const c = openModal('🔌 Кабели не по номеру точки', h('div', {},
    h('div', { class: 'mut' }, 'Одинарная точка — 1 кабель, двойная (B05-06) — 2, тройная — 3. У этих точек своего числа кабелей нет, и оно взято по типу. Точки, где число кабелей задано вручную (исключения), здесь не показываются.'),
    touched.length ? h('div', { class: 'l-warn', style: { margin: '6px 0' } }, `В отчётах протяжки изменится число кабелей и метраж у записей: ${touched.length}.`) : null,
    ...rows.map((r) => h('label', { class: 'pickrow', style: { margin: '4px 0' } }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { r.on = e.target.checked; go.textContent = `🔌 Исправить (${rows.filter((x) => x.on).length})`; } }),
      h('span', {}, h('b', {}, r.p.label), ` — ${now(r.p)} → ${r.want.map((w) => `${w.cable}×${w.count}`).join(' + ')}`))),
    h('div', { class: 'btns' }, go, h('button', { class: 'sec', onclick: () => c() }, 'Отмена'))), { sticky: true });
}
