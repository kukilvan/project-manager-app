// Builds the calculation context: lookup indexes over a project's data. Softly deleted records (deleted: true) are skipped.
// Pure; reached through src/domain/index.js. `data.shared` holds the pool's shared lists (shared.js); without it only the project's old lists are seen.
import { sharedView } from './shared.js';
const live = (arr) => (arr || []).filter((x) => !x.deleted);
const byId = (arr) => new Map(live(arr).map((x) => [x.id, x]));

export function buildContext(data) {
  const ctx = {
    projects: byId(data.projects),
    points: byId(data.points),
    days: byId(data.days),
    entries: byId(data.entries),
    catalog: byId(data.catalog),
    types: byId(data.types),
    cables: byId(data.cables),
    devices: byId(data.devices),
    configs: byId(data.configs),
    units: byId(data.units),
    // shared lists (ADR 0016): the pool over the project's old list; deleted pool items stay for lookups, pickers use choiceList
    culprits: sharedView(data.culprits, data.shared?.culprits),
    delayReasons: sharedView(data.delayReasons, data.shared?.delayReasons),
    // problems of the shared pool, deleted ones too (marks keep their label); used from ticket 03 on
    problems: new Map((data.shared?.problems || []).filter((x) => x?.id != null).map((x) => [x.id, x])),
    todos: byId(data.todos),
    notes: byId(data.notes),
    pulls: byId(data.pulls),
    cabinetSettings: live(data.cabinetSettings),
    journalByPoint: new Map(),
  };
  // Journal: one row = point × work. Rows without an entry are «edits» (the date and the work are stored in the row itself).
  live(data.journal).forEach((row, order) => {
    const point = ctx.points.get(row.pointId);
    if (!point) return;
    let resolved;
    if (row.entryId) {
      const entry = ctx.entries.get(row.entryId);
      const day = entry && ctx.days.get(entry.dayId);
      if (!entry || !day) return; // entry or day deleted: the row is not counted
      resolved = { date: day.date, action: entry.workType, workId: entry.workId, cableId: entry.cableId, deviceIds: entry.deviceIds, result: entry.result, ports: Array.isArray(entry.portQty) ? (entry.portQty.find((q) => q && q.id === row.pointId)?.v ?? undefined) : undefined, projectId: day.projectId, by: entry.updatedBy || entry.createdBy };
    } else {
      resolved = {
        date: row.editDate, workId: row.editWorkId, cableId: row.editCableId, deviceIds: row.editDeviceIds, action: ctx.catalog.get(row.editWorkId)?.workType,
        result: undefined, projectId: point.projectId, by: row.updatedBy || row.createdBy,
      };
    }
    const full = { id: row.id, pointId: row.pointId, order, fromEdit: !row.entryId, ...resolved };
    if (!ctx.journalByPoint.has(row.pointId)) ctx.journalByPoint.set(row.pointId, []);
    ctx.journalByPoint.get(row.pointId).push(full);
  });
  return ctx;
}
