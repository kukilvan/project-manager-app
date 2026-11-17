// «Отчёты» tab: working days, the entries of a day, the daily report text in Russian and Hebrew, copying, and the link to the iPhone Shortcuts command «Doh».
// Reads days, entries and the context from store.js and writes through repo.save; the report text, statuses and applicability of works come from src/domain; other views reuse its point picker and the «add work» helpers.
//
// Contents:
// - copyText(), shortcutUrl() — copy to the clipboard and the link to the iPhone Shortcuts command «Doh»
// - dayForm() — create and edit a day (one day per date, «🌴 Выходной» with a reason, a warning for a suspicious date)
// - todayBlocked() — the check of the recording paths: today is a day off (here or in another project) — a message and nothing is written
// - pointsPicker() — choose points with filters by rack and type
// - entryForm() — one entry (one work): works that fit the chosen points, devices, quantities, delay, saving as several entries
// - addWorkForPoints(), addWorkForPoint() — «add work to this point» as an entry of today
// - markShilutForPoints(), releasePorts() — «Шилют поклеен» in one tap and the release of ports when such an entry is deleted
// - syncJournal() — bring the journal rows of an entry in line with its points
// - batchForm() — several works at once for the same points
// - dayScreen(), dohView() — the screen of one day and the tab itself
import { lang as uiLang } from '../../i18n/index.js';
import { typeMatch, typeFilterOptions } from '../typegroups.js';
import { latinKey, choiceList } from '../../domain/index.js';
import { rackPortsOf, stuckPortsOf } from '../../domain/rack.js';
import { cfgMatch, cfgFilterOptions, cfgFilterValid } from '../cfgfilter.js';
import { h, formModal, openModal, confirmDialog, messageDialog, toast } from '../ui.js';
import { hint } from './guide.js';
import { state, getRepo, currentProject, pointsSorted, infoOf, allDays, liveProjects } from '../store.js';
import { newId } from '../repo.js';
import { DAY_OFF_REASONS, isDayOff, dayOffText, dayConflict, doh, entryLine, dateText, dayEntries, workFits, workUsesPoints, openTasksFor, pullGroups, devicesForWork, compositionOf, workApplicable } from '../../domain/index.js';

let openDayId = null;
const WORK_TYPES = ['Протяжка', 'Хивут', 'Установка', 'Проверка', 'Шилют', 'Перетяжка', 'Перенос', 'Доп. работа', 'Время', 'Текст'];
const blank = (v) => v === undefined || v === null || v === '';

export const todayIso = () => new Date().toLocaleDateString('sv'); // YYYY-MM-DD in local time

const daysSorted = () => [...state.ctx.days.values()].sort((a, b) =>
  (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt ?? 0) - (a.createdAt ?? 0)));

// ---------- copy and the link to the iPhone Shortcuts command «Doh» ----------
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* the fallback is below */ }
  const t = h('textarea', { value: text, style: { position: 'fixed', opacity: '0', top: '0' } });
  document.body.appendChild(t); t.select(); t.setSelectionRange(0, text.length);
  let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
  t.remove(); return ok;
}
export const shortcutUrl = (text) => `shortcuts://run-shortcut?name=Doh&input=text&text=${encodeURIComponent(text)}`;

// ---------- «Сегодня» ----------
export function openToday(ui) {
  const today = todayIso();
  const day = daysSorted().find((d) => d.date === today);
  if (ui) ui.go('doh');
  if (day) { openDayId = day.id; ui?.render(); return; }
  dayForm({ date: today }, ui);
}

// ---------- day form ----------
function bumpLastWork(date) {
  const p = currentProject(); const ms = Date.parse(date);
  if (p && ms && ms > (p.lastWorkDate || 0)) getRepo().saveProject(p.id, { lastWorkDate: ms });
}

// the message window of a clash with a day of another project (checks 4 and 5 of the day form, and the recording paths)
const showConflict = (c, date) => (c.kind === 'work'
  ? messageDialog('Нельзя сделать выходным', `${dateText(date)} уже есть рабочий день в проекте «${c.project.name}». Сначала удалите тот день или выберите другую дату.`)
  : messageDialog('Эта дата — выходной', `${dateText(date)} — выходной в проекте «${c.project.name}». Сначала снимите там «🌴 Выходной» или выберите другую дату.`));
const dayConflictFor = (date, projectId, dayId, off) => dayConflict(allDays(), liveProjects(), { date, projectId, dayId, off });

// Today is a day off — in this project, or (when today has no day yet) in another one: the work is not recorded
export function todayBlocked() {
  const p = currentProject(); const today = todayIso();
  const day = daysSorted().find((d) => d.date === today);
  if (day) {
    if (!isDayOff(day)) return false;
    messageDialog('🌴 Выходной', `Сегодня отмечен выходной (${dayOffText(day, 'ru')}). Чтобы записать работу, откройте «Отчёты» → сегодняшний день → «✏️ Изменить день» и выключите «🌴 Выходной».`);
    return true;
  }
  const c = dayConflictFor(today, p.id, null, false);
  if (c) { showConflict(c, today); return true; }
  return false;
}

