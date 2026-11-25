// Starts a real PocketBase for the server tests and talks to it: JSON requests, the write route, a small realtime (SSE) client.
// Shared by tests/pb-*.test.js; not a test itself. Uses tools/pb-dev.mjs (the binary in .cache/pocketbase/, fetched by
// `node tools/pb-dev.mjs fetch`). Without the binary the server tests are skipped with a message, unless PB_TESTS_REQUIRED=1 (CI), then they fail.
import fs from 'node:fs';
import { binaryPath, startPocketBase, stopPocketBase, ensureUser, PB_VERSION } from '../tools/pb-dev.mjs';

export const REQUIRED = process.env.PB_TESTS_REQUIRED === '1';

// null when the binary is there; otherwise why the server tests are skipped
export function missingBinary() {
  let bin;
  try { bin = binaryPath(); } catch (e) { return e.message; }
  return fs.existsSync(bin) ? null : `PocketBase ${PB_VERSION} is not in .cache/pocketbase (run: node tools/pb-dev.mjs fetch); server tests skipped`;
}

export async function api(url, path, { method = 'GET', token, body, raw } = {}) {
  const res = await fetch(url + path, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: token } : {}) },
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  return { status: res.status, json, text };
}

// A server with the repo's migrations and hooks, the test users A, B, C and helpers bound to it
export async function startServer(opts = {}) {
  const pb = await startPocketBase(opts);
  const call = (path, o) => api(pb.url, path, o);
  return {
    ...pb,
    call,
    su: (path, o = {}) => call(path, { ...o, token: pb.superToken }),
    save: (token, ops, schema = 1) => call('/api/pm/save', { method: 'POST', token, body: { schema, ops } }),
    user: (email, name) => ensureUser(pb.url, pb.superToken, { email, name }),
    // every record of a collection as the superuser sees it (filter optional)
    all: async (coll, filter) => {
      const q = `?perPage=1000${filter ? `&filter=${encodeURIComponent(filter)}` : ''}`;
      const r = await call(`/api/collections/${coll}/records${q}`, { token: pb.superToken });
      if (r.status !== 200) throw new Error(`list ${coll}: ${r.text}`);
      return r.json.items;
    },
    stop: () => stopPocketBase(pb, { removeData: true }),
  };
}

// A realtime client: connects to /api/realtime, subscribes to `topics` with `token` (or as a guest) and keeps every event.
// Returns { events: [{event, data}], waitFor(pred, ms) → the event or null, close() }.
export async function realtime(url, token, topics) {
  const ctl = new AbortController();
  const res = await fetch(`${url}/api/realtime`, { signal: ctl.signal, headers: { Accept: 'text/event-stream' } });
  const events = [];
  const waiters = [];
  let clientId = null;
  let onConnect;
  const connected = new Promise((r) => { onConnect = r; });
  (async () => {
    const dec = new TextDecoder();
    let buf = '';
    try {
      for await (const chunk of res.body) {
        buf += dec.decode(chunk, { stream: true }).replace(/\r/g, '');
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          let event = 'message'; let data = '';
          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          let parsed = data;
          try { parsed = JSON.parse(data); } catch { /* text */ }
          if (event === 'PB_CONNECT') { clientId = parsed.clientId; onConnect(); continue; }
          const ev = { event, data: parsed, at: Date.now() };
          events.push(ev);
          for (const w of waiters.slice()) if (w.pred(ev)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(ev); }
        }
      }
    } catch { /* aborted */ }
  })();
  await connected;
  const sub = await api(url, '/api/realtime', { method: 'POST', token, body: { clientId, subscriptions: topics } });
  if (sub.status !== 204) throw new Error(`realtime subscribe: ${sub.status} ${sub.text}`);
  return {
    events,
    waitFor(pred, ms) {
      const found = events.find(pred);
      if (found) return Promise.resolve(found);
      return new Promise((resolve) => {
        const timer = setTimeout(() => { const k = waiters.indexOf(w); if (k >= 0) { waiters.splice(k, 1); resolve(null); } }, ms);
        const w = { pred, resolve: (ev) => { clearTimeout(timer); resolve(ev); } };
        waiters.push(w);
      });
    },
    close() { ctl.abort(); },
  };
}
