import { requestJson } from './http.js';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

// --- pure helpers ---
export function rowsToObjects(grid) {
  if (!grid || grid.length < 2) return [];
  const [header, ...rows] = grid;
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

// Tag each object with its 1-based sheet row (header is row 1) so the pipeline
// can update it in place later — the core of resumable checkpointing.
export function attachRowNumbers(objects, startRow = 2) {
  return objects.map((o, i) => ({ ...o, _row: startRow + i }));
}

export function objectToRow(obj, columns) {
  return columns.map((c) => (obj[c] ?? '').toString());
}

// Pull the first row number out of an append response's updatedRange.
export function parseStartRow(updatedRange) {
  const m = /![A-Z]+(\d+)/.exec(updatedRange || '');
  return m ? Number(m[1]) : null;
}

// --- network (thin) ---
const authInit = (token, extra = {}) => ({
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...extra,
});

export async function readTab(sheetId, tab, token, opts = {}) {
  const url = `${BASE}/${sheetId}/values/${encodeURIComponent(tab)}`;
  const data = await requestJson(url, authInit(token), opts);
  return attachRowNumbers(rowsToObjects(data.values || []));
}

export async function writeHeader(sheetId, tab, columns, token, opts = {}) {
  const url = `${BASE}/${sheetId}/values/${encodeURIComponent(`${tab}!A1`)}?valueInputOption=RAW`;
  return requestJson(url, authInit(token, { method: 'PUT', body: JSON.stringify({ values: [columns] }) }), opts);
}

// Append rows; return the 1-based sheet row of the first appended row so the
// caller can address each new row for later in-place status updates.
export async function appendRows(sheetId, tab, rows, token, opts = {}) {
  if (!rows.length) return { appended: 0, startRow: null };
  const url = `${BASE}/${sheetId}/values/${encodeURIComponent(tab)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const data = await requestJson(url, authInit(token, { method: 'POST', body: JSON.stringify({ values: rows }) }), opts);
  return { appended: rows.length, startRow: parseStartRow(data.updates?.updatedRange) };
}

// Overwrite a single row in place (row = 1-based sheet row).
export async function updateRow(sheetId, tab, row, values, token, opts = {}) {
  const url = `${BASE}/${sheetId}/values/${encodeURIComponent(`${tab}!A${row}`)}?valueInputOption=RAW`;
  return requestJson(url, authInit(token, { method: 'PUT', body: JSON.stringify({ values: [values] }) }), opts);
}
