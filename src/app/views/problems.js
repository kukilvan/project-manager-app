// Problems on points (ADR 0017): the «Проблемы» reference screen and its form, the «⚠ Проблема» and «✔ Решено» forms for selected points, and the «Проблемы» block of the point card.
// The list lives in the shared pool `pool_problems` (written with repo.savePool; only the pool administrator deletes), marks in the project subcollection
// `problemMarks` (written with repo.save). Fit, labels and write operations come from src/domain/problems.js; the selection bars of «Точки», the plan and the rack screen use problemButtons().
//
// Contents:
// - problemsRefView() — the reference screen: rows with «N открыто», «➕ Добавить проблему»; problemForm() — add and edit one problem
// - markForm(ids, done) — «⚠ Проблема» for one or several points; solveForm(ids, done) — «✔ Решено» for several points
// - problemButtons(ids, done) — the two buttons of a selection bar
// - problemsBlock(point) — the block of the point card: open marks in red with «✔ Решено», solved ones in grey, «⚠ Проблема»
import { h, openModal, formModal, confirmDialog, messageDialog, toast } from '../ui.js';
import { state, getRepo, currentProject } from '../store.js';
import { newId } from '../repo.js';
import { isPoolAdmin } from '../pool.js';
import { lang } from '../../i18n/index.js';
import {
  liveProblems, problemsForPoints, openProblemsOf, marksOf, markOps, solveOps, problemName, descText, markName, markDesc,
  problemCounts, hasCyrillic, isOpenMark, isSystemType, nameEnPatch,
} from '../../domain/index.js';

// Names and descriptions in the UI language (Hebrew UI — Hebrew, otherwise Russian)
const L = () => (lang() === 'he' ? 'he' : 'ru');
const ctx = () => state.ctx;
const pointsOf = (ids) => ids.map((id) => ctx().points.get(id)).filter(Boolean);
const two = (n) => String(n).padStart(2, '0');
const when = (ms, withTime) => { if (!ms) return ''; const d = new Date(ms); return `${two(d.getDate())}.${two(d.getMonth() + 1)}${withTime ? ` ${two(d.getHours())}:${two(d.getMinutes())}` : ''}`; };
const EMPTY_LIST = 'Список проблем пуст. Добавьте их: Ещё → Выпадающие списки → «Проблемы».';

// ---- the reference screen ----
export function problemsRefView() {
  const c = ctx(); const counts = problemCounts([...c.points.values()], c).byProblem;
  const typesText = (pr) => ((pr.types || []).length ? pr.types.join(', ') : 'все типы');
  const rows = liveProblems(c).map((pr) => h('div', { class: 'item', onclick: () => problemForm(pr) },
    h('div', { class: 'name' }, `${problemName(pr, L())} · ${typesText(pr)}`, h('div', { class: 'sub' }, pr.nameHe || '—')),
    counts.get(pr.id) ? h('span', { class: 'pill st-bad' }, `${counts.get(pr.id)} открыто`) : null));
  return h('div', {},
    h('div', { class: 'mut', style: { marginBottom: '6px' } }, '🔗 Общий список для всех проектов этой базы. Удаляет только администратор.'),
    h('div', { class: 'mut', style: { marginBottom: '10px' } }, 'Конкретная неполадка на точке, например «не просверлены двери». Отмечается кнопкой «⚠ Проблема» у выбранных точек.'),
    h('div', { class: 'btns', style: { marginTop: 0 } }, h('button', { onclick: () => problemForm(null) }, '➕ Добавить проблему')),
    h('div', { class: 'card', style: { padding: 0, marginTop: '12px' } }, rows.length ? rows : h('div', { class: 'empty' }, 'Список пуст.')));
}

// Type ticks: the type ids of the current project, the group names of its types and what the problem already lists (even if this project lacks it)
function typeTicks(current) {
  const types = [...ctx().types.values()].filter((t) => !isSystemType(t));
  const ids = new Set(types.map((t) => t.id));
  const groups = new Set(types.map((t) => String(t.group || '').trim()).filter(Boolean));
  const all = [...new Set([...ids, ...groups, ...(current || [])])].sort((a, b) => a.localeCompare(b, 'ru'));
  const boxes = new Map();
  const el = h('div', { class: 'picklist', style: { maxHeight: '220px' } }, all.length ? all.map((v) => {
    const cb = h('input', { type: 'checkbox', checked: (current || []).includes(v) }); boxes.set(v, cb);
    return h('label', { class: 'pickrow' }, cb, h('span', {}, v, groups.has(v) && !ids.has(v) ? h('small', { class: 'mut' }, ' · группа типов') : null));
  }) : h('div', { class: 'empty' }, 'Список пуст.'));
  return { el, get: () => all.filter((v) => boxes.get(v).checked) };
}

