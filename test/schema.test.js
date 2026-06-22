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
  for (const c of ['query_key', 'tile_id', 'status', 'cap_hit'])
    assert.ok(DISCOVERY_COLUMNS.includes(c), `missing ${c}`);
});

test('status enums match the design state machine', () => {
  assert.deepEqual(LEAD_STATUS, ['Discovered', 'Enriched', 'Needs PageSpeed',
    'Qualified', 'Drafted', 'Review ready', 'Dropped', 'Research only',
    'Contacted', 'Suppressed', 'Error']);
  assert.deepEqual(QUERY_STATUS, ['Pending', 'Running', 'Completed', 'Capped', 'Error']);
});
