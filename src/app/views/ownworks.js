// «Работы на точках» в окне «Изменить» (одна точка или группа — из «Точек», плана, шкафа): что требуется сейчас
// (от типа, устройств, кабелей) и свой набор поверх этого — добавить работу, убрать, изменить количество на точку
// или на каждый кабель точки (например, метаэм пас-дин: у двойного бакара 2, у одинарного 1).
import { h } from '../ui.js';
import { state } from '../store.js';
import { worksSummary, ownWorksPatch, tasksOf, compositionOf, ownWorksOf, OWN_STAGES } from '../../domain/index.js';

const CHIP = { 'Хивут': 'hiv', 'Установка': 'ins', 'Проверка': 'chk' };
const span = (min, max) => (min === max ? String(min) : `${min}–${max}`);
const qtyOf = (p, ctx, workId) => tasksOf(p, ctx).filter((t) => t.workId === workId).reduce((n, t) => n + t.qty, 0);

/**
 * Поле формы (formModal, type 'custom'). pointsOf(v) — точки, какими они будут после остальных изменений формы
 * (например, со сменой типа); sig(v) — от каких полей формы это зависит. get() → Map workId → изменение (см. ownWorksPatch).
 */
export function ownWorksField({ pointsOf, sig = () => '' }) {
  return {
    key: 'ownWorks', label: 'Работы на точках', type: 'custom',
    hint: 'Своё у точки поверх того, что приходит от типа, устройств и кабелей. Изменение применяется ко всем выбранным точкам; «на каждый кабель» — по числу кабелей каждой точки.',
    build: ({ values }) => {
      const changes = new Map(); const added = []; let sum = null; let last = null;
      const box = h('div', {});
      const ctx = () => state.ctx;
      // что получится у выбранных точек после изменения: «2» или «1–2»
      const after = (workId, ch) => {
        const qs = sum.points.map((p) => qtyOf({ ...p, ownWorks: ownWorksPatch(p, ctx(), new Map([[workId, ch]])) }, ctx(), workId));
        const on = qs.filter((q) => q > 0);
        if (!on.length) return 'не требуется';
        return `${span(Math.min(...on), Math.max(...on))} на точку${on.length < qs.length ? ` (у ${on.length} из ${qs.length})` : ''}`;
      };
      const paint = () => {
        const n = sum.points.length; const one = n === 1;
        const rows = [...sum.rows, ...added.filter((a) => !sum.rows.some((r) => r.workId === a.workId))];
        const card = (r) => {
          const ch = changes.get(r.workId);
          const now = r.have ? `${one ? 'сейчас' : `у ${r.have} из ${n} точек`}: ${one ? '' : 'по '}${span(r.min, r.max)}` : 'сейчас нет';
          const ownTxt = r.own ? ` · своё${one ? '' : ` у ${r.own}`}${r.perCable ? ' (на кабель)' : ''}${r.removed ? `, убрано${one ? '' : ` у ${r.removed}`}` : ''}` : ' · по составу';
          const qty = h('input', { type: 'text', inputMode: 'numeric', class: 'qty', placeholder: 'кол.', style: { width: '56px', textAlign: 'center' },
            value: ch?.op === 'set' ? String(ch.qty) : '' });
          const per = h('select', { style: { flex: 1, minWidth: 0 } }, h('option', { value: 'point' }, 'на точку'), h('option', { value: 'cable' }, 'на каждый кабель'));
          per.value = ch?.op === 'set' ? ch.per : (r.perCable && r.perCable === r.own ? 'cable' : 'point');
          const res = h('div', { class: 'mut', style: { fontSize: '13px', marginTop: '4px' } });
          const showRes = () => {
            const c = changes.get(r.workId);
            res.textContent = c ? `→ будет: ${c.op === 'reset' ? `как по составу — ${after(r.workId, c)}` : c.op === 'remove' ? 'убрана у точек' : after(r.workId, c)}` : '';
            res.style.color = c ? 'var(--warn)' : '';
          };
          const setQty = () => {
            const t = qty.value.trim().replace(',', '.');
            if (t === '') changes.delete(r.workId); else if (Number(t) >= 0) changes.set(r.workId, { op: 'set', qty: Number(t), per: per.value });
            showRes();
          };
          qty.oninput = setQty; per.onchange = () => { if (qty.value.trim() === '') qty.value = '1'; setQty(); };
          const del = h('button', { type: 'button', class: 'sec', style: { padding: '6px 10px', flex: 'none' }, title: 'Убрать работу у точек',
            onclick: () => { qty.value = ''; changes.set(r.workId, { op: 'remove' }); showRes(); } }, '✖');
          const back = r.own ? h('button', { type: 'button', class: 'sec', style: { padding: '6px 10px', flex: 'none' }, title: 'Как по составу',
            onclick: () => { qty.value = ''; changes.set(r.workId, { op: 'reset' }); showRes(); } }, '↩︎') : null;
          showRes();
          return h('div', { 'data-work': r.workId, style: { padding: '8px 2px', borderBottom: '1px solid rgba(128,128,128,.15)' } },
            h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
              h('b', { style: { flex: 1, fontSize: '14px' } }, r.name), h('span', { class: `chip ${CHIP[r.workType] || ''}` }, r.workType)),
            h('div', { class: 'mut', style: { fontSize: '13px' } }, now + ownTxt),
            h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px' } }, qty, per, del, back), res);
        };
        const free = [...ctx().catalog.values()].filter((w) => OWN_STAGES.includes(w.workType) && w.active !== false && !rows.some((r) => r.workId === w.id))
          .sort((a, b) => OWN_STAGES.indexOf(a.workType) - OWN_STAGES.indexOf(b.workType) || a.name.localeCompare(b.name, 'ru'));
        const addSel = h('select', { onchange: () => {
          const w = ctx().catalog.get(addSel.value); if (!w) return;
          added.push({ workId: w.id, name: w.name, workType: w.workType, have: 0, min: 0, max: 0, own: 0, perCable: 0, removed: 0 });
          changes.set(w.id, { op: 'set', qty: 1, per: 'point' }); paint();
        } }, h('option', { value: '' }, '➕ Добавить работу…'), ...free.map((w) => h('option', { value: w.id }, `${w.name} · ${w.workType}`)));
        box.replaceChildren(...[
          !n ? h('div', { class: 'mut' }, 'У выбранных точек тип без состава (старая схема) — своего набора работ у них нет.') : null,
          sum.skipped.length && n ? h('div', { class: 'l-warn', style: { fontSize: '13px' } }, `Не изменятся точки с типом без состава: ${sum.skipped.length}`) : null,
          ...(n ? rows.map(card) : []),
          n ? addSel : null].filter(Boolean));
      };
      return {
        el: box,
        // после остальных полей формы (состав точки загружается в том же обновлении) — по свежим значениям
        update: () => queueMicrotask(() => { const v = values(); const s = JSON.stringify(sig(v)); if (s === last) return; last = s; sum = worksSummary(pointsOf(v), ctx()); paint(); }),
        get: () => changes,
      };
    },
  };
}

/** Что записать в точку p (в виде после остальных изменений формы): undefined — не менять */
export function ownWorksData(p, changes) {
  if (!changes?.size || !state.ctx || !compositionOf(p, state.ctx)) return undefined;
  return ownWorksPatch(p, state.ctx, changes);
}
/** Свой набор работ точки одной строкой (для карточки точки): «Метаэм: 1 на кабель; Установка камеры: убрана» */
export function ownWorksText(p) {
  const ctx = state.ctx; if (!ctx || !compositionOf(p, ctx)) return '';
  return ownWorksOf(p).filter((o) => ctx.catalog.has(o.workId)).map((o) => `${ctx.catalog.get(o.workId).name}: ${!(Number(o.qty) > 0) ? 'убрана' : `${o.qty}${o.per === 'cable' ? ' на кабель' : ' на точку'}`}`).join('; ');
}
