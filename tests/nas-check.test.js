// Checks the NAS check tool (tools/nas-check.mjs) with stubbed responses, and guards the NAS document docs/nas-requirements.md; offline.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  parseArgs, judgeA1, judgeA2, judgeA3a, judgeA3b, judgeA4, judgeA5, judgeA6, judgeA8, judgeA9,
  checkRealtime, runChecks, formatResult, summaryLine, exitCode, main, USAGE, USER_AGENT, DEFAULT_HOLD_S, SUPERUSERS_ID,
} from '../tools/nas-check.mjs';

// A response snapshot as the tool's judges expect it
const res = (status, text = '', headers = {}) => ({ status, headers: new Headers(headers), text });
const json = (status, obj, headers = {}) => res(status, JSON.stringify(obj), { 'content-type': 'application/json', ...headers });
const enc = new TextEncoder();
const CONNECT = 'event: PB_CONNECT\nid: abc\ndata: {"clientId":"abc"}\n\n';

// ---------- arguments ----------

test('args: no address or --help prints the usage', () => {
  assert.deepEqual(parseArgs([]), { help: true });
  assert.deepEqual(parseArgs(['--help']), { help: true });
  assert.deepEqual(parseArgs(['--quick']), { help: true });
  assert.match(USAGE, /--quick/);
  assert.match(USAGE, /--hold/);
});

test('args: https address, defaults, --quick and --hold', () => {
  assert.equal(DEFAULT_HOLD_S, 150);
  assert.deepEqual(parseArgs(['https://pm.example.com']), { base: 'https://pm.example.com', local: false, quick: false, hold: DEFAULT_HOLD_S });
  assert.deepEqual(parseArgs(['https://pm.example.com/']), { base: 'https://pm.example.com', local: false, quick: false, hold: DEFAULT_HOLD_S });
  assert.equal(parseArgs(['https://pm.example.com', '--quick']).quick, true);
  assert.equal(parseArgs(['--hold', '20', 'https://pm.example.com']).hold, 20);
  assert.equal(parseArgs(['https://pm.example.com', '--hold', '2.5']).hold, 2.5);
});

