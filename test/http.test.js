import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestJson } from '../src/http.js';

const resp = (status, body, headers = {}) => ({
  status, ok: status >= 200 && status < 300,
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  json: async () => body, text: async () => JSON.stringify(body),
});

test('returns parsed JSON on 200', async () => {
  const fetchImpl = async () => resp(200, { ok: 1 });
  assert.deepEqual(await requestJson('https://x', {}, { fetchImpl }), { ok: 1 });
});

test('retries on 429 then succeeds, respecting attempts', async () => {
  let calls = 0;
  const fetchImpl = async () => (++calls < 3 ? resp(429, {}, { 'retry-after': '0' }) : resp(200, { done: 1 }));
  const out = await requestJson('https://x', {}, { fetchImpl, maxRetries: 3, baseDelayMs: 0 });
  assert.deepEqual(out, { done: 1 });
  assert.equal(calls, 3);
});

test('throws after exhausting retries on persistent 500', async () => {
  const fetchImpl = async () => resp(500, { error: 'boom' });
  await assert.rejects(() => requestJson('https://x', {}, { fetchImpl, maxRetries: 2, baseDelayMs: 0 }),
    /HTTP 500/);
});

test('does not retry on 4xx other than 429', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return resp(403, { error: 'denied' }); };
  await assert.rejects(() => requestJson('https://x', {}, { fetchImpl, maxRetries: 3, baseDelayMs: 0 }), /HTTP 403/);
  assert.equal(calls, 1);
});
