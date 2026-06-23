import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePagespeed, runPagespeed } from '../src/pagespeed.js';

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

const fakeFetch = (status, body) => async () => ({ ok: status < 400, status, json: async () => ({}), text: async () => body });

test('a Lighthouse load failure is reported as unreachable, not thrown', async () => {
  const r = await runPagespeed('http://dead.example', 'k',
    { fetchImpl: fakeFetch(400, 'Lighthouse returned error: FAILED_DOCUMENT_REQUEST net::ERR_CONNECTION_FAILED'), maxRetries: 0 });
  assert.equal(r.unreachable, true);
  assert.deepEqual([r.performanceScore, r.lcpMs, r.failedAudits], [null, null, []]);
});

test('a non-load API error (e.g. quota) still throws', async () => {
  await assert.rejects(
    runPagespeed('http://x.example', 'k', { fetchImpl: fakeFetch(400, 'quotaExceeded: daily limit'), maxRetries: 0 }),
    /HTTP 400/);
});
