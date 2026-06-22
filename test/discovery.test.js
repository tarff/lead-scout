import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQueryKey, selectPending } from '../src/discovery.js';

test('query key is stable and order-independent on its fields', () => {
  const a = buildQueryKey({ category: 'trades', place_type: 'plumber', tile_id: '0_0', rank_preference: 'distance' });
  assert.equal(a, 'trades|plumber|0_0|distance');
});

test('selects Pending and retryable Error queries; skips Completed/Capped/Running', () => {
  const queries = [
    { query_key: 'p', status: 'Pending' },
    { query_key: 'e', status: 'Error' },
    { query_key: 'c', status: 'Completed' },
    { query_key: 'cap', status: 'Capped' },
    { query_key: 'run', status: 'Running' },
  ];
  assert.deepEqual(selectPending(queries).map((q) => q.query_key), ['p', 'e']);
});

test('empty input yields empty selection', () => {
  assert.deepEqual(selectPending([]), []);
});
