# lead-scout Stage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Modules with logic are built with @superpowers:test-driven-development (red → green → commit). I/O wrappers are tested with an **injected `fetch`/client** so tests stay offline and deterministic.

**Goal:** Wire the paid/IO layer onto the green pure-logic foundation — Google service-account auth, Sheets read/write, Places discovery + enrichment, PageSpeed, OpenRouter drafting (gated by the compliance keystone), the data-driven parameter derivations that fill the `null` config slots, a resumable dry-run-first orchestrator, and the weekly GitHub Actions cron.

**Architecture:** Each stage is a small module that takes an **injected HTTP client** (so it is unit-testable offline) and pure mapping functions (response → lead fields) that are tested directly. The orchestrator (`pipeline.js`) sequences stages over the two Sheets tabs (source of truth), enforces per-SKU caps, isolates per-item failures, and persists progress after each stage so a crash resumes without repeating paid/LLM work. No parameter is guessed: `config.center`, `config.tileSizeM`, `config.caps`, and `config.pagespeed.minPerformanceScore` are filled **only** by the derivation tasks (geocode, pricing, calibration) and committed with their justification.

**Tech Stack:** Node 24 ESM, `node:test`, native `fetch`, native `--env-file` for local secrets, **one** runtime dep: `google-auth-library` (service-account token only). Installed with `sfw npm install`.

**Depends on:** the merged foundation (`config.js`, `schema.js`, `dedupe.js`, `qualify.js`, `score.js`, `compliance.js`, `tiling.js`, `discovery.js`, `categories.js`).

**Design references:** `docs/plans/2026-06-22-prospecting-agent-design.md` (data flow, field masks, cost controls, error handling, decision table). Compliance keystone is non-negotiable — drafting is gated on `compliance.evaluate(...) === 'Review ready'`.

**Hard rules carried in:**
- **No guessed numbers** — derivation tasks (8, 9, 10) produce `tileSizeM`, `caps`, `minPerformanceScore`, `center` from data + documented sources before any broad live run.
- **`sfw` on every install** (user global rule). CI uses `npm ci` (lockfile, no registry resolution).
- **Dry-run is the default** (`config.dryRun` true unless `DRY_RUN=false`). First runs and calibration cost nothing or near-nothing.
- **Fail-fast on missing secrets.** Per-item isolation everywhere. Log every cap hit ("cap reached, N skipped") — no silent truncation.

---

## Task 1: Stage dependencies + scripts

**Files:**
- Modify: `package.json`

**Step 1: Install the one dependency**

Run: `sfw npm install google-auth-library`
Expected: adds `google-auth-library` to `dependencies`, creates `package-lock.json`.

**Step 2: Add run scripts to `package.json`**

```json
{
  "scripts": {
    "test": "node --test",
    "start": "node --env-file=.env src/run.js",
    "calibrate": "node --env-file=.env scripts/calibrate-threshold.mjs",
    "derive-tiling": "node --env-file=.env scripts/derive-tiling.mjs",
    "geocode": "node --env-file=.env scripts/geocode-centre.mjs"
  }
}
```

**Step 3: Verify foundation still green with the new dep present**

Run: `npm test`
Expected: 55 pass, 0 fail (dep install must not break anything).

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add google-auth-library + run scripts for stage layer"
```

---

## Task 2: HTTP client with retry/backoff

A thin wrapper over `fetch`: timeout, JSON parse, retry on `429`/`5xx` with exponential backoff, honour `Retry-After`. Injected everywhere so stages are testable offline.

**Files:**
- Create: `src/http.js`
- Test: `test/http.test.js`

**Step 1: Write the failing test** (inject a fake fetch)

```js
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
```

**Step 2: Run — expect FAIL.**

**Step 3: Implement**

```js
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// fetch wrapper: JSON in/out, retry on 429 + 5xx with exponential backoff.
export async function requestJson(url, init = {}, opts = {}) {
  const { fetchImpl = fetch, maxRetries = 4, baseDelayMs = 500, timeoutMs = 30000 } = opts;
  let attempt = 0;
  for (;;) {
    attempt++;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(url, { ...init, signal: ac.signal });
    } catch (e) {
      clearTimeout(timer);
      if (attempt > maxRetries) throw e;
      await sleep(baseDelayMs * 2 ** (attempt - 1));
      continue;
    }
    clearTimeout(timer);
    if (res.ok) return res.json();

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt > maxRetries) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
    const retryAfter = Number(res.headers.get('retry-after'));
    const delay = Number.isFinite(retryAfter) ? retryAfter * 1000 : baseDelayMs * 2 ** (attempt - 1);
    await sleep(delay);
  }
}
```

**Step 4: Run — expect PASS.**

**Step 5: Commit**

```bash
git add src/http.js test/http.test.js
git commit -m "feat: add http client with retry/backoff + 429 handling"
```

---

## Task 3: Service-account auth

Resolves the SA credential from `GOOGLE_SHEETS_SA_JSON` — either a **file path** (local) or **inline JSON** (CI secret) — and mints an access token via `google-auth-library`. The source-resolution is a pure, tested helper; token minting is a thin wrapper.

**Files:**
- Create: `src/auth.js`
- Test: `test/auth.test.js`

**Step 1: Write the failing test** (only the pure resolver is unit-tested)

```js
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
```

**Step 2: Run — expect FAIL.**

**Step 3: Implement**

```js
import { readFileSync as fsRead } from 'node:fs';
import { GoogleAuth } from 'google-auth-library';

// Accepts inline JSON (CI secret) or a path to the key file (local). Injected
// reader for testability.
export function resolveCredentials(value, deps = {}) {
  const readFileSync = deps.readFileSync || fsRead;
  if (!value || !value.trim()) throw new Error('GOOGLE_SHEETS_SA_JSON is not set');
  const raw = value.trim().startsWith('{') ? value : readFileSync(value, 'utf8');
  return JSON.parse(raw);
}

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

export async function getAccessToken(saValue) {
  const credentials = resolveCredentials(saValue);
  const auth = new GoogleAuth({ credentials, scopes: SCOPES });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('failed to obtain access token');
  return token;
}
```

**Step 4: Run — expect PASS** (`node --test test/auth.test.js`).

**Step 5: Commit**

```bash
git add src/auth.js test/auth.test.js
git commit -m "feat: add service-account auth (inline JSON or file path)"
```

---

## Task 4: Sheets client

Read both tabs into row objects keyed by `schema.js` columns, and write/append/update rows. The **row↔object mapping is pure and fully tested**; the network methods are thin and take an injected token + http.

**Files:**
- Create: `src/sheets.js`
- Test: `test/sheets.test.js`

**Step 1: Write the failing test** (pure mappers)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowsToObjects, objectToRow, attachRowNumbers, parseStartRow } from '../src/sheets.js';

const cols = ['place_id', 'business_name', 'status'];

test('rowsToObjects maps a header + data grid to keyed objects', () => {
  const grid = [['place_id', 'business_name', 'status'], ['p1', 'Acme', 'Discovered']];
  assert.deepEqual(rowsToObjects(grid), [{ place_id: 'p1', business_name: 'Acme', status: 'Discovered' }]);
});

test('rowsToObjects pads short rows and ignores a header-only sheet', () => {
  assert.deepEqual(rowsToObjects([['place_id', 'business_name', 'status']]), []);
  const grid = [['place_id', 'business_name', 'status'], ['p2']];
  assert.deepEqual(rowsToObjects(grid)[0], { place_id: 'p2', business_name: '', status: '' });
});

test('attachRowNumbers tags each object with its 1-based sheet row (header = row 1)', () => {
  const objs = attachRowNumbers([{ place_id: 'p1' }, { place_id: 'p2' }]);
  assert.equal(objs[0]._row, 2);
  assert.equal(objs[1]._row, 3);
});

test('objectToRow emits values in the given column order, blanks for missing', () => {
  assert.deepEqual(objectToRow({ place_id: 'p1', status: 'Drafted' }, cols), ['p1', '', 'Drafted']);
});

test('parseStartRow reads the first row number from an append updatedRange', () => {
  assert.equal(parseStartRow('Leads!A5:AJ7'), 5);
  assert.equal(parseStartRow(undefined), null);
});
```

