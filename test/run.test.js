import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireSecrets, validateRunnableConfig } from '../src/run.js';

test('requireSecrets lists every missing secret', () => {
  assert.throws(() => requireSecrets({}), /GOOGLE_API_KEY.*OPENROUTER_API_KEY.*GOOGLE_SHEETS_SA_JSON.*SHEET_ID/s);
});

test('requireSecrets accepts the required runtime secrets', () => {
  assert.doesNotThrow(() => requireSecrets({
    GOOGLE_API_KEY: 'google',
    OPENROUTER_API_KEY: 'openrouter',
    GOOGLE_SHEETS_SA_JSON: '{}',
    SHEET_ID: 'sheet',
  }));
});

test('validateRunnableConfig rejects unset derived stage parameters', () => {
  assert.throws(() => validateRunnableConfig({
    center: null,
    tileSizeM: null,
    caps: { searchNearby: null, searchText: null, placeDetails: null, pagespeed: null, drafts: null },
  }), /center.*tileSizeM.*caps\.searchNearby.*caps\.searchText.*caps\.placeDetails.*caps\.pagespeed.*caps\.drafts/s);
});
