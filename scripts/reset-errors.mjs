// One-off maintenance: flip leads stuck in "Error" back to a resumable status so
// the next enrichment re-processes them with current logic (e.g. a dead site now
// qualifies as "broken" instead of crashing). Clears last_error. Leads keep their
// already-fetched website/phone, so they resume at the PageSpeed/qualify stage.
// Pass --apply to write; default prints a preview.
import { getAccessToken } from '../src/auth.js';
import { readTab, updateRow } from '../src/sheets.js';
import { labelRowToKeys, LEADS_COLUMNS } from '../src/schema.js';

const APPLY = process.argv.includes('--apply');
const WRITE_OPTS = { maxRetries: 6, baseDelayMs: 1000, maxDelayMs: 60000 };
const toRow = (obj) => LEADS_COLUMNS.map((c) => (obj[c] ?? '').toString());

const token = await getAccessToken(process.env.GOOGLE_SHEETS_SA_JSON);
const sheetId = process.env.SHEET_ID;
const leads = (await readTab(sheetId, 'Leads', token)).map(labelRowToKeys);
const stuck = leads.filter((l) => l.status === 'Error');

for (const lead of stuck) {
  console.log(`row ${lead._row}: ${lead.business_name} — was: ${(lead.last_error || '').slice(0, 80)}`);
  if (APPLY && lead._row) {
    lead.status = 'Enriched';
    lead.last_error = '';
    await updateRow(sheetId, 'Leads', lead._row, toRow(lead), token, WRITE_OPTS);
  }
}
console.log(`\n${stuck.length} Error row(s) ${APPLY ? 'reset to Enriched' : 'would reset (dry run; pass --apply)'}.`);
