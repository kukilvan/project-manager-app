// Formats and writes the rack sheets into a Google Sheet (values go straight into cells, no links between sheets).
// Sheet descriptions come from src/domain/shilutsheet.js; racktablecore.js calls `rebuildRackSheets` with the Sheets api object.
// «#fff» and «#ffffff» mean the same (the short form used to come out red)
const rgb = (hex) => { let h = String(hex || '#000000').replace('#', ''); if (h.length === 3) h = [...h].map((c) => c + c).join(''); const n = (i) => (parseInt(h.slice(i, i + 2), 16) || 0) / 255; return { red: n(0), green: n(2), blue: n(4) }; };
const esc = (t) => String(t).replace(/'/g, "''");
const LINE = { style: 'SOLID', color: rgb('#8a8a8a') };

// one repeatCell: style { bg, fg, bold, size, halign, valign, clip }
function fmt(sheetId, r0, r1, c0, c1, st) {
  const f = {}; const fields = [];
  if (st.bg) { f.backgroundColor = rgb(st.bg); fields.push('backgroundColor'); }
  const tf = {};
  if (st.fg) { tf.foregroundColor = rgb(st.fg); fields.push('textFormat.foregroundColor'); }
  if (st.bold !== undefined) { tf.bold = !!st.bold; fields.push('textFormat.bold'); }
  if (st.size) { tf.fontSize = st.size; fields.push('textFormat.fontSize'); }
  if (fields.some((x) => x.startsWith('textFormat'))) f.textFormat = tf;
  if (st.halign) { f.horizontalAlignment = st.halign; fields.push('horizontalAlignment'); }
  if (st.valign) { f.verticalAlignment = st.valign; fields.push('verticalAlignment'); }
  if (st.clip) { f.wrapStrategy = 'CLIP'; fields.push('wrapStrategy'); }
  return { repeatCell: { range: { sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 }, cell: { userEnteredFormat: f }, fields: fields.map((x) => `userEnteredFormat.${x}`).join(',') } };
}
const box = (sheetId, r0, r1, c0, c1) => ({ updateBorders: { range: { sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 },
  top: LINE, bottom: LINE, left: LINE, right: LINE, innerHorizontal: LINE, innerVertical: LINE } });

// Formatting requests for one sheet (the sheet description comes from domain/shilutsheet.js)
export function rackSheetRequests(sheetId, sh) {
  const out = [];
  sh.widths.forEach((px, i) => out.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } }));
  (sh.rowHeights || []).forEach((x) => out.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: x.r0, endIndex: x.r1 }, properties: { pixelSize: x.px }, fields: 'pixelSize' } }));
  if (sh.kind === 'plan') {
    const nCols = sh.widths.length; const [t0, t1] = sh.tableRows;
    out.push(fmt(sheetId, 0, 1, 0, 1, { bold: true, size: 14 }), fmt(sheetId, 1, 3, 0, 1, { bold: true, size: 12 }));
    out.push(fmt(sheetId, sh.headerRow, sh.headerRow + 1, 0, nCols, { bg: '#1F3B5C', fg: '#ffffff', bold: true, halign: 'CENTER', valign: 'MIDDLE' }));
    out.push(fmt(sheetId, t0, t1, 0, nCols, { halign: 'CENTER', valign: 'MIDDLE', size: 9, clip: true }));
    out.push(fmt(sheetId, t0, t1, 0, 1, { bold: true, size: 11 }), fmt(sheetId, t0, t1, nCols - 1, nCols, { size: 10 }));
    out.push(box(sheetId, sh.headerRow, t1, 0, nCols));
  } else {
    const [r0, r1] = sh.stripRows;
    sh.stripCols.forEach((c) => {
      out.push(fmt(sheetId, r0, r1, c, c + 1, { halign: 'CENTER', valign: 'MIDDLE', size: 11 }), fmt(sheetId, r0, r0 + 3, c, c + 1, { bold: true }), box(sheetId, r0, r1, c, c + 1));
    });
  }
  (sh.fills || []).forEach((f) => out.push(fmt(sheetId, f.r, f.r + 1, f.c0, f.c1, { bg: f.bg, fg: f.fg, bold: f.bold })));
  return out;
}

// Rebuilds all sheets of the file: adds the new ones, deletes the old ones, then writes the values
export async function rebuildRackSheets(api, fileId, sheets) {
  const old = await api.sheetsOf(fileId);
  const base = 200000 + Math.floor(Math.random() * 700000);
  const ids = sheets.map((_, i) => base + i);
  const requests = [];
  sheets.forEach((sh, i) => requests.push({ addSheet: { properties: { sheetId: ids[i], title: `__pz${i}`, index: i,
    gridProperties: { rowCount: Math.max(30, sh.rows.length + 5), columnCount: Math.max(sh.widths.length + 1, 8), frozenRowCount: sh.frozenRows || 0, frozenColumnCount: sh.frozenCols || 0 } } } }));
  old.forEach((o) => requests.push({ deleteSheet: { sheetId: o.sheetId } }));
  sheets.forEach((sh, i) => requests.push({ updateSheetProperties: { properties: { sheetId: ids[i], title: sh.title, rightToLeft: !!sh.rtl }, fields: 'title,rightToLeft' } }));
  sheets.forEach((sh, i) => requests.push(...rackSheetRequests(ids[i], sh)));
  await api.batch(fileId, requests);
  await api.write(fileId, sheets.map((sh) => ({ range: `'${esc(sh.title)}'!A1`, values: sh.rows })));
}
