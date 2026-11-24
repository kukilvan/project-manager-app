// Creates the test drawing project in test mode: «Test drawing» with the generated PDF, points at every progress stage, journal rows, a problem mark and an unlinked and a hidden caption.
// It also adds «Test drawing 2» (the same PDF, no points) for switching drawings.
// Started only by `?mem=1&memPlan=1` from src/main.js, which imports this module dynamically (its own chunk, so the live bundle never loads it). Data comes from src/domain/testplan.js (spec 7 § 6).
// Writes through the repo (createProject, save, savePool) and `patchDrawings`; the PDF goes to the device copy `pz-drawings` through `cachePut`; opens «Точки» when done.
import { getRepo, setCurrentProject, nav } from './store.js';
import { cachePut, patchDrawings } from './drawings.js';
import { testPlanData, testPlanPdf } from '../domain/testplan.js';
import { EXAMPLE_PROBLEMS } from '../domain/problems.js';
import { info } from '../log.js';

const CABLE_PROBLEM = 'Кабель';

// the shared problem «Кабель» (the example list when the pool has none) → { id, descId }
async function cableProblem(repo) {
  const find = (list) => list.find((p) => !p.deleted && p.name === CABLE_PROBLEM);
  let found = find(await repo.readPool('problems'));
  if (!found) {
    await repo.savePool(EXAMPLE_PROBLEMS.map(({ id, ...data }) => ({ coll: 'problems', id, data: { ...data, deleted: false } })), { strict: true });
    found = find(await repo.readPool('problems'));
  }
  return { id: found.id, descId: found.descs?.find((d) => !d.deleted)?.id ?? null };
}

/** Creates and opens the project «Test drawing»; returns its id */
export async function startTestPlan() {
  const repo = getRepo(); const t = testPlanData(); const bytes = testPlanPdf();
  const problem = await cableProblem(repo);
  const pid = repo.createProject({ name: 'Test drawing' });
  setCurrentProject(pid);
  await cachePut(t.drawing.id, bytes.buffer); await cachePut(t.drawing2.id, bytes.buffer.slice(0));
  const own = { size: bytes.byteLength, addedAt: new Date().toISOString(), addedBy: repo.user?.email || '', fileId: null };
  patchDrawings(pid, () => [{ ...t.drawing, ...own, unlinked: t.unlinked, hidden: t.hidden }, { ...t.drawing2, ...own }]);
  repo.save(pid, [
    ...t.configs.map((c) => ({ coll: 'configs', id: c.id, data: c })),
    ...t.points.map(({ id, ...data }) => ({ coll: 'points', id, data })),
    ...t.journal.map(({ id, ...data }) => ({ coll: 'journal', id, data })),
    ...t.marks.map(({ id, ...data }) => ({ coll: 'problemMarks', id, data: { ...data, problemId: problem.id, descId: problem.descId } })),
  ]);
  nav.ui?.go('meter');
  info(`Тестовый чертёж: проект создан, точек ${t.points.length}`);
  return pid;
}
