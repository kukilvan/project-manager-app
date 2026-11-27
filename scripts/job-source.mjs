// Picks the data source of the server jobs (spec 4 § 5.2): PM_SOURCE=pocketbase → scripts/pb-source.mjs (the NAS), anything else → scripts/fs-source.mjs
// (Firestore, GitHub Actions, as before). Also gives the Google service account the night sheets use. Each source is loaded only when chosen,
// so the NAS jobs never load firebase-admin. Secrets are read from the environment or, on the NAS, from files in PM_SECRETS and are never printed.
//
// Environment: PM_SOURCE; Firestore — FIREBASE_SERVICE_ACCOUNT (the JSON, also the Google account); PocketBase — PB_URL (default http://pocketbase:8090),
// PB_JOBS_EMAIL, the password in PB_JOBS_PASSWORD or the file <PM_SECRETS>/pb_jobs_password, the Google account in GOOGLE_SERVICE_ACCOUNT or the file
// <PM_SECRETS>/google_service_account.json (PM_SECRETS default /run/secrets).
import fs from 'node:fs';
import path from 'node:path';

// An error whose message is printed as it is (no stack), as the jobs did before for a missing secret
export class SetupError extends Error {}

export const isPocketBase = (env = process.env) => env.PM_SOURCE === 'pocketbase';

// A secret: the variable when one is named and set, else the file of that name in PM_SECRETS, else ''
export function secret(env, variable, file) {
  if (variable && env[variable]) return env[variable];
  const p = path.join(env.PM_SECRETS || '/run/secrets', file);
  try { return fs.readFileSync(p, 'utf8').trim(); } catch { return ''; }
}

export async function openSource(env = process.env) {
  if (isPocketBase(env)) {
    const { openPocketBase } = await import('./pb-source.mjs');
    try {
      return await openPocketBase({ url: env.PB_URL || 'http://pocketbase:8090', email: env.PB_JOBS_EMAIL, password: secret(env, 'PB_JOBS_PASSWORD', 'pb_jobs_password') });
    } catch (e) { throw new SetupError(e.message, { cause: e.cause }); }
  }
  const key = env.FIREBASE_SERVICE_ACCOUNT;
  if (!key) throw new SetupError('Нет секрета FIREBASE_SERVICE_ACCOUNT');
  const { openFirestore } = await import('./fs-source.mjs');
  return openFirestore(key);
}

// The Google service account (parsed JSON) for Drive and Sheets
export function googleCredentials(env = process.env) {
  const text = isPocketBase(env) ? secret(env, 'GOOGLE_SERVICE_ACCOUNT', 'google_service_account.json') : env.FIREBASE_SERVICE_ACCOUNT;
  if (!text) throw new SetupError(isPocketBase(env) ? 'Нет сервисного аккаунта Google (google_service_account.json)' : 'Нет секрета FIREBASE_SERVICE_ACCOUNT');
  // the parser's own message quotes the text, which here is a key: it must not reach a log
  try { return JSON.parse(text); } catch { throw new SetupError('Сервисный аккаунт Google не читается: это не JSON'); }
}
