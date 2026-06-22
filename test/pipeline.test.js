import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPipeline } from '../src/pipeline.js';

const baseCaps = { searchNearby: 10, placeDetails: 10, pagespeed: 10, drafts: 10 };

function fakes(overrides = {}) {
  const calls = { appendLeads: [], updateLead: [], updateQuery: [], llm: 0 };
  const deps = {
    apiKey: 'k', pagespeedCfg: { minPerformanceScore: null, maxLcpMs: 2500, requireHttps: true },
    readLeads: async () => [],
    readQueries: async () => [{ _row: 2, query_key: 'q1', status: 'Pending', category: 'trades',
      place_type: 'plumber', tile_id: '0_0', center_lat: -37.9, center_lng: 145, radius_m: 700 }],
    searchNearby: async () => [{ place_id: 'p1', business_name: 'Acme' }], // no website => hot
    placeDetails: async () => ({ website_url: '', phone: '03 9000 0000' }),
    runPagespeed: async () => ({ performanceScore: null, lcpMs: null, failedAudits: [] }),
    callLLM: async () => { calls.llm++; return 'opener'; },
    appendLeads: async (rows) => { calls.appendLeads.push(rows.length); return { startRow: 2 }; },
    updateLead: async (l) => { calls.updateLead.push([l.place_id, l.status]); },
    updateQuery: async (q) => { calls.updateQuery.push([q.query_key, q.status]); },
    log: () => {},
    ...overrides,
  };
  return { deps, calls };
}

test('append with no row number defers enrichment (no paid work it cannot persist) and warns', async () => {
  const logs = [];
  let detailsCalls = 0;
  const { deps } = fakes({
    appendLeads: async () => ({ startRow: null }), // cannot determine row numbers
    placeDetails: async () => { detailsCalls++; return { website_url: '', phone: '03 9' }; },
    log: (m) => logs.push(m),
  });
  await runPipeline({ ...deps, dryRun: false, caps: baseCaps });
  assert.equal(detailsCalls, 0, 'must not pay for enrichment that cannot be checkpointed');
  assert.ok(logs.some((m) => /no startRow/i.test(m)), 'warns about the deferred leads');
});

test('dry-run performs NO writes and NO LLM calls', async () => {
  const { deps, calls } = fakes();
  const summary = await runPipeline({ ...deps, dryRun: true, caps: baseCaps });
  assert.equal(calls.appendLeads.length, 0);
  assert.equal(calls.updateLead.length, 0);
  assert.equal(calls.updateQuery.length, 0);
  assert.equal(calls.llm, 0);
  assert.ok(summary.discovered >= 1 && summary.hot >= 1);
});

test('live run stages BEFORE enrich, then checkpoints the query Completed', async () => {
  const { deps, calls } = fakes();
  await runPipeline({ ...deps, dryRun: false, caps: baseCaps });
  assert.ok(calls.appendLeads.length >= 1, 'Discovered rows appended before enrichment');
  assert.deepEqual(calls.updateQuery.at(-1), ['q1', 'Completed'], 'query checkpointed Completed');
  assert.ok(calls.updateLead.some(([id]) => id === 'p1'), 'lead row updated in place after enrich');
});

test('full searchNearby result (>=20) marks the query Capped, not Completed', async () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ place_id: `p${i}`, business_name: `B${i}` }));
  const { deps, calls } = fakes({ searchNearby: async () => many });
  await runPipeline({ ...deps, dryRun: false, caps: baseCaps });
  assert.equal(calls.updateQuery.at(-1)[1], 'Capped');
});

test('one bad item does not abort the run; it is marked Error', async () => {
  const { deps, calls } = fakes({
    searchNearby: async () => [{ place_id: 'p1', business_name: 'Acme' }, { place_id: 'p2', business_name: 'Bad' }],
    placeDetails: async (id) => { if (id === 'p2') throw new Error('details boom'); return { website_url: '', phone: '03 9' }; },
  });
  const summary = await runPipeline({ ...deps, dryRun: false, caps: baseCaps });
  assert.ok(summary.errors >= 1);
  assert.ok(calls.updateLead.some(([id, status]) => id === 'p2' && status === 'Error'));
});

test('searchNearby cap is enforced and logged; remaining queries skipped', async () => {
  const logs = [];
  const { deps } = fakes({ readQueries: async () => Array.from({ length: 5 }, (_, i) => ({
    _row: 2 + i, query_key: `q${i}`, status: 'Pending', category: 'c', place_type: 'plumber', tile_id: `${i}`,
    center_lat: -37.9, center_lng: 145, radius_m: 700 })), log: (m) => logs.push(m) });
  const summary = await runPipeline({ ...deps, dryRun: true, caps: { ...baseCaps, searchNearby: 2 } });
  assert.equal(summary.searches, 2);
  assert.ok(logs.some((m) => /cap reached/i.test(m)));
});

test('completed queries are skipped (no paid search repeated on resume)', async () => {
  let searched = 0;
  const { deps } = fakes({
    readQueries: async () => [{ _row: 2, query_key: 'done', status: 'Completed', place_type: 'plumber',
      center_lat: -37.9, center_lng: 145, radius_m: 700 }],
    searchNearby: async () => { searched++; return []; },
  });
  await runPipeline({ ...deps, dryRun: false, caps: baseCaps });
  assert.equal(searched, 0);
});

test('resume: an existing Discovered lead is enriched + updated even with no new discovery', async () => {
  const { deps, calls } = fakes({
    readQueries: async () => [], // nothing new to discover
    readLeads: async () => [{ _row: 7, place_id: 'old1', business_name: 'Old', status: 'Discovered' }],
  });
  await runPipeline({ ...deps, dryRun: false, caps: baseCaps });
  assert.ok(calls.updateLead.some(([id]) => id === 'old1'), 'resumable lead picked up and updated');
});
