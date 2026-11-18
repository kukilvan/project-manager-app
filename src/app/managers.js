// Management sheets: the app itself creates a Google Sheet (no template) and writes the ready values and the update stamp into it.
// The report content comes from src/domain (`buildReport`); `sheetRequests` formats the legend, the section rows (thick frame, 28 px), the point blocks and the rack sheet (merged two-level header, progress colours, framed blocks, percents, frozen column); the Sheets api object is passed in (`realApi` of google.js in the app, the server job's own one in scripts/server-tables-lib.mjs).
import { buildReport } from '../domain/index.js';

// «#fff» and «#ffffff» mean the same (the short form used to come out red)
const rgb = (hex) => { let h = String(hex || '#000000').replace('#', ''); if (h.length === 3) h = [...h].map((c) => c + c).join(''); const n = (i) => (parseInt(h.slice(i, i + 2), 16) || 0) / 255; return { red: n(0), green: n(2), blue: n(4) }; };
const colLetter = (n) => { let s = ''; let x = n + 1; while (x > 0) { const m = (x - 1) % 26; s = String.fromCharCode(65 + m) + s; x = Math.floor((x - 1) / 26); } return s; };
const esc = (t) => String(t).replace(/'/g, "''");

const border = (style, hex) => ({ style, color: rgb(hex) });
const THIN = '#D0D4D9'; const NAVY = '#1F3B5C';

const GREEN = [198, 229, 201]; const AMBER = [230, 180, 34]; // progress colour: dark yellow (1%) → the green of a finished stage (100%)
const toHex = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
// Fill of a stage's cells by its percent (a number 0–1): none for 0 and «—», else a blend from dark yellow to green
export const progressColor = (p) => (typeof p === 'number' && p > 0 ? toHex(AMBER.map((a, i) => a + (GREEN[i] - a) * Math.min(1, p))) : '');

// Formatting requests of the rack sheet «Итоги по шкафам»: widths and heights, two-level header with merges, progress colours, blocks framed in navy (the header too),
// teal lines between racks, percent format (no rules, no filter)
function rackSheetRequests(sheetId, sh) {
  const out = []; const nCols = sh.cols.length; const [h0, h1] = sh.headerRows; const [r0, r1] = sh.rackRows; const end = sh.totalRow + 1;
  const range = (a, b, c, d) => ({ sheetId, startRowIndex: a, endRowIndex: b, startColumnIndex: c, endColumnIndex: d });
  const fmt = (rg, userEnteredFormat, fields) => out.push({ repeatCell: { range: rg, cell: { userEnteredFormat }, fields } });
  const height = (a, b, px) => out.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: a, endIndex: b }, properties: { pixelSize: px }, fields: 'pixelSize' } });
  sh.cols.forEach((c, i) => out.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: c.width }, fields: 'pixelSize' } }));
  fmt(range(0, 1, 0, 1), { textFormat: { bold: true, fontSize: 14 } }, 'userEnteredFormat.textFormat');
  fmt(range(1, 2, 0, 1), { textFormat: { bold: true } }, 'userEnteredFormat.textFormat');
  fmt(range(1, 2, 4, 5), { textFormat: { bold: false, foregroundColor: rgb('#5F6368') } }, 'userEnteredFormat.textFormat'); // the update stamp
  // header: level 1 mid blue with white bold text, level 2 (under the stages) light with navy text; merged cells (the values sit in the first cell of each merge)
  fmt(range(h0, h1, 0, nCols), { backgroundColor: rgb('#3C6EA5'), textFormat: { bold: true, foregroundColor: rgb('#FFFFFF') }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP' },
    'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)');
  fmt(range(h1 - 1, h1, 2, 10), { backgroundColor: rgb('#DCE6F2'), textFormat: { bold: true, fontSize: 10, foregroundColor: rgb(NAVY) } }, 'userEnteredFormat(backgroundColor,textFormat)');
  [[0, 1], [1, 2], [10, 11], [11, 12]].forEach(([c0, c1]) => out.push({ mergeCells: { range: range(h0, h1, c0, c1), mergeType: 'MERGE_ALL' } }));
  sh.stageCols.forEach((c) => out.push({ mergeCells: { range: range(h0, h0 + 1, c, c + 2), mergeType: 'MERGE_ALL' } }));
  height(h0, h0 + 1, 34); height(h0 + 1, h1, 24); height(sh.totalRow, end, 34);
  if (r1 > r0) height(r0, r1, 30); // no rack rows (no point passes the filters): an empty row range would fail the whole batch
  // body: centred, the counts grey, the percents bold in «0%»; rack names bold on grey, centred; «Всего» on pale grey; total row bold on light blue
  fmt(range(h1, end, 0, nCols), { horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', textFormat: { foregroundColor: rgb('#555555') } }, 'userEnteredFormat(horizontalAlignment,verticalAlignment,textFormat)');
  fmt(range(h1, end, 1, 2), { backgroundColor: rgb('#F7F8FA'), textFormat: { foregroundColor: rgb('#444444') } }, 'userEnteredFormat(backgroundColor,textFormat)');
  fmt(range(h1, end, 10, 12), { textFormat: { foregroundColor: rgb('#222222') } }, 'userEnteredFormat.textFormat');
  sh.stageCols.forEach((c) => fmt(range(h1, end, c + 1, c + 2), { numberFormat: { type: 'PERCENT', pattern: '0%' }, horizontalAlignment: 'CENTER', textFormat: { bold: true, fontSize: 11, foregroundColor: rgb('#000000') } },
    'userEnteredFormat(numberFormat,horizontalAlignment,textFormat)'));
  fmt(range(h1, end, 0, 1), { backgroundColor: rgb('#EEF1F5'), horizontalAlignment: 'CENTER', textFormat: { bold: true, fontSize: 11, foregroundColor: rgb('#222222') } }, 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)');
  fmt(range(sh.totalRow, end, 0, nCols), { backgroundColor: rgb('#DCE6F2'), textFormat: { bold: true, foregroundColor: rgb('#000000') } }, 'userEnteredFormat(backgroundColor,textFormat.bold,textFormat.foregroundColor)');
  fmt(range(sh.totalRow, end, 0, 1), { horizontalAlignment: 'CENTER' }, 'userEnteredFormat.horizontalAlignment');
  // progress colours on both cells of a stage (count and percent), after the row backgrounds; 0 and «—» stay white
  for (let r = h1; r < end; r += 1) {
    sh.stageCols.forEach((c) => { const col = progressColor(sh.rows[r][c + 1]); if (col) fmt(range(r, r + 1, c, c + 2), { backgroundColor: rgb(col) }, 'userEnteredFormat.backgroundColor'); });
  }
  // borders, later ones win on a shared edge: thin grey lines everywhere, dotted between a stage's count and percent, teal lines between racks,
  // the blocks (rack + total, each stage, partly + faults) framed in navy from the top of the header to the total, the thick outer frame
  const headLine = border('SOLID', '#8FA3BA'); const thin = border('SOLID', '#B6BEC8'); const dotted = border('DOTTED', '#B6BEC8');
  const navy = border('SOLID_MEDIUM', NAVY);
  out.push({ updateBorders: { range: range(h0, h1, 0, nCols), top: headLine, bottom: headLine, left: headLine, right: headLine, innerHorizontal: headLine, innerVertical: headLine } });
  out.push({ updateBorders: { range: range(h1, end, 0, nCols), top: thin, bottom: thin, left: thin, right: thin, innerHorizontal: thin, innerVertical: thin } });
  sh.stageCols.forEach((c) => out.push({ updateBorders: { range: range(h1, end, c, c + 2), innerVertical: dotted } }));
  out.push({ updateBorders: { range: range(h1 - 1, h1, 0, nCols), bottom: navy } });
  if (r1 > r0) out.push({ updateBorders: { range: range(r0, r1, 0, nCols), innerHorizontal: border('SOLID_MEDIUM', '#12A3A3') } });
  [[0, 2], [2, 4], [4, 6], [6, 8], [8, 10], [10, 12]].forEach(([c0, c1]) => out.push({ updateBorders: { range: range(h0, end, c0, c1), left: navy, right: navy } }));
  out.push({ updateBorders: { range: range(sh.totalRow, end, 0, nCols), top: border('SOLID_THICK', NAVY) } });
  const frame = border('SOLID_THICK', NAVY);
  out.push({ updateBorders: { range: range(h0, end, 0, nCols), top: frame, bottom: frame, left: frame, right: frame } });
  return out;
}

// Formatting requests for one sheet (the rack sheet has its own): widths, legend (A–G), stamp, header, section rows, borders, dates, highlighting, filter
export function sheetRequests(sheetId, sh) {
  if (sh.kind === 'racks') return rackSheetRequests(sheetId, sh);
  const out = []; const nCols = sh.cols.length; const first = sh.headerRow + 1; const lastRow = Math.max(sh.rows.length, first + 1);
  const range = (r0, r1, c0, c1) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 });
  sh.cols.forEach((c, i) => out.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: c.width || 110 }, fields: 'pixelSize' } }));
  out.push({ repeatCell: { range: range(0, 1, 0, 1), cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 14 } } }, fields: 'userEnteredFormat.textFormat' } });
  out.push({ repeatCell: { range: range(1, 2, 0, 1), cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat' } });
  // update stamp (E2): plain grey text, not bold
  out.push({ repeatCell: { range: range(1, 2, 4, 5), cell: { userEnteredFormat: { textFormat: { bold: false, foregroundColor: rgb('#5F6368') } } }, fields: 'userEnteredFormat.textFormat' } });
  // colour legend: one framed cell per colour, text centred and wrapped
  if (sh.legendRow !== undefined && sh.legend?.length) {
    sh.legend.forEach((l, i) => out.push({ repeatCell: { range: range(sh.legendRow, sh.legendRow + 1, i, i + 1), cell: { userEnteredFormat: {
      backgroundColor: rgb(l.color), textFormat: { foregroundColor: rgb(l.textColor || '#000000') }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP' } },
    fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)' } }));
    const edge = border('SOLID', '#C4C8CC');
    out.push({ updateBorders: { range: range(sh.legendRow, sh.legendRow + 1, 0, sh.legend.length), top: edge, bottom: edge, left: edge, right: edge, innerVertical: edge } });
  }
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
  // the problem column: several problems in a cell, one per line, so the text wraps (point rows only)
  sh.cols.forEach((c, i) => {
    if (c.id === 'problem') (sh.pointRuns || []).forEach(([r0, r1]) => out.push({ repeatCell: { range: range(r0, r1, i, i + 1), cell: { userEnteredFormat: { wrapStrategy: 'WRAP' } }, fields: 'userEnteredFormat.wrapStrategy' } }));
  });
  // section rows: white, bold 12, navy text, 28 px high; alignment cleared (the text runs over the empty cells); the frame comes with the borders below
  (sh.sectionRows || []).forEach((r) => {
    out.push({ repeatCell: { range: range(r, r + 1, 0, nCols), cell: { userEnteredFormat: { backgroundColor: rgb('#FFFFFF'), textFormat: { bold: true, fontSize: 12, foregroundColor: rgb(NAVY) }, verticalAlignment: 'MIDDLE' } },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,numberFormat)' } });
    out.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: r, endIndex: r + 1 }, properties: { pixelSize: 28 }, fields: 'pixelSize' } });
  });
  // color of the information columns by point status: consecutive rows of one color go in one request
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
      : { type: r.kind === 'eq' ? 'TEXT_EQ' : 'TEXT_STARTS_WITH', values: [{ userEnteredValue: r.text }] };
    const format = { backgroundColor: rgb(r.color), ...(r.textColor ? { textFormat: { foregroundColor: rgb(r.textColor) } } : {}) };
    out.push({ addConditionalFormatRule: { rule: { ranges: [range(first, lastRow, r.col, r.col + 1)], booleanRule: { condition: cond, format } }, index: 0 } });
  });
  // borders: thin around every block of point rows first, then the section frames, then the header frame (later borders win on shared edges)
  const thin = border('SOLID', THIN);
  (sh.pointRuns || []).forEach(([r0, r1]) => out.push({ updateBorders: { range: range(r0, r1, 0, nCols), top: thin, bottom: thin, left: thin, right: thin, innerHorizontal: thin, innerVertical: thin } }));
  const frame = border('SOLID_THICK', NAVY);
  (sh.sectionRows || []).forEach((r) => out.push({ updateBorders: { range: range(r, r + 1, 0, nCols), top: frame, bottom: frame, left: frame, right: frame, innerVertical: { style: 'NONE' } } }));
  out.push({ updateBorders: { range: range(sh.headerRow, sh.headerRow + 1, 0, nCols), top: frame, bottom: frame, left: frame, right: frame, innerVertical: border('SOLID', '#8FA3BA') } });
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
    gridProperties: { rowCount: Math.max(50, sh.rows.length + 20), columnCount: Math.max(sh.cols.length, ...sh.rows.map((r) => r.length), 7), frozenRowCount: sh.frozenRows ?? sh.headerRow + 1, frozenColumnCount: sh.frozenCols || 0 } } } }));
  old.forEach((o) => requests.push({ deleteSheet: { sheetId: o.sheetId } }));
  sheets.forEach((sh, i) => requests.push({ updateSheetProperties: { properties: { sheetId: ids[i], title: sh.title, rightToLeft: !!sh.rtl }, fields: 'title,rightToLeft' } }));
  sheets.forEach((sh, i) => requests.push(...sheetRequests(ids[i], sh)));
  await api.batch(fileId, requests);
  // the stamp cell goes into the same values write
  await api.write(fileId, sheets.flatMap((sh) => [{ range: `'${esc(sh.title)}'!A1`, values: sh.rows }, stampWrite(sh)]));
}

