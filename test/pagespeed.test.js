import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePagespeed } from '../src/pagespeed.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/pagespeed-sample.json', import.meta.url)));

test('normalizes performance score to 0-100 integer', () => {
  const n = normalizePagespeed(sample);
  assert.equal(typeof n.performanceScore, 'number');
  assert.ok(n.performanceScore >= 0 && n.performanceScore <= 100);
});

test('extracts LCP in milliseconds', () => {
  assert.ok(Number.isFinite(normalizePagespeed(sample).lcpMs));
});

test('failedAudits is an array of audit ids that scored 0', () => {
  const n = normalizePagespeed(sample);
  assert.ok(Array.isArray(n.failedAudits));
});

test('handles a response with no lighthouseResult gracefully', () => {
  assert.deepEqual(normalizePagespeed({}), { performanceScore: null, lcpMs: null, failedAudits: [] });
});
