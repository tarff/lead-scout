// One-off migration: switch the Leads tab to the layout that shows a plain-language
// "Priority" column and keeps the numeric score as a hidden sort key. Recomputes
// both from each row's stored qualification / evidence / phone (no API calls), then
// rewrites the whole tab in one bulk write. Backs up to scratchpad first.
// Pass --apply to write; default prints a preview.
import { writeFileSync } from 'node:fs';
import { getAccessToken } from '../src/auth.js';
import { readTab, writeHeader, clearTab, appendRows, formatWorkingView } from '../src/sheets.js';
import { labelRowToKeys, LEADS_COLUMNS, LEADS_HEADER_ROW, LEADS_VISIBLE_COUNT } from '../src/schema.js';
import { score, priorityLabel } from '../src/score.js';

const APPLY = process.argv.includes('--apply');
const WRITE_OPTS = { maxRetries: 6, baseDelayMs: 1000, maxDelayMs: 60000 };
const QUALS = new Set(['hot', 'warm', 'needs_pagespeed', 'dropped']);
const toRow = (obj) => LEADS_COLUMNS.map((c) => (obj[c] ?? '').toString());

const token = await getAccessToken(process.env.GOOGLE_SHEETS_SA_JSON);
const sheetId = process.env.SHEET_ID;
const leads = (await readTab(sheetId, 'Leads', token)).map(labelRowToKeys);

writeFileSync(process.argv[3] || './scripts/.leads-backup.json', JSON.stringify(leads, null, 2));

for (const lead of leads) {
  const reasons = (lead.evidence_summary || '').split(', ').map((s) => s.trim()).filter(Boolean);
  if (QUALS.has(lead.qualification)) {
    lead.score = score({ qualification: lead.qualification, reasons }, lead);
    lead.priority = priorityLabel(lead.qualification, lead.qualification === 'warm' ? reasons.length : 0);
  } else {
    lead.score = '';
    lead.priority = ''; // not yet qualified (Discovered) — filled when enriched
  }
}

const sample = leads.filter((l) => l.priority).slice(0, 12);
for (const l of sample) console.log(`${(l.business_name || '').slice(0, 28).padEnd(28)} | ${l.priority}`);
console.log(`\n${leads.length} rows; ${leads.filter((l) => l.priority).length} with a Priority.`);

if (!APPLY) {
  console.log('dry run — pass --apply to rewrite the sheet.');
} else {
  await writeHeader(sheetId, 'Leads', LEADS_HEADER_ROW, token, WRITE_OPTS);
  await clearTab(sheetId, 'Leads', token, WRITE_OPTS);
  await appendRows(sheetId, 'Leads', leads.map(toRow), token, WRITE_OPTS);
  await formatWorkingView(sheetId, 'Leads', LEADS_VISIBLE_COUNT, token, WRITE_OPTS);
  console.log('sheet rewritten to the Priority layout.');
}
