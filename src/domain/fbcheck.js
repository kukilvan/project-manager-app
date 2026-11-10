// Checks of the own-database setup wizard: no sign-in, only public Google endpoints with the key from the settings (apiKey).
// Each returns { ok, msg }; msg tells a person what is wrong and what to do. fetchFn is replaced in tests.
// Used by src/app/setup.js and tests/domain.test.js.
const IDT = 'https://identitytoolkit.googleapis.com/v1';
async function call(fetchFn, url, init) {
  try {
    const r = await fetchFn(url, init);
    let j = null; try { j = await r.json(); } catch { j = null; }
    return { status: r.status, ok: r.ok, j, err: String(j?.error?.message || j?.error?.status || '') };
  } catch (e) { return { status: 0, ok: false, j: null, err: `NETWORK ${e?.message || e}` }; }
}
const net = (r) => r.status === 0 && { ok: false, msg: 'Нет связи с Google. Проверьте интернет и нажмите «Проверить» ещё раз.' };

/** Step 1: the settings were pasted correctly (the key works) */
export async function checkConfig(cfg, fetchFn = fetch) {
  const r = await call(fetchFn, `${IDT}/projects?key=${encodeURIComponent(cfg.apiKey)}`);
  if (net(r)) return net(r);
  if (r.ok || /CONFIGURATION_NOT_FOUND/.test(r.err)) return { ok: true, msg: `Проект «${cfg.projectId}» найден.` };
  if (/API key not valid|API_KEY_INVALID/i.test(r.err)) return { ok: false, msg: 'Ключ (apiKey) не подходит. Скопируйте блок firebaseConfig заново, целиком.' };
  return { ok: false, msg: `Google ответил: ${r.err || r.status}. Проверьте, что скопирован весь блок firebaseConfig.` };
}

/** Step 2: Google sign-in is enabled */
export async function checkGoogle(cfg, continueUri, fetchFn = fetch) {
  const r = await call(fetchFn, `${IDT}/accounts:createAuthUri?key=${encodeURIComponent(cfg.apiKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId: 'google.com', continueUri }),
  });
  if (net(r)) return net(r);
  if (r.ok && r.j?.authUri) return { ok: true, msg: 'Вход через Google включён.' };
  if (/CONFIGURATION_NOT_FOUND/.test(r.err)) return { ok: false, msg: 'Authentication ещё не запущен: на странице Authentication нажмите «Начать» (Get started), затем включите Google.' };
  if (/OPERATION_NOT_ALLOWED|INVALID_PROVIDER_ID|not enabled/i.test(r.err)) return { ok: false, msg: 'Вход через Google не включён: Authentication → «Способ входа» (Sign-in method) → Google → включить → «Сохранить».' };
  return { ok: false, msg: `Google ответил: ${r.err || r.status}` };
}

/** Step 3: the app address is in the list of allowed domains */
export async function checkDomain(cfg, host, fetchFn = fetch) {
  const r = await call(fetchFn, `${IDT}/projects?key=${encodeURIComponent(cfg.apiKey)}`);
  if (net(r)) return net(r);
  if (!r.ok) return { ok: false, msg: /CONFIGURATION_NOT_FOUND/.test(r.err) ? 'Сначала шаг 2: запустите Authentication.' : `Google ответил: ${r.err || r.status}` };
  const list = (r.j?.authorizedDomains || []).map((d) => String(d).toLowerCase());
  return list.includes(String(host).toLowerCase()) ? { ok: true, msg: `Домен ${host} разрешён.` }
    : { ok: false, msg: `Домен ${host} не добавлен. Сейчас разрешены: ${list.join(', ') || 'никакие'}.` };
}

/** Steps 4–5: the database exists and the rules are pasted (the empty document meta/probe is readable by everyone under the rules) */
export async function checkFirestore(cfg, fetchFn = fetch) {
  const r = await call(fetchFn, `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(cfg.projectId)}/databases/(default)/documents/meta/probe?key=${encodeURIComponent(cfg.apiKey)}`);
  if (net(r)) return { db: net(r), rules: net(r) };
  const noDb = { ok: false, msg: 'База ещё не создана: Firestore Database → «Создать базу данных» (Create database), рабочий режим (production).' };
  if (r.status === 404 && /database|does not exist/i.test(r.err) && !/Document/i.test(r.err)) return { db: noDb, rules: noDb };
  if (/has not been used|is disabled|SERVICE_DISABLED/i.test(r.err)) return { db: noDb, rules: noDb };
  if (/Datastore Mode/i.test(r.err)) return { db: { ok: false, msg: 'База создана в режиме Datastore, нужен режим Firestore (Native). Создайте базу заново в режиме Firestore.' }, rules: { ok: false, msg: '' } };
  const db = { ok: true, msg: 'База создана.' };
  if (r.ok || r.status === 404) return { db, rules: { ok: true, msg: 'Правила вставлены.' } };
  if (r.status === 403) return { db, rules: { ok: false, msg: 'Правила не вставлены (или вставлены не те). Скопируйте правила кнопкой и опубликуйте (Publish).' } };
  return { db, rules: { ok: false, msg: `Google ответил: ${r.err || r.status}` } };
}
