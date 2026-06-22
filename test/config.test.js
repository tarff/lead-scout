import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';

test('radius is the design-specified 10km', () => {
  assert.equal(config.radiusM, 10000);
});

test('undecided params are null placeholders, not guessed values', () => {
  assert.equal(config.center, null);
  assert.equal(config.tileSizeM, null);
  assert.equal(config.pagespeed.minPerformanceScore, null);
  assert.equal(config.caps.placeDetails, null);
});

test('design-sourced thresholds are present and cited', () => {
  assert.equal(config.pagespeed.maxLcpMs, 2500);
  assert.equal(config.pagespeed.requireHttps, true);
});

test('model slug is the confirmed OpenRouter slug', () => {
  assert.equal(config.model, 'anthropic/claude-haiku-4.5');
});
