// Seeds a new database (open edition) with the starter set of the shared pool on the administrator's first sign-in.
// The set is a copy of Ivan's pool (src/data/starter-pool.json): point types, devices, cables, works and door configurations.
// Writes through the repo's `savePool`; waits for pool.js and edition.js to know the administrator.
import starter from '../data/starter-pool.json';
import { getRepo } from './store.js';
import { adminKnown } from '../edition.js';
import { isPoolAdmin, poolReady, poolHasData, onPool } from './pool.js';
import { toast } from './ui.js';
import { info } from '../log.js';

let done = false;
export function seedStarterPool() {
  if (done) return;
  const kinds = Object.entries(starter.pool || {}).filter(([, list]) => list.length);
  if (!kinds.length) return;
  const tryNow = () => {
    if (done || !poolReady() || !getRepo() || !adminKnown()) return;   // wait until the administrator is known
    done = true; off();
    if (!isPoolAdmin() || poolHasData()) return;
    const ops = kinds.flatMap(([coll, list]) => list.map(({ id, ...data }) => ({ coll, id, data: { ...data, deleted: false } })));
    for (let i = 0; i < ops.length; i += 400) getRepo().savePool(ops.slice(i, i + 400));
    info(`Стартовый набор записан в общий пул: ${ops.length}`);
    toast(`Загружен стартовый набор (${ops.length}): типы точек, устройства, кабели, работы, конфигурации дверей. Лишнее можно убрать в «Ещё → Общий пул»`);
  };
  const off = onPool(tryNow);
  tryNow();
}