function dayForm(day, ui) {
  const repo = getRepo(); const p = currentProject(); const isNew = !day.id; const wasOff = isDayOff(day);
  formModal({
    title: isNew ? 'Новый день' : 'День',
    submitLabel: 'Сохранить',
    fields: [
      { key: 'date', label: 'Дата', type: 'date', required: true },
      { key: 'off', label: '🌴 Выходной', type: 'checkbox' },
      { key: 'offReason', label: 'Причина выходного', type: 'select', visible: (v) => !!v.off,
        options: DAY_OFF_REASONS.map((r) => ({ value: r.id, label: r.ru })) },
      { key: 'offText', label: 'Своя причина', type: 'text', visible: (v) => !!v.off && v.offReason === 'other' },
      { key: 'helper', label: 'Помощник (пусто = сам)', type: 'text', placeholder: 'сам', visible: (v) => !v.off },
      { key: 'helperHe', label: 'Помощник на иврите', type: 'text', visible: (v) => !v.off },
      { key: 'object', label: 'Объект (для разового выезда)', type: 'text', visible: (v) => !!p.oneOff && !v.off },
      { key: 'comment', label: 'Комментарий в конце отчёта', type: 'textarea' },
    ],
    values: {
      date: day.date, comment: day.comment, object: day.object,
      off: wasOff, offReason: day.offReason, offText: day.offText,
      helper: day.helper === undefined ? p.helper : (day.helper === 'сам' ? '' : day.helper),
      helperHe: day.helperHe === undefined ? p.helperHe : (day.helperHe === 'сам' ? '' : day.helperHe),
    },
    onSubmit: async (v) => {
      // 1. one day per date: a second report for the same date is not created
      const same = daysSorted().find((d) => d.date === v.date && d.id !== day.id);
      if (same) {
        if (isNew) { toast('На эту дату день уже есть — открываю его'); openDayId = same.id; ui?.go?.('doh'); ui?.render?.(); return; }
        toast('На эту дату уже есть другой день — две даты в одном отчёте нельзя'); return false;
      }
      // 2. a day off needs a reason (own text for «Другое»)
      if (v.off) {
        if (!v.offReason) { toast('Выберите причину выходного'); return false; }
        if (v.offReason === 'other' && !v.offText) { toast('Впишите свою причину'); return false; }
      }
      // 3. a day with entries does not become a day off: delete the entries first
      if (v.off && !wasOff && !isNew) {
        const n = dayEntries(day, state.ctx).length;
        if (n) { await messageDialog('🌴 Выходной', `В этом дне есть записи: ${n}. Выходной — день без работы: сначала удалите записи, потом включите «🌴 Выходной».`); return false; }
      }
      // 4. a day off on a date with a working day in another project
      if (v.off && (!wasOff || v.date !== day.date)) {
        const c = dayConflictFor(v.date, p.id, day.id, true);
        if (c) { await showConflict(c, v.date); return false; }
      }
      // 5. a working day (new, switched back from a day off, or moved) on a date that is a day off in another project
      if (!v.off && (isNew || wasOff || v.date !== day.date)) {
        const c = dayConflictFor(v.date, p.id, day.id, false);
        if (c) { await showConflict(c, v.date); return false; }
      }
      // 6. the date differs a lot from today — most likely a typo in the year or the day
      const diff = (Date.parse(v.date) - Date.parse(todayIso())) / 86400000;
      if (diff > 1 || diff < -730) {
        if (!(await confirmDialog(`Дата ${dateText(v.date)} — ${diff > 0 ? 'в будущем' : 'очень давно'}. Всё верно?`, { yes: 'Да, сохранить' }))) return false;
      }
      const id = day.id || newId();
      // helper fields are not touched while the day is off, so they come back when it is a working day again
      const data = v.off
        ? { date: v.date, off: true, offReason: v.offReason, offText: v.offReason === 'other' ? v.offText : null, comment: v.comment }
        : { date: v.date, helper: v.helper || 'сам', helperHe: v.helperHe || 'сам', object: v.object, comment: v.comment,
          ...(wasOff ? { off: false, offReason: null, offText: null } : {}) };
      repo.save(p.id, [{ coll: 'days', id, data }]);
      if (!v.off) bumpLastWork(v.date);   // a day off is not a working day: it does not move the last work date
      if (isNew) { openDayId = id; ui?.go?.('doh'); }
    },
    extra: isNew ? [] : [{ label: 'Удалить день', kind: 'danger', closes: false, onClick: async (v, { close }) => {
      const msg = wasOff ? `Удалить выходной ${dateText(day.date)}? Его можно будет вернуть из истории.` : 'Удалить день вместе с записями? Его можно будет вернуть из истории.';
      if (!(await confirmDialog(msg, { yes: 'Удалить', danger: true }))) return;
      releasePorts(state.data.entries.filter((e) => e.dayId === day.id && !e.deleted));
      repo.remove(p.id, 'days', day.id); openDayId = null; close(); ui?.render();
    } }],
  });
}