// Ready descriptions: one row per live description (both texts editable, ✕ marks it deleted — marks that use it keep its text) and «➕ Добавить описание»
function descRows(current) {
  const rows = (current || []).map((d) => ({ ...d }));
  const box = h('div', {});
  const draw = () => {
    box.replaceChildren(...rows.filter((r) => !r.deleted).map((r) => {
      const ru = h('input', { type: 'text', value: r.ru || '', placeholder: 'Описание (русский)', oninput: (e) => { r.ru = e.target.value; } });
      const he = h('input', { type: 'text', dir: 'rtl', value: r.he || '', placeholder: 'Описание (иврит)', oninput: (e) => { r.he = e.target.value; } });
      return h('div', { class: 'qtyrow', style: { alignItems: 'center' } }, h('div', { style: { flex: 1, minWidth: 0, display: 'grid', gap: '4px' } }, ru, he),
        h('button', { type: 'button', class: 'sec x', onclick: () => { if (r.id) r.deleted = true; else rows.splice(rows.indexOf(r), 1); draw(); } }, '✕'));
    }), h('div', { class: 'btns', style: { marginTop: '4px' } }, h('button', { type: 'button', class: 'sec', onclick: () => { rows.push({ ru: '', he: '' }); draw(); } }, '➕ Добавить описание')));
  };
  draw();
  // → the list to save, or null when a row has only one of the two texts; a row emptied completely is dropped (an old one is marked deleted)
  const get = () => {
    const out = [];
    for (const r of rows) {
      const ru = String(r.ru || '').trim(); const he = String(r.he || '').trim();
      if (r.deleted) { if (r.id) out.push({ id: r.id, ru: r.ru || '', he: r.he || '', deleted: true }); continue; }
      if (!ru && !he) { if (r.id) out.push({ id: r.id, ru: r.ru || '', he: r.he || '', deleted: true }); continue; }
      if (!ru || !he) return null;
      out.push({ id: r.id || `d_${newId(6)}`, ru, he });
    }
    return out;
  };
  return { el: box, get };
}

export function problemForm(existing) {
  const repo = getRepo();
  let ticks; let descs;
  formModal({
    title: existing ? problemName(existing, L()) : 'Новая проблема',
    values: existing || {},
    fields: [
      { key: 'name', label: 'Название' },
      { key: 'nameHe', label: 'Название на иврите' },
      { key: 'nameEn', label: 'Название (English)', hint: 'Необязательно. Если указано, в английском интерфейсе показывается оно.' },
      { key: 'types', label: 'Для типов точек (пусто — для всех)', type: 'custom', build: () => { ticks = typeTicks(existing?.types); return ticks; } },
      { key: 'descs', label: 'Готовые описания', type: 'custom', build: () => { descs = descRows(existing?.descs); return descs; } },
    ],
    extra: existing && isPoolAdmin() ? [{ label: 'Удалить', kind: 'danger', onClick: async () => {
      if (!(await confirmDialog(`Удалить проблему «${problemName(existing, L())}» из общего списка? Её нельзя будет выбрать для новых отметок. Отметки на точках останутся.`, { yes: 'Удалить', danger: true }))) return false;
      repo.savePool([{ coll: 'problems', id: existing.id, data: { deleted: true } }]); toast('Удалено из общего списка'); return true;
    } }] : [],
    onSubmit: (v) => {
      const name = String(v.name || '').trim(); const nameHe = String(v.nameHe || '').trim();
      if (!name || !nameHe) { toast('Впишите название на русском и на иврите'); return false; }
      const list = descs.get();
      if (!list) { toast('У описания нужны оба текста: русский и иврит'); return false; }
      const id = existing?.id || `pr_${newId(8)}`;
      repo.savePool([{ coll: 'problems', id, data: { name, nameHe, ...nameEnPatch(v.nameEn, existing), types: ticks.get(), descs: list, deleted: false } }]);
      toast('Сохранено в общем списке');
    },
  });
}

// ---- marking ----
const field = (label, input, hint, required) => h('label', { class: 'field' }, h('span', {}, label, required ? ' *' : ''), input, hint ? h('small', {}, hint) : null);

