// Shared filters of «Точки» and «План»: the rack, type and door-configuration sets kept in memory per project while the app is open (spec 7 § 3).
// Nothing is written to the device or Firestore. Another project clears the sets; only «Точки» prunes vanished values (§ 1.5).
// createSharedFilters(pidOf) is the testable part (tests/sharedfilters.test.js); the module instance reads the project from store.js.
import { currentProject } from './store.js';

export const SHARED_KEYS = ['cab', 'type', 'cfg'];

/** A store of the three shared sets; `pidOf()` gives the current project id. */
export function createSharedFilters(pidOf) {
  let pid = null; let sets = { cab: new Set(), type: new Set(), cfg: new Set() };
  const listeners = new Set();
  const empty = () => ({ cab: new Set(), type: new Set(), cfg: new Set() });
  const fire = (key) => listeners.forEach((fn) => { try { fn(key); } catch { /* a listener must not stop the others */ } });
  function current() {
    const now = pidOf() ?? null;
    if (now !== pid) { pid = now; sets = empty(); }
    return sets;
  }
  return {
    /** The sets of the current project (another project — cleared first). Treat them as read-only; change through set(). */
    get: () => current(),
    /** Store a set for `key` ('cab' | 'type' | 'cfg') and call the listeners when it changed. */
    set(key, value) {
      const s = current(); const next = new Set(value || []);
      if (next.size === s[key].size && [...next].every((v) => s[key].has(v))) return false;
      s[key] = next; fire(key); return true;
    },
    /** Empty all three sets; listeners are called once when something was ticked. */
    clear() {
      const s = current(); const had = SHARED_KEYS.some((k) => s[k].size);
      sets = empty(); if (had) fire('all'); return had;
    },
    /** Change listener; returns the unsubscribe function. */
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

const store = createSharedFilters(() => currentProject()?.id);
export const sharedFilters = () => store.get();
export const setShared = (key, set) => store.set(key, set);
export const clearShared = () => store.clear();
export const onSharedChange = (fn) => store.onChange(fn);