// The stamp cell of a sheet as a values-write item: «'<title>'!E2» ← the update text
const stampWrite = (sh) => ({ range: `'${esc(sh.title)}'!${colLetter(sh.stamp.col)}${sh.stamp.row + 1}`, values: [[sh.stamp.text]] });

// Updates one sheet of the project (`now` — the time of the update stamp). Returns { patch, link, changed, message }: patch — profile fields to save
export async function syncTable(api, project, ctx, table, { force = false, uid = '', nameOf, noCreate = false, shareWith = '', now = new Date() } = {}) {
  const rep = buildReport(project, ctx, table, { nameOf, now });
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
    let rebuild = force || rep.hash !== oldHash;
    if (!rebuild) {
      // data unchanged: only the «Обновлено» cells; if that fails (e.g. an editor renamed a tab), rebuild the file instead
      try { await api.write(fileId, rep.sheets.map(stampWrite)); } catch (e) { console.warn('stamp write', e); rebuild = true; }
    }
    if (rebuild) {
      await rebuildSheets(api, fileId, rep.sheets);
      patch.hash = rep.hash; changed = true;
    }
    if (file.name !== rep.title) await api.rename(fileId, rep.title);
  } catch (e) { e.patch = patch; throw e; } // the file is already created: remember it so the next attempt does not create more
  patch.syncedAt = new Date().toISOString();
  return { patch, link, changed, rep, message: changed ? `Таблица «${table.name}» обновлена: точек ${rep.pointCount}, столбцов ${rep.colCount}` : `Таблица «${table.name}»: данные не менялись, она актуальна` };
}
