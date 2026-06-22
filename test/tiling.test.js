import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tileCircle } from '../src/tiling.js';

const center = { lat: -37.9333, lng: 145.0167 };

test('tile larger than the whole area => single tile at centre', () => {
  const tiles = tileCircle(center, 10000, 30000);
  assert.equal(tiles.length, 1);
  assert.equal(tiles[0].tile_id, '0_0');
});

test('invalid tile sizes throw before any loop', () => {
  for (const tileSizeM of [null, 0, -1, Infinity, NaN])
    assert.throws(() => tileCircle(center, 10000, tileSizeM), /tileSizeM/);
});

test('smaller tiles produce a grid covering the area', () => {
  const tiles = tileCircle(center, 10000, 5000);
  assert.ok(tiles.length > 1);
  for (const t of tiles) {
    assert.ok(Number.isFinite(t.lat) && Number.isFinite(t.lng));
    assert.ok(t.radius > 0);
    assert.match(t.tile_id, /^-?\d+_-?\d+$/);
  }
});

test('tile ids are unique and deterministic', () => {
  const ids = tileCircle(center, 10000, 5000).map((t) => t.tile_id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, tileCircle(center, 10000, 5000).map((t) => t.tile_id));
});
