// Maintenance: rank the Leads tab best-first. Backfills any missing numeric score
// (sort key) from each row's qualification/evidence/phone, then sorts the tab by
// Score descending so the strongest prospects sit at the top. Idempotent.
import { getAccessToken } from '../src/auth.js';
import { readTab, updateRow, sortByColumn } from '../src/sheets.js';
import { labelRowToKeys, LEADS_COLUMNS } from '../src/schema.js';
import { score } from '../src/score.js';

const WRITE_OPTS = { maxRetries: 6, baseDelayMs: 1000, maxDelayMs: 60000 };
const QUALS = new Set(['hot', 'broken', 'warm', 'needs_pagespeed', 'dropped']);
const toRow = (obj) => LEADS_COLUMNS.map((c) => (obj[c] ?? '').toString());

const token = await getAccessToken(process.env.GOOGLE_SHEETS_SA_JSON);
const sheetId = process.env.SHEET_ID;
const leads = (await readTab(sheetId, 'Leads', token)).map(labelRowToKeys);

let filled = 0;
for (const lead of leads) {
  if (!QUALS.has(lead.qualification) || String(lead.score).trim()) continue;
  const reasons = (lead.evidence_summary || '').split(', ').map((s) => s.trim()).filter(Boolean);
  lead.score = score({ qualification: lead.qualification, reasons }, lead);
  filled++;
  if (lead._row) await updateRow(sheetId, 'Leads', lead._row, toRow(lead), token, WRITE_OPTS);
}

await sortByColumn(sheetId, 'Leads', LEADS_COLUMNS.indexOf('score'), token, WRITE_OPTS);
console.log(`backfilled ${filled} missing score(s); Leads sorted best-first.`);