export function markForm(ids, done) {
  const c = ctx(); const pts = pointsOf(ids); if (!pts.length) return;
  if (!liveProblems(c).length) { messageDialog('⚠ Проблема', EMPTY_LIST); return; }
  const { list, partial } = problemsForPoints(pts, c);
  const prSel = h('select', {}, h('option', { value: '' }, '—'), ...list.map((pr) => h('option', { value: pr.id }, problemName(pr, L()))));
  if (list.length === 1) prSel.value = list[0].id;
  const OWN = '__own';
  const descSel = h('select', {});
  const own = h('input', { type: 'text', dir: 'rtl', autocomplete: 'off' });
  const ownRow = field('Своё описание', own, 'Только иврит — так попадёт в таблицу для руководства.');
  const fillDescs = () => {
    const pr = c.problems.get(prSel.value);
    descSel.replaceChildren(h('option', { value: '' }, '— без описания —'),
      ...(pr?.descs || []).filter((d) => !d.deleted).map((d) => h('option', { value: d.id }, descText(d, L()))),
      h('option', { value: OWN }, '✍️ Своё описание'));
    descSel.value = ''; showOwn();
  };
  const showOwn = () => { ownRow.style.display = descSel.value === OWN ? '' : 'none'; if (descSel.value === OWN) own.focus(); };
  prSel.onchange = fillDescs; descSel.onchange = showOwn;
  fillDescs();
  const save = () => {
    if (!prSel.value) { toast('Выберите проблему'); return; }
    let choice = { problemId: prSel.value };
    if (descSel.value === OWN) {
      const text = own.value.trim();
      if (!text) { toast('Впишите своё описание'); return; }
      if (hasCyrillic(text)) { toast('Своё описание пишется на иврите (без русских букв)'); return; }
      choice = { ...choice, text };
    } else if (descSel.value) choice = { ...choice, descId: descSel.value };
    const repo = getRepo();
    repo.save(currentProject().id, markOps(pts.map((p) => p.id), choice, repo.by, Date.now(), c));
    toast(`Проблема отмечена. Точек: ${pts.length}`);
    close(); done?.();
  };
  const close = openModal(pts.length === 1 ? `⚠ Проблема — ${pts[0].label}` : `⚠ Проблема — выбрано точек: ${pts.length}`, h('div', {},
    field('Проблема', prSel, partial ? 'Показаны проблемы, подходящие всем выбранным точкам.' : '', true),
    field('Описание', descSel), ownRow,
    h('div', { class: 'row' }, h('button', { class: 'grow', onclick: save }, 'Сохранить'))));
}

export function solveForm(ids, done) {
  const c = ctx(); const pts = pointsOf(ids);
  const counts = problemCounts(pts, c);
  if (!counts.points) { toast('У выбранных точек нет открытых проблем'); return; }
  const ALL = '__all';
  const opts = [...counts.byProblem.entries()].map(([id, n]) => ({ id, n, name: markName({ problemId: id }, c, L()) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const sel = h('select', {}, h('option', { value: ALL }, `Все открытые (${counts.points})`), ...opts.map((o) => h('option', { value: o.id }, `${o.name} (${o.n})`)));
  const close = openModal(`✔ Решено — выбрано точек: ${pts.length}`, h('div', {},
    field('Какая проблема решена', sel),
    h('div', { class: 'row' }, h('button', { class: 'grow', onclick: () => {
      const repo = getRepo();
      const ops = solveOps(pts.map((p) => p.id), sel.value === ALL ? null : sel.value, repo.by, Date.now(), c);
      if (ops.length) repo.save(currentProject().id, ops);
      toast(`Решено. Отметок: ${ops.length}`); close(); done?.();
    } }, '✔ Решено'))));
}

// The two buttons of a selection bar: «⚠ Проблема» (any selection) and «✔ Решено» (a selection with an open problem)
export function problemButtons(ids, done) {
  const anyOpen = pointsOf(ids).some((p) => openProblemsOf(p, ctx()).length);
  return [
    h('button', { class: 'sec', disabled: !ids.length, onclick: () => markForm(ids, done) }, '⚠ Проблема'),
    h('button', { class: 'sec', disabled: !anyOpen, onclick: () => solveForm(ids, done) }, '✔ Решено'),
  ];
}

// ---- the point card block ----
export function problemsBlock(point) {
  const c = ctx(); const open = openProblemsOf(point, c);
  const solved = marksOf(point, c).filter((m) => !isOpenMark(m));
  const row = (m, isOpen) => {
    const desc = markDesc(m, c, L());
    return h('div', { class: `prob${isOpen ? '' : ' solved'}` },
      h('div', { class: 'prob-text' }, h('b', {}, markName(m, c, L())), desc ? h('div', { dir: 'auto' }, desc) : null,
        h('div', { class: 'prob-sub' }, isOpen ? `отмечено: ${m.markedByName || '—'}, ${when(m.markedAt, true)}`
          : `отмечено: ${m.markedByName || '—'}, ${when(m.markedAt)} · решено: ${m.solvedByName || '—'}, ${when(m.solvedAt)}`)),
      isOpen ? h('button', { class: 'sec', onclick: () => {
        const repo = getRepo(); const ops = solveOps([point.id], m.problemId, repo.by, Date.now(), c);
        if (ops.length) repo.save(currentProject().id, ops);
        toast(`Решено. Отметок: ${ops.length}`);
      } }, '✔ Решено') : null);
  };
  return h('div', {},
    h('div', { class: 'group', style: { padding: '12px 0 6px' } }, 'Проблемы'),
    ...open.map((m) => row(m, true)), ...solved.map((m) => row(m, false)),
    h('div', { class: 'btns', style: { marginTop: '6px' } }, h('button', { class: 'sec', onclick: () => markForm([point.id]) }, '⚠ Проблема')));
}
