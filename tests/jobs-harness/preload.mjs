// Preload of the job-script harness (node --import): registers hooks.mjs, fixes the clock at FAKE_NOW and answers every fetch (Google) with HTTP 500.
// tests/server-jobs.test.js runs the real scripts/server-*.mjs with it on the fake Firestore of tests/fake-firestore.js.
import { register } from 'node:module';
register(new URL('./hooks.mjs', import.meta.url).href);
const NOW = Date.parse(process.env.FAKE_NOW);
const RealDate = Date;
class FakeDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }
globalThis.Date = FakeDate;
globalThis.fetch = async () => new Response('{"error":{"message":"stub"}}', { status: 500 });