**Step 2: Run — expect FAIL.**

**Step 3: Implement** (mappers + network methods)

```js
import { requestJson } from './http.js';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

// --- pure helpers ---
export function rowsToObjects(grid) {
  if (!grid || grid.length < 2) return [];
  const [header, ...rows] = grid;
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

// Tag each object with its 1-based sheet row (header is row 1) so the pipeline
// can update it in place later — the core of resumable checkpointing.
export function attachRowNumbers(objects, startRow = 2) {
  return objects.map((o, i) => ({ ...o, _row: startRow + i }));
}

export function objectToRow(obj, columns) {
  return columns.map((c) => (obj[c] ?? '').toString());
}

// Pull the first row number out of an append response's updatedRange.
export function parseStartRow(updatedRange) {
  const m = /![A-Z]+(\d+)/.exec(updatedRange || '');
  return m ? Number(m[1]) : null;
}

// --- network (thin) ---
const authInit = (token, extra = {}) => ({
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...extra,
});

export async function readTab(sheetId, tab, token, opts = {}) {
  const url = `${BASE}/${sheetId}/values/${encodeURIComponent(tab)}`;
  const data = await requestJson(url, authInit(token), opts);
  return attachRowNumbers(rowsToObjects(data.values || []));
}

export async function writeHeader(sheetId, tab, columns, token, opts = {}) {
  const url = `${BASE}/${sheetId}/values/${encodeURIComponent(`${tab}!A1`)}?valueInputOption=RAW`;
  return requestJson(url, authInit(token, { method: 'PUT', body: JSON.stringify({ values: [columns] }) }), opts);
}

// Append rows; return the 1-based sheet row of the first appended row so the
// caller can address each new row for later in-place status updates.
export async function appendRows(sheetId, tab, rows, token, opts = {}) {
  if (!rows.length) return { appended: 0, startRow: null };
  const url = `${BASE}/${sheetId}/values/${encodeURIComponent(tab)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const data = await requestJson(url, authInit(token, { method: 'POST', body: JSON.stringify({ values: rows }) }), opts);
  return { appended: rows.length, startRow: parseStartRow(data.updates?.updatedRange) };
}

// Overwrite a single row in place (row = 1-based sheet row).
export async function updateRow(sheetId, tab, row, values, token, opts = {}) {
  const url = `${BASE}/${sheetId}/values/${encodeURIComponent(`${tab}!A${row}`)}?valueInputOption=RAW`;
  return requestJson(url, authInit(token, { method: 'PUT', body: JSON.stringify({ values: [values] }) }), opts);
}
```

**Step 4: Run — expect PASS** (pure helper tests).

**Step 5: Commit**

```bash
git add src/sheets.js test/sheets.test.js
git commit -m "feat: add sheets client (row mapping, row-number tracking, read/append/update)"
```

---

## Task 5: Places client (discovery + text + details)

`searchNearby` (type-based discovery), `searchText` (the cleaners/builders path that have no Table-A type), and `placeDetails` (enrichment). **Field masks kept minimal**; Enterprise fields (`websiteUri`, phone) only in `placeDetails`. Response→lead mappers are pure + tested.

**Files:**
- Create: `src/places.js`
- Test: `test/places.test.js`

**Step 1: Write the failing test** (pure mappers + injected http)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapDiscovery, mapDetails, searchNearby } from '../src/places.js';

test('mapDiscovery extracts id, name, type, address from a New API place', () => {
  const place = { id: 'p1', displayName: { text: 'Acme Plumbing' }, primaryType: 'plumber',
    formattedAddress: '1 St, Hampton VIC', location: { latitude: -37.9, longitude: 145.0 } };
  assert.deepEqual(mapDiscovery(place), {
    place_id: 'p1', place_resource_name: 'places/p1', business_name: 'Acme Plumbing',
    primary_type: 'plumber', address: '1 St, Hampton VIC',
  });
});

test('mapDetails extracts website + phone (enterprise fields)', () => {
  const place = { id: 'p1', websiteUri: 'https://acme.test', nationalPhoneNumber: '03 9000 0000' };
  assert.deepEqual(mapDetails(place), { website_url: 'https://acme.test', phone: '03 9000 0000' });
});

test('mapDetails leaves blanks when fields absent (no website => hot later)', () => {
  assert.deepEqual(mapDetails({ id: 'p1' }), { website_url: '', phone: '' });
});

test('searchNearby posts field mask + body and returns mapped places', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return {
    ok: true, status: 200, headers: { get: () => null },
    json: async () => ({ places: [{ id: 'p1', displayName: { text: 'A' } }] }) }; };
  const out = await searchNearby({ apiKey: 'k', includedTypes: ['plumber'],
    center: { lat: -37.9, lng: 145 }, radius: 1000 }, { fetchImpl });
  assert.equal(out[0].place_id, 'p1');
  assert.match(seen.init.headers['X-Goog-FieldMask'], /places\.id/);
  assert.equal(seen.init.headers['X-Goog-Api-Key'], 'k');
});
```

**Step 2: Run — expect FAIL.**

**Step 3: Implement**

```js
import { requestJson } from './http.js';

const NEARBY = 'https://places.googleapis.com/v1/places:searchNearby';
const TEXT = 'https://places.googleapis.com/v1/places:searchText';
const DETAILS = (id) => `https://places.googleapis.com/v1/places/${id}`;

const DISCOVERY_MASK = 'places.id,places.displayName,places.primaryType,places.location,places.formattedAddress';
const DETAILS_MASK = 'id,websiteUri,nationalPhoneNumber,internationalPhoneNumber';

export function mapDiscovery(p) {
  return {
    place_id: p.id,
    place_resource_name: `places/${p.id}`,
    business_name: p.displayName?.text || '',
    primary_type: p.primaryType || '',
    address: p.formattedAddress || '',
  };
}

export function mapDetails(p) {
  return {
    website_url: p.websiteUri || '',
    phone: p.nationalPhoneNumber || p.internationalPhoneNumber || '',
  };
}

export async function searchNearby({ apiKey, includedTypes, center, radius, maxResultCount = 20 }, opts = {}) {
  const body = {
    includedTypes, maxResultCount,
    locationRestriction: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius } },
  };
  const data = await requestJson(NEARBY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': DISCOVERY_MASK },
    body: JSON.stringify(body),
  }, opts);
  return (data.places || []).map(mapDiscovery);
}

