import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveTilingSummaries } from '../scripts/derive-tiling.mjs';

test('deriveTilingSummaries rejects a missing centre instead of guessing coordinates', () => {
  assert.throws(() => deriveTilingSummaries({
    categories: [],
    center: null,
    radiusM: 10000,
    tileSizes: [3000],
  }), /center/);
});
