import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';

test('radius is the design-specified 10km', () => {
  assert.equal(config.radiusM, 10000);
});

test('undecided params are null placeholders, not guessed values', () => {
  assert.equal(config.pagespeed.minPerformanceScore, null);
});

test('center is the derived Hampton centroid, not a guessed coordinate', () => {
  assert.equal(typeof config.center.lat, 'number');
  assert.equal(typeof config.center.lng, 'number');
});

test('tile size + every cap are derived finite numbers (docs/cost-model.md)', () => {
  assert.equal(config.tileSizeM, 4000);
  for (const k of ['searchNearby', 'searchText', 'placeDetails', 'pagespeed', 'drafts']) {
    assert.ok(Number.isFinite(config.caps[k]) && config.caps[k] > 0, `cap ${k} must be a positive number`);
  }
});

test('design-sourced thresholds are present and cited', () => {
  assert.equal(config.pagespeed.maxLcpMs, 2500);
  assert.equal(config.pagespeed.requireHttps, true);
});

test('model slug is the confirmed OpenRouter slug', () => {
  assert.equal(config.model, 'anthropic/claude-haiku-4.5');
});