export async function searchText({ apiKey, textQuery, center, radius, maxResultCount = 20 }, opts = {}) {
  const body = {
    textQuery, maxResultCount,
    locationBias: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius } },
  };
  const data = await requestJson(TEXT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': DISCOVERY_MASK },
    body: JSON.stringify(body),
  }, opts);
  return (data.places || []).map(mapDiscovery);
}

export async function placeDetails(placeId, apiKey, opts = {}) {
  const data = await requestJson(DETAILS(placeId), {
    headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': DETAILS_MASK },
  }, opts);
  return mapDetails(data);
}
```

**Step 4: Run — expect PASS.**

**Step 5: Commit**

```bash
git add src/places.js test/places.test.js
git commit -m "feat: add places client (searchNearby/searchText/details, masked)"
```

---

## Task 6: PageSpeed client + normaliser

Calls `runPagespeed` (mobile) and normalises to the exact shape `qualify` expects: `{ performanceScore: 0-100, lcpMs, failedAudits[] }`. Normaliser is tested against a recorded fixture; the call is a thin wrapper.

**Files:**
- Create: `src/pagespeed.js`
- Create: `test/fixtures/pagespeed-sample.json` (a trimmed real runPagespeed response captured during dev)
- Test: `test/pagespeed.test.js`

**Step 1: Write the failing test**

```js
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
```

**Step 2: Run — expect FAIL** (capture `test/fixtures/pagespeed-sample.json` first by running one real call against e.g. `https://example.com`, trimmed to `lighthouseResult.categories.performance.score` + `lighthouseResult.audits`).

**Step 3: Implement**

```js
import { requestJson } from './http.js';

const ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

export function normalizePagespeed(resp) {
  const lr = resp?.lighthouseResult;
  if (!lr) return { performanceScore: null, lcpMs: null, failedAudits: [] };
  const score = lr.categories?.performance?.score;
  const lcp = lr.audits?.['largest-contentful-paint']?.numericValue;
  const failedAudits = Object.entries(lr.audits || {})
    .filter(([, a]) => a && a.score === 0)
    .map(([id]) => id);
  return {
    performanceScore: score == null ? null : Math.round(score * 100),
    lcpMs: lcp == null ? null : Math.round(lcp),
    failedAudits,
  };
}

export async function runPagespeed(url, apiKey, opts = {}) {
  const u = new URL(ENDPOINT);
  u.searchParams.set('url', url);
  u.searchParams.set('strategy', 'mobile');
  for (const c of ['performance', 'seo']) u.searchParams.append('category', c);
  u.searchParams.set('key', apiKey);
  const data = await requestJson(u.toString(), {}, { timeoutMs: 60000, ...opts });
  return normalizePagespeed(data);
}
```

**Step 4: Run — expect PASS.**

**Step 5: Commit**

```bash
git add src/pagespeed.js test/pagespeed.test.js test/fixtures/pagespeed-sample.json
git commit -m "feat: add pagespeed client + normaliser (qualify-shaped output)"
```

---

## Task 7: OpenRouter drafting — GATED on compliance

Drafts a one-line opener (or phone/contact-form note) **only** for leads the compliance keystone marks `Review ready`. `Research only` leads get an internal note, never outreach copy. This gate is the heaviest test here.

**Files:**
- Create: `src/draft.js`
- Test: `test/draft.test.js`

**Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftForLead } from '../src/draft.js';

const reviewReady = {
  business_name: 'Acme Plumbing', qualification: 'hot', contact_channel: 'email',
  consent_basis: 'inferred', consent_evidence: 'web form', caller_identity: 'Ctrl Alt Develop',
  sender_contact: 'hello@ctrlaltdevelop.io', unsubscribe: 'reply STOP', suppressed: false,
};

const callLLM = async () => 'Noticed Acme Plumbing has no site — keen to help?';

test('drafts outreach copy for a Review-ready lead', async () => {
  const r = await draftForLead(reviewReady, { callLLM });
  assert.equal(r.draft_type, 'outreach');
  assert.match(r.draft_opener, /Acme Plumbing/);
});

test('NEVER drafts outreach for a Research-only lead — internal note only', async () => {
  let llmCalled = false;
  const r = await draftForLead({ ...reviewReady, suppressed: true },
    { callLLM: async () => { llmCalled = true; return 'x'; } });
  assert.equal(r.draft_type, 'internal_note');
  assert.equal(r.draft_opener, '');
  assert.equal(llmCalled, false, 'must not call the LLM for non-review-ready leads');
});

test('missing channel => internal note, no LLM call', async () => {
  let llmCalled = false;
  const r = await draftForLead({ business_name: 'X', qualification: 'hot' },
    { callLLM: async () => { llmCalled = true; return 'x'; } });
  assert.equal(r.draft_type, 'internal_note');
  assert.equal(llmCalled, false);
});
```

**Step 2: Run — expect FAIL.**

**Step 3: Implement**

```js
import { requestJson } from './http.js';
import { evaluate } from './compliance.js';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

function buildPrompt(lead) {
  return `Write ONE friendly, specific opening line (max 30 words) for a local web-design`
    + ` outreach to "${lead.business_name}". Reason they qualified: ${lead.qualification}`
    + ` (${(lead.evidence_summary || lead.qualification)}). No greeting, no sign-off, just the line.`;
}

export async function defaultCallLLM(prompt, { apiKey, model }, opts = {}) {
  const data = await requestJson(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 80 }),
  }, opts);
  return data.choices?.[0]?.message?.content?.trim() || '';
}

// Gate: outreach copy ONLY for Review-ready leads. Everyone else gets an
// internal note and the LLM is never called.
export async function draftForLead(lead, deps) {
  const gate = evaluate(lead);
  if (gate.status !== 'Review ready') {
    return { draft_type: 'internal_note', draft_opener: '',
      compliance_status: gate.status, last_error: '' , _reasons: gate.reasons };
  }
  const opener = await deps.callLLM(buildPrompt(lead));
  return { draft_type: 'outreach', draft_opener: opener, compliance_status: 'Review ready' };
}
```

**Step 4: Run — expect PASS.**

**Step 5: Commit**

```bash
git add src/draft.js test/draft.test.js
git commit -m "feat: add OpenRouter drafting gated on compliance keystone"
```

---

## Task 8 (DERIVATION): Hampton centroid → fill `config.center`

No guessed coordinate. Resolve the suburb centre via Geocoding and record the source.

**Files:**
- Create: `scripts/geocode-centre.mjs`
- Modify: `src/config.js` (`center`)

**Step 1: Write the script**

```js
// One-off: resolve the Hampton, VIC centroid via Google Geocoding and print it.
// Run: npm run geocode  (requires GOOGLE_API_KEY with Geocoding API enabled).
const key = process.env.GOOGLE_API_KEY;
const u = new URL('https://maps.googleapis.com/maps/api/geocode/json');
u.searchParams.set('address', 'Hampton VIC 3188, Australia');
u.searchParams.set('key', key);
const r = await fetch(u);
const j = await r.json();
const loc = j.results?.[0]?.geometry?.location;
console.log('Hampton centre:', loc, '\nSource: Google Geocoding API,', j.results?.[0]?.formatted_address);
```

**Step 2: Run it**

Run: `npm run geocode` (enable Geocoding API on the key first if needed; restrict the key to include it).
Expected: prints `{ lat, lng }`.

**Step 3: Fill config + cite source**

Edit `src/config.js`:
```js
  // Hampton, VIC centroid — Google Geocoding API (scripts/geocode-centre.mjs), 2026-06-22.
  center: { lat: <printed lat>, lng: <printed lng> },
