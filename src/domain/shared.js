// Shared lists (delay reasons, culprits, problems — one list per database in the pool): the lookup view over the pool and a project's old list, what pickers offer, and the one-time merge plan.
// Pure (ADR 0016); reached through src/domain/index.js. Used by buildContext (context.js), src/app/shared.js, the reference-list screens and the nightly job.

// The pool collections of the shared lists (`pool_<kind>`), and the kinds a project still holds old copies of
export const SHARED_KINDS = ['delayReasons', 'culprits', 'problems'];
export const LEGACY_KINDS = ['delayReasons', 'culprits'];

const toList = (x) => (x instanceof Map ? [...x.values()] : x || []);

// The list for lookups → Map id → item. Live project items are marked `legacy: true`; every pool item of the same id lays over them
// (deleted pool items too, marked `deleted`), so a name stays readable with its Hebrew wherever it is used.
export function sharedView(projectItems, poolItems) {
  const m = new Map();
  toList(projectItems).forEach((x) => { if (x?.id != null && !x.deleted) m.set(x.id, { ...x, legacy: true }); });
  toList(poolItems).forEach((x) => {
    if (x?.id == null) return;
    const old = m.get(x.id);
    m.set(x.id, { ...x, he: x.he || old?.he || '', legacy: false, deleted: !!x.deleted });
  });
  return m;
}

// What pickers offer → [item], sorted by name: pool items not deleted, plus old project items whose id is not in the pool at all.
// keep: ids that stay in the list even when deleted (the value a record already has, so saving its form does not drop it).
export function choiceList(view, keep = []) {
  const kept = new Set(keep.filter((x) => x != null && x !== ''));
  const out = [...view.values()].filter((x) => !x.deleted || kept.has(x.id));
  kept.forEach((id) => { if (!view.has(id)) out.push({ id, he: '', legacy: true }); });
  return out.sort((a, b) => String(a.id).localeCompare(String(b.id), 'ru'));
}

// The merge of one project's old list into the pool → { ops, conflicts }.
// pool: Map id → pool item (or a list); items: the project's documents. An item absent from the pool is added with its Hebrew;
// a live pool item with empty Hebrew gets the item's; another non-empty Hebrew is kept and the pair goes to conflicts;
// a deleted pool item is skipped (never revived). Deleted project items are ignored.
// ops: [{ id, data, added }] — `added` for new items; conflicts: [{ id, kept, other, project }].
export function mergePlan(pool, items, projectName = '') {
  const byId = pool instanceof Map ? pool : new Map(toList(pool).filter((x) => x?.id != null).map((x) => [x.id, x]));
  const ops = []; const conflicts = []; const seen = new Set();
  toList(items).forEach((x) => {
    if (x?.id == null || x.deleted || seen.has(x.id)) return;
    seen.add(x.id);
    const he = String(x.he || '').trim(); const cur = byId.get(x.id);
    if (!cur) { ops.push({ id: x.id, data: { he, deleted: false }, added: true }); return; }
    if (cur.deleted || !he) return;
    const curHe = String(cur.he || '').trim();
    if (!curHe) ops.push({ id: x.id, data: { he }, added: false });
    else if (curHe !== he) conflicts.push({ id: x.id, kept: curHe, other: he, project: projectName });
  });
  return { ops, conflicts };
}

// The pool after a plan's ops (a new Map), so the next project of the same run sees them
export function applyMerge(pool, ops) {
  const m = new Map(pool instanceof Map ? pool : toList(pool).map((x) => [x.id, x]));
  ops.forEach((o) => m.set(o.id, { ...(m.get(o.id) || {}), ...o.data, id: o.id }));
  return m;
}

// The shared lists for buildContext from raw pool documents → { delayReasons, culprits, problems } (lists; a missing kind is empty)
export function sharedFrom(pools = {}) {
  return Object.fromEntries(SHARED_KINDS.map((k) => [k, toList(pools[k])]));
}

// Shared-list items of an imported file (`reference.delayReasons`, `culprits`, `problems`) → pool writes [{ coll, id, data }]:
// only ids absent from the pool; a deleted pool item counts as present, so it is not revived. Nothing goes into project collections.
const SERVICE = ['legacy', 'projectId', 'updatedAtServer', 'createdBy', 'createdByName', 'createdAt'];
export function sharedImportOps(reference, pools = {}) {
  const ops = [];
  SHARED_KINDS.forEach((k) => {
    const have = new Set(toList(pools[k]).map((x) => x?.id));
    toList(reference?.[k]).forEach((d) => {
      if (d?.id == null || d.deleted || have.has(d.id)) return;
      have.add(d.id);
      const data = Object.fromEntries(Object.entries(d).filter(([f]) => !SERVICE.includes(f) && f !== 'id'));
      ops.push({ coll: k, id: d.id, data: { ...data, deleted: false } });
    });
  });
  return ops;
}
