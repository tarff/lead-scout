import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterNew } from '../src/dedupe.js';

test('drops candidates already known by place_id', () => {
  const out = filterNew(['a', 'b'], [{ place_id: 'b' }, { place_id: 'c' }]);
  assert.deepEqual(out.map((x) => x.place_id), ['c']);
});

test('drops intra-batch duplicates, keeping first occurrence', () => {
  const out = filterNew([], [{ place_id: 'x', n: 1 }, { place_id: 'x', n: 2 }]);
  assert.deepEqual(out, [{ place_id: 'x', n: 1 }]);
});

test('accepts a Set or array of existing ids and handles empty input', () => {
  assert.deepEqual(filterNew(new Set(['a']), []), []);
  assert.deepEqual(filterNew(new Set(['a']), [{ place_id: 'a' }]), []);
});
