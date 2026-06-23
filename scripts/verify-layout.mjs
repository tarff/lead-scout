// READ-ONLY sanity check of the new Priority layout.
import { getAccessToken } from '../src/auth.js';
import { readTab } from '../src/sheets.js';
import { labelRowToKeys } from '../src/schema.js';

const token = await getAccessToken(process.env.GOOGLE_SHEETS_SA_JSON);
const grid = await readTab(process.env.SHEET_ID, 'Leads', token);
const leads = grid.map(labelRowToKeys);

const counts = {};
for (const l of leads) counts[l.priority || '(blank)'] = (counts[l.priority || '(blank)'] || 0) + 1;
console.log('Priority distribution:');
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${v.toString().padStart(3)}  ${k}`);
const withScore = leads.filter((l) => String(l.score).trim()).length;
console.log(`\nhidden numeric Score present on ${withScore} rows (sort key intact).`);