test('args: a remote http:// address is refused, local ones are allowed', () => {
  assert.match(parseArgs(['http://pm.example.com']).error, /http:\/\//);
  assert.match(parseArgs(['http://192.168.1.5:8090']).error, /http:\/\//);
  assert.deepEqual(parseArgs(['http://127.0.0.1:8090']), { base: 'http://127.0.0.1:8090', local: true, quick: false, hold: DEFAULT_HOLD_S });
  assert.deepEqual(parseArgs(['http://localhost:8090']), { base: 'http://localhost:8090', local: true, quick: false, hold: DEFAULT_HOLD_S });
});

test('args: bad input is an error, not a throw', () => {
  assert.ok(parseArgs(['127.0.0.1:8090']).error);
  assert.ok(parseArgs(['not an address']).error);
  assert.ok(parseArgs(['https://pm.example.com/some/path']).error);
  assert.ok(parseArgs(['https://a.example.com', 'https://b.example.com']).error);
  assert.ok(parseArgs(['https://pm.example.com', '--hold', '0']).error);
  assert.ok(parseArgs(['https://pm.example.com', '--hold', 'abc']).error);
  assert.ok(parseArgs(['https://pm.example.com', '--hold']).error);
  assert.ok(parseArgs(['https://pm.example.com', '--nope']).error);
});

// ---------- judges ----------

test('A1: health', () => {
  assert.equal(judgeA1(json(200, { message: 'API is healthy.' })).status, 'PASS');
  assert.equal(judgeA1(json(200, { message: 'other' })).status, 'FAIL');
  assert.equal(judgeA1(res(200, '<html>a page</html>')).status, 'FAIL');
  assert.equal(judgeA1(res(502, 'Bad gateway')).status, 'FAIL');
  assert.equal(judgeA1({ error: 'timeout after 15 s' }).status, 'FAIL');
});

test('A2: http redirects to https', () => {
  for (const code of [301, 302, 307, 308]) assert.equal(judgeA2(res(code, '', { location: 'https://pm.example.com/api/health' })).status, 'PASS');
  assert.equal(judgeA2(res(301, '', { location: 'http://pm.example.com/' })).status, 'FAIL');
  assert.equal(judgeA2(res(301)).status, 'FAIL');
  const served = judgeA2(json(200, { message: 'API is healthy.' }));
  assert.equal(served.status, 'FAIL');
  assert.match(served.text, /serves the API/);
  assert.equal(judgeA2({ error: 'connect ECONNREFUSED' }).status, 'FAIL');
});

test('A3: the dashboard and the superuser login are blocked', () => {
  assert.equal(judgeA3a(res(403, 'blocked')).status, 'PASS');
  assert.equal(judgeA3a(res(200, '<html>PocketBase</html>')).status, 'FAIL');
  assert.match(judgeA3a(res(200, '<html>')).text, /reachable/);
  assert.equal(judgeA3a(res(404)).status, 'FAIL');
  const blocked = res(403, 'blocked');
  const answered = json(400, { message: 'Failed to authenticate.' });
  assert.equal(judgeA3b(blocked, blocked).status, 'PASS');
  const open = judgeA3b(answered, blocked);
  assert.equal(open.status, 'FAIL');
  assert.match(open.text, /by name: it is not blocked/);
  // the Cloudflare rule covers the name but not the collection id
  const byId = judgeA3b(blocked, answered);
  assert.equal(byId.status, 'FAIL');
  assert.match(byId.text, new RegExp(`by id ${SUPERUSERS_ID}: it is not blocked`));
  assert.equal(judgeA3b(res(500), blocked).status, 'FAIL');
  assert.equal(judgeA3b(blocked, { error: 'timeout after 15 s' }).status, 'FAIL');
});

test('A4: batch is on', () => {
  assert.equal(judgeA4(json(400, { data: { requests: { code: 'validation_required' } } })).status, 'PASS');
  const off = judgeA4(json(403, { message: 'Batch requests are not allowed.' }));
  assert.equal(off.status, 'FAIL');
  assert.match(off.text, /batch is off/);
  assert.equal(judgeA4(json(400, { data: {} })).status, 'FAIL');
  assert.equal(judgeA4(res(429, 'too many')).status, 'FAIL');
});

test('A5: password off, Google provider on; the text names the part', () => {
  const methods = (password, oauth2) => json(200, { password: { enabled: password }, oauth2 });
  const google = { enabled: true, providers: [{ name: 'google' }] };
  assert.equal(judgeA5(methods(false, google)).status, 'PASS');
  const pw = judgeA5(methods(true, google));
  assert.equal(pw.status, 'FAIL');
  assert.match(pw.text, /password sign-in is on/);
  const off = judgeA5(methods(false, { enabled: false, providers: [] }));
  assert.match(off.text, /OAuth2 is off/);
  const noGoogle = judgeA5(methods(false, { enabled: true, providers: [{ name: 'github' }] }));
  assert.match(noGoogle.text, /no google provider/);
  const both = judgeA5(methods(true, { enabled: false, providers: [] }));
  assert.match(both.text, /password sign-in is on; OAuth2 is off/);
  assert.equal(judgeA5(res(404, 'no users collection')).status, 'FAIL');
  assert.equal(judgeA5(res(200, 'not json')).status, 'FAIL');
});

test('A6: no CORS for a foreign origin', () => {
  assert.equal(judgeA6(res(204)).status, 'PASS');
  assert.equal(judgeA6(res(204, '', { 'access-control-allow-origin': 'https://pm.example.org' })).status, 'PASS');
  assert.equal(judgeA6(res(204, '', { 'access-control-allow-origin': '*' })).status, 'FAIL');
  assert.equal(judgeA6(res(204, '', { 'access-control-allow-origin': 'https://example.com' })).status, 'FAIL');
  assert.equal(judgeA6({ error: 'timeout after 15 s' }).status, 'FAIL');
});

test('A8: the app files are not cached at the edge; skipped while the site is not there', () => {
  const sw = (cf) => res(200, '// sw', { 'content-type': 'text/javascript', ...(cf ? { 'cf-cache-status': cf } : {}) });
  assert.equal(judgeA8(sw(), sw()).status, 'PASS');
  assert.equal(judgeA8(sw('MISS'), sw('BYPASS')).status, 'PASS');
  assert.equal(judgeA8(sw('MISS'), sw('HIT')).status, 'FAIL');
  assert.equal(judgeA8(sw('MISS'), sw('hit')).status, 'FAIL');
  assert.equal(judgeA8(res(404, 'not found'), res(404)).status, 'SKIP');
  assert.equal(judgeA8(res(200, '<html>placeholder</html>', { 'content-type': 'text/html' }), res(200)).status, 'SKIP');
  assert.equal(judgeA8(res(500, 'oops'), res(500)).status, 'FAIL');
  assert.equal(judgeA8({ error: 'timeout' }, res(200)).status, 'FAIL');
  assert.equal(judgeA8(sw('MISS'), res(502, 'Bad gateway')).status, 'FAIL');
});

test('A9: the site is the app built for /', () => {
  const page = res(200, '<html><link rel="manifest" href="/manifest.webmanifest"></html>', { 'content-type': 'text/html' });
  const manifest = (start) => json(200, { name: 'x', start_url: start }, { 'content-type': 'application/manifest+json' });
  assert.equal(judgeA9(page, manifest('/')).status, 'PASS');
  const wrongBase = judgeA9(page, manifest('/project-manager-app/'));
  assert.equal(wrongBase.status, 'FAIL');
  assert.match(wrongBase.text, /another base/);
  assert.equal(judgeA9(res(404), res(404)).status, 'SKIP');
  assert.equal(judgeA9(page, res(200, '<html>placeholder</html>', { 'content-type': 'text/html' })).status, 'SKIP');
  assert.equal(judgeA9(res(200, '<html></html>', { 'content-type': 'text/html' }), manifest('/')).status, 'FAIL');
  assert.equal(judgeA9(page, { error: 'timeout' }).status, 'FAIL');
  // a broken site is a FAIL, not "the site is not there"
  assert.equal(judgeA9(page, res(500, 'oops')).status, 'FAIL');
  assert.equal(judgeA9(page, res(200, 'not json', { 'content-type': 'text/plain' })).status, 'FAIL');
});

// ---------- output ----------

test('a FAIL line shows what was expected and the first 120 characters of the body', () => {
  const body = 'x'.repeat(500);
  const r = judgeA1(res(502, body));
  const lines = formatResult(r).split('\n');
  assert.match(lines[0], /^FAIL A1 /);
  assert.match(lines[1], /expected:/);
  assert.equal(lines[2].trim(), `got: 502 ${'x'.repeat(120)}`);
  assert.equal(formatResult(judgeA1(json(200, { message: 'API is healthy.' }))).split('\n').length, 1);
});

test('the summary line and the exit code', () => {
  const p = { id: 'A1', status: 'PASS', text: '' };
  const f = { id: 'A2', status: 'FAIL', text: '' };
  const s = { id: 'A3a', status: 'SKIP', text: '' };
  const i = { id: 'A7i', status: 'INFO', text: '' };
  assert.equal(summaryLine([p, p, f, s, s, s, i]), 'Summary: 2 pass, 1 fail, 3 skip');
  assert.equal(exitCode([p, s, i]), 0);
  assert.equal(exitCode([p, f]), 1);
});

// ---------- realtime ----------

// A fake fetch for /api/realtime: each call takes the next script { status, closeAfterMs, connect } and returns a Response
function realtimeFetch(scripts) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const s = scripts[Math.min(calls.length - 1, scripts.length - 1)];
    if (s.throws) throw new Error(s.throws);
    if (s.status && s.status !== 200) return new Response('nope', { status: s.status });
    let timer;
    const body = new ReadableStream({
      start(c) {
        if (s.connect !== false) c.enqueue(enc.encode(CONNECT));
        if (s.closeAfterMs !== undefined) timer = setTimeout(() => c.close(), s.closeAfterMs);
      },
      cancel() { clearTimeout(timer); },
    });
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
  fn.calls = calls;
  return fn;
}

test('A7: a stream cut after 1 s and a reconnect that connects → PASS and the cut time', async () => {
  const fetchFn = realtimeFetch([{ closeAfterMs: 1000 }, {}]);
  const out = await checkRealtime({ fetchFn, base: 'http://x', hold: 2 });
  assert.equal(out[0].id, 'A7');
  assert.equal(out[0].status, 'PASS');
  assert.match(out[0].text, /reconnects/);
  assert.equal(out[1].id, 'A7i');
  assert.equal(out[1].status, 'INFO');
  assert.match(out[1].text, /cut after 1(\.\d)? s idle/);
  assert.equal(fetchFn.calls.length, 2);
});

test('A7: a failed reconnect → FAIL', async () => {
  const fetchFn = realtimeFetch([{ closeAfterMs: 50 }, { status: 502 }]);
  const out = await checkRealtime({ fetchFn, base: 'http://x', hold: 2 });
  assert.equal(out[0].status, 'FAIL');
  assert.match(out[0].text, /reconnect/);
  assert.match(out[0].got, /502/);
  assert.equal(out[1].id, 'A7i');
});

test('A7: a stream that stays open for the hold → PASS and "still open"', async () => {
  const fetchFn = realtimeFetch([{}]);
  const out = await checkRealtime({ fetchFn, base: 'http://x', hold: 0.3 });
  assert.equal(out[0].status, 'PASS');
  assert.equal(out[1].text, 'realtime stream still open after 0.3 s');
  assert.equal(fetchFn.calls.length, 1);
});

test('A7: no PB_CONNECT, a bad status or a network error → FAIL', async () => {
  const silent = await checkRealtime({ fetchFn: realtimeFetch([{ connect: false }]), base: 'http://x', hold: 1, connectTimeoutMs: 100 });
  assert.equal(silent.length, 1);
  assert.equal(silent[0].status, 'FAIL');
  assert.match(silent[0].text, /PB_CONNECT/);
  const bad = await checkRealtime({ fetchFn: realtimeFetch([{ status: 404 }]), base: 'http://x', hold: 1 });
  assert.equal(bad[0].status, 'FAIL');
  assert.match(bad[0].got, /404/);
  const down = await checkRealtime({ fetchFn: realtimeFetch([{ throws: 'fetch failed' }]), base: 'http://x', hold: 1 });
  assert.equal(down[0].status, 'FAIL');
});

test('A7 --quick: only the connect, no A7i line, no hold', async () => {
  const fetchFn = realtimeFetch([{ closeAfterMs: 10 }]);
  const out = await checkRealtime({ fetchFn, base: 'http://x', quick: true, hold: 100 });
  assert.equal(out.length, 1);
  assert.equal(out[0].status, 'PASS');
  assert.match(out[0].text, /--quick/);
  assert.equal(fetchFn.calls.length, 1);
});

// ---------- the whole run ----------

// A fake fetch for a healthy NAS copy of a given kind: routes by "METHOD path" (http:// address = the A2 probe)
function nasFetch({ site = false, overrides = {} } = {}) {
  const jsonRes = (status, obj, h = {}) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...h } });
  const routes = {
    'GET https://pm.example.com/api/health': () => jsonRes(200, { message: 'API is healthy.' }),
    'GET http://pm.example.com/api/health': () => new Response('', { status: 301, headers: { location: 'https://pm.example.com/api/health' } }),
    'GET https://pm.example.com/_/': () => new Response('blocked', { status: 403 }),
    'POST https://pm.example.com/api/collections/_superusers/auth-with-password': () => new Response('blocked', { status: 403 }),
    [`POST https://pm.example.com/api/collections/${SUPERUSERS_ID}/auth-with-password`]: () => new Response('blocked', { status: 403 }),
    'POST https://pm.example.com/api/batch': () => jsonRes(400, { data: { requests: { code: 'validation_required' } } }),
    'GET https://pm.example.com/api/collections/users/auth-methods': () => jsonRes(200, { password: { enabled: false }, oauth2: { enabled: true, providers: [{ name: 'google' }] } }),
    'OPTIONS https://pm.example.com/api/health': () => new Response(null, { status: 204 }),
    'GET https://pm.example.com/sw.js': () => (site ? new Response('//sw', { status: 200, headers: { 'content-type': 'text/javascript' } }) : new Response('nf', { status: 404 })),
    'GET https://pm.example.com/': () => (site ? new Response('<link rel="manifest" href="/manifest.webmanifest">', { status: 200, headers: { 'content-type': 'text/html' } }) : new Response('nf', { status: 404 })),
    'GET https://pm.example.com/manifest.webmanifest': () => (site ? jsonRes(200, { start_url: '/' }) : new Response('nf', { status: 404 })),
    ...overrides,
  };
  const rt = realtimeFetch([{}]);
  return async (url, init = {}) => {
    if (url.endsWith('/api/realtime')) return rt(url, init);
    assert.equal(init.headers['user-agent'], USER_AGENT);
    const handler = routes[`${init.method || 'GET'} ${url}`];
    if (!handler) throw new Error(`unexpected request: ${init.method || 'GET'} ${url}`);
    return handler();
  };
}

