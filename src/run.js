import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { getAccessToken } from './auth.js';
import { expandDiscoveryQueries } from './expand.js';
import { CANDIDATE_CATEGORIES } from './categories.js';
import { defaultCallLLM } from './draft.js';
import { runPagespeed } from './pagespeed.js';
import { placeDetails, searchNearby, searchText } from './places.js';
import { runPipeline } from './pipeline.js';
import { DISCOVERY_COLUMNS, LEADS_COLUMNS, LEADS_HEADER_ROW, LEADS_VISIBLE_COUNT, labelRowToKeys } from './schema.js';
import { appendRows, formatWorkingView, readTab, updateRow, writeHeader } from './sheets.js';

const REQUIRED = ['GOOGLE_API_KEY', 'OPENROUTER_API_KEY', 'GOOGLE_SHEETS_SA_JSON', 'SHEET_ID'];
const REQUIRED_CAPS = ['searchNearby', 'searchText', 'placeDetails', 'pagespeed', 'drafts'];

export function requireSecrets(env) {
  const missing = REQUIRED.filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing secrets: ${missing.join(', ')}`);
}

export function validateRunnableConfig(cfg) {
  const missing = [];
  if (!cfg.center) missing.push('center');
  if (cfg.tileSizeM == null) missing.push('tileSizeM');
  for (const cap of REQUIRED_CAPS) {
    if (cfg.caps?.[cap] == null) missing.push(`caps.${cap}`);
  }
  if (missing.length) throw new Error(`Missing derived config values: ${missing.join(', ')}`);
}

const toRow = (obj, columns) => columns.map((c) => (obj[c] ?? '').toString());

export async function main(env = process.env, log = console.log) {
  requireSecrets(env);
  validateRunnableConfig(config);

  const token = await getAccessToken(env.GOOGLE_SHEETS_SA_JSON);
  const sheetId = env.SHEET_ID;

  if (!config.dryRun) {
    await writeHeader(sheetId, 'Leads', LEADS_HEADER_ROW, token);
    await writeHeader(sheetId, 'DiscoveryQueries', DISCOVERY_COLUMNS, token);
    // Lean working view: freeze the header, hide the internal columns.
    await formatWorkingView(sheetId, 'Leads', LEADS_VISIBLE_COUNT, token);
  }

  const existingQueries = await readTab(sheetId, 'DiscoveryQueries', token);
  const knownQueries = new Set(existingQueries.map((q) => q.query_key));
  const desiredQueries = expandDiscoveryQueries({
    categories: CANDIDATE_CATEGORIES,
    center: config.center,
    radiusM: config.radiusM,
    tileSizeM: config.tileSizeM,
    rankPreference: 'distance',
  });
  const missingQueries = desiredQueries.filter((q) => !knownQueries.has(q.query_key));
  if (!config.dryRun && missingQueries.length) {
    await appendRows(sheetId, 'DiscoveryQueries',
      missingQueries.map((q) => toRow(q, DISCOVERY_COLUMNS)), token);
  }

  const summary = await runPipeline({
    apiKey: env.GOOGLE_API_KEY,
    dryRun: config.dryRun,
    caps: config.caps,
    pagespeedCfg: config.pagespeed,
    readLeads: async () => (await readTab(sheetId, 'Leads', token)).map(labelRowToKeys),
    readQueries: () => readTab(sheetId, 'DiscoveryQueries', token),
    searchNearby,
    searchText,
    placeDetails,
    runPagespeed,
    callLLM: (prompt) => defaultCallLLM(prompt, {
      apiKey: env.OPENROUTER_API_KEY,
      model: env.OPENROUTER_MODEL || config.model,
    }),
    appendLeads: (rows) => appendRows(sheetId, 'Leads',
      rows.map((r) => toRow(r, LEADS_COLUMNS)), token),
    updateLead: (lead) => updateRow(sheetId, 'Leads', lead._row,
      toRow(lead, LEADS_COLUMNS), token),
    updateQuery: (q) => updateRow(sheetId, 'DiscoveryQueries', q._row,
      toRow(q, DISCOVERY_COLUMNS), token),
    log,
  });

  log(`DONE ${JSON.stringify(summary)}`);
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