```

**Step 4: Verify config test still passes after un-nulling center**

Update `test/config.test.js`: replace the `center === null` assertion with a structure check
(`assert.equal(typeof config.center.lat, 'number')`). Run: `node --test test/config.test.js` → PASS.

**Step 5: Commit**

```bash
git add scripts/geocode-centre.mjs src/config.js test/config.test.js
git commit -m "feat(derivation): resolve Hampton centroid via Geocoding, fill config.center"
```

---

## Task 9 (DERIVATION): Pricing → tile size + per-SKU caps

No guessed `tileSizeM`/`caps`. Pull **current** Places API (New) pricing + free-tier, compute tile counts per candidate size and projected monthly cost, choose values that respect the free tier + the ~$20 alert, and **document the source + math**.

**Files:**
- Create: `scripts/derive-tiling.mjs`
- Create: `docs/cost-model.md` (records pricing snapshot + chosen values + justification)
- Modify: `src/config.js` (`tileSizeM`, `caps`)
- Modify: `test/config.test.js` (cap shape expectations)

**Step 1: Capture current pricing**

Fetch the current Google Maps Platform pricing for **Nearby Search (New)**, **Text Search (New)**, **Place Details (Enterprise — websiteUri/phone)**, and the monthly free call allotment. Record the snapshot (date + URL + numbers) in `docs/cost-model.md`. PageSpeed + Sheets are free.

**Step 2: Compute tiling/cost for candidate sizes**

```js
// scripts/derive-tiling.mjs — prints tile count + projected calls/cost for each
// candidate tile size, using config.center/radius and the pricing in docs/cost-model.md.
import { config } from '../src/config.js';
import { tileCircle } from '../src/tiling.js';
import { CANDIDATE_CATEGORIES } from '../src/categories.js';

const NEARBY_TYPES = CANDIDATE_CATEGORIES.flatMap((c) => c.place_types || []).length;
const TEXT_QUERIES = CANDIDATE_CATEGORIES.flatMap((c) => c.text_queries || []).length;
for (const tileSizeM of [2000, 3000, 4000, 5000]) {
  const tiles = tileCircle(config.center, config.radiusM, tileSizeM);
  const nearbyCalls = tiles.length * NEARBY_TYPES; // one searchNearby per (tile × place_type)
  const textCalls = tiles.length * TEXT_QUERIES; // one searchText per (tile × text_query)
  const discoveryCalls = nearbyCalls + textCalls;
  console.log({ tileSizeM, tiles: tiles.length, nearbyTypes: NEARBY_TYPES,
    textQueries: TEXT_QUERIES, nearbyCalls, textCalls, discoveryCalls });
}
```

Run: `npm run derive-tiling`. Use the printed call counts + the pricing snapshot to pick a `tileSizeM`
and per-run `caps` (searchNearby, searchText, placeDetails, pagespeed, drafts) that keep a weekly run within
free tier and the $20 alert. **Document the chosen numbers + reasoning in `docs/cost-model.md`, with Nearby
Search and Text Search priced separately even if their current unit prices match.**

**Step 3: Fill config from the documented derivation**

```js
  tileSizeM: <chosen>,            // docs/cost-model.md §tiling, <date>
  caps: { searchNearby: <n>, searchText: <n>, placeDetails: <n>, pagespeed: <n>, drafts: <n> }, // docs/cost-model.md §caps
```

Before choosing the final derived values, expand the placeholder cap shape so tests and runtime agree:

```js
  caps: { searchNearby: null, searchText: null, placeDetails: null, pagespeed: null, drafts: null },
```

Update `test/config.test.js` to assert every cap key exists while values are still null, then update it again after
derivation to assert each derived cap is a finite number with a `docs/cost-model.md` citation in `src/config.js`.

**Step 4: Commit**

```bash
git add scripts/derive-tiling.mjs docs/cost-model.md src/config.js
git commit -m "feat(derivation): set tile size + per-SKU caps from documented pricing"
```

---

## Task 10 (DERIVATION): PageSpeed threshold calibration → fill `minPerformanceScore`

No guessed cutoff. Sample mobile performance scores of 30–50 real local sites, inspect the distribution, set the cutoff (e.g. bottom quartile), and document the sample.

**Files:**
- Create: `scripts/calibrate-threshold.mjs`
- Create: `docs/threshold-calibration.md` (sample list + distribution + chosen cutoff)
- Modify: `src/config.js` (`pagespeed.minPerformanceScore`)

**Step 1: Write the calibration script**

```js
// scripts/calibrate-threshold.mjs — sample local sites' mobile perf scores, print
// the distribution + quartiles to inform config.pagespeed.minPerformanceScore.
// Cheap: PageSpeed is free. Run: npm run calibrate
import { runPagespeed } from '../src/pagespeed.js';

const key = process.env.GOOGLE_API_KEY;
// Seed: real local business URLs gathered manually or from a one-off limited
// Places Details sample. List them in docs/threshold-calibration.md first.
const SITES = JSON.parse(process.env.CALIBRATION_SITES || '[]');

const scores = [];
for (const url of SITES) {
  try {
    const { performanceScore } = await runPagespeed(url, key);
    if (performanceScore != null) scores.push(performanceScore);
    console.log(url, performanceScore);
  } catch (e) { console.error('skip', url, e.message); }
}
scores.sort((a, b) => a - b);
const q = (p) => scores[Math.floor((scores.length - 1) * p)];
console.log({ n: scores.length, min: scores[0], q25: q(0.25), median: q(0.5), q75: q(0.75), max: scores.at(-1) });
```

**Step 2: Gather the sample + run**

Use a deliberately small calibration sample, not the final orchestrator. Collect 30–50 real local business
site URLs manually or from a one-off limited Places Details sample using the Task 5 client, and list them in
`docs/threshold-calibration.md` before running the script. Run `CALIBRATION_SITES='[...]' npm run calibrate`.
Record the printed distribution. Choose the cutoff (e.g. the 25th percentile = "bottom quartile is poor") and
justify it. This avoids a circular dependency on Task 13 while still using real local sites.

**Step 3: Fill config + cite the sample**

```js
    minPerformanceScore: <chosen>,  // bottom-quartile of N local sites — docs/threshold-calibration.md, <date>