const ids = (results) => results.map((r) => `${r.status}:${r.id}`);

test('runChecks: a healthy NAS before the site is there — A1-A7 pass, A8 and A9 skip', async () => {
  const { results, unreachable } = await runChecks({ base: 'https://pm.example.com', local: false, quick: true, fetch: nasFetch() });
  assert.equal(unreachable, null);
  assert.deepEqual(ids(results), ['PASS:A1', 'PASS:A2', 'PASS:A3a', 'PASS:A3b', 'PASS:A4', 'PASS:A5', 'PASS:A6', 'PASS:A7', 'SKIP:A8', 'SKIP:A9']);
  assert.equal(exitCode(results), 0);
  assert.equal(summaryLine(results), 'Summary: 8 pass, 0 fail, 2 skip');
});

test('runChecks: with the site there, A8 and A9 pass', async () => {
  const { results } = await runChecks({ base: 'https://pm.example.com', local: false, quick: true, fetch: nasFetch({ site: true }) });
  assert.deepEqual(ids(results).slice(-2), ['PASS:A8', 'PASS:A9']);
});

test('runChecks: one broken setting fails only its line and sets exit code 1', async () => {
  const overrides = { 'POST https://pm.example.com/api/batch': () => new Response('{"message":"Batch requests are not allowed."}', { status: 403 }) };
  const { results } = await runChecks({ base: 'https://pm.example.com', local: false, quick: true, fetch: nasFetch({ overrides }) });
  assert.deepEqual(ids(results).filter((s) => s.startsWith('FAIL')), ['FAIL:A4']);
  assert.equal(exitCode(results), 1);
});

