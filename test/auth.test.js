import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCredentials } from '../src/auth.js';

const sa = { client_email: 'x@y.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\n...' };

test('parses inline JSON credentials', () => {
  const c = resolveCredentials(JSON.stringify(sa), { readFileSync: () => { throw new Error('should not read'); } });
  assert.equal(c.client_email, sa.client_email);
});

test('reads credentials from a file path', () => {
  const c = resolveCredentials('./service-account.json', { readFileSync: () => JSON.stringify(sa) });
  assert.equal(c.client_email, sa.client_email);
});

test('throws a clear error when the secret is missing', () => {
  assert.throws(() => resolveCredentials('', {}), /GOOGLE_SHEETS_SA_JSON/);
});
