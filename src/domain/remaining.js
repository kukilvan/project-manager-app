// «What is left»: the stages and works a point still lacks (taking the point type's stages into account), readiness by rack, and what the record button records.
// Built on pointInfo from status.js; pure. leftTasks feeds «Что осталось», the point card and the plan filter «Работа»; remainingPreset feeds the record button of «Что осталось».
import { pointInfo } from './status.js';
import { comparePoints } from './points.js';
import { workUsesPoints } from './compose.js';

export const REMAIN_STAGES = ['Дотянуть', 'Хивут', 'Установка', 'Проверка'];

// Which stages a point still lacks («Дотянуть» — only some of its cables are pulled)
export function missingStages(point, ctx) {
  const type = ctx.types.get(point.typeId);
  const stages = type?.stages;
  const has = (s) => !stages || stages.includes(s);
  const info = pointInfo(point, ctx);
  if (info.composed) { // a point made of devices: by tasks
    const st = info.stageStats; const o = [];
    if (st['Протяжка'].done && !info.pulled) o.push('Дотянуть');
    if (st['Хивут'].total && !info.hived) o.push('Хивут');
    if (st['Установка'].total && info.install !== 'Установлено') o.push('Установка');
    if (st['Проверка'].total && (!info.checked || info.checkResult === 'Не работает')) o.push('Проверка');  // faulty — check again
    return o;
  }
  const out = [];
  // not all cable kinds are pulled (e.g. 6005 is there, cat7 is not yet)
  if (has('Протяжка') && !info.pulled && info.pullDone) out.push('Дотянуть');
  if (has('Хивут') && !info.hived) out.push('Хивут');
  if (has('Установка') && info.install !== 'Установлено') out.push('Установка');
  if (has('Проверка') && (!info.checked || info.checkResult === 'Не работает')) out.push('Проверка');  // faulty — check again
  return out;
}

// The works still waiting on a point, as «Что осталось» lists them: [{ key, label, chip, qty? }]. Keys: `p:<cable>` — pull of a cable,
// `w:<workId>` — a work of a composite point (qty summed over its devices), `s:<stage>` — a stage of a legacy point. info — the point's status (cached in the app).
const CHIP = { 'Протяжка': 'pul', 'Дотянуть': 'pul', 'Хивут': 'hiv', 'Установка': 'ins', 'Проверка': 'chk' };
export function leftTasks(point, ctx, info = pointInfo(point, ctx)) {
  const out = new Map();
  const add = (key, label, chip) => { if (!out.has(key)) out.set(key, { key, label, chip }); return out.get(key); };
  if (info.composed) {
    info.tasks.filter((t) => !t.done).forEach((t) => {
      if (t.stage === 'Протяжка') add(`p:${t.cable}`, `Протяжка ${t.cable}`, 'pul');
      else { const w = ctx.catalog.get(t.workId); const x = add(`w:${t.workId}`, w?.name || t.workId, CHIP[t.stage] || ''); x.qty = (x.qty || 0) + t.qty; }
    });
  } else {
    const type = ctx.types.get(point.typeId); const has = (st) => !type?.stages || type.stages.includes(st);
    if (has('Протяжка') && !info.pulled && !info.pullDone) add('s:Протяжка', 'Протяжка', 'pul');
    missingStages(point, ctx).forEach((m) => add(`s:${m}`, m, CHIP[m] || ''));
    if (has('Шилют') && !info.shilut && info.checked) add('s:Шилют', 'Шилют', '');
  }
  return [...out.values()];
}

// Groups by rack: [{ cabinet, items: [{ point, missing }] }] — only points that lack something
export function remaining(ctx) {
  const by = new Map();
  [...ctx.points.values()].sort(comparePoints).forEach((point) => {
    const missing = missingStages(point, ctx);
    if (!missing.length) return;
    const key = point.cabinet || '';
    if (!by.has(key)) by.set(key, []);
    by.get(key).push({ point, missing });
  });
  return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru', { numeric: true }))
    .map(([cabinet, items]) => ({ cabinet, items }));
}

