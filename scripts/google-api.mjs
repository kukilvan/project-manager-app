// Google Drive and Sheets for the night sheets: the `api` object runTables needs, over REST with a service account's sign-in.
// Used by server-tables.mjs (GitHub Actions) and nas-jobs.mjs (the NAS); the caller makes the GoogleAuth, so this module loads no package.
// Tests replace the whole object or `fetch`.
const D = 'https://www.googleapis.com/drive/v3/files';
const S = 'https://sheets.googleapis.com/v4/spreadsheets';

// The scopes the caller's GoogleAuth needs
export const TABLES_SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'];

// auth: anything with getAccessToken() (google-auth-library's GoogleAuth)
export function createTablesApi(auth) {
  async function call(method, url, body) {
    const token = (await auth.getAccessToken());
    const r = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text(); let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
    if (!r.ok) { const e = new Error(json?.error?.message || `HTTP ${r.status}`); e.status = r.status; throw e; }
    return json;
  }
  return {
    async fileInfo(id) { try { const f = await call('GET', `${D}/${id}?fields=id,name,trashed`); return f.trashed ? null : f; } catch (e) { if (e.status === 404 || e.status === 403) return null; throw e; } },
    rename: (id, name) => call('PATCH', `${D}/${id}?fields=id`, { name }),
    sheetsOf: async (id) => (await call('GET', `${S}/${id}?fields=sheets.properties(sheetId,title,gridProperties)`)).sheets.map((x) => x.properties),
    batch: (id, requests) => call('POST', `${S}/${id}:batchUpdate`, { requests }),
    write: (id, data) => call('POST', `${S}/${id}/values:batchUpdate`, { valueInputOption: 'RAW', data }),
    // for «PDF с номерами»
    async download(id) { const token = await auth.getAccessToken(); const r = await fetch(`${D}/${id}?alt=media`, { headers: { Authorization: `Bearer ${token}` } }); if (!r.ok) throw new Error(`Чертёж не скачать: HTTP ${r.status} (откройте его серверу кнопкой «☁️ … на Диск» в плане)`); return new Uint8Array(await r.arrayBuffer()); },
    async upload(id, bytes) { const token = await auth.getAccessToken(); const r = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media&fields=id`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf' }, body: bytes }); if (!r.ok) throw new Error(`Не записать на Диск: HTTP ${r.status}`); },
  };
}
