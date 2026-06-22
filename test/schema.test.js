import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEADS_COLUMNS, DISCOVERY_COLUMNS, LEAD_STATUS, QUERY_STATUS,
  LEADS_HEADER_ROW, LEADS_VISIBLE_COUNT, HEADER_LABELS, labelRowToKeys } from '../src/schema.js';

const noDupes = (arr) => assert.equal(new Set(arr).size, arr.length);

test('Leads columns have no duplicates and key fields present', () => {
  noDupes(LEADS_COLUMNS);
  for (const c of ['place_id', 'compliance_status', 'suppressed', 'status',
    'contacted', 'sender_contact', 'unsubscribe', 'contact_form_manual_only',
    'do_not_call_note'])
    assert.ok(LEADS_COLUMNS.includes(c), `missing ${c}`);
});

test('the first visible Leads columns are the human working set, friendly-labelled', () => {
  assert.deepEqual(LEADS_COLUMNS.slice(0, LEADS_VISIBLE_COUNT), [
    'business_name', 'address', 'phone', 'website_url', 'primary_type',
    'evidence_summary', 'score', 'status', 'draft_opener',
  ]);
  assert.deepEqual(LEADS_HEADER_ROW.slice(0, 4), ['Business Name', 'Address', 'Phone', 'Website']);
});

test('every Leads column has a friendly label and the header row matches column order', () => {
  assert.equal(LEADS_HEADER_ROW.length, LEADS_COLUMNS.length);
  for (const c of LEADS_COLUMNS) assert.ok(HEADER_LABELS[c], `missing label for ${c}`);
});

test('labelRowToKeys translates a label-keyed sheet row back to snake_case keys, keeping _row', () => {
  const fromSheet = { 'Business Name': 'Acme', Website: 'https://x', Status: 'Enriched', _row: 5 };
  assert.deepEqual(labelRowToKeys(fromSheet),
    { business_name: 'Acme', website_url: 'https://x', status: 'Enriched', _row: 5 });
});

test('DiscoveryQueries columns have no duplicates and key fields present', () => {
  noDupes(DISCOVERY_COLUMNS);
  for (const c of ['query_key', 'query_mode', 'tile_id', 'text_query', 'status', 'cap_hit'])
    assert.ok(DISCOVERY_COLUMNS.includes(c), `missing ${c}`);
});

test('DiscoveryQueries keeps existing column positions stable for live sheets', () => {
  assert.deepEqual(DISCOVERY_COLUMNS.slice(0, 15), [
    'query_key', 'category', 'place_type', 'tile_id', 'rank_preference',
    'center_lat', 'center_lng', 'radius_m',
    'status', 'result_count', 'cap_hit', 'started_at', 'completed_at',
    'last_error', 'updated_at',
  ]);
  assert.deepEqual(DISCOVERY_COLUMNS.slice(15), ['query_mode', 'text_query']);
});

test('status enums match the design state machine', () => {
  assert.deepEqual(LEAD_STATUS, ['Discovered', 'Enriched', 'Needs PageSpeed',
    'Qualified', 'Drafted', 'Review ready', 'Dropped', 'Research only',
    'Contacted', 'Suppressed', 'Error']);
  assert.deepEqual(QUERY_STATUS, ['Pending', 'Running', 'Completed', 'Capped', 'Error']);
});