test('runChecks: a local address skips A2, A3, A8 and makes no Cloudflare request', async () => {
  const urls = [];
  const rt = realtimeFetch([{}]);
  const fetchFn = async (url, init = {}) => {
    if (url.endsWith('/api/realtime')) return rt(url, init);
    urls.push(`${init.method || 'GET'} ${url}`);
    if (url.endsWith('/api/health') && init.method !== 'OPTIONS') return new Response('{"message":"API is healthy."}', { status: 200 });
    if (url.endsWith('/api/batch')) return new Response('{"data":{"requests":{"code":"validation_required"}}}', { status: 400 });
    if (url.endsWith('/auth-methods')) return new Response('{"password":{"enabled":false},"oauth2":{"enabled":true,"providers":[{"name":"google"}]}}', { status: 200 });
    if (init.method === 'OPTIONS') return new Response(null, { status: 204 });
    return new Response('nf', { status: 404 });
  };
  const { results } = await runChecks({ base: 'http://127.0.0.1:8090', local: true, quick: true, fetch: fetchFn });
  assert.deepEqual(ids(results), ['PASS:A1', 'SKIP:A2', 'SKIP:A3a', 'SKIP:A3b', 'PASS:A4', 'PASS:A5', 'PASS:A6', 'PASS:A7', 'SKIP:A8', 'SKIP:A9']);
  assert.ok(!urls.some((u) => u.includes('http://127.0.0.1/') || u.includes('_superusers') || u.includes(SUPERUSERS_ID) || u.includes('/_/') || u.includes('sw.js')));
});