```

**Step 4: Update the qualify expectation note**

`qualify` already treats a non-null threshold correctly (Task 5 foundation tests). No code change — just
confirm `npm test` stays green with the new config value (the existing qualify tests inject their own cfg).

**Step 5: Commit**

```bash
git add scripts/calibrate-threshold.mjs docs/threshold-calibration.md src/config.js
git commit -m "feat(derivation): calibrate PageSpeed cutoff from sampled local sites"
```

---

## Task 11: Discovery query expansion

Turn `categories × tiles` plus optional text-search seeds into `DiscoveryQueries` rows, deduped by `query_key`. Pure; consumes foundation `tiling.js` + `discovery.js`. Text-search rows are represented explicitly so the Task 5 `searchText` client is actually reachable.

**Files:**
- Modify: `src/categories.js`
- Create: `src/expand.js`
- Modify: `src/schema.js`
- Test: `test/schema.test.js`
- Test: `test/expand.test.js`

**Step 0: Add configured text-search seeds**

Extend the real category config with explicit text-search seeds for categories that are not reliably covered by Places Table-A included types. Keep these narrow and local-service-oriented so the actual Task 13 run creates text queries instead of leaving `searchText` unused.

```js
export const CANDIDATE_CATEGORIES = [
  { category: 'trades', place_types: ['plumber', 'electrician', 'roofing_contractor', 'painter'],
    text_queries: ['deck builder Hampton VIC', 'bathroom renovator Hampton VIC'] },
  { category: 'home_services', place_types: ['locksmith', 'moving_company'],
    text_queries: ['house cleaner Hampton VIC', 'window cleaner Hampton VIC'] },
  // other existing categories can omit text_queries; expand defaults to [].
];
```

Update the categories test or add one if needed to assert at least one configured category has `text_queries`, so the real `expandDiscoveryQueries({ categories: CANDIDATE_CATEGORIES, ... })` path produces `query_mode: 'text'` rows.

**Step 1: Extend the discovery sheet schema**

Add `query_mode` and `text_query` to `DISCOVERY_COLUMNS` so the pipeline can branch between Nearby Search and Text Search without overloading `place_type`.

```js
export const DISCOVERY_COLUMNS = [
  'query_key', 'query_mode', 'category', 'place_type', 'text_query', 'tile_id', 'rank_preference',
  'center_lat', 'center_lng', 'radius_m',
  'status', 'result_count', 'cap_hit', 'started_at', 'completed_at',
  'last_error', 'updated_at',
];
```

Update the schema test to assert the new columns are present and ordered before row-writing code depends on them.

**Step 2: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandDiscoveryQueries } from '../src/expand.js';

const cats = [{ category: 'trades', place_types: ['plumber', 'electrician'], text_queries: ['deck builder Hampton VIC'] }];
const center = { lat: -37.93, lng: 145.01 };

test('expands nearby category × place_type × tile into unique keyed rows', () => {
  const rows = expandDiscoveryQueries({ categories: cats, center, radiusM: 10000, tileSizeM: 30000,
    rankPreference: 'distance' });
  const nearby = rows.filter((r) => r.query_mode === 'nearby');
  // 1 tile (tile > area) × 2 place types = 2 nearby rows
  assert.equal(nearby.length, 2);
  assert.equal(new Set(nearby.map((r) => r.query_key)).size, 2);
  assert.equal(nearby[0].status, 'Pending');
  assert.equal(nearby[0].center_lat, center.lat);
});

test('expands text-search seeds into explicit text rows', () => {
  const rows = expandDiscoveryQueries({ categories: cats, center, radiusM: 10000, tileSizeM: 30000,
    rankPreference: 'distance' });
  const text = rows.filter((r) => r.query_mode === 'text');
  assert.equal(text.length, 1);
  assert.equal(text[0].text_query, 'deck builder Hampton VIC');
  assert.equal(text[0].place_type, '');
  assert.match(text[0].query_key, /text:deck builder Hampton VIC/);
});

test('is idempotent — same inputs produce the same keys', () => {
  const args = { categories: cats, center, radiusM: 10000, tileSizeM: 30000, rankPreference: 'distance' };
  assert.deepEqual(expandDiscoveryQueries(args).map((r) => r.query_key),
    expandDiscoveryQueries(args).map((r) => r.query_key));
});
```

**Step 3: Run — expect FAIL.**

**Step 4: Implement**

```js
import { tileCircle } from './tiling.js';
import { buildQueryKey } from './discovery.js';

export function expandDiscoveryQueries({ categories, center, radiusM, tileSizeM, rankPreference }) {
  const tiles = tileCircle(center, radiusM, tileSizeM);
  const rows = [];
  const seen = new Set();
  const push = (row) => {
    if (seen.has(row.query_key)) return;
    seen.add(row.query_key);
    rows.push(row);
  };
  for (const { category, place_types = [], text_queries = [] } of categories) {
    for (const place_type of place_types) {
      for (const t of tiles) {
        const query_key = buildQueryKey({ category, place_type, tile_id: t.tile_id, rank_preference: rankPreference });
        push({
          query_key, query_mode: 'nearby', category, place_type, text_query: '',
          tile_id: t.tile_id, rank_preference: rankPreference,
          center_lat: t.lat, center_lng: t.lng, radius_m: t.radius, status: 'Pending',
          result_count: '', cap_hit: '', started_at: '', completed_at: '', last_error: '', updated_at: '',
        });
      }
    }
    for (const text_query of text_queries) {
      for (const t of tiles) {
        const query_key = buildQueryKey({ category, place_type: `text:${text_query}`, tile_id: t.tile_id, rank_preference: rankPreference });
        push({
          query_key, query_mode: 'text', category, place_type: '', text_query,
          tile_id: t.tile_id, rank_preference: rankPreference,
          center_lat: t.lat, center_lng: t.lng, radius_m: t.radius, status: 'Pending',
          result_count: '', cap_hit: '', started_at: '', completed_at: '', last_error: '', updated_at: '',
        });
      }
    }
  }
  return rows;
}
```

**Step 5: Run — expect PASS.**

**Step 6: Commit**

```bash
git add src/categories.js src/expand.js src/schema.js test/schema.test.js test/expand.test.js
git commit -m "feat: expand categories × tiles into deduped discovery queries"
```

---

## Task 12: Orchestrator (pipeline)

Sequences the run with **full checkpointing**: load state → for each pending query mark `Running` → search (cap-limited, Nearby or Text) → dedupe vs sheet → **stage `Discovered` to the sheet immediately (before any paid enrichment)** capturing each new row number → mark the query `Completed`/`Capped`/`Error` → then enrich/qualify/score/compliance/draft each non-terminal lead and **update its row in place**. Because Discovered leads and query statuses are persisted as they happen, a crash or the next weekly run **resumes without repeating paid Nearby Search, Text Search, Place Details, or LLM calls**. Human-completed compliance rows resume from `Research only`/`Qualified` so the compliance gate can actually reach drafting after manual sheet review. **Per-item isolation**, **dry-run** (no writes/LLM), **cap logging**, **run summary**. All clients are injected so the orchestration is unit-tested offline.

**Files:**
- Create: `src/pipeline.js`
- Test: `test/pipeline.test.js`

(`src/sheets.js` already has `appendRows`-with-row-number and `updateRow` from Task 4 — the pipeline reaches them only through injected `deps`.)

**Injected `deps` contract:** `readLeads()`/`readQueries()` return rows tagged with `_row`; `appendLeads(rows)` returns `{ startRow }`; `updateLead(lead)`/`updateQuery(q)` overwrite by `lead._row`/`q._row`; plus `searchNearby`, `searchText`, `placeDetails`, `runPagespeed`, `callLLM`, `apiKey`, `pagespeedCfg`, `caps`, `dryRun`, `log`.

