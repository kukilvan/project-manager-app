// The Drive copy of the server backup: which folder is the newest, its zip without a `zip` program, and the upload into the owner's Drive file.
// The upload replaces the contents of the file «Автокопия данных (обновляется каждые 2 дня).zip» through the Drive API. The owner created the file and
// shared it with the service account for writing (the service account cannot create files in someone else's Drive: it has no storage of its own).
// Drive keeps earlier versions itself (about 30 days). Used by server-drive-backup.mjs (GitHub Actions) and nas-jobs.mjs (the NAS, spec 4 § 5.1);
// it makes no sign-in itself: the caller gives the access token.
import fs from 'node:fs';
import path from 'node:path';
import { zip, filesOf } from './zip-lib.mjs';

// The name stays as it is although the NAS copies daily: the owner shared this very file with the service account (spec 4 § 8)
export const DRIVE_FILE_NAME = 'Автокопия данных (обновляется каждые 2 дня).zip';

// The newest backup folder (2026-10-10_0830) in `root`, or undefined
export const newestBackup = (root) => fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}_\d{4}$/.test(d.name)).map((d) => d.name).sort().at(-1);

// A zip of one backup folder, the folder itself inside (as `zip -r <folder>` makes it)
export const zipBackup = (root, folder) => zip(filesOf(path.join(root, folder), `${folder}/`));

// Replaces the Drive file's contents with `bytes` and describes which copy is inside. Throws with a one-line reason.
export async function uploadDriveBackup({ token, bytes, folder, fetch: get = fetch }) {
  const H = { Authorization: `Bearer ${token}` };
  const q = encodeURIComponent(`name = '${DRIVE_FILE_NAME}' and trashed = false`);
  const list = await get(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`, { headers: H });
  if (!list.ok) throw new Error(`поиск файла: HTTP ${list.status} ${await list.text()}`);
  const files = (await list.json()).files || [];
  if (!files.length) throw new Error(`на Диске нет файла «${DRIVE_FILE_NAME}», открытого сервисному аккаунту на запись. Создайте его в папке «Полевой журнал» и дайте доступ «Редактор» сервисному аккаунту`);
  const id = files[0].id;
  const up = await get(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media&fields=id,size`, { method: 'PATCH', headers: { ...H, 'Content-Type': 'application/zip' }, body: bytes });
  if (!up.ok) throw new Error(`загрузка: HTTP ${up.status} ${await up.text()}`);
  await get(`https://www.googleapis.com/drive/v3/files/${id}`, { method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ description: `Копия ${folder} (UTC). Внутри — папка автокопии, как в репозитории polevoy-backups. Как восстановить — ВОССТАНОВЛЕНИЕ.md` }) });
}
