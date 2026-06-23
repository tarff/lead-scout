// Maintenance: resume pass that enriches already-staged Discovered leads and
// re-runs PageSpeed on Needs PageSpeed leads. No new discovery (readQueries=[]).
// Run: node --env-file=.env scripts/enrich-resume.mjs
import { getAccessToken } from '../src/auth.js';
import { runPagespeed } from '../src/pagespeed.js';
import { placeDetails, searchNearby, searchText } from '../src/places.js';
import { runPipeline } from '../src/pipeline.js';
import { config } from '../src/config.js';
import { DISCOVERY_COLUMNS, LEADS_COLUMNS, labelRowToKeys } from '../src/schema.js';
import { appendRows, readTab, updateRow } from '../src/sheets.js';

const SHEET_WRITE_OPTS = { maxRetries: 6, baseDelayMs: 1000, maxDelayMs: 60000 };
const toRow = (obj, cols) => cols.map((c) => (obj[c] ?? '').toString());
const env = process.env;
const sheetId = env.SHEET_ID;
const token = await getAccessToken(env.GOOGLE_SHEETS_SA_JSON);

const summary = await runPipeline({
  apiKey: env.GOOGLE_API_KEY, dryRun: false, caps: config.caps, pagespeedCfg: config.pagespeed,
  readLeads: async () => (await readTab(sheetId, 'Leads', token)).map(labelRowToKeys),
  readQueries: async () => [], // resume only — no new discovery
  searchNearby, searchText, placeDetails, runPagespeed,
  callLLM: async () => '',
  appendLeads: (rows) => appendRows(sheetId, 'Leads', rows.map((r) => toRow(r, LEADS_COLUMNS)), token, SHEET_WRITE_OPTS),
  updateLead: (lead) => updateRow(sheetId, 'Leads', lead._row, toRow(lead, LEADS_COLUMNS), token, SHEET_WRITE_OPTS),
  updateQuery: (q) => updateRow(sheetId, 'DiscoveryQueries', q._row, toRow(q, DISCOVERY_COLUMNS), token, SHEET_WRITE_OPTS),
  log: console.log,
});
console.log('SUMMARY', JSON.stringify(summary));

const leads = (await readTab(sheetId, 'Leads', token)).map(labelRowToKeys);
const byStatus = {};
let blankWhy = 0;
for (const l of leads) {
  byStatus[l.status] = (byStatus[l.status] || 0) + 1;
  if (!(l.evidence_summary || '').trim()) blankWhy++;
}
console.log('final by status:', JSON.stringify(byStatus));
console.log('remaining blank Why It Qualified:', blankWhy, 'of', leads.length);
