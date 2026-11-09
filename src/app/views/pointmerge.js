// «🔀 Одинаковые точки»: одна и та же точка записана по-разному — двойная «FC/B05-06» и одинарные «FC/B05» + «FC/B06».
// Человек выбирает, какой вид оставить; работы (записи дохa, журнал, протяжки, метраж) переходят на оставляемую точку,
// лишние точки убираются (их можно вернуть через историю). Что не сходится — показывается до объединения:
// количество в отчёте (по умолчанию сохраняется как было), работа, которой у оставляемой точки нет, разные метры.
import { h, openModal, toast, confirmDialog } from '../ui.js';
import { state, getRepo, currentProject } from '../store.js';
import { findSameGroups, previewMerge, mergeOps } from '../../domain/merge.js';
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
      // двойной точки нет (одинарные стоят на одной отметке подряд) — первая одинарная станет двойной
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
    // «оставлять одинарные» — группам без двойной точки делать нечего (они и так одинарные)
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