test('runChecks: a hanging request is a FAIL of that check (timeout)', async () => {
  const overrides = { 'GET https://pm.example.com/_/': () => new Promise(() => {}) };
  const { results } = await runChecks({ base: 'https://pm.example.com', local: false, quick: true, fetch: nasFetch({ overrides }), requestTimeoutMs: 50 });
  const a3a = results.find((r) => r.id === 'A3a');
  assert.equal(a3a.status, 'FAIL');
  assert.match(a3a.got, /timeout/);
});

test('runChecks: an unreachable host stops at A1', async () => {
  const fetchFn = async () => { throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }); };
  const { results, unreachable } = await runChecks({ base: 'https://pm.example.com', local: false, fetch: fetchFn });
  assert.deepEqual(results, []);
  assert.match(unreachable, /ECONNREFUSED/);
});

// ---------- the CLI ----------

function capture() {
  const io = { out: [], err: [] };
  return { io, opts: { out: (s) => io.out.push(s), err: (s) => io.err.push(s) } };
}

test('main: usage errors and --help exit 2 and send no request', async () => {
  const never = async () => { throw new Error('no request expected'); };
  for (const argv of [[], ['--help'], ['http://pm.example.com'], ['https://pm.example.com', '--hold', 'x']]) {
    const { io, opts } = capture();
    assert.equal(await main(argv, { ...opts, fetch: never }), 2, argv.join(' '));
    assert.ok(io.out.join('\n').includes('Usage:') || io.err.join('\n').includes('Usage:'));
  }
});