**Step 1: Write the failing test** (inject fakes for every external)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPipeline } from '../src/pipeline.js';

const baseCaps = { searchNearby: 10, searchText: 10, placeDetails: 10, pagespeed: 10, drafts: 10 };

function fakes(overrides = {}) {
  const calls = { appendLeads: [], updateLead: [], updateQuery: [], llm: 0, pagespeed: 0 };
  const deps = {
    apiKey: 'k', pagespeedCfg: { minPerformanceScore: null, maxLcpMs: 2500, requireHttps: true },
    readLeads: async () => [],
    readQueries: async () => [{ _row: 2, query_key: 'q1', status: 'Pending', category: 'trades',
      query_mode: 'nearby', place_type: 'plumber', tile_id: '0_0', center_lat: -37.9, center_lng: 145, radius_m: 700 }],
    searchNearby: async () => [{ place_id: 'p1', business_name: 'Acme' }], // no website => hot
    searchText: async () => [{ place_id: 't1', business_name: 'Text Result' }],
    placeDetails: async () => ({ website_url: '', phone: '03 9000 0000' }),
    runPagespeed: async () => { calls.pagespeed++; return { performanceScore: null, lcpMs: null, failedAudits: [] }; },
    callLLM: async () => { calls.llm++; return 'opener'; },
    appendLeads: async (rows) => { calls.appendLeads.push(rows.length); return { startRow: 2 }; },
    updateLead: async (l) => { calls.updateLead.push([l.place_id, l.status]); },
    updateQuery: async (q) => { calls.updateQuery.push([q.query_key, q.status]); },
    log: () => {},
    ...overrides,
  };
  return { deps, calls };
}

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

test('text query rows call searchText, not searchNearby', async () => {
  let nearby = 0, text = 0;
  const { deps } = fakes({
    readQueries: async () => [{ _row: 2, query_key: 'text', status: 'Pending', query_mode: 'text',
      text_query: 'deck builder Hampton VIC', center_lat: -37.9, center_lng: 145, radius_m: 700 }],
    searchNearby: async () => { nearby++; return []; },
    searchText: async () => { text++; return [{ place_id: 't1', business_name: 'Text Result' }]; },
  });
  await runPipeline({ ...deps, dryRun: true, caps: baseCaps });
  assert.equal(nearby, 0);
  assert.equal(text, 1);
});

test('searchText cap is enforced and logged independently from searchNearby', async () => {
  const logs = [];
  const { deps } = fakes({
    readQueries: async () => Array.from({ length: 3 }, (_, i) => ({
      _row: 2 + i, query_key: `text${i}`, status: 'Pending', query_mode: 'text',
      text_query: `deck builder ${i}`, center_lat: -37.9, center_lng: 145, radius_m: 700 })),
    log: (m) => logs.push(m),
  });
  const summary = await runPipeline({ ...deps, dryRun: true, caps: { ...baseCaps, searchText: 1 } });
  assert.equal(summary.textSearches, 1);
  assert.ok(logs.some((m) => /searchText cap reached/i.test(m)));
});

test('resume: an existing Discovered lead is enriched + updated even with no new discovery', async () => {
  const { deps, calls } = fakes({
    readQueries: async () => [], // nothing new to discover
    readLeads: async () => [{ _row: 7, place_id: 'old1', business_name: 'Old', status: 'Discovered' }],
  });
  await runPipeline({ ...deps, dryRun: false, caps: baseCaps });
  assert.ok(calls.updateLead.some(([id]) => id === 'old1'), 'resumable lead picked up and updated');
});

test('draft cap leaves Review-ready leads Qualified for the next run and logs the cap', async () => {
  const logs = [];
  const { deps, calls } = fakes({
    readQueries: async () => [],
    readLeads: async () => [{ _row: 9, place_id: 'ready1', business_name: 'Ready Co', status: 'Qualified',
      qualification: 'hot', contact_channel: 'email', consent_basis: 'inferred', consent_evidence: 'website',
      caller_identity: 'Ctrl Alt Develop', sender_contact: 'hello@ctrlaltdevelop.io',
      unsubscribe: 'reply STOP', suppressed: false }],
    log: (m) => logs.push(m),
  });
  await runPipeline({ ...deps, dryRun: false, caps: { ...baseCaps, drafts: 0 } });
  assert.equal(calls.llm, 0);
  assert.ok(calls.updateLead.some(([id, status]) => id === 'ready1' && status === 'Qualified'));
  assert.ok(logs.some((m) => /draft cap reached/i.test(m)));
});

test('pagespeed cap is logged and website leads stay resumable', async () => {
  const logs = [];
  const { deps, calls } = fakes({
    readQueries: async () => [],
    readLeads: async () => [{ _row: 8, place_id: 'site1', business_name: 'Site Co',
      status: 'Enriched', website_url: 'https://site.example' }],
    log: (m) => logs.push(m),
  });
  await runPipeline({ ...deps, dryRun: false, caps: { ...baseCaps, pagespeed: 0 } });
  assert.ok(logs.some((m) => /pagespeed cap reached/i.test(m)));
  assert.ok(calls.updateLead.some(([id, status]) => id === 'site1' && status === 'Needs PageSpeed'));
});

test('resume: Needs PageSpeed retries PageSpeed instead of reusing stale qualification', async () => {
  const { deps, calls } = fakes({
    readQueries: async () => [],
    readLeads: async () => [{ _row: 11, place_id: 'retry1', business_name: 'Retry Co',
      status: 'Needs PageSpeed', qualification: 'needs_pagespeed',
      website_url: 'https://retry.example', evidence_summary: 'missing_pagespeed' }],
    runPagespeed: async () => { calls.pagespeed++; return { performanceScore: 10, lcpMs: 4000, failedAudits: [] }; },
  });
  await runPipeline({ ...deps, dryRun: false, caps: baseCaps });
  assert.equal(calls.pagespeed, 1);
  assert.ok(calls.updateLead.some(([id, status]) => id === 'retry1' && status === 'Research only'));
});

test('manual compliance completion on a Research-only row resumes drafting', async () => {
  const { deps, calls } = fakes({
    readQueries: async () => [],
    readLeads: async () => [{ _row: 10, place_id: 'manual1', business_name: 'Manual Co', status: 'Research only',
      qualification: 'hot', contact_channel: 'email', consent_basis: 'inferred', consent_evidence: 'website',
      caller_identity: 'Ctrl Alt Develop', sender_contact: 'hello@ctrlaltdevelop.io',
      unsubscribe: 'reply STOP', suppressed: false, website_url: 'https://manual.example' }],
    runPagespeed: async () => { throw new Error('manual reviewed qualification should be reused'); },
  });
  await runPipeline({ ...deps, dryRun: false, caps: baseCaps });
  assert.equal(calls.llm, 1);
  assert.ok(calls.updateLead.some(([id, status]) => id === 'manual1' && status === 'Review ready'));
});
```

**Step 2: Run — expect FAIL.**

**Step 3: Implement** (checkpointed; stage-before-enrich; resumable; injected deps; per-item isolation)

```js
import { filterNew } from './dedupe.js';
import { selectPending } from './discovery.js';
import { qualify } from './qualify.js';
import { score } from './score.js';
import { evaluate } from './compliance.js';
import { draftForLead } from './draft.js';

