// One-off live test: pick one top lead, set it to the in_person channel with
// real compliance fields, run the pipeline with the REAL OpenRouter LLM, and print
// the generated spoken opener. Drafts only (never sends). Optional arg: business name.
import { getAccessToken } from '../src/auth.js';
import { runPagespeed } from '../src/pagespeed.js';
import { placeDetails, searchNearby, searchText } from '../src/places.js';
import { defaultCallLLM } from '../src/draft.js';
import { runPipeline } from '../src/pipeline.js';
import { config } from '../src/config.js';
import { DISCOVERY_COLUMNS, LEADS_COLUMNS, labelRowToKeys } from '../src/schema.js';
import { appendRows, readTab, updateRow } from '../src/sheets.js';

const env = process.env;
const WRITE_OPTS = { maxRetries: 6, baseDelayMs: 1000, maxDelayMs: 60000 };
const toRow = (obj, cols) => cols.map((c) => (obj[c] ?? '').toString());
const sheetId = env.SHEET_ID;
const token = await getAccessToken(env.GOOGLE_SHEETS_SA_JSON);

const leads = (await readTab(sheetId, 'Leads', token)).map(labelRowToKeys);
const wanted = process.argv[2];
const target = wanted
  ? leads.find((l) => l.business_name === wanted)
  : leads.find((l) => l.qualification === 'hot' && l.status === 'Research only');
if (!target) throw new Error('no target lead found');

// Set the in-person compliance fields (real values for Ctrl Alt Develop).
Object.assign(target, {
  contact_channel: 'in_person',
  caller_identity: 'Ctrl Alt Develop',
  sender_contact: 'timelbery@iinet.net.au',
  suppressed: 'false',
});
await updateRow(sheetId, 'Leads', target._row, toRow(target, LEADS_COLUMNS), token, WRITE_OPTS);
console.log(`target: ${target.business_name} (row ${target._row}) — set to in_person, re-running...\n`);

await runPipeline({
  apiKey: env.GOOGLE_API_KEY, dryRun: false, caps: config.caps, pagespeedCfg: config.pagespeed,
  readLeads: async () => (await readTab(sheetId, 'Leads', token)).map(labelRowToKeys),
  readQueries: async () => [],
  searchNearby, searchText, placeDetails, runPagespeed,
  callLLM: (prompt) => defaultCallLLM(prompt, { apiKey: env.OPENROUTER_API_KEY, model: env.OPENROUTER_MODEL || config.model }),
  appendLeads: (rows) => appendRows(sheetId, 'Leads', rows.map((r) => toRow(r, LEADS_COLUMNS)), token, WRITE_OPTS),
  updateLead: (lead) => updateRow(sheetId, 'Leads', lead._row, toRow(lead, LEADS_COLUMNS), token, WRITE_OPTS),
  updateQuery: (q) => updateRow(sheetId, 'DiscoveryQueries', q._row, toRow(q, DISCOVERY_COLUMNS), token, WRITE_OPTS),
  log: () => {},
});

const after = (await readTab(sheetId, 'Leads', token)).map(labelRowToKeys).find((l) => l._row === target._row);
console.log('business : ', after.business_name);
console.log('why      : ', after.evidence_summary);
console.log('status   : ', after.status);
console.log('channel  : ', after.contact_channel);
console.log('draft    : ', JSON.stringify(after.draft_opener));