test('main: a clean run prints one line per check, the summary and exits 0', async () => {
  const { io, opts } = capture();
  const code = await main(['https://pm.example.com', '--quick'], { ...opts, fetch: nasFetch() });
  assert.equal(code, 0);
  const text = io.out.join('\n');
  assert.match(text, /^NAS check of https:\/\/pm\.example\.com$/m);
  assert.match(text, /^PASS A1 /m);
  assert.match(text, /^SKIP A9 /m);
  assert.match(text, /^Summary: 8 pass, 0 fail, 2 skip$/m);
  assert.equal(io.err.length, 0);
});

test('main: a failed check exits 1; an unreachable host exits 2 with "cannot reach"', async () => {
  const overrides = { 'GET https://pm.example.com/_/': () => new Response('<html>PocketBase</html>', { status: 200 }) };
  const failing = capture();
  assert.equal(await main(['https://pm.example.com', '--quick'], { ...failing.opts, fetch: nasFetch({ overrides }) }), 1);
  assert.match(failing.io.out.join('\n'), /^FAIL A3a /m);
  assert.match(failing.io.out.join('\n'), /Summary: 7 pass, 1 fail, 2 skip/);

  const down = capture();
  const code = await main(['https://pm.example.com'], { ...down.opts, fetch: async () => { throw new TypeError('fetch failed'); } });
  assert.equal(code, 2);
  assert.match(down.io.err.join('\n'), /cannot reach https:\/\/pm\.example\.com/);
});