const nowIso = () => new Date().toISOString();
// Leads not yet finished — picked up on resume.
const RESUMABLE = new Set(['Discovered', 'Enriched', 'Needs PageSpeed', 'Qualified']);
const MANUAL_COMPLIANCE_FIELDS = [
  'contact_channel', 'consent_basis', 'consent_evidence', 'contact_source',
  'dncr_checked_at', 'phone_consent_basis', 'telemarketing_compliance_status',
];

function hasManualComplianceSignal(lead) {
  return MANUAL_COMPLIANCE_FIELDS.some((k) => (lead[k] || '').toString().trim());
}

function reasonsFromEvidence(lead) {
  return (lead.evidence_summary || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function hasReusableQualification(lead) {
  const statusAllowsReuse = lead.status === 'Qualified'
    || (lead.status === 'Research only' && hasManualComplianceSignal(lead));
  return statusAllowsReuse && ['hot', 'warm'].includes(lead.qualification);
}

export async function runPipeline(deps) {
  const { caps, dryRun, log = () => {} } = deps;
  const summary = { discovered: 0, new: 0, hot: 0, warm: 0, drafted: 0, appended: 0,
    updated: 0, searches: 0, textSearches: 0, errors: 0 };

  // --- 1. load state ---
  const existingLeads = await deps.readLeads();
  const existingIds = new Set(existingLeads.map((l) => l.place_id));
  const pending = selectPending(await deps.readQueries());
  const toProcess = existingLeads.filter((l) =>
    RESUMABLE.has(l.status) || (l.status === 'Research only' && hasManualComplianceSignal(l)));

  // --- 2. discover → stage Discovered (before enrich) → checkpoint query ---
  for (const q of pending) {
    const isText = q.query_mode === 'text';
    if (!isText && summary.searches >= caps.searchNearby) {
      log(`searchNearby cap reached, remaining nearby queries skipped`); continue;
    }
    if (isText && summary.textSearches >= caps.searchText) {
      log(`searchText cap reached, remaining text queries skipped`); continue;
    }
    if (isText) summary.textSearches++;
    else summary.searches++;
    if (!dryRun) await deps.updateQuery({ ...q, status: 'Running', started_at: nowIso() });
    try {
      const center = { lat: Number(q.center_lat), lng: Number(q.center_lng) };
      const radius = Number(q.radius_m);
      const found = isText
        ? await deps.searchText({ apiKey: deps.apiKey, textQuery: q.text_query, center, radius })
        : await deps.searchNearby({ apiKey: deps.apiKey, includedTypes: [q.place_type], center, radius });
      summary.discovered += found.length;
      const fresh = filterNew(existingIds, found);
      fresh.forEach((f) => existingIds.add(f.place_id));
      summary.new += fresh.length;
      const staged = fresh.map((f) => ({ ...f, status: 'Discovered', first_seen_at: nowIso(), updated_at: nowIso() }));
      if (!dryRun && staged.length) {
        const { startRow } = await deps.appendLeads(staged); // STAGE before paid enrichment
        staged.forEach((s, i) => { s._row = startRow == null ? null : startRow + i; });
        summary.appended += staged.length;
      }
      toProcess.push(...staged);
      if (!dryRun) await deps.updateQuery({ ...q, status: found.length >= 20 ? 'Capped' : 'Completed',
        result_count: found.length, cap_hit: found.length >= 20, completed_at: nowIso() });
    } catch (e) {
      summary.errors++;
      if (!dryRun) await deps.updateQuery({ ...q, status: 'Error', last_error: e.message });
    }
  }

  // --- 3. enrich → qualify → score → compliance → draft → update row (per-item isolated) ---
  let enriched = 0, pageSpeeds = 0, drafts = 0;
  let detailsCapLogged = false, pageSpeedCapLogged = false, draftCapLogged = false;
  for (const lead of toProcess) {
    try {
      if (lead.status === 'Discovered') {
        if (enriched >= caps.placeDetails) { // cap hit — leave Discovered, resume next run
          if (!detailsCapLogged) { log('placeDetails cap reached, remaining Discovered leads deferred'); detailsCapLogged = true; }
          continue;
        }
        enriched++;
        Object.assign(lead, await deps.placeDetails(lead.place_id, deps.apiKey));
        lead.status = 'Enriched';
      }
      let q = hasReusableQualification(lead)
        ? { qualification: lead.qualification, reasons: reasonsFromEvidence(lead) }
        : null;
      if (!q) {
        let pagespeed = null;
        if (lead.website_url && pageSpeeds < caps.pagespeed) {
          pageSpeeds++;
          pagespeed = await deps.runPagespeed(lead.website_url, deps.apiKey);
        } else if (lead.website_url && pageSpeeds >= caps.pagespeed && !pageSpeedCapLogged) {
          log('pagespeed cap reached, remaining website leads deferred or qualified on URL-only evidence');
          pageSpeedCapLogged = true;
        }
        q = qualify(lead, pagespeed, deps.pagespeedCfg);
        lead.qualification = q.qualification;
        lead.evidence_summary = q.reasons.join(', ');
        if (pagespeed) {
          lead.pagespeed_score = pagespeed.performanceScore ?? '';
          lead.lcp_ms = pagespeed.lcpMs ?? '';
          lead.failed_audits = (pagespeed.failedAudits || []).join(',');
        }
      }
      if (q.qualification === 'hot') summary.hot++;
      else if (q.qualification === 'warm') summary.warm++;

      if (q.qualification === 'needs_pagespeed') {
        lead.status = 'Needs PageSpeed'; // pagespeed cap hit / no data yet — retried next run
      } else if (q.qualification === 'dropped') {
        lead.status = 'Dropped';
      } else {
        lead.score = score(q, lead);
        const gate = evaluate(lead);
        lead.compliance_status = gate.status;
        if (gate.status === 'Review ready' && drafts < caps.drafts && !dryRun) {
          Object.assign(lead, await draftForLead(lead, { callLLM: deps.callLLM }));
          if (lead.draft_type === 'outreach') { summary.drafted++; drafts++; }
          lead.status = 'Review ready';
        } else if (gate.status === 'Review ready') {
          if (drafts >= caps.drafts && !draftCapLogged) {
            log('draft cap reached, Review-ready leads left Qualified for the next run');
            draftCapLogged = true;
          }
          lead.status = 'Qualified';
        } else {
          lead.status = 'Research only';
        }
      }
      lead.updated_at = nowIso();
      if (!dryRun && lead._row) { await deps.updateLead(lead); summary.updated++; }
    } catch (e) {
      summary.errors++;
      lead.status = 'Error'; lead.last_error = e.message; lead.updated_at = nowIso();
      if (!dryRun && lead._row) await deps.updateLead(lead).catch(() => {});
    }
  }

  log(`run summary: ${JSON.stringify(summary)}`);
  return summary;
}
```

**Step 4: Run — expect PASS.**

**Step 5: Commit**

```bash
git add src/pipeline.js test/pipeline.test.js
git commit -m "feat: add checkpointed dry-run-first orchestrator (stage-before-enrich, resume, caps)"
```

---

## Task 13: Entrypoint + live limited-mode smoke

Wires real clients into the pipeline, fails fast on missing secrets, and runs first in dry-run, then a tiny live "limit mode" (one category, one tile, small caps) to prove end-to-end before any broad run.

**Files:**
- Create: `src/run.js`
- Test: `test/run.test.js` (secret-validation only)

**Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireSecrets } from '../src/run.js';

test('fails fast listing every missing secret', () => {
  assert.throws(() => requireSecrets({}), /GOOGLE_API_KEY.*OPENROUTER_API_KEY.*GOOGLE_SHEETS_SA_JSON.*SHEET_ID/s);
});

test('passes when all secrets present', () => {
  assert.doesNotThrow(() => requireSecrets({ GOOGLE_API_KEY: 'a', OPENROUTER_API_KEY: 'b',
    GOOGLE_SHEETS_SA_JSON: 'c', SHEET_ID: 'd' }));
});
```

**Step 2: Run — expect FAIL.**

**Step 3: Implement** (secret check + wiring)

```js
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { getAccessToken } from './auth.js';
import { readTab, writeHeader, appendRows, updateRow } from './sheets.js';
import { searchNearby, searchText, placeDetails } from './places.js';
import { runPagespeed } from './pagespeed.js';
import { defaultCallLLM } from './draft.js';
import { runPipeline } from './pipeline.js';
import { expandDiscoveryQueries } from './expand.js';
import { CANDIDATE_CATEGORIES } from './categories.js';
import { LEADS_COLUMNS, DISCOVERY_COLUMNS } from './schema.js';

const REQUIRED = ['GOOGLE_API_KEY', 'OPENROUTER_API_KEY', 'GOOGLE_SHEETS_SA_JSON', 'SHEET_ID'];
export function requireSecrets(env) {
  const missing = REQUIRED.filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing secrets: ${missing.join(', ')}`);
}

