// Checks the question asked before the starter set is written into the shared pool (poolEmptyOnServer, src/domain/pool.js; ticket 4.14):
// only a server pool with no document at all counts as empty, deleted documents count, and a failed read is not an empty pool.
import test from 'node:test';
import assert from 'node:assert/strict';
import { poolEmptyOnServer, POOL_KINDS } from '../src/domain/pool.js';

const server = (pool) => async (kind) => pool[kind] || [];

test('a server pool with no document is empty: every kind is asked', async () => {
  const asked = [];
  assert.equal(await poolEmptyOnServer(async (k) => { asked.push(k); return []; }), true);
  assert.deepEqual(asked, POOL_KINDS);
});

test('one document of any kind, a deleted one too, means the pool is not empty', async () => {
  for (const k of POOL_KINDS) {
    assert.equal(await poolEmptyOnServer(server({ [k]: [{ id: 'x' }] })), false, k);
    assert.equal(await poolEmptyOnServer(server({ [k]: [{ id: 'x', deleted: true }] })), false, `${k}, deleted`);
  }
});

test('a failed read throws: nothing is decided without the server', async () => {
  await assert.rejects(poolEmptyOnServer(async () => { throw Object.assign(new Error('offline'), { code: 'unavailable' }); }), /offline/);
});
