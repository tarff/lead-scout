// One-off migration: rewrite the "Why It Qualified" column on existing rows from
// raw reason codes (e.g. "no_https, high_lcp") to the explicit human phrasing used
// for all new rows. No API calls — phrasing is derived from codes plus the numbers
// already stored in each row (lcp_ms, pagespeed_score). Idempotent: rows already
// humanized pass through unchanged. Pass --apply to write; default is a dry run.
import { getAccessToken } from '../src/auth.js';
import { readTab, updateRow } from '../src/sheets.js';
import { labelRowToKeys, LEADS_COLUMNS } from '../src/schema.js';
import { humanizeReasons } from '../src/evidence.js';

const APPLY = process.argv.includes('--apply');
const WRITE_OPTS = { maxRetries: 6, baseDelayMs: 1000, maxDelayMs: 60000 };
const toRow = (obj) => LEADS_COLUMNS.map((c) => (obj[c] ?? '').toString());

const token = await getAccessToken(process.env.GOOGLE_SHEETS_SA_JSON);
const sheetId = process.env.SHEET_ID;
const leads = (await readTab(sheetId, 'Leads', token)).map(labelRowToKeys);

let changed = 0;
for (const lead of leads) {
  const current = (lead.evidence_summary || '').trim();
  if (!current) continue;
  const codes = current.split(', ').map((s) => s.trim()).filter(Boolean);
  const humanized = humanizeReasons(codes, lead).join(', ');
  if (humanized === current) continue; // already humanized / nothing to do
  changed++;
  console.log(`row ${lead._row}: "${current}"  ->  "${humanized}"`);
  if (APPLY && lead._row) {
    lead.evidence_summary = humanized;
    await updateRow(sheetId, 'Leads', lead._row, toRow(lead), token, WRITE_OPTS);
  }
}

console.log(`\n${changed} row(s) ${APPLY ? 'rewritten' : 'would change (dry run; pass --apply to write)'}.`);