const toRow = (obj, cols) => cols.map((c) => (obj[c] ?? '').toString());

async function main() {
  requireSecrets(process.env);
  const { SHEET_ID, GOOGLE_API_KEY, OPENROUTER_API_KEY, GOOGLE_SHEETS_SA_JSON } = process.env;
  const token = await getAccessToken(GOOGLE_SHEETS_SA_JSON);

  // ensure headers exist (idempotent)
  await writeHeader(SHEET_ID, 'Leads', LEADS_COLUMNS, token);
  await writeHeader(SHEET_ID, 'DiscoveryQueries', DISCOVERY_COLUMNS, token);

  // ensure the discovery queries exist (append only the missing keys)
  const existingQ = await readTab(SHEET_ID, 'DiscoveryQueries', token);
  const known = new Set(existingQ.map((q) => q.query_key));
  const desired = expandDiscoveryQueries({ categories: CANDIDATE_CATEGORIES, center: config.center,
    radiusM: config.radiusM, tileSizeM: config.tileSizeM, rankPreference: 'distance' });
  const missing = desired.filter((q) => !known.has(q.query_key));
  if (!config.dryRun && missing.length) {
    await appendRows(SHEET_ID, 'DiscoveryQueries', missing.map((q) => toRow(q, DISCOVERY_COLUMNS)), token);
  }

  const summary = await runPipeline({
    apiKey: GOOGLE_API_KEY, dryRun: config.dryRun, caps: config.caps, pagespeedCfg: config.pagespeed,
    readLeads: () => readTab(SHEET_ID, 'Leads', token),
    readQueries: () => readTab(SHEET_ID, 'DiscoveryQueries', token),
    searchNearby, searchText, placeDetails, runPagespeed,
    callLLM: (prompt) => defaultCallLLM(prompt, { apiKey: OPENROUTER_API_KEY, model: config.model }),
    appendLeads: (rows) => appendRows(SHEET_ID, 'Leads', rows.map((r) => toRow(r, LEADS_COLUMNS)), token),
    updateLead: (lead) => updateRow(SHEET_ID, 'Leads', lead._row, toRow(lead, LEADS_COLUMNS), token),
    updateQuery: (q) => updateRow(SHEET_ID, 'DiscoveryQueries', q._row, toRow(q, DISCOVERY_COLUMNS), token),
    log: console.log,
  });
  console.log('DONE', summary);
}

// Cross-platform entrypoint guard (Windows-safe): only run main when executed
// directly, never when imported by a test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
```

**Step 4: Run — expect PASS** (`node --test test/run.test.js`).

**Step 5: Dry-run, then limited live smoke**

- Seed queries first: a dry-run does **not** append missing discovery queries, so either run one live `ensure` (it appends `Pending` rows, then stop) or hand-add a couple of `Pending` rows to `DiscoveryQueries`. Then dry-run: `npm start` with `DRY_RUN=true` walks the pending queries and prints intended actions with **zero writes/LLM**.
- Live limited smoke: a temporary limit config (one nearby `place_type` and/or one `text_query`, one tile, small `searchNearby` and `searchText` caps) → confirm a handful of rows land in `Leads` with correct statuses/compliance, and that the searched queries flip to `Completed`/`Capped`. Use this run to collect the calibration URLs for Task 10.

**Step 6: Commit**

```bash
git add src/run.js test/run.test.js
git commit -m "feat: add entrypoint (fail-fast secrets) + dry-run/limit wiring"
```

---

## Task 14: GitHub Actions weekly cron

**Files:**
- Create: `.github/workflows/prospect.yml`

**Step 1: Write the workflow**

```yaml
name: prospect
on:
  schedule:
    - cron: '0 19 * * 0'   # weekly, Sunday 19:00 UTC (Mon ~06:00 AEST) — adjust after first runs
  workflow_dispatch:
    inputs:
      dry_run:
        description: 'Dry run (no writes/LLM)'
        type: boolean
        default: true

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
      - run: npm ci
      - run: node src/run.js
        env:
          DRY_RUN: ${{ github.event_name == 'schedule' && 'false' || inputs.dry_run }}
          GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
          GOOGLE_SHEETS_SA_JSON: ${{ secrets.GOOGLE_SHEETS_SA_JSON }}
          SHEET_ID: ${{ secrets.SHEET_ID }}
```

**Step 2: Validate**

- `workflow_dispatch` with `dry_run: true` first — confirm a green run that writes nothing.
- Then a manual live dispatch with `dry_run: false` and small caps; confirm rows append.
- Leave the schedule active only once a live dispatch has proven safe and within cost.

**Step 3: Commit**

```bash
git add .github/workflows/prospect.yml
git commit -m "ci: add weekly prospect cron + manual dispatch (dry-run default)"
```

---

## Task 15: Stage green check

**Step 1:** `npm test` — all foundation + stage tests pass, 0 fail.
**Step 2:** Confirm `dependencies` contains only `google-auth-library`.
**Step 3:** Confirm every derived config value (`center`, `tileSizeM`, `caps`, `minPerformanceScore`) is non-null **and** has a doc citation; no guessed numbers remain.
**Step 4:** Commit any tidy-ups.

---

## Gate before any real outreach (NOT code)

Leads only reach `Review ready` through the compliance keystone, but **a human still checks consent, message contents, suppression, and channel before sending** — human approval is not a consent substitute. **Legal review of the contact-channel decision table (especially phone/DNCR and contact-form handling) must happen before the first outreach.** The cron only *researches and drafts*; it never sends.