// ---------- choosing points ----------
export function pointsPicker({ typesOf, fits, onPick }) {
  let ids = [];
  const btn = h('button', { type: 'button', class: 'sec', style: { width: '100%', textAlign: 'start' } }, 'Выбрать точки…');
  const label = () => { btn.textContent = ids.length ? `Выбрано точек: ${ids.length} — изменить` : 'Выбрать точки…'; };
  let valuesFn = () => ({}); let changedFn = null;
  btn.onclick = () => openPicker();
  function openPicker() {
    const vals = valuesFn();
    const allowed = typesOf ? typesOf(vals) : null;
    const pts = pointsSorted().filter((pt) => (fits ? fits(pt, vals) : (!allowed || allowed.includes(pt.typeId))));
    const chosen = new Set(ids);
    let q = ''; let fCab = ''; let fType = ''; let fCfg = '';
    const list = h('div', { class: 'picklist' });
    const count = h('b', {});
    const fill = () => {
      list.replaceChildren(); let last = null;
      const shown = pts.filter((pt) => (!q || latinKey(`${pt.label} ${pt.planName ?? ''}`).includes(latinKey(q)))
        && (!fCab || (fCab === '__none' ? !pt.cabinet : pt.cabinet === fCab)) && typeMatch(fType, pt.typeId) && cfgMatch(fCfg, pt));
      if (!shown.length) list.append(h('div', { class: 'empty' }, pts.length ? 'Ничего не найдено' : 'Подходящих точек нет'));
      shown.forEach((pt) => {
        const key = `${pt.cabinet || ''}\u0000${pt.typeId}`;
        if (key !== last) { list.append(h('div', { class: 'group', style: { padding: '8px 4px 4px' } }, `${pt.cabinet ? `Шкаф ${pt.cabinet}` : 'Без шкафа'} · ${pt.typeId}`)); last = key; }
        const cb = h('input', { type: 'checkbox', checked: chosen.has(pt.id), onchange: () => { cb.checked ? chosen.add(pt.id) : chosen.delete(pt.id); count.textContent = `Выбрано: ${chosen.size}`; } });
        list.append(h('label', { class: 'pickrow' }, cb, h('span', {}, pt.label), h('small', {}, infoOf(pt).status)));
      });
      count.textContent = `Выбрано: ${chosen.size}`;
      list._shown = shown;
    };
    const search = h('input', { type: 'search', placeholder: 'Поиск по обозначению', oninput: (e) => { q = e.target.value.trim().toLowerCase(); fill(); } });
    // filters as on the «Точки» tab: rack and type (with shared groups — «▸ Все: Дверь»)
    const cabs = [...new Set(pts.map((pt) => pt.cabinet || ''))].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
    const cabSel = h('select', { onchange: (e) => { fCab = e.target.value; fill(); } }, h('option', { value: '' }, 'Все шкафы'), ...cabs.map((c) => (c ? h('option', { value: c }, `Шкаф ${c}`) : h('option', { value: '__none' }, 'Без шкафа'))));
    const typeSel = h('select', { onchange: (e) => { fType = e.target.value; fill(); } }, h('option', { value: '' }, 'Все типы'), ...typeFilterOptions(pts.map((pt) => pt.typeId)).map(([v, t]) => h('option', { value: v }, t)));
    const cfgOpts = cfgFilterOptions(pts);
    const cfgSel = cfgOpts.length ? h('select', { onchange: (e) => { fCfg = e.target.value; fill(); } }, h('option', { value: '' }, 'Все конфигурации дверей'), ...cfgOpts.map(([v, t]) => h('option', { value: v }, t))) : null;
    const close = openModal('Точки', h('div', {},
      search, h('div', { style: { display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' } }, cabs.length > 1 ? cabSel : null, typeSel, cfgSel), h('div', { class: 'row', style: { margin: '8px 0' } }, count,
        h('button', { type: 'button', class: 'sec', onclick: () => { (list._shown || []).forEach((pt) => chosen.add(pt.id)); fill(); } }, 'Все показанные'),
        h('button', { type: 'button', class: 'sec', onclick: () => { chosen.clear(); fill(); } }, 'Снять все')),
      list,
      h('div', { class: 'row' }, h('button', { class: 'grow', onclick: () => {
        ids = pts.map((pt) => pt.id).filter((id) => chosen.has(id)); // the order as in the list
        label(); close(); onPick?.(ids); changedFn?.();
      } }, 'Готово'))));
    fill();
  }
  return {
    el: btn, get: () => ids,
    set: (v) => { ids = [...(v || [])]; label(); },
    bind: (fn, changed) => { valuesFn = fn; changedFn = changed; },
  };
}

// ---------- entry form (one work) ----------
function entryForm(day, entry, preset) {
  const repo = getRepo(); const pid = currentProject().id; const ctx = state.ctx;
  const catalog = [...ctx.catalog.values()].filter((w) => w.active !== false);
  const workOf = (v) => ctx.catalog.get(v.workId);
  const lock = !entry && !!preset?.lockPull;   // «Завершить протяжку»: the type and the work are not chosen — only pulling
  // what a point is waiting for: the work fits it and is not done yet (when editing an entry, its own work and points stay)
  const appl = (pt, w) => workApplicable(pt, ctx, w, infoOf);
  const ownPts = new Set(entry?.pointIds || []);
  const okFor = (pt, w) => appl(pt, w) || (!!entry && entry.workId === w.id && ownPts.has(pt.id));
  // the work on a point is already done (taking the chosen devices into account); a repeated check of a non-working point is not «done»
  const isDoneFor = (p, v) => {
    const w = workOf(v); if (!w) return false;
    if (w.workType === 'Проверка' && infoOf(p).checkResult === 'Не работает') return false;
    if (v.deviceIds?.length && infoOf(p).composed && ['Хивут', 'Установка', 'Проверка', 'Шилют'].includes(w.workType)) return !(openTasksFor(p, ctx, w, v.deviceIds) || []).length;
    return !appl(p, w);
  };
  const chosenPts = (v) => (v.pointIds || []).map((id) => ctx.points.get(id)).filter(Boolean);
  // a work is available if it is not tied to points or at least one chosen point needs it
  const workOk = (w, v) => { const pts = chosenPts(v); return !pts.length || !workUsesPoints(w, ctx) || (entry?.workId === w.id) || pts.some((pt) => okFor(pt, w)); };
  const isTime = (v) => v.workType === 'Время' || workOf(v)?.unit === 'мин';
  const isText = (v) => v.workType === 'Текст';
  const usesCache = new Map();
  const hasPointsWork = (v) => { const w = workOf(v); if (!w) return false; if (!usesCache.has(w.id)) usesCache.set(w.id, workUsesPoints(w, ctx)); return usesCache.get(w.id); };
  const effPts = (v) => (hasPointsWork(v) ? (v.pointIds || []) : []);
  const ptsOf = (v) => effPts(v).map((id) => ctx.points.get(id)).filter(Boolean);
  const anyLegacy = (v) => ptsOf(v).some((p) => !compositionOf(p, ctx));
  const devOpts = (v) => (workOf(v) && ptsOf(v).length ? devicesForWork(ptsOf(v), ctx, v.workId, v.workType, { onlyOpen: !entry }) : []);
  // ticks «which devices it applies to» (for points made of devices)
  const devBox = (() => {
    const el = h('div', { class: 'picklist', style: { maxHeight: '200px' } }); let sig = ''; let total = 0; const boxes = new Map();
    const draw = (v) => {
      const opts = devOpts(v); const s = opts.map((o) => o.deviceId).join(',');
      total = workOf(v) && ptsOf(v).length ? devicesForWork(ptsOf(v), ctx, v.workId, v.workType).length : 0;   // how many devices there are in all (some are already done and hidden)
      if (s === sig) return; sig = s;
      const keep = new Map([...boxes].map(([k, cb]) => [k, cb.checked])); boxes.clear();
      el.replaceChildren(...opts.map((o) => {
        const was = keep.has(o.deviceId) ? keep.get(o.deviceId) : (entry?.deviceIds?.length ? entry.deviceIds.includes(o.deviceId) : true);
        const cb = h('input', { type: 'checkbox', checked: was }); boxes.set(o.deviceId, cb);
        return h('label', { class: 'pickrow' }, cb, h('span', {}, o.name));
      }));
    };
    return { el, update: draw, get: () => { const all = [...boxes]; const on = all.filter(([, cb]) => cb.checked).map(([k]) => k); return on.length === all.length && all.length === total ? undefined : on; } };
  })();
  let modal = null;
  const picker = pointsPicker({
    fits: (pt, v) => lock || !workOf(v) || okFor(pt, workOf(v)),
    onPick: (ids) => { // for pulling, put in the cable of the first point if none is chosen yet
      const first = ctx.points.get(ids[0]);
      if (first && modal) modal.set?.('cableId', infoOf(first).cable);
    },
  });
  picker.set(entry?.pointIds ?? preset?.pointIds);
  // the work was changed — points it does not fit are removed from the selection (with a message)
  let lastWork = `${entry?.workType ?? preset?.workType ?? ''}|${entry?.workId ?? preset?.workId ?? ''}`;
  picker.update = (v) => {
    const key = `${v.workType || ''}|${v.workId || ''}`; if (key === lastWork) return; lastWork = key;
    const work = workOf(v); const ids = picker.get(); if (!work || !ids.length) return;
    const keep = ids.filter((id) => { const pt = ctx.points.get(id); return !pt || okFor(pt, work); });
    if (keep.length !== ids.length) { picker.set(keep); toast(`Убрано точек, которым «${work.name}» не подходит или уже сделана: ${ids.length - keep.length}`); }
  };

  // a new entry split into several (by cable kind / skipping what is done); time, culprit and note go to the first one
  const saveGroups = (v, groups) => {
    const ops = [];
    if (day._new) { ops.push({ coll: 'days', id: day.id, data: { date: day.date, helper: day.helper || 'сам', helperHe: day.helperHe || 'сам' } }); day._new = false; }
    const made = groups.map(([cableId, ids], i) => {
      const id = newId();
      ops.push({ coll: 'entries', id, data: { dayId: day.id, workType: v.workType, workId: v.workId, pointIds: ids, cableId, deviceIds: v.deviceIds || null,
        minutes: i ? undefined : v.minutes, culprit: i ? undefined : v.culprit, note: i ? undefined : v.note,
        delayReason: i ? undefined : v.delayReason, delayCulprit: i ? undefined : v.delayCulprit, delayNote: i ? undefined : v.delayNote, delayMinutes: i ? undefined : v.delayMinutes,
        result: v.workType === 'Проверка' ? (v.result || 'Работает') : undefined } });
      return [id, ids];
    });
    repo.save(pid, ops); made.forEach(([id, ids]) => syncJournal(id, ids)); bumpLastWork(day.date);
    toast(groups.length > 1 ? `Сохранено записей: ${groups.length}` : 'Сохранено');
    preset?.onSaved?.(v.pointIds || []);
  };
  modal = formModal({
    title: entry ? 'Запись' : 'Добавить работу', submitLabel: 'Сохранить',
    fields: [
      { key: 'workType', label: 'Тип работы', type: 'select', required: true, emptyLabel: 'Выберите…', visible: () => !lock,
        // only the types that have a work that at least one of the chosen points is waiting for (if points are already chosen)
        optionsFn: (v) => WORK_TYPES.filter((t) => t === 'Текст' || t === entry?.workType || catalog.some((w) => w.workType === t && workOk(w, v)))
          .map((t) => ({ value: t, label: t === 'Текст' ? 'Своя строка (текст)' : t })) },
      { key: 'workId', label: 'Работа', type: 'select', emptyLabel: (v) => (chosenPts(v).length && catalog.some((w) => w.workType === v.workType) && !catalog.some((w) => w.workType === v.workType && workOk(w, v)) ? 'Нет работ, которые ждут эти точки' : 'Выберите…'),
        visible: (v) => !lock && !!v.workType && !isText(v),
        optionsFn: (v) => catalog.filter((w) => w.workType === v.workType && workOk(w, v)).map((w) => ({ value: w.id, label: w.name })) },
      { key: 'pointIds', label: 'Точки', type: 'custom', visible: (v) => !isText(v) && hasPointsWork(v),
        build: (api) => { picker.bind(api.values, api.changed); return picker; } },
      { key: 'deviceIds', label: 'Устройства', type: 'custom', hint: 'Снимите галочку, если работа сделана не на всех устройствах точки.',
        visible: (v) => !isText(v) && devOpts(v).length > 1, build: () => devBox },
      { key: 'quantity', label: 'Количество', type: 'number', visible: (v) => !isText(v) && !!v.workId && !isTime(v) && !effPts(v).length && v.workType !== 'Протяжка' },
      { key: 'cableId', label: 'Кабель', type: 'select', visible: (v) => v.workType === 'Протяжка' && (!effPts(v).length || anyLegacy(v) || !!entry),
        hint: 'Для точек из устройств кабели берутся из их состава — по записи на каждый вид кабеля.',
        // cables of the chosen points (and the entry's own cable when editing); while there are no points — all cables of the project
        optionsFn: (v) => { const pts = chosenPts(v); const ids = pts.length ? [...new Set(pts.flatMap((p) => (infoOf(p).cableList || []).map((c) => c.cable)))] : [...ctx.cables.keys()];
          if (entry?.cableId && !ids.includes(entry.cableId)) ids.push(entry.cableId); return ids.filter((id) => ctx.cables.has(id)).map((id) => ({ value: id, label: id })); } },
      { key: 'pullCount', label: 'Сколько кабелей / точек', type: 'number', visible: (v) => v.workType === 'Протяжка' && !effPts(v).length },
      { key: 'meters', label: 'Метры', type: 'number', visible: (v) => v.workType === 'Протяжка' && !effPts(v).length && ctx.cables.get(v.cableId)?.accounting === 'Метры' },
      // work time — only for works counted in minutes (waiting, fault finding…); for the others it follows from the quantity
      { key: 'minutes', label: 'Время, мин', type: 'number', visible: (v) => !isText(v) && !!v.workType && (isTime(v) || !blank(entry?.minutes)) },
      // shared lists (choiceList): what can be chosen, plus the entry's own value even if it was deleted from the list
      { key: 'culprit', label: 'Виновник (прежняя запись)', type: 'select', visible: () => !blank(entry?.culprit),
        options: choiceList(ctx.culprits, [entry?.culprit]).map((c) => ({ value: c.id, label: c.id })) },
      // a delay for this work: in the report it is a line right under the work; all of it is optional
      { key: 'delayReason', label: '⏱ Задержка: причина', type: 'select', emptyLabel: '—', visible: (v) => !isText(v) && !!v.workType,
        options: choiceList(ctx.delayReasons, [entry?.delayReason]).map((r) => ({ value: r.id, label: r.id })) },
      { key: 'delayCulprit', label: '⏱ Задержка: виновник', type: 'select', emptyLabel: '—', visible: (v) => !isText(v) && !!v.workType,
        options: choiceList(ctx.culprits, [entry?.delayCulprit]).map((c) => ({ value: c.id, label: c.id })) },
      { key: 'delayNote', label: '⏱ Задержка: комментарий', type: 'text', visible: (v) => !isText(v) && !!v.workType },
      { key: 'delayMinutes', label: '⏱ Задержка: время, мин', type: 'number', visible: (v) => !isText(v) && !!v.workType },
      { key: 'result', label: 'Результат проверки', type: 'select', visible: (v) => v.workType === 'Проверка',
        options: [{ value: 'Работает', label: 'Работает' }, { value: 'Не работает', label: 'Не работает' }] },
      { key: 'note', label: 'Приписка', type: 'textarea', hint: 'Для «своей строки» — весь текст строки отчёта.', visible: (v) => !!v.workType },
    ],
    values: {
      workType: entry?.workType ?? preset?.workType, workId: entry?.workId ?? preset?.workId, pointIds: entry?.pointIds ?? preset?.pointIds,
      quantity: entry?.quantity, cableId: entry?.cableId ?? preset?.cableId, pullCount: entry?.workType === 'Протяжка' ? entry?.quantity : undefined,
      meters: entry?.meters, minutes: entry?.minutes, culprit: entry?.culprit,
      delayReason: entry?.delayReason, delayCulprit: entry?.delayCulprit, delayNote: entry?.delayNote, delayMinutes: entry?.delayMinutes,
      result: entry?.result ?? 'Работает', note: entry?.note,
    },
    onSubmit: (v) => {
      if (lock) { v.workType = 'Протяжка'; v.workId = preset.workId; }
      let pointIds = (isText(v) || !hasPointsWork(v)) ? [] : (v.pointIds || []);
      if (isText(v)) { if (blank(v.note)) { toast('Введите текст строки'); return false; } }
      else {
        // numbers: only above zero
        const bad = [['quantity', 'Количество', !isTime(v) && !effPts(v).length && v.workType !== 'Протяжка'], ['pullCount', 'Сколько кабелей / точек', v.workType === 'Протяжка' && !effPts(v).length],
          ['meters', 'Метры', v.workType === 'Протяжка' && !effPts(v).length && ctx.cables.get(v.cableId)?.accounting === 'Метры'], ['minutes', 'Время, мин', isTime(v) || !blank(entry?.minutes)], ['delayMinutes', 'Задержка: время', true]]
          .find(([k, , on]) => on && v[k] !== undefined && !(v[k] > 0));
        if (bad) { toast(`${bad[1]}: нужно число больше нуля`); return false; }
        // points the chosen work does not fit are not recorded
        const work = workOf(v);
        if (work && pointIds.length && !lock) {
          const misfit = pointIds.filter((id) => { const pt = ctx.points.get(id); return pt && !workFits(pt, ctx, work) && !(entry?.pointIds || []).includes(id) && !(entry && entry.workId === v.workId); });
          if (misfit.length) { toast(`Работа «${work.name}» не подходит точкам: ${misfit.slice(0, 4).map((id) => ctx.points.get(id).label).join(', ')}${misfit.length > 4 ? '…' : ''}`); return false; }
        }
        // editing an entry: points added to it must not be already marked by another entry (otherwise the work would be counted twice)
        if (entry && pointIds.length) {
          const added = pointIds.filter((id) => !(entry.pointIds || []).includes(id)).map((id) => ctx.points.get(id)).filter(Boolean);
          if (added.length) {
            const done = v.workType === 'Протяжка' ? pullGroups(added, ctx, v.deviceIds, (p) => v.cableId || infoOf(p).cable).done
              : added.filter((p) => isDoneFor(p, v)).map((p) => p.label);
            if (done.length) { toast(`Уже отмечено другой записью: ${done.slice(0, 5).join(', ')}${done.length > 5 ? '…' : ''}`); return false; }
          }
        }

        if (blank(v.workId)) { toast('Выберите работу'); return false; }
        if (isTime(v) && blank(v.minutes)) { toast('Укажите время в минутах'); return false; }
        if (!isTime(v) && v.workType !== 'Протяжка' && !pointIds.length && blank(v.quantity)) { toast('Выберите точки или укажите количество'); return false; }
        if (v.workType === 'Протяжка' && !pointIds.length && blank(v.pullCount)) { toast('Выберите точки или укажите количество'); return false; }
      }
      // points made of devices: only what is not done; pulling — one entry per cable kind
      let groups = [[v.workType === 'Протяжка' ? (v.cableId || undefined) : undefined, pointIds]];
      if (!entry && !isText(v) && pointIds.length) {
        const pts = pointIds.map((x) => ctx.points.get(x)).filter(Boolean);
        if (v.workType === 'Протяжка') {
          const r = pullGroups(pts, ctx, v.deviceIds, (p) => v.cableId || infoOf(p).cable);
          if (!r.groups.length) { toast(`Уже протянуто: ${r.done.join(', ')}`); return false; }
          if (r.done.length) toast(`Пропущено (уже протянуто): ${r.done.join(', ')}`);
          groups = r.groups;
        } else {
          const done = pts.filter((p) => isDoneFor(p, v));
          if (done.length === pts.length) { toast(`Уже отмечено: ${done.map((p) => p.label).join(', ')}`); return false; }
          if (done.length) toast(`Пропущено (уже отмечено): ${done.map((p) => p.label).join(', ')}`);
          groups = [[undefined, pointIds.filter((x) => !done.some((p) => p.id === x))]];
        }
      }
      if (groups.length > 1 || groups[0][1] !== pointIds) { saveGroups(v, groups); return undefined; }
      const id = entry?.id || newId();
      const data = {
        dayId: day.id, workType: v.workType, workId: isText(v) ? null : v.workId, pointIds,
        quantity: v.workType === 'Протяжка' ? v.pullCount : v.quantity,
        meters: v.workType === 'Протяжка' ? v.meters : undefined,
        cableId: v.workType === 'Протяжка' ? (v.cableId || undefined) : undefined,
        deviceIds: isText(v) ? undefined : (v.deviceIds || null),
        minutes: isText(v) ? undefined : v.minutes, culprit: isText(v) ? undefined : v.culprit,
        delayReason: isText(v) ? undefined : v.delayReason, delayCulprit: isText(v) ? undefined : v.delayCulprit, delayNote: isText(v) ? undefined : v.delayNote, delayMinutes: isText(v) ? undefined : v.delayMinutes,
        result: v.workType === 'Проверка' ? (v.result || 'Работает') : undefined, note: v.note,
      };
      const ops = [{ coll: 'entries', id, data }];
      if (day._new) { // the day for today is created only when the entry is saved
        ops.unshift({ coll: 'days', id: day.id, data: { date: day.date, helper: day.helper || 'сам', helperHe: day.helperHe || 'сам' } });
        day._new = false;
      }
      repo.save(pid, ops);
      syncJournal(id, pointIds);
      bumpLastWork(day.date);
      toast('Сохранено');
      if (!entry) preset?.onSaved?.(pointIds);
    },
    extra: entry ? [{ label: 'Удалить', kind: 'danger', closes: false, onClick: async (v, { close }) => {
      if (!(await confirmDialog('Удалить запись? Её можно будет вернуть из истории.', { yes: 'Удалить', danger: true }))) return;
      releasePorts(entry); repo.remove(pid, 'entries', entry.id); close();
    } }] : [],
  });
}

// «Добавить работу на эту точку»: an entry in today's day (the day is created on saving)
// a work on several points at once (for example those chosen on the plan)
export function addWorkForPoints(pointIds, preset = {}) {
  if (todayBlocked()) return;
  const p = currentProject(); const today = todayIso();
  const day = daysSorted().find((d) => d.date === today)
    || { id: newId(), date: today, helper: p.helper, helperHe: p.helperHe, _new: true };
  entryForm(day, null, { ...preset, pointIds: [...pointIds] });
}
// «Шилют поклеен» in one tap (from the rack panel): records the work «Шилют» into today's day, without a form.
// The work is chosen as in «Несколько работ»: for a point made of devices — the open task «Шилют», for old points — the work of the type «Шилют» for its type.
// → { made: entries, done: [labels: already stuck], none: [labels: the type has no work «Шилют»] }; today is a day off → { made: 0, blocked: true }, nothing is written
export function markShilutForPoints(pointIds, portsByPoint = null) {
  if (todayBlocked()) return { made: 0, blocked: true };
  const ctx = state.ctx; const repo = getRepo(); const p = currentProject(); const today = todayIso();
  const pts = [...new Set(pointIds)].map((id) => ctx.points.get(id)).filter(Boolean);
  const works = [...ctx.catalog.values()].filter((w) => w.active !== false && w.workType === 'Шилют');
  const byWork = new Map(); const done = []; const none = [];
  const fresh = new Map();   // point id → numbers of the ports stuck by this tap
  const put = (w, pt) => { if (!byWork.has(w.id)) byWork.set(w.id, []); byWork.get(w.id).push(pt.id); };
  pts.forEach((pt) => {
    // ports that are not stuck yet (if no ports are given — all of them)
    const total = rackPortsOf(pt, ctx); const stuck = portsByPoint ? stuckPortsOf(pt, ctx) : new Set();
    const want = portsByPoint ? [...(portsByPoint.get(pt.id) || [])] : Array.from({ length: total }, (_, i) => i);
    const newPorts = want.filter((i) => !stuck.has(i));
    if (portsByPoint && total && !newPorts.length) { done.push(pt.label); return; }
    if (compositionOf(pt, ctx)) {
      const fit = works.filter((w) => workFits(pt, ctx, w));
      const open = fit.filter((w) => (openTasksFor(pt, ctx, w) || []).length > 0);
      if (open.length) { open.forEach((w) => put(w, pt)); fresh.set(pt.id, newPorts); } else if (fit.length) done.push(pt.label); else none.push(pt.label);
    } else {
      const w = works.find((x) => (x.forTypes || []).includes(pt.typeId));
      if (!w) none.push(pt.label); else if (infoOf(pt).shilut) done.push(pt.label); else { put(w, pt); fresh.set(pt.id, newPorts); }
    }
  });
  if (!byWork.size) return { made: 0, done, none };
  const day = daysSorted().find((d) => d.date === today); const dayId = day?.id || newId();
  const ops = day ? [] : [{ coll: 'days', id: dayId, data: { date: today, helper: p.helper || 'сам', helperHe: p.helperHe || 'сам' } }];
  const made = [];
  byWork.forEach((ids, workId) => {
    const id = newId(); const data = { dayId, workType: 'Шилют', workId, pointIds: ids };
    // part of the ports of a point: the report gets the number of stuck ports, the point closes when all of them are done
    const portQty = ids.map((pid) => ({ id: pid, v: (fresh.get(pid) || []).length })).filter((q) => portsByPoint && q.v > 0 && q.v < rackPortsOf(ctx.points.get(q.id), ctx));
    if (portQty.length) data.portQty = portQty;
    if (portsByPoint) data.portIdx = ids.map((pid) => ({ id: pid, i: [...(fresh.get(pid) || [])] })).filter((q) => q.i.length);   // which exact ports were stuck by this entry (so that they can be released when the entry is deleted)
    ops.push({ coll: 'entries', id, data }); made.push([id, ids]);
  });
  if (portsByPoint) fresh.forEach((list, pid) => { const pt = ctx.points.get(pid); const all = new Set([...stuckPortsOf(pt, ctx), ...list]); ops.push({ coll: 'points', id: pid, data: { shStuck: [...all].sort((a, b) => a - b) } }); });
  repo.save(p.id, ops); made.forEach(([id, ids]) => syncJournal(id, ids)); bumpLastWork(today);
  return { made: made.length, done, none };
}
export function addWorkForPoint(pointId) {
  if (todayBlocked()) return;
  const p = currentProject(); const today = todayIso();
  const day = daysSorted().find((d) => d.date === today)
    || { id: newId(), date: today, helper: p.helper, helperHe: p.helperHe, _new: true };
  entryForm(day, null, { pointIds: [pointId] });
}

// when a «Шилют» entry by ports is deleted (or a point is removed from it): its ports count as not stuck again
function releasePorts(entries, onlyPoints = null) {
  const drop = new Map();   // pointId -> ports to release
  [].concat(entries || []).forEach((entry) => {
    if (!entry || entry.workType !== 'Шилют' || !Array.isArray(entry.portIdx)) return;
    entry.portIdx.forEach((q) => { if (!onlyPoints || onlyPoints.has(q.id)) drop.set(q.id, [...(drop.get(q.id) || []), ...q.i]); });
  });
  const ops = [];
  drop.forEach((list, id) => {
    const pt = state.data.points.find((x) => x.id === id && !x.deleted); if (!pt) return;
    const rest = (pt.shStuck || []).filter((i) => !list.includes(i));
    if (rest.length !== (pt.shStuck || []).length) ops.push({ coll: 'points', id, data: { shStuck: rest } });
  });
  if (ops.length) getRepo().save(currentProject().id, ops);
}

// the journal rows of an entry: add the missing ones, remove the extra ones
export function syncJournal(entryId, pointIds) {
  const repo = getRepo(); const pid = currentProject().id;
  const have = state.data.journal.filter((r) => r.entryId === entryId);
  const want = new Set(pointIds);
  const live = new Map(have.filter((r) => !r.deleted).map((r) => [r.pointId, r]));
  const ops = pointIds.filter((pt) => !live.has(pt)).map((pt) => ({ coll: 'journal', id: `${entryId}_${pt}`, data: { entryId, pointId: pt, deleted: false } }));
  if (ops.length) repo.save(pid, ops);
  const gone = have.filter((r) => !r.deleted && !want.has(r.pointId));
  if (gone.length) releasePorts(state.data.entries.find((e) => e.id === entryId), new Set(gone.map((r) => r.pointId)));
  gone.forEach((r) => repo.remove(pid, 'journal', r.id));
}

// ---------- several works at once for the same points ----------
function batchForm(day) {
  const repo = getRepo(); const pid = currentProject().id; const ctx = state.ctx;
  // only points that still have something to do
  const anyOpen = (pt) => [...ctx.catalog.values()].some((w) => w.active !== false && w.workType !== 'Время' && workApplicable(pt, ctx, w, infoOf));
  const picker = pointsPicker({ fits: (pt) => anyOpen(pt) });
  let selected = new Set();
  let box = null; let lastKey = '';
  const applicable = (ptIds) => {
    const pts = ptIds.map((id) => ctx.points.get(id)).filter(Boolean);
    if (!pts.length) return [];
    return [...ctx.catalog.values()].filter((w) => w.active !== false && w.workType !== 'Время' && pts.some((pt) => workApplicable(pt, ctx, w, infoOf)));
  };
  const works = {
    el: (box = h('div', { class: 'picklist' }, h('div', { class: 'mut' }, 'Сначала выберите точки'))),
    get: () => [...selected],
    update: (v) => {
      const list = applicable(v.pointIds || []);
      const key = list.map((w) => w.id).join(',');
      if (key === lastKey) return; lastKey = key;
      selected = new Set([...selected].filter((id) => list.some((w) => w.id === id)));
      box.replaceChildren();
      if (!list.length) { box.append(h('div', { class: 'mut' }, (v.pointIds || []).length ? 'Для этих точек нет доступных работ' : 'Сначала выберите точки')); return; }
      list.forEach((w) => {
        const cb = h('input', { type: 'checkbox', checked: selected.has(w.id), onchange: () => { cb.checked ? selected.add(w.id) : selected.delete(w.id); } });
        box.append(h('label', { class: 'pickrow' }, cb, h('span', {}, w.name), h('small', {}, w.workType)));
      });
    },
  };
  formModal({
    title: 'Несколько работ', submitLabel: 'Сохранить всё',
    fields: [
      { key: 'pointIds', label: 'Точки', type: 'custom', required: true, build: (api) => { picker.bind(api.values, api.changed); return picker; } },
      { key: 'workIds', label: 'Работы', type: 'custom', required: true, build: () => works },
    ],
    onSubmit: (v) => {
      const pts = v.pointIds.map((id) => ctx.points.get(id)).filter(Boolean);
      let made = 0;
      v.workIds.forEach((wid) => {
        const w = ctx.catalog.get(wid); if (!w) return;
        // pulling: a separate entry for each cable kind, only what is not pulled; other works — only where not done
        const groups = w.workType === 'Протяжка'
          ? pullGroups(pts, ctx, null, (pt) => infoOf(pt).cable).groups
          : [[undefined, pts.filter((pt) => workApplicable(pt, ctx, w, infoOf)).map((pt) => pt.id)]];
        groups.forEach(([cableId, ids]) => {
          if (!ids.length) return;
          const id = newId();
          repo.save(pid, [{ coll: 'entries', id, data: { dayId: day.id, workType: w.workType, workId: w.id, pointIds: ids, cableId, result: w.workType === 'Проверка' ? 'Работает' : undefined } }]);
          syncJournal(id, ids); made += 1;
        });
      });
      bumpLastWork(day.date);
      toast(`Записей добавлено: ${made}`);
    },
  });
}

// The data of an entry changed since it was saved (a point's length, the number of cables, a deleted point…) — the report now shows other figures
const RED = '#ff453a';
const changedSince = (e, ctx) => !!e.snap && e.snap !== entryLine(e, ctx, 'ru');

// ---------- day screen ----------
// A day off: the reason, the comment and a hint — no entries, no report cards
function dayOffScreen(day, ui) {
  return h('div', {},
    h('div', { class: 'btns', style: { marginTop: 0 } },
      h('button', { class: 'sec', onclick: () => { openDayId = null; ui.render(); } }, '← Все дни'),
      h('button', { class: 'sec', onclick: () => dayForm(day, ui) }, '✏️ Изменить день')),
    h('div', { class: 'card' },
      h('div', { style: { fontSize: '18px', fontWeight: 700 } }, dateText(day.date)),
      h('div', { style: { margin: '6px 0' } }, `🌴 Выходной: ${dayOffText(day, 'ru')}`),
      blank(day.comment) ? null : h('div', { style: { whiteSpace: 'pre-wrap', margin: '6px 0' } }, String(day.comment)),
      h('div', { class: 'mut' }, 'Это выходной: записей и отчёта у него нет. Чтобы снова сделать день рабочим, нажмите «✏️ Изменить день» и выключите «🌴 Выходной».')));
}

function dayScreen(day, ui) {
  if (isDayOff(day)) return dayOffScreen(day, ui);
  const ctx = state.ctx; const entries = dayEntries(day, ctx);
  const ru = doh(day, ctx, 'ru'); const he = doh(day, ctx, 'he');
  const enText = uiLang() === 'en' ? doh(day, ctx, 'en') : null;   // the English report — when the interface is in English
  const textBlock = (text, rtl) => h('pre', { class: 'dohtext', dir: rtl ? 'rtl' : 'ltr' }, text);
  const act = (label, text, cls = 'sec') => h('button', { class: cls, onclick: async () => { toast((await copyText(text)) ? 'Скопировано' : 'Не удалось скопировать'); } }, label);
  const link = (label, text) => h('a', { class: 'btnlink', href: shortcutUrl(text) }, label);
  return h('div', {},
    h('div', { class: 'btns', style: { marginTop: 0 } },
      h('button', { class: 'sec', onclick: () => { openDayId = null; ui.render(); } }, '← Все дни'),
      h('button', { class: 'sec', onclick: () => dayForm(day, ui) }, '✏️ Изменить день')),
    h('div', { class: 'card' },
      h('div', { style: { fontSize: '18px', fontWeight: 700 } }, dateText(day.date)),
      entries.some((e) => changedSince(e, ctx)) ? h('div', { style: { color: RED, fontWeight: 600, margin: '6px 0' } }, '⚠ В этом отчёте изменились данные с момента записи (красные строки). Если отчёт уже отправлен — он отличается от того, что видно сейчас.',
        h('div', { class: 'btns' }, h('button', { class: 'sec', onclick: () => { getRepo().save(currentProject().id, entries.filter((e) => changedSince(e, ctx)).map((e) => ({ coll: 'entries', id: e.id, data: {} }))); toast('Принято: пометки сняты'); } }, '✔ Принять новые данные'))) : null,
      entries.length ? h('div', { style: { marginTop: '8px' } }, entries.map((e) =>
        h('div', { class: 'item', onclick: () => entryForm(day, e) },
          h('div', { class: 'name' }, entryLine(e, ctx, uiLang()) || '—',
            changedSince(e, ctx) ? h('div', { class: 'sub', style: { color: RED, fontWeight: 600 } }, `⚠ данные изменились после записи (было: ${e.snap.replace(/\n/g, ' / ')})`) : null,
            e.updatedByName ? h('div', { class: 'sub' }, e.updatedByName) : null))))
        : hint(ui, 'Записей пока нет. «Добавить работу» — одна работа (можно сразу на много точек). «Несколько работ» — выбрать точки один раз и отметить сразу несколько работ.', 'doh', '📖 Что такое отчёт и как его заполнять'),
      h('div', { class: 'btns' },
        h('button', { onclick: () => entryForm(day, null) }, '➕ Добавить работу'),
        h('button', { class: 'sec', onclick: () => batchForm(day) }, 'Несколько работ'))),
    h('div', { class: 'card' }, h('b', {}, 'Отчёт (русский)'), textBlock(ru, false),
      h('div', { class: 'btns' }, act('📋 Копировать RU', ru, ''), link('➡️ Отправить', ru))),
    h('div', { class: 'card' }, h('b', {}, 'Отчёт (иврит)'), textBlock(he, true),
      h('div', { class: 'btns' }, act('📋 Копировать HE', he, ''), link('➡️ Отправить', he))),
    enText ? h('div', { class: 'card' }, h('b', {}, 'Отчёт (английский)'), textBlock(enText, false),
      h('div', { class: 'btns' }, act('📋 Копировать EN', enText, ''), link('➡️ Отправить', enText))) : null);
}

// ---------- the tab ----------
export function dohView(ui) {
  const ctx = state.ctx;
  const open = openDayId && ctx.days.get(openDayId);
  if (open) return dayScreen(open, ui);
  // the day may not be in the context yet (the save has just gone through) — do not reset, the next update brings it
  const days = daysSorted();
  return h('div', {},
    h('div', { class: 'btns', style: { marginTop: 0 } },
      h('button', { onclick: () => openToday(ui) }, '📝 Сегодня'),
      h('button', { class: 'sec', onclick: () => dayForm({ date: todayIso() }, ui) }, 'Другой день'),
      h('button', { class: 'sec', onclick: () => ui.open('month') }, '📅 Отчёт за месяц')),
    days.length ? h('div', { class: 'card', style: { padding: 0, marginTop: '10px' } }, days.map((d) => {
      const n = dayEntries(d, ctx).length;
      return h('div', { class: 'item', onclick: () => { openDayId = d.id; ui.render(); } },
        h('div', { class: 'name' }, dateText(d.date), dayEntries(d, ctx).some((e) => changedSince(e, ctx)) ? h('span', { style: { color: RED, fontWeight: 700 } }, '  ⚠ данные изменились') : null,
          h('div', { class: 'sub' }, `${isDayOff(d) ? `🌴 Выходной: ${dayOffText(d, 'ru')}` : n ? `записей: ${n}` : 'пока без записей'}${d.createdByName ? ` · ${d.createdByName}` : ''}`)));
    })) : hint(ui, 'Дней пока нет. Нажмите «Сегодня» и внесите сделанные работы: из них соберётся отчёт за день.', 'doh', '📖 Что такое отчёт и как его заполнять'));
}
