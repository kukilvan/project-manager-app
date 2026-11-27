// Module hooks of the job-script harness: firebase-admin and google-auth-library resolve to the fakes next to this file (neither is installed for the tests).
const map = { 'firebase-admin': new URL('./fake-admin.mjs', import.meta.url).href, 'google-auth-library': new URL('./fake-gauth.mjs', import.meta.url).href };
export async function resolve(spec, ctx, next) { return map[spec] ? { url: map[spec], shortCircuit: true } : next(spec, ctx); }