// A point is fully finished: every stage of its type is done (pull, termination, installation if needed, checking with no fault, port labels)
export function isFinished(point, ctx) {
  const type = ctx.types.get(point.typeId);
  const stages = type?.stages || ['Протяжка', 'Хивут', 'Установка', 'Проверка', 'Шилют'];
  const info = pointInfo(point, ctx);
  if (info.composed) return info.tasks.every((t) => t.done) && info.checkResult !== 'Не работает';
  const ok = {
    'Протяжка': !!info.pulled, 'Хивут': !!info.hived, 'Проверка': !!info.checked && info.checkResult !== 'Не работает', 'Шилют': !!info.shilut,
    'Установка': info.install === 'Установлено',
  };
  return stages.every((s) => ok[s] !== false);
}

// Readiness by rack: [{ cabinet, done, total }]
export function readinessByCabinet(ctx) {
  const by = new Map();
  [...ctx.points.values()].forEach((p) => {
    const k = p.cabinet || '';
    const r = by.get(k) || { cabinet: k, done: 0, total: 0 };
    r.total += 1; if (isFinished(p, ctx)) r.done += 1; by.set(k, r);
  });
  return [...by.values()].sort((a, b) => a.cabinet.localeCompare(b.cabinet, 'ru', { numeric: true }));
}

// The work a pull from «Что осталось» is recorded with: the first active catalog work of type «Протяжка» that applies to points
// (`workUsesPoints`), so «Протяжка без точек» is never taken; null when the catalog has none.
export function pullWorkOf(ctx) {
  return [...ctx.catalog.values()].find((w) => w.workType === 'Протяжка' && w.active !== false && workUsesPoints(w, ctx)) || null;
}

// What the record button of «Что осталось» records for the ticked work keys (spec 7 § 4.1): `p:<cable>` and `w:<workId>` keys can be recorded,
// `s:<stage>` keys of old points cannot (and `p:` keys neither when the catalog has no pull work by points).
// → { mode: 'none' | 'one' | 'many', workIds, pullCables, left: [labels of the keys that cannot be recorded], pointIds, key, one }
// mode follows the recordable keys only (the button text); with no ticked point the view keeps the button disabled.
// workIds — every `w:` work plus the pull work once when a `p:` key is ticked; pullCables — the cables of the `p:` keys (null when none).
// key and one — for mode 'one': the key and the preset of the one-work form (a pull gets `onlyCables` with its cable, § 4.2).
export function remainingPreset(tickedKeys, pointIds, ctx) {
  const keys = [...(tickedKeys || [])];
  const pull = keys.some((k) => k.startsWith('p:')) ? pullWorkOf(ctx) : null;
  const rec = keys.filter((k) => k.startsWith('w:') || (k.startsWith('p:') && pull));
  const left = keys.filter((k) => !rec.includes(k)).map((k) => (k.startsWith('p:') ? `Протяжка ${k.slice(2)}` : k.slice(2)));
  const cables = rec.filter((k) => k.startsWith('p:')).map((k) => k.slice(2));
  const workIds = [...new Set([...rec.filter((k) => k.startsWith('w:')).map((k) => k.slice(2)), ...(cables.length ? [pull.id] : [])])];
  const out = { mode: !rec.length ? 'none' : rec.length === 1 ? 'one' : 'many', workIds, pullCables: cables.length ? cables : null, left, pointIds: [...(pointIds || [])], key: null, one: null };
  if (out.mode === 'one') {
    const k = rec[0]; out.key = k;
    out.one = k.startsWith('p:') ? { workType: 'Протяжка', workId: pull.id, cableId: k.slice(2), onlyCables: [k.slice(2)] }
      : { workId: k.slice(2), workType: ctx.catalog.get(k.slice(2))?.workType };
  }
  return out;
}
