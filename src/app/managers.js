// Management sheets: the app itself creates a Google Sheet (no template) and writes the ready values into it.
// The report content comes from src/domain (`buildReport`); the Sheets api object is passed in (`realApi` of google.js in the app, the server job's own one in scripts/server-tables-lib.mjs).
import { buildReport } from '../domain/index.js';

// «#fff» and «#ffffff» mean the same (the short form used to come out red)
const rgb = (hex) => { let h = String(hex || '#000000').replace('#', ''); if (h.length === 3) h = [...h].map((c) => c + c).join(''); const n = (i) => (parseInt(h.slice(i, i + 2), 16) || 0) / 255; return { red: n(0), green: n(2), blue: n(4) }; };
const colLetter = (n) => { let s = ''; let x = n + 1; while (x > 0) { const m = (x - 1) % 26; s = String.fromCharCode(65 + m) + s; x = Math.floor((x - 1) / 26); } return s; };
const esc = (t) => String(t).replace(/'/g, "''");

// Formatting requests for one sheet: widths, header, dates, highlighting, filter
export function sheetRequests(sheetId, sh) {
  const out = []; const nCols = sh.cols.length; const first = sh.headerRow + 1; const lastRow = Math.max(sh.rows.length, first + 1);
  const range = (r0, r1, c0, c1) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 });
  sh.cols.forEach((c, i) => out.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: c.width || 110 }, fields: 'pixelSize' } }));
  out.push({ repeatCell: { range: range(0, 1, 0, 1), cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 14 } } }, fields: 'userEnteredFormat.textFormat' } });
  out.push({ repeatCell: { range: range(1, 2, 0, 1), cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat' } });
  if (sh.summaryRows.length) {
    out.push({ repeatCell: { range: range(2, 3, 0, 7), cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: rgb('#E8EEF5'), horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment)' } });
    out.push({ repeatCell: { range: range(3, 4, 0, 7), cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 12 }, backgroundColor: rgb('#D3E3F5'), horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment)' } });
  }
  out.push({ repeatCell: { range: range(sh.headerRow, sh.headerRow + 1, 0, nCols), cell: { userEnteredFormat: {
    backgroundColor: rgb('#1F3B5C'), textFormat: { bold: true, foregroundColor: rgb('#FFFFFF') }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP' } },
  fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)' } });
  out.push({ repeatCell: { range: range(first, lastRow, 0, nCols), cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)' } });
  sh.cols.forEach((c, i) => {
    if (c.kind === 'stage') out.push({ repeatCell: { range: range(first, lastRow, i, i + 1), cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' }, horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } });
    else if (c.kind === 'num' || c.kind === 'status') out.push({ repeatCell: { range: range(first, lastRow, i, i + 1), cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat.horizontalAlignment' } });
  });
  // colour of the information columns by point status: consecutive rows of one colour go in one request
  const infoCols = []; sh.cols.forEach((c, i) => { if (c.kind !== 'stage' && c.kind !== 'status' && c.id !== 'checkResult') infoCols.push(i); });
  const groups = []; infoCols.forEach((i) => { const g = groups[groups.length - 1]; if (g && g[1] === i) g[1] = i + 1; else groups.push([i, i + 1]); });
  const rc = sh.rowColors || [];
  for (let i = 0; i < rc.length;) {
    let j = i; while (j < rc.length && rc[j] === rc[i]) j += 1;
    if (rc[i]) groups.forEach(([c0, c1]) => out.push({ repeatCell: { range: range(first + i, first + j, c0, c1), cell: { userEnteredFormat: { backgroundColor: rgb(rc[i]) } }, fields: 'userEnteredFormat.backgroundColor' } }));
    i = j;
  }
  // highlighting: conditional formatting (cells hold values only)
  const rowNo = first + 1; // number of the first data row in A1 notation
  sh.rules.forEach((r) => {
    const cell = `${colLetter(r.col)}${rowNo}`;
    const cond = r.kind === 'number' ? { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: `=ISNUMBER(${cell})` }] }
      : r.kind === 'blank' ? { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: `=(COUNTA($A${rowNo}:$${colLetter(Math.max(nCols - 1, 0))}${rowNo})>0)*(LEN(${cell})=0)` }] }
        : { type: r.kind === 'eq' ? 'TEXT_EQ' : 'TEXT_STARTS_WITH', values: [{ userEnteredValue: r.text }] };
    const format = { backgroundColor: rgb(r.color), ...(r.textColor ? { textFormat: { foregroundColor: rgb(r.textColor) } } : {}) };
    out.push({ addConditionalFormatRule: { rule: { ranges: [range(first, lastRow, r.col, r.col + 1)], booleanRule: { condition: cond, format } }, index: 0 } });
  });
  out.push({ setBasicFilter: { filter: { range: range(sh.headerRow, Math.max(sh.rows.length, sh.headerRow + 1), 0, nCols) } } });
  return out;
}

// Rebuilds all sheets of the file: adds the new ones, deletes the old ones (in one request), then writes the values
export async function rebuildSheets(api, fileId, sheets) {
  const old = await api.sheetsOf(fileId);
  const base = 100000 + Math.floor(Math.random() * 800000);
  const ids = sheets.map((_, i) => base + i);
  const requests = [];
  sheets.forEach((sh, i) => requests.push({ addSheet: { properties: { sheetId: ids[i], title: `__pz${i}`, index: i, rightToLeft: sh.rtl,
    gridProperties: { rowCount: Math.max(50, sh.rows.length + 20), columnCount: Math.max(sh.cols.length, ...sh.rows.map((r) => r.length), 7), frozenRowCount: sh.headerRow + 1 } } } }));
  old.forEach((o) => requests.push({ deleteSheet: { sheetId: o.sheetId } }));
  sheets.forEach((sh, i) => requests.push({ updateSheetProperties: { properties: { sheetId: ids[i], title: sh.title, rightToLeft: !!sh.rtl }, fields: 'title,rightToLeft' } }));
  sheets.forEach((sh, i) => requests.push(...sheetRequests(ids[i], sh)));
  await api.batch(fileId, requests);
  await api.write(fileId, sheets.map((sh) => ({ range: `'${esc(sh.title)}'!A1`, values: sh.rows })));
}

// Updates one sheet of the project. Returns { patch, link, changed, message }: patch — profile fields to save
export async function syncTable(api, project, ctx, table, { force = false, uid = '', nameOf, noCreate = false, shareWith = '' } = {}) {
  const rep = buildReport(project, ctx, table, { nameOf });
  const patch = {};
  let fileId = table.fileId || '';
  let oldHash = table.hash || '';
  let file = fileId ? await api.fileInfo(fileId) : null;
  if (!file && noCreate) throw new Error('Сервер не видит файл таблицы: откройте её для сервера кнопкой «Обновить» в приложении');
  if (!file && fileId && table.by && uid && table.by !== uid) {
    // the file was created by another member: you have no access — do not create a new one, so the link is not replaced
    { const who = nameOf?.(table.by); throw new Error(`Эту таблицу создал${who ? ` ${who}` : ' другой участник проекта'}, у вас нет к ней доступа. Обновить её может только он.`); }
  }
  if (!file) { file = await api.create(rep.title); fileId = file.id; oldHash = ''; if (uid) patch.by = uid; }
  if (uid && !table.by && !patch.by) patch.by = uid;
  // the sheet goes into a Drive folder (once; the server does not move files)
  // into «Для руководства» if marked (a shared link for management), otherwise into the project folder
  const kind = table.inFolder ? 'managers' : '';
  if (api.placeIn && ((table.placedKind ?? '') !== kind || !table.placed || patch.by)) { try { await api.placeIn(fileId, project, kind); patch.placed = true; patch.placedKind = kind; } catch (e) { console.warn('placeIn', e); } }
  const link = `https://docs.google.com/spreadsheets/d/${fileId}/edit`;
  if (fileId !== table.fileId) patch.fileId = fileId;
  if (link !== table.link) patch.link = link;
  // share the file with the service account (night auto-update): once per address
  if (shareWith && api.share && table.sharedWith !== shareWith) { try { await api.share(fileId, shareWith); patch.sharedWith = shareWith; } catch (e) { console.warn('share', e); } }
  let changed = false;
  try {
    if (force || rep.hash !== oldHash) {
      await rebuildSheets(api, fileId, rep.sheets);
      patch.hash = rep.hash; changed = true;
    }
    if (file.name !== rep.title) await api.rename(fileId, rep.title);
  } catch (e) { e.patch = patch; throw e; } // the file is already created: remember it so the next attempt does not create more
  patch.syncedAt = new Date().toISOString();
  return { patch, link, changed, rep, message: changed ? `Таблица «${table.name}» обновлена: точек ${rep.pointCount}, столбцов ${rep.colCount}` : `Таблица «${table.name}»: данные не менялись, она актуальна` };
}
