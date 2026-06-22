import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandDiscoveryQueries } from '../src/expand.js';

const cats = [{ category: 'trades', place_types: ['plumber', 'electrician'] }];
const center = { lat: -37.93, lng: 145.01 };

test('expands category × place_type × tile into unique keyed rows', () => {
  const rows = expandDiscoveryQueries({ categories: cats, center, radiusM: 10000, tileSizeM: 30000,
    rankPreference: 'distance' });
  // 1 tile (tile > area) × 2 place types = 2 rows
  assert.equal(rows.length, 2);
  assert.equal(new Set(rows.map((r) => r.query_key)).size, 2);
  assert.equal(rows[0].status, 'Pending');
  assert.equal(rows[0].center_lat, center.lat);
});

test('is idempotent — same inputs produce the same keys', () => {
  const args = { categories: cats, center, radiusM: 10000, tileSizeM: 30000, rankPreference: 'distance' };
  assert.deepEqual(expandDiscoveryQueries(args).map((r) => r.query_key),
    expandDiscoveryQueries(args).map((r) => r.query_key));
});
