#!/usr/bin/env node
// NAS check: probes the address of the owner's NAS copy and reports PASS, FAIL or SKIP for each acceptance check A1-A9 of docs/nas-requirements.md, plus the realtime cut time.
// Talks only to the given address over HTTP (built-in fetch); sends no credentials, creates nothing, reads and writes no file, needs no dependency.
// Spec: .scratch/02-nas-requirements/spec.md, section 4.
//
// Contents:
// - parseArgs() — the command line: the address (https://, or http:// for 127.0.0.1 and localhost only), --quick, --hold, --help
// - judgeA1() … judgeA9() — pure: one stubbed or real response (or two) in, one result line out
// - checkRealtime() — A7 and A7i: connect to the realtime stream, hold it open, reconnect after a cut
// - runChecks() — the network part: runs A1-A9 in order through a fetch function that tests can replace
// - formatResult(), summaryLine(), exitCode() — the output lines and the exit code
// - main() and the CLI: node tools/nas-check.mjs https://<host> [--quick] [--hold <seconds>]
// Exit codes: 0 — no check failed; 1 — a check failed; 2 — bad usage or the address cannot be reached.
import { parseArgs as nodeParseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

export const USER_AGENT = 'project-manager-nas-check';
export const REQUEST_TIMEOUT_MS = 15000;
export const CONNECT_TIMEOUT_MS = 10000;
export const DEFAULT_HOLD_S = 150;
export const BODY_CUT = 120;
const FOREIGN_ORIGIN = 'https://example.com';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

// Plain ASCII on purpose: the owner's PowerShell window may print other characters wrongly.
export const USAGE = [
  'Usage: node tools/nas-check.mjs https://<host> [--quick] [--hold <seconds>]',
  '',
  'Checks a NAS address against the acceptance checks A1-A9 of docs/nas-requirements.md.',
  'Sends no credentials and changes nothing.',
  '',
  '  https://<host>   the address of the NAS copy; plain http:// only for 127.0.0.1 and',
  '                   localhost (local testing: the checks that need Cloudflare are skipped)',
  '  --quick          skip the realtime hold of A7 (only check that the stream connects)',
  `  --hold <s>       how long A7 holds the realtime stream open (default ${DEFAULT_HOLD_S})`,
  '  --help           this text',
  '',
  'Exit code: 0 no check failed, 1 a check failed, 2 bad usage or the address cannot be reached.',
].join('\n');

// Command line → { help } | { error } | { base, local, quick, hold }. Never throws.
export function parseArgs(argv) {
  let parsed;
  try {
    parsed = nodeParseArgs({
      args: argv,
      allowPositionals: true,
      options: { quick: { type: 'boolean' }, hold: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
    });
  } catch (e) {
    return { error: e.message };
  }
  const { values, positionals } = parsed;
  if (values.help || positionals.length === 0) return { help: true };
  if (positionals.length > 1) return { error: 'give one address only' };
  let url;
  try { url = new URL(positionals[0]); } catch { return { error: `not an address: ${positionals[0]}` }; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { error: `the address must start with https:// (got ${positionals[0]})` };
  const local = LOCAL_HOSTS.has(url.hostname);
  if (url.protocol === 'http:' && !local) return { error: 'a plain http:// address is refused: use https:// (http:// is only for 127.0.0.1 and localhost)' };
  if (url.pathname !== '/' || url.search || url.hash) return { error: 'give the address without a path, like https://<host>' };
  let hold = DEFAULT_HOLD_S;
  if (values.hold !== undefined) {
    hold = Number(values.hold);
    if (!values.hold.trim() || !Number.isFinite(hold) || hold <= 0) return { error: `--hold needs a number of seconds above 0 (got ${values.hold})` };
  }
  return { base: url.origin, local, quick: Boolean(values.quick), hold };
}

// ---------- results and responses ----------
// A response snapshot is { status, headers (a Headers), text }, or { error } when there was no HTTP answer.

const cut = (t) => String(t ?? '').slice(0, BODY_CUT).replace(/\s+/g, ' ').trim();
const describe = (res) => (res.error ? `no answer: ${res.error}` : `${res.status} ${cut(res.text)}`.trim());
const pass = (id, text) => ({ id, status: 'PASS', text });
const skip = (id, text) => ({ id, status: 'SKIP', text });
const info = (id, text) => ({ id, status: 'INFO', text });
const fail = (id, text, expected, res) => ({ id, status: 'FAIL', text, expected, got: describe(res) });
const asJson = (res) => { try { return JSON.parse(res.text); } catch { return null; } };
const isHtml = (res) => /text\/html/i.test(res.headers?.get('content-type') || '');
const secs = (s) => String(s >= 10 ? Math.round(s) : Math.round(s * 10) / 10);

export function judgeA1(res) {
  const expected = '200 and {"message":"API is healthy."}';
  if (!res.error && res.status === 200 && asJson(res)?.message === 'API is healthy.') return pass('A1', 'health answers 200: API is healthy');
  return fail('A1', 'health check did not answer like PocketBase', expected, res);
}

export function judgeA2(res) {
  const expected = '301, 302, 307 or 308 with a Location that starts with https://';
  if (res.error) return fail('A2', 'plain http request failed', expected, res);
  const location = res.headers.get('location') || '';
  if ([301, 302, 307, 308].includes(res.status) && location.startsWith('https://')) return pass('A2', `http:// redirects to https:// (${res.status})`);
  if (res.status === 200) return fail('A2', 'plain http serves the API instead of redirecting', expected, res);
  return fail('A2', 'plain http does not redirect to https://', expected, res);
}

export function judgeA3a(res) {
  const expected = '403 (blocked by the Cloudflare rule)';
  if (!res.error && res.status === 403) return pass('A3a', 'the dashboard /_/ is blocked (403)');
  if (!res.error && res.status === 200) return fail('A3a', 'the dashboard /_/ is reachable from the internet', expected, res);
  return fail('A3a', 'the dashboard /_/ did not answer 403', expected, res);
}

export function judgeA3b(res) {
  const expected = '403 (blocked by the Cloudflare rule)';
  if (!res.error && res.status === 403) return pass('A3b', 'the superuser login is blocked (403)');
  if (!res.error && res.status === 400) return fail('A3b', 'PocketBase answered the superuser login: it is not blocked', expected, res);
  return fail('A3b', 'the superuser login did not answer 403', expected, res);
}

export function judgeA4(res) {
  const expected = '400 and data.requests.code = validation_required';
  if (!res.error && res.status === 400 && asJson(res)?.data?.requests?.code === 'validation_required') return pass('A4', 'batch is on (empty batch rejected with validation_required)');
  if (!res.error && res.status === 403) return fail('A4', 'batch is off (Settings > Application > Batch)', expected, res);
  return fail('A4', 'batch did not answer like an enabled PocketBase', expected, res);
}

export function judgeA5(res) {
  const expected = 'password.enabled false, oauth2.enabled true, a provider named google';
  if (res.error || res.status !== 200) return fail('A5', 'auth methods of the users collection could not be read', expected, res);
  const j = asJson(res);
  if (!j) return fail('A5', 'auth methods are not JSON', expected, res);
  const problems = [];
  if (j.password?.enabled !== false) problems.push('password sign-in is on');
  if (j.oauth2?.enabled !== true) problems.push('OAuth2 is off');
  else if (!(j.oauth2.providers || []).some((p) => p?.name === 'google')) problems.push('no google provider');
  if (problems.length) return fail('A5', `sign-in methods are wrong: ${problems.join('; ')}`, expected, res);
  return pass('A5', 'password sign-in is off, OAuth2 is on with the google provider');
}

export function judgeA6(res) {
  const expected = `no Access-Control-Allow-Origin, or one that is neither * nor ${FOREIGN_ORIGIN}`;
  if (res.error) return fail('A6', 'CORS request failed', expected, res);
  const allow = res.headers.get('access-control-allow-origin');
  if (allow === '*' || allow === FOREIGN_ORIGIN) return fail('A6', `a foreign origin is allowed (Access-Control-Allow-Origin: ${allow})`, expected, { status: res.status, text: `Access-Control-Allow-Origin: ${allow}` });
  return pass('A6', `no CORS for a foreign origin (Access-Control-Allow-Origin: ${allow || 'absent'})`);
}

export function judgeA8(first, second) {
  const expected = 'a second answer for sw.js that is not served from the Cloudflare cache (cf-cache-status not HIT)';
  if (first.error) return fail('A8', 'sw.js request failed', expected, first);
  if (first.status === 404 || (first.status === 200 && isHtml(first))) return skip('A8', 'no sw.js yet: the site is not there');
  if (first.status !== 200) return fail('A8', 'sw.js did not answer 200', expected, first);
  if (second.error) return fail('A8', 'second sw.js request failed', expected, second);
  const cache = second.headers.get('cf-cache-status');
  if (/^hit$/i.test(cache || '')) return fail('A8', 'Cloudflare serves sw.js from its cache (cf-cache-status: HIT): add the Bypass cache rule', expected, { status: second.status, text: 'cf-cache-status: HIT' });
  return pass('A8', `sw.js is not served from the edge cache (cf-cache-status: ${cache || 'absent'})`);
}

export function judgeA9(index, manifest) {
  const expected = 'an HTML page with rel="manifest" and a manifest with start_url "/"';
  if (manifest.error) return fail('A9', 'manifest request failed', expected, manifest);
  const m = manifest.status === 200 && !isHtml(manifest) ? asJson(manifest) : null;
  if (!m) return skip('A9', 'no manifest yet: the site is not there');
  if (m.start_url !== '/') return fail('A9', `the app is built for another base (manifest start_url is ${JSON.stringify(m.start_url)})`, expected, { status: manifest.status, text: manifest.text });
  if (index.error || index.status !== 200 || !/rel=["']manifest["']/i.test(index.text)) return fail('A9', 'the start page does not link the manifest', expected, index);
  return pass('A9', 'the site is the app built for / (manifest start_url "/")');
}

// ---------- network ----------

const TIMEOUT = Symbol('timeout');
// The promise's value, or TIMEOUT after ms. The timer is always cleared.
function race(promise, ms) {
  let timer;
  const late = new Promise((resolve) => { timer = setTimeout(() => resolve(TIMEOUT), ms); });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

const errText = (e) => `${e?.message || e}${e?.cause ? ` (${e.cause.code || e.cause.message})` : ''}`;

// One request → a response snapshot, or { error } on a timeout or a network error. The 15 s limit covers the body too.
async function request(fetchFn, url, { method = 'GET', headers = {}, body, redirect = 'follow', timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const ctl = new AbortController();
  const work = (async () => {
    const r = await fetchFn(url, { method, headers: { 'user-agent': USER_AGENT, ...headers }, body, redirect, signal: ctl.signal });
    return { status: r.status, headers: r.headers, text: await r.text() };
  })();
  try {
    const res = await race(work, timeoutMs);
    if (res === TIMEOUT) { ctl.abort(); return { error: `timeout after ${secs(timeoutMs / 1000)} s` }; }
    return res;
  } catch (e) {
    return { error: errText(e) };
  }
}

// Opens the realtime stream and waits for PB_CONNECT → { reader, stop, connectedAt } or { error, res }.
async function openStream(fetchFn, base, connectMs) {
  const ctl = new AbortController();
  const stop = () => { try { ctl.abort(); } catch { /* already closed */ } };
  const started = Date.now();
  try {
    const r = await race(fetchFn(`${base}/api/realtime`, { headers: { 'user-agent': USER_AGENT, accept: 'text/event-stream' }, signal: ctl.signal }), connectMs);
    if (r === TIMEOUT) { stop(); return { error: `no answer within ${secs(connectMs / 1000)} s`, res: { error: 'timeout' } }; }
    if (r.status !== 200 || !r.body) {
      const text = await race(r.text().catch(() => ''), connectMs);
      stop();
      return { error: 'the stream did not open', res: { status: r.status, text: text === TIMEOUT ? '' : text } };
    }
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let seen = '';
    while (!seen.includes('PB_CONNECT')) {
      const chunk = await race(reader.read(), Math.max(connectMs - (Date.now() - started), 0));
      if (chunk === TIMEOUT) { stop(); return { error: `no PB_CONNECT within ${secs(connectMs / 1000)} s`, res: { status: 200, text: seen } }; }
      if (chunk.done) { stop(); return { error: 'the stream closed before PB_CONNECT', res: { status: 200, text: seen } }; }
      seen += decoder.decode(chunk.value, { stream: true });
    }
    return { reader, stop, connectedAt: Date.now() };
  } catch (e) {
    stop();
    return { error: errText(e), res: { error: errText(e) } };
  }
}

// Reads the open stream for up to holdMs → { cut: false } (still open) or { cut: true, afterS } (it closed or broke).
async function holdStream(opened, holdMs) {
  const endAt = Date.now() + holdMs;
  for (;;) {
    const left = endAt - Date.now();
    if (left <= 0) return { cut: false };
    let chunk;
    try { chunk = await race(opened.reader.read(), left); } catch { chunk = { done: true }; }
    if (chunk === TIMEOUT) return { cut: false };
    if (chunk.done) return { cut: true, afterS: (Date.now() - opened.connectedAt) / 1000 };
  }
}

// A7 and A7i. quick: only the connect. Otherwise hold the stream; if it is cut, a second connection must work.
export async function checkRealtime({ fetchFn, base, quick = false, hold = DEFAULT_HOLD_S, connectTimeoutMs = CONNECT_TIMEOUT_MS, onProgress = () => {} }) {
  const expected = `PB_CONNECT within ${secs(connectTimeoutMs / 1000)} s${quick ? '' : ', and after a cut a second connection with PB_CONNECT'}`;
  const first = await openStream(fetchFn, base, connectTimeoutMs);
  if (first.error) return [fail('A7', `realtime did not connect: ${first.error}`, expected, first.res)];
  if (quick) {
    first.stop();
    return [pass('A7', 'realtime connects (PB_CONNECT); the hold was skipped (--quick)')];
  }
  onProgress(`holding the realtime stream open for up to ${secs(hold)} s (--quick skips this)`);
  const held = await holdStream(first, hold * 1000);
  first.stop();
  if (!held.cut) {
    return [pass('A7', `realtime connects and stays open for ${secs(hold)} s`), info('A7i', `realtime stream still open after ${secs(hold)} s`)];
  }
  const cutLine = info('A7i', `realtime stream cut after ${secs(held.afterS)} s idle`);
  const second = await openStream(fetchFn, base, connectTimeoutMs);
  if (second.error) return [fail('A7', `realtime did not reconnect after the cut: ${second.error}`, expected, second.res), cutLine];
  second.stop();
  return [pass('A7', 'realtime connects and reconnects after a cut'), cutLine];
}

// Runs A1-A9 in order → { results, unreachable }. onResult is called with each result as soon as it is known.
// unreachable: A1 got no HTTP answer at all (the tool stops there). fetch can be replaced by a stub.
export async function runChecks({ base, local, quick = false, hold = DEFAULT_HOLD_S, fetch: fetchFn = globalThis.fetch, onResult = () => {}, onProgress = () => {}, requestTimeoutMs = REQUEST_TIMEOUT_MS, connectTimeoutMs = CONNECT_TIMEOUT_MS }) {
  const results = [];
  const emit = (r) => { results.push(r); onResult(r); };
  const get = (path, opts) => request(fetchFn, `${base}${path}`, { timeoutMs: requestTimeoutMs, ...opts });
  const post = (path, json) => get(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(json) });
  const localSkip = 'a local address: this check needs Cloudflare';

  const a1 = await get('/api/health');
  if (a1.error) return { results, unreachable: a1.error };
  emit(judgeA1(a1));

  if (local) emit(skip('A2', localSkip));
  else emit(judgeA2(await request(fetchFn, `http://${new URL(base).hostname}/api/health`, { redirect: 'manual', timeoutMs: requestTimeoutMs })));

  if (local) { emit(skip('A3a', localSkip)); emit(skip('A3b', localSkip)); }
  else {
    emit(judgeA3a(await get('/_/')));
    emit(judgeA3b(await post('/api/collections/_superusers/auth-with-password', { identity: 'check@example.com', password: 'x' })));
  }

  emit(judgeA4(await post('/api/batch', { requests: [] })));
  emit(judgeA5(await get('/api/collections/users/auth-methods')));
  emit(judgeA6(await get('/api/health', { method: 'OPTIONS', headers: { origin: FOREIGN_ORIGIN, 'access-control-request-method': 'GET' } })));
  for (const r of await checkRealtime({ fetchFn, base, quick, hold, connectTimeoutMs, onProgress })) emit(r);

  if (local) emit(skip('A8', localSkip));
  else {
    const first = await get('/sw.js');
    emit(judgeA8(first, first.error || first.status !== 200 || isHtml(first) ? first : await get('/sw.js')));
  }

  const [index, manifest] = [await get('/'), await get('/manifest.webmanifest')];
  emit(judgeA9(index, manifest));
  return { results, unreachable: null };
}

// ---------- output ----------

export function formatResult(r) {
  const lines = [`${r.status.padEnd(4)} ${r.id.padEnd(3)} ${r.text}`];
  if (r.status === 'FAIL') {
    if (r.expected) lines.push(`         expected: ${r.expected}`);
    if (r.got) lines.push(`         got: ${r.got}`);
  }
  return lines.join('\n');
}

const count = (results, status) => results.filter((r) => r.status === status).length;
export const summaryLine = (results) => `Summary: ${count(results, 'PASS')} pass, ${count(results, 'FAIL')} fail, ${count(results, 'SKIP')} skip`;
export const exitCode = (results) => (count(results, 'FAIL') ? 1 : 0);

// The whole run → the exit code. io: { fetch, out, err } and the timeouts, replaced by tests.
export async function main(argv, { out = (s) => console.log(s), err = (s) => console.error(s), ...rest } = {}) {
  const a = parseArgs(argv);
  if (a.help) { out(USAGE); return 2; }
  if (a.error) { err(`nas-check: ${a.error}`); err(''); err(USAGE); return 2; }
  out(`NAS check of ${a.base}${a.local ? ' (a local address: the checks that need Cloudflare are skipped)' : ''}`);
  const { results, unreachable } = await runChecks({
    ...rest,
    base: a.base,
    local: a.local,
    quick: a.quick,
    hold: a.hold,
    onResult: (r) => out(formatResult(r)),
    onProgress: (t) => out(`     ... ${t}`),
  });
  if (unreachable) { err(`cannot reach ${a.base}: ${unreachable}`); return 2; }
  out(summaryLine(results));
  return exitCode(results);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
