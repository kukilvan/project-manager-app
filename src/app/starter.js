// Seeds a new database (open edition) with the starter set of the shared pool on the administrator's first sign-in.
// The set is a copy of Ivan's pool (src/data/starter-pool.json): point types, devices, cables, works and door configurations.
// Writes through the repo's `savePool`, only after `readPool` says the server's pool is empty; waits for pool.js and edition.js to know the administrator.
import starter from '../data/starter-pool.json';
import { getRepo } from './store.js';
import { adminKnown } from '../edition.js';
import { isPoolAdmin, poolReady, poolHasData, onPool } from './pool.js';
import { poolEmptyOnServer } from '../domain/pool.js';
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
    const repo = getRepo();
    // the listeners may be empty only because nothing is read yet: the server confirms; no answer → nothing written, the next start asks again
    poolEmptyOnServer((k) => repo.readPool(k))
      .then((empty) => { if (empty) write(repo, kinds); })
      .catch((e) => info(`Стартовый набор не записан: общий пул с сервера не прочитан (${e?.code || e?.message || e})`));
  };
  const off = onPool(tryNow);
  tryNow();
}

function write(repo, kinds) {
  const ops = kinds.flatMap(([coll, list]) => list.map(({ id, ...data }) => ({ coll, id, data: { ...data, deleted: false } })));
  for (let i = 0; i < ops.length; i += 400) repo.savePool(ops.slice(i, i + 400));
  info(`Стартовый набор записан в общий пул: ${ops.length}`);
  toast(`Загружен стартовый набор (${ops.length}): типы точек, устройства, кабели, работы, конфигурации дверей. Лишнее можно убрать в «Ещё → Общий пул»`);
}