// ---------- the NAS document ----------

// Resolved from this file, like the other tests: the suite may run from any folder
const DOC = new URL('../docs/nas-requirements.md', import.meta.url);

// Budget 34,000 bytes since spec 4 (was 30,000): stage 4 adds the names of the release, the job runner and the restore tool
test('NAS document: exists, within 34,000 bytes, sections in order', () => {
  assert.ok(fs.existsSync(DOC), 'docs/nas-requirements.md is missing');
  const text = fs.readFileSync(DOC, 'utf8');
  assert.ok(Buffer.byteLength(text) <= 34000, 'docs/nas-requirements.md is over 34,000 bytes');
  const titles = [...text.matchAll(/^## (\d+)\. (.+)$/gm)].map((m) => [Number(m[1]), m[2]]);
  assert.deepEqual(titles.map((t) => t[0]), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const expected = ['Summary', 'PocketBase', 'The site on the NAS', 'Access from outside', 'Sign-in', 'Server jobs', 'Backups', 'Data volume', 'Power and network', 'Acceptance checks', 'Open questions', 'What changes in later stages'];
  expected.forEach((start, i) => assert.ok(titles[i][1].startsWith(start), `section ${i + 1} should start with "${start}", is "${titles[i][1]}"`));
});

test('NAS document: every requirement id is defined once; the acceptance table has A1-A14 once each', () => {
  const text = fs.readFileSync(DOC, 'utf8');
  const defined = [...text.matchAll(/\*\*(R-[A-Z]+-\d+)\b/g)].map((m) => m[1]);
  assert.ok(defined.length >= 20, `only ${defined.length} requirement ids found`);
  assert.equal(new Set(defined).size, defined.length, `duplicate id: ${defined.find((id, i) => defined.indexOf(id) !== i)}`);
  const section = text.slice(text.indexOf('## 10. Acceptance checks'), text.indexOf('## 11. '));
  const rows = [...section.matchAll(/^\| (A\d+[a-z]?) \|/gm)].map((m) => m[1]);
  assert.deepEqual(rows, Array.from({ length: 14 }, (_, i) => `A${i + 1}`));
});

test('NAS document: the WAF rule blocks the superuser collection by name and by the id A3b probes', () => {
  const text = fs.readFileSync(DOC, 'utf8');
  const rule = text.slice(text.indexOf('**R-NET-4'), text.indexOf('**R-NET-5'));
  assert.ok(rule.includes('"/api/collections/_superusers/"'));
  assert.ok(rule.includes(`"/api/collections/${SUPERUSERS_ID}/"`));
});

test('NAS document: only placeholders — no real e-mail, IPv4 address or host', () => {
  const text = fs.readFileSync(DOC, 'utf8');
  const emails = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
  assert.deepEqual(emails.filter((e) => !/@example\.com$/.test(e)), []);
  const ips = text.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) || [];
  assert.deepEqual(ips.filter((ip) => !['127.0.0.1', '0.0.0.0'].includes(ip)), []);
  // spec 6: github.com, example.com, <host>, and Cloudflare and Google documentation hosts; spec 4: ganigeorgiev.com, PocketBase's release host since 2026-10-26
  const allowed = [/^<host$/, /^github\.com$/, /^([a-z0-9-]+\.)?example\.com$/, /^developers\.cloudflare\.com$/, /^(developers|support|cloud)\.google\.com$/, /^ganigeorgiev\.com$/];
  const hosts = [...text.matchAll(/https:\/\/([^\s/)`'">,;]+)/g)].map((m) => m[1]);
  assert.deepEqual(hosts.filter((h) => !allowed.some((re) => re.test(h))), []);
});
