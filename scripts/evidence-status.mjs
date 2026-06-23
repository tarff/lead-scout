// One-off, READ-ONLY: report lead status counts and what the "Why It Qualified"
// column currently holds (raw codes vs humanized phrases).
import { getAccessToken } from '../src/auth.js';
import { readTab } from '../src/sheets.js';
import { labelRowToKeys } from '../src/schema.js';

const token = await getAccessToken(process.env.GOOGLE_SHEETS_SA_JSON);
const leads = (await readTab(process.env.SHEET_ID, 'Leads', token)).map(labelRowToKeys);

const byStatus = {};
for (const l of leads) byStatus[l.status || '(blank)'] = (byStatus[l.status || '(blank)'] || 0) + 1;

const CODE = /^(no_website|no_https|low_performance|high_lcp|missing_pagespeed|failed_audit:)/;
const codey = leads.filter((l) => (l.evidence_summary || '').split(', ').some((p) => CODE.test(p)));

console.log('total leads:', leads.length);
console.log('by status:', JSON.stringify(byStatus, null, 2));
console.log('rows whose evidence still looks like raw codes:', codey.length);
console.log('sample evidence values:');
for (const l of leads.slice(0, 12)) console.log('  -', JSON.stringify(l.evidence_summary || ''));
