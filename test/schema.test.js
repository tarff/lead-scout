import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEADS_COLUMNS, DISCOVERY_COLUMNS, LEAD_STATUS, QUERY_STATUS } from '../src/schema.js';

const noDupes = (arr) => assert.equal(new Set(arr).size, arr.length);

test('Leads columns have no duplicates and key fields present', () => {
  noDupes(LEADS_COLUMNS);
  for (const c of ['place_id', 'compliance_status', 'suppressed', 'status',
    'contacted', 'sender_contact', 'unsubscribe', 'contact_form_manual_only',
    'do_not_call_note'])
    assert.ok(LEADS_COLUMNS.includes(c), `missing ${c}`);
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
