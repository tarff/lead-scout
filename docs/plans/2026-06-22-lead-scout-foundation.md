# lead-scout Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Each module is built with @superpowers:test-driven-development (red → green → commit).

**Goal:** Build the testable, zero-cost core of lead-scout — project scaffold, config, sheet-schema constants, and the pure business logic (dedupe, qualify, score, compliance gating, tiling, discovery checkpointing) — fully unit-tested, before any paid API stage is wired.

**Architecture:** A single Node.js (ESM) project. All decision logic lives in small pure functions under `src/` that take their inputs and config explicitly (dependency injection) so they are deterministic and need no network or credentials to test. Sheet I/O, Places, PageSpeed, OpenRouter, and the GitHub Actions cron are a **separate later plan** that consumes these functions.

**Tech Stack:** Node 24 (ESM, `"type": "module"`), built-in `node:test` + `node:assert/strict` (zero test deps). No runtime dependencies in this foundation.

**Non-negotiable design references:** `docs/plans/2026-06-22-prospecting-agent-design.md` (compliance keystone, sheet schema, decision table). The compliance module is the keystone — it must default leads to `Research only` and only allow `Review ready` when the decision table passes.

**Parameters NOT decided here (must stay injected / null — never guess):** PageSpeed performance-score cutoff, tile size, per-SKU/stage caps, exact suburb centre coordinate, final category list. These are derived in the stage plan via calibration/pricing tasks. Functions accept them as arguments; config holds `null` placeholders with TODO references.

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `src/.gitkeep`, `test/.gitkeep` (removed as real files land)

**Step 1: Create `package.json`**

```json
{
  "name": "lead-scout",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Compliant lead-research tool for Ctrl Alt Develop",
  "scripts": {
    "test": "node --test"
  }
}
```

**Step 2: Verify the test runner is wired**

Run: `npm test`
Expected: exits 0 with "tests 0" (no test files yet) — confirms `node --test` works.

**Step 3: Commit**

```bash
git add package.json
git commit -m "chore: scaffold node project with built-in test runner"
```

---

## Task 2: Config module

Holds committed, non-secret config. Decided values come from the design doc; undecided parameters are `null` with a TODO pointing at their derivation task. Secrets are read from env, never stored here.

**Files:**
- Create: `src/config.js`
- Test: `test/config.test.js`

**Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';

test('radius is the design-specified 10km', () => {
  assert.equal(config.radiusM, 10000);
});

test('undecided params are null placeholders, not guessed values', () => {
  assert.equal(config.center, null);                 // exact centroid confirmed in stage plan
  assert.equal(config.tileSizeM, null);              // derived in stage plan
  assert.equal(config.pagespeed.minPerformanceScore, null); // calibrated in stage plan
  assert.equal(config.caps.placeDetails, null);      // derived from pricing
});

test('design-sourced thresholds are present and cited', () => {
  assert.equal(config.pagespeed.maxLcpMs, 2500);     // CWV "good" LCP boundary
  assert.equal(config.pagespeed.requireHttps, true);
});

test('model slug is the confirmed OpenRouter slug', () => {
  assert.equal(config.model, 'anthropic/claude-haiku-4.5');
});
```

**Step 2: Run test to verify it fails**

Run: `node --test test/config.test.js`
Expected: FAIL — cannot find `../src/config.js`.

**Step 3: Write minimal implementation**

```js
// Committed, non-secret config. Secrets come from env (see .env.example).
// Values marked TODO are derived in the stage plan — DO NOT guess them.
export const config = {
  // TODO(stage plan: exact centroid) — confirm Hampton centre via Geocoding
  // before discovery runs. Null prevents a guessed coordinate from being used.
  center: null,
  radiusM: 10000, // design: 10km target radius around Hampton, VIC

  // TODO(stage plan: tiling/cost derivation) — searchNearby returns max 20
  // results/req, so tile size is chosen from category density + SKU pricing.
  tileSizeM: null,

  pagespeed: {
    // TODO(stage plan: threshold calibration) — cutoff set from sampled real
    // local sites; null means "perf-score signal disabled" until calibrated.
    minPerformanceScore: null,
    maxLcpMs: 2500,    // Core Web Vitals "good" LCP upper bound (Google CWV)
    requireHttps: true,
  },

  // TODO(stage plan: pricing derivation) — hard per-run caps per paid SKU/stage.
  caps: { searchNearby: null, placeDetails: null, pagespeed: null, drafts: null },

  model: 'anthropic/claude-haiku-4.5', // confirmed on OpenRouter 2026-06-22
  dryRun: process.env.DRY_RUN !== 'false', // safe default: dry-run unless told otherwise
};
```

**Step 4: Run test to verify it passes**

Run: `node --test test/config.test.js`
Expected: PASS (4 tests).

**Step 5: Commit**

```bash
git add src/config.js test/config.test.js
git commit -m "feat: add non-secret config with injected (null) undecided params"
```

---

## Task 3: Sheet schema constants

The single source of column order and status enums for both tabs, transcribed exactly from the design doc.

**Files:**
- Create: `src/schema.js`
- Test: `test/schema.test.js`

**Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEADS_COLUMNS, DISCOVERY_COLUMNS, LEAD_STATUS, QUERY_STATUS } from '../src/schema.js';

const noDupes = (arr) => assert.equal(new Set(arr).size, arr.length);

test('Leads columns have no duplicates and key fields present', () => {
  noDupes(LEADS_COLUMNS);
  for (const c of ['place_id', 'compliance_status', 'suppressed', 'status',
    'contacted', 'sender_contact', 'unsubscribe', 'contact_form_manual_only',
    'do_not_call_note'])
    assert.ok(LEADS_COLUMNS.includes(c), `missing ${c}`);
});

test('DiscoveryQueries columns have no duplicates and key fields present', () => {
  noDupes(DISCOVERY_COLUMNS);
  for (const c of ['query_key', 'tile_id', 'status', 'cap_hit'])
    assert.ok(DISCOVERY_COLUMNS.includes(c), `missing ${c}`);
});

test('status enums match the design state machine', () => {
  assert.deepEqual(LEAD_STATUS, ['Discovered', 'Enriched', 'Needs PageSpeed',
    'Qualified', 'Drafted', 'Review ready', 'Dropped', 'Research only',
    'Contacted', 'Suppressed', 'Error']);
  assert.deepEqual(QUERY_STATUS, ['Pending', 'Running', 'Completed', 'Capped', 'Error']);
});
```

**Step 2: Run — expect FAIL** (`node --test test/schema.test.js`): cannot find module.

**Step 3: Implement**

```js
// Column order + status enums — transcribed from the v1 design doc. The sheet
// header rows are written from these arrays so code and sheet never drift.
export const LEADS_COLUMNS = [
  'place_id', 'place_resource_name', 'business_name', 'primary_type', 'address',
  'website_url', 'phone', 'contact_channel', 'contact_source',
  'consent_basis', 'consent_evidence', 'compliance_status', 'suppressed',
  'dncr_checked_at', 'dncr_result', 'phone_consent_basis',
  'telemarketing_compliance_status', 'caller_identity', 'sender_contact',
  'unsubscribe', 'phone_script_notes', 'do_not_call_note',
  'contact_form_allowed_basis', 'contact_form_manual_only',
  'qualification', 'score', 'evidence_summary', 'pagespeed_score', 'lcp_ms',
  'failed_audits',
  'draft_type', 'draft_opener', 'status', 'contacted', 'contacted_at',
  'last_error', 'first_seen_at', 'updated_at',
];

export const DISCOVERY_COLUMNS = [
  'query_key', 'category', 'place_type', 'tile_id', 'rank_preference',
  'center_lat', 'center_lng', 'radius_m',
  'status', 'result_count', 'cap_hit', 'started_at', 'completed_at',
  'last_error', 'updated_at',
];

export const LEAD_STATUS = ['Discovered', 'Enriched', 'Needs PageSpeed',
  'Qualified', 'Drafted', 'Review ready', 'Dropped', 'Research only',
  'Contacted', 'Suppressed', 'Error'];

export const QUERY_STATUS = ['Pending', 'Running', 'Completed', 'Capped', 'Error'];
```

**Step 4: Run — expect PASS.**

**Step 5: Commit**

```bash
git add src/schema.js test/schema.test.js
git commit -m "feat: add sheet schema constants (Leads + DiscoveryQueries)"
```

---

## Task 4: Dedupe

**Files:**
- Create: `src/dedupe.js`
- Test: `test/dedupe.test.js`

**Step 1: Write the failing test**

```js
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
```

**Step 2: Run — expect FAIL.**

**Step 3: Implement**

```js
// Returns only candidates whose place_id is neither already known nor a
// duplicate earlier in the same batch.
export function filterNew(existingIds, candidates) {
  const seen = new Set(existingIds);
  const out = [];
  for (const c of candidates) {
    if (!c || c.place_id == null) continue;
    if (seen.has(c.place_id)) continue;
    seen.add(c.place_id);
    out.push(c);
  }
  return out;
}
```

**Step 4: Run — expect PASS.**

**Step 5: Commit**

```bash
git add src/dedupe.js test/dedupe.test.js
git commit -m "feat: add place_id dedupe (known + intra-batch)"
```

---

## Task 5: Qualify

Classifies a lead as `hot` (no website), `warm` (poor website per the multi-signal ruleset), `dropped` (good website), or `needs_pagespeed` (has a website but no PageSpeed evidence yet). The threshold is **injected via config** — when `minPerformanceScore` is `null`, the perf-score signal is disabled (no guessed cutoff).

**Files:**
- Create: `src/qualify.js`
- Test: `test/qualify.test.js`

**Normalized PageSpeed input shape** (produced later by the stage plan):
`{ performanceScore: <0-100 int>, lcpMs: <number>, failedAudits: <string[]> }`.

**Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qualify } from '../src/qualify.js';

const cfg = { minPerformanceScore: 40, maxLcpMs: 2500, requireHttps: true };
const good = { performanceScore: 95, lcpMs: 1500, failedAudits: [] };

test('no website => hot', () => {
  assert.equal(qualify({ website_url: '' }, null, cfg).qualification, 'hot');
});

test('good https site, fast, no failed audits => dropped', () => {
  assert.equal(qualify({ website_url: 'https://x.com' }, good, cfg).qualification, 'dropped');
});

test('website with no PageSpeed evidence is not dropped', () => {
  const r = qualify({ website_url: 'https://x.com' }, null, cfg);
  assert.equal(r.qualification, 'needs_pagespeed');
  assert.ok(r.reasons.includes('missing_pagespeed'));
});

test('URL-only failure is warm even when PageSpeed evidence is missing', () => {
  const r = qualify({ website_url: 'http://x.com' }, null, cfg);
  assert.equal(r.qualification, 'warm');
  assert.ok(r.reasons.includes('no_https'));
});

test('low performance score => warm', () => {
  const r = qualify({ website_url: 'https://x.com' }, { ...good, performanceScore: 20 }, cfg);
  assert.equal(r.qualification, 'warm');
  assert.ok(r.reasons.includes('low_performance'));
});

test('LCP above max => warm', () => {
  const r = qualify({ website_url: 'https://x.com' }, { ...good, lcpMs: 4000 }, cfg);
  assert.equal(r.qualification, 'warm');
  assert.ok(r.reasons.includes('high_lcp'));
});

test('non-https site => warm', () => {
  const r = qualify({ website_url: 'http://x.com' }, good, cfg);
  assert.equal(r.qualification, 'warm');
  assert.ok(r.reasons.includes('no_https'));
});

test('failed mobile audit => warm', () => {
  const r = qualify({ website_url: 'https://x.com' }, { ...good, failedAudits: ['viewport'] }, cfg);
  assert.equal(r.qualification, 'warm');
  assert.ok(r.reasons.includes('failed_audit:viewport'));
});

test('null minPerformanceScore disables the perf signal (no guessed cutoff)', () => {
  const r = qualify({ website_url: 'https://x.com' },
    { ...good, performanceScore: 5 }, { ...cfg, minPerformanceScore: null });
  assert.equal(r.qualification, 'dropped'); // low score ignored when threshold not calibrated
});
```

**Step 2: Run — expect FAIL.**

**Step 3: Implement**

```js
// Mobile-usability Lighthouse audits whose failure indicates a poor mobile site.
const MOBILE_USABILITY_AUDITS = new Set(['viewport', 'font-size', 'tap-targets']);

export function qualify(lead, pagespeed, cfg) {
  const url = (lead?.website_url || '').trim();
  if (!url) return { qualification: 'hot', reasons: ['no_website'] };

  const reasons = [];
  if (cfg.requireHttps && !url.toLowerCase().startsWith('https://')) reasons.push('no_https');

  if (!pagespeed) {
    return reasons.length
      ? { qualification: 'warm', reasons }
      : { qualification: 'needs_pagespeed', reasons: ['missing_pagespeed'] };
  }

  if (cfg.minPerformanceScore != null && pagespeed.performanceScore != null
      && pagespeed.performanceScore < cfg.minPerformanceScore) reasons.push('low_performance');
  if (cfg.maxLcpMs != null && pagespeed.lcpMs != null && pagespeed.lcpMs > cfg.maxLcpMs)
    reasons.push('high_lcp');
  for (const a of pagespeed.failedAudits || [])
    if (MOBILE_USABILITY_AUDITS.has(a)) reasons.push(`failed_audit:${a}`);

  return reasons.length
    ? { qualification: 'warm', reasons }
    : { qualification: 'dropped', reasons: [] };
}
```

**Step 4: Run — expect PASS (9 tests).**

**Step 5: Commit**

```bash
git add src/qualify.js test/qualify.test.js
git commit -m "feat: add multi-signal qualify (injected threshold, no guessed cutoff)"
```

---

## Task 6: Score

Ranking is **ordinal**, derived straight from the design's stated priority: no-site beats poor-site; among poor-sites, more failing signals (severity) ranks higher; a contactable phone breaks ties. No tuned weights — the multipliers below are positional separators for a lexicographic sort, documented as such.

**Files:**
- Create: `src/score.js`
- Test: `test/score.test.js`

**Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { score } from '../src/score.js';

const hot = { qualification: 'hot', reasons: ['no_website'] };
const warm1 = { qualification: 'warm', reasons: ['no_https'] };
const warm3 = { qualification: 'warm', reasons: ['no_https', 'high_lcp', 'low_performance'] };

test('hot outranks any warm', () => {
  assert.ok(score(hot, {}) > score(warm3, {}));
});

test('more failing signals => higher warm score (severity)', () => {
  assert.ok(score(warm3, {}) > score(warm1, {}));
});

test('phone presence breaks ties for equal qualification/severity', () => {
  assert.ok(score(warm1, { phone: '03 9973 5662' }) > score(warm1, { phone: '' }));
});

test('dropped is lowest', () => {
  assert.ok(score({ qualification: 'dropped', reasons: [] }, {}) < score(warm1, {}));
});

test('needs_pagespeed does not outrank a warm lead', () => {
  assert.ok(score({ qualification: 'needs_pagespeed', reasons: ['missing_pagespeed'] }, {}) < score(warm1, {}));
});

test('needs_pagespeed outranks dropped so retryable leads are not buried with drops', () => {
  assert.ok(score({ qualification: 'needs_pagespeed', reasons: ['missing_pagespeed'] }, {}) >
    score({ qualification: 'dropped', reasons: [] }, {}));
});

test('unknown qualification throws instead of silently ranking as dropped', () => {
  assert.throws(() => score({ qualification: 'typo', reasons: [] }, {}), /unknown qualification/);
});
```

**Step 2: Run — expect FAIL.**

**Step 3: Implement**

```js
// Lexicographic rank: [qualification tier] >> [severity] >> [contactable].
// Multipliers are place-value separators for the ordering, NOT tuned weights.
const TIER = { hot: 3, warm: 2, needs_pagespeed: 1, dropped: 0 };

export function score(qual, lead) {
  const tier = TIER[qual.qualification];
  if (tier == null) throw new RangeError(`unknown qualification: ${qual.qualification}`);
  const severity = qual.qualification === 'warm' ? (qual.reasons?.length || 0) : 0;
  const contactable = lead?.phone ? 1 : 0;
  return tier * 1000 + severity * 10 + contactable;
}
```

**Step 4: Run — expect PASS.**

**Step 5: Commit**

```bash
git add src/score.js test/score.test.js
git commit -m "feat: add ordinal lead score (priority order, no tuned weights)"
```

---

## Task 7: Compliance gating (KEYSTONE)

The decision table from the design. Default is `Research only`; `Review ready` requires the selected channel to satisfy every rule. `suppressed` always blocks. This module gets the heaviest test coverage.

**Files:**
- Create: `src/compliance.js`
- Test: `test/compliance.test.js`

**Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../src/compliance.js';

const ready = (lead) => assert.equal(evaluate(lead).status, 'Review ready');
const only = (lead, reason) => {
  const r = evaluate(lead);
  assert.equal(r.status, 'Research only');
  if (reason) assert.ok(r.reasons.includes(reason), `expected reason ${reason}, got ${r.reasons}`);
};

const emailOK = {
  contact_channel: 'email', consent_basis: 'inferred', consent_evidence: 'web form 2026-06-01',
  caller_identity: 'Ctrl Alt Develop', sender_contact: 'hello@ctrlaltdevelop.io',
  unsubscribe: 'reply STOP', suppressed: false,
};

test('no channel => Research only', () => only({}, 'no_lawful_channel'));
test('suppressed always blocks even if otherwise valid', () =>
  only({ ...emailOK, suppressed: true }, 'suppressed'));
test('sheet-style suppressed string false does not block', () =>
  ready({ ...emailOK, suppressed: 'false' }));
test('sheet-style suppressed string true blocks', () =>
  only({ ...emailOK, suppressed: 'TRUE' }, 'suppressed'));

test('email with full consent + identity + unsubscribe => Review ready', () => ready(emailOK));
test('email missing consent_basis => Research only', () =>
  only({ ...emailOK, consent_basis: '' }, 'missing_consent'));
test('email with invalid consent_basis => Research only', () =>
  only({ ...emailOK, consent_basis: 'assumed' }, 'missing_consent'));
test('email missing unsubscribe => Research only', () =>
  only({ ...emailOK, unsubscribe: '' }, 'missing_unsubscribe'));
test('email missing sender contact => Research only', () =>
  only({ ...emailOK, sender_contact: '' }, 'missing_sender_identity'));
test('sms uses the same electronic-message rules', () =>
  ready({ ...emailOK, contact_channel: 'sms' }));

const formOK = {
  contact_channel: 'contact_form', contact_source: 'https://x.com/contact',
  contact_form_allowed_basis: 'public enquiry form, no marketing prohibition',
  contact_form_manual_only: true,
  caller_identity: 'Ctrl Alt Develop', sender_contact: 'hello@ctrlaltdevelop.io', suppressed: false,
};
test('contact form with source + allowed basis + identity => Review ready', () => ready(formOK));
test('contact form missing source URL => Research only', () =>
  only({ ...formOK, contact_source: '' }, 'missing_form_source'));
test('contact form missing allowed-use evidence => Research only', () =>
  only({ ...formOK, contact_form_allowed_basis: '' }, 'missing_form_allowed_basis'));
test('contact form must be manual-only, not automated submission => Research only', () =>
  only({ ...formOK, contact_form_manual_only: false }, 'automated_form_submission'));
test('contact form accepts sheet-style TRUE for manual-only flag', () =>
  ready({ ...formOK, contact_form_manual_only: 'TRUE' }));
test('contact form missing sender contact => Research only', () =>
  only({ ...formOK, sender_contact: '' }, 'missing_sender_identity'));

const phoneOK = {
  contact_channel: 'phone', dncr_checked_at: '2026-06-20', dncr_result: 'not listed',
  phone_consent_basis: 'existing-business inferred', telemarketing_compliance_status: 'compliant',
  caller_identity: 'Ctrl Alt Develop', phone_script_notes: 'intro + opt-out offer',
  do_not_call_note: 'offer opt-out and mark suppressed if requested', suppressed: false,
};
test('phone with full DNCR/telemarketing record => Review ready', () => ready(phoneOK));
test('phone missing DNCR check => Research only', () =>
  only({ ...phoneOK, dncr_checked_at: '' }, 'missing_dncr'));
test('phone missing consent basis => Research only', () =>
  only({ ...phoneOK, phone_consent_basis: '' }, 'missing_phone_consent'));
test('phone missing telemarketing status => Research only', () =>
  only({ ...phoneOK, telemarketing_compliance_status: '' }, 'missing_telemarketing_status'));
test('phone missing do-not-call note => Research only', () =>
  only({ ...phoneOK, do_not_call_note: '' }, 'missing_do_not_call_note'));
```

**Step 2: Run — expect FAIL.**

**Step 3: Implement**

```js
// Compliance keystone. Default Research only; Review ready only when the
// selected channel satisfies every rule in the design's decision table.
// Mirrors docs/plans/2026-06-22-prospecting-agent-design.md.
const has = (v) => typeof v === 'string' ? v.trim().length > 0 : !!v;
const isTrue = (v) => v === true || (typeof v === 'string' && v.trim().toLowerCase() === 'true');
const VALID_CONSENT = new Set(['express', 'inferred']);

export function evaluate(lead) {
  const reasons = [];
  const research = () => ({ status: 'Research only', channel: lead.contact_channel || null, reasons });

  if (isTrue(lead.suppressed)) { reasons.push('suppressed'); return research(); }

  switch (lead.contact_channel) {
    case 'email': case 'sms': case 'dm': {
      if (!VALID_CONSENT.has(lead.consent_basis)) reasons.push('missing_consent');
      if (!has(lead.consent_evidence)) reasons.push('missing_consent_evidence');
      if (!has(lead.caller_identity) || !has(lead.sender_contact)) reasons.push('missing_sender_identity');
      if (!has(lead.unsubscribe)) reasons.push('missing_unsubscribe');
      break;
    }
    case 'contact_form': {
      if (!has(lead.contact_source)) reasons.push('missing_form_source');
      if (!has(lead.contact_form_allowed_basis)) reasons.push('missing_form_allowed_basis');
      if (!isTrue(lead.contact_form_manual_only)) reasons.push('automated_form_submission');
      if (!has(lead.caller_identity) || !has(lead.sender_contact)) reasons.push('missing_sender_identity');
      break;
    }
    case 'phone': {
      if (!has(lead.dncr_checked_at) || !has(lead.dncr_result)) reasons.push('missing_dncr');
      if (!has(lead.phone_consent_basis)) reasons.push('missing_phone_consent');
      if (!has(lead.telemarketing_compliance_status)) reasons.push('missing_telemarketing_status');
      if (!has(lead.caller_identity) || !has(lead.phone_script_notes)) reasons.push('missing_caller_identity');
      if (!has(lead.do_not_call_note)) reasons.push('missing_do_not_call_note');
      break;
    }
    default:
      reasons.push('no_lawful_channel');
  }

  return reasons.length ? research()
    : { status: 'Review ready', channel: lead.contact_channel, reasons: [] };
}
```

**Step 4: Run — expect PASS (all gating tests).**

**Step 5: Commit**

```bash
git add src/compliance.js test/compliance.test.js
git commit -m "feat: add compliance decision-table gating (keystone)"
```

---

## Task 8: Tiling

Splits the search circle into a grid of tiles, each with a circumscribing search radius, because `searchNearby` returns at most 20 results per request. **Tile size is an argument** (derived later); the function is pure geometry.

**Files:**
- Create: `src/tiling.js`
- Test: `test/tiling.test.js`

**Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tileCircle } from '../src/tiling.js';

const center = { lat: -37.9333, lng: 145.0167 };

test('tile larger than the whole area => single tile at centre', () => {
  const tiles = tileCircle(center, 10000, 30000);
  assert.equal(tiles.length, 1);
  assert.equal(tiles[0].tile_id, '0_0');
});

test('invalid tile sizes throw before any loop', () => {
  for (const tileSizeM of [null, 0, -1, Infinity, NaN])
    assert.throws(() => tileCircle(center, 10000, tileSizeM), /tileSizeM/);
});

test('smaller tiles produce a grid covering the area', () => {
  const tiles = tileCircle(center, 10000, 5000);
  assert.ok(tiles.length > 1);
  for (const t of tiles) {
    assert.ok(Number.isFinite(t.lat) && Number.isFinite(t.lng));
    assert.ok(t.radius > 0);
    assert.match(t.tile_id, /^-?\d+_-?\d+$/);
  }
});

test('tile ids are unique and deterministic', () => {
  const ids = tileCircle(center, 10000, 5000).map((t) => t.tile_id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, tileCircle(center, 10000, 5000).map((t) => t.tile_id));
});
```

**Step 2: Run — expect FAIL.**

**Step 3: Implement**

```js
// Cover a circle (center, radiusM) with square tiles of side tileSizeM. Each
// tile carries a search radius circumscribing the square (side*√2/2) so the
// union covers the area. A tile is kept if its centre is within
// radiusM + tileRadius of the area centre.
const M_PER_DEG_LAT = 111320;

export function tileCircle(center, radiusM, tileSizeM) {
  if (!Number.isFinite(tileSizeM) || tileSizeM <= 0)
    throw new RangeError('tileSizeM must be a positive finite number');

  const tileRadius = (tileSizeM * Math.SQRT2) / 2;
  const half = Math.max(0, Math.ceil((radiusM - tileSizeM / 2) / tileSizeM));
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180);
  const tiles = [];
  for (let row = -half; row <= half; row++) {
    for (let col = -half; col <= half; col++) {
      const dLat = (row * tileSizeM) / M_PER_DEG_LAT;
      const dLng = (col * tileSizeM) / mPerDegLng;
      const offsetM = Math.hypot(row * tileSizeM, col * tileSizeM);
      if (offsetM > radiusM + tileRadius) continue; // tile fully outside area
      tiles.push({
        tile_id: `${row}_${col}`,
        lat: center.lat + dLat,
        lng: center.lng + dLng,
        radius: Math.round(tileRadius),
      });
    }
  }
  return tiles;
}
```

**Step 4: Run — expect PASS.**

**Step 5: Commit**

```bash
git add src/tiling.js test/tiling.test.js
git commit -m "feat: add geo-tiling for searchNearby 20-result limit"
```

---

## Task 9: Discovery query keys + checkpoint selection

Builds stable `query_key`s and selects which discovery queries still need to run, so completed/capped tiles are skipped on retry and errored ones are retried — the cost-control checkpoint.

**Files:**
- Create: `src/discovery.js`
- Test: `test/discovery.test.js`

**Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQueryKey, selectPending } from '../src/discovery.js';

test('query key is stable and order-independent on its fields', () => {
  const a = buildQueryKey({ category: 'trades', place_type: 'plumber', tile_id: '0_0', rank_preference: 'distance' });
  assert.equal(a, 'trades|plumber|0_0|distance');
});

test('selects Pending and retryable Error queries; skips Completed/Capped/Running', () => {
  const queries = [
    { query_key: 'p', status: 'Pending' },
    { query_key: 'e', status: 'Error' },
    { query_key: 'c', status: 'Completed' },
    { query_key: 'cap', status: 'Capped' },
    { query_key: 'run', status: 'Running' },
  ];
  assert.deepEqual(selectPending(queries).map((q) => q.query_key), ['p', 'e']);
});

test('empty input yields empty selection', () => {
  assert.deepEqual(selectPending([]), []);
});
```

**Step 2: Run — expect FAIL.**

**Step 3: Implement**

```js
// query_key dedupes a discovery task by category + place_type + tile + rank.
export function buildQueryKey({ category, place_type, tile_id, rank_preference }) {
  return [category, place_type, tile_id, rank_preference].join('|');
}

// Queries still needing a paid search call: never-run (Pending) or retryable
// (Error). Completed/Capped are done; Running is in-flight.
const RUNNABLE = new Set(['Pending', 'Error']);
export function selectPending(queries) {
  return queries.filter((q) => RUNNABLE.has(q.status));
}
```

**Step 4: Run — expect PASS.**

**Step 5: Commit**

```bash
git add src/discovery.js test/discovery.test.js
git commit -m "feat: add discovery query keys + checkpoint selection"
```

---

## Task 10: Candidate category list (needs Tim's approval)

Per the agreed approach: draft a candidate list of local-SMB Places types for Tim to approve/edit. This is a **proposal artifact**, not yet active targeting — it is consumed by discovery in the stage plan only after approval.

**Files:**
- Create: `src/categories.js`

**Step 1: Draft the proposal**

```js
// CANDIDATE local-SMB targeting list — PENDING TIM'S APPROVAL before use.
// Each entry maps a business category to Places (New) `includedTypes`. Trim or
// extend before the stage plan wires discovery. rank_preference is per-query.
export const CANDIDATE_CATEGORIES = [
  { category: 'trades', place_types: ['plumber', 'electrician', 'roofing_contractor', 'painter', 'general_contractor'] },
  { category: 'home_services', place_types: ['locksmith', 'moving_company', 'house_cleaning_service'] },
  { category: 'food', place_types: ['cafe', 'restaurant', 'bakery'] },
  { category: 'personal_care', place_types: ['hair_salon', 'beauty_salon', 'barber_shop'] },
  { category: 'auto', place_types: ['car_repair', 'car_wash'] },
  { category: 'health', place_types: ['physiotherapist', 'dentist', 'veterinary_care'] },
  { category: 'retail', place_types: ['florist', 'pet_store', 'hardware_store'] },
];
```

**Step 2: Surface for approval**

Do **not** mark this done autonomously. Present `CANDIDATE_CATEGORIES` to Tim; apply his edits; only then commit.

**Step 3: Commit (after approval)**

```bash
git add src/categories.js
git commit -m "feat: add approved candidate SMB category list"
```

---

## Task 11: Foundation green check

**Step 1: Run the whole suite**

Run: `npm test`
Expected: all tests across Tasks 2–9 PASS, 0 failures.

**Step 2: Confirm zero runtime dependencies**

Verify `package.json` has no `dependencies` block — the foundation must stay install-free.

**Step 3: Commit any final tidy-ups**

```bash
git commit -am "chore: foundation green — pure logic fully tested" --allow-empty
```

---

## Done = ready for the stage plan

When this plan is green, the **stage plan** (separate doc) wires the paid/IO layer onto these pure functions: Sheets client (service account) + header writing from `schema.js`, Places discovery using `tiling.js` + `discovery.js`, Place Details enrichment, PageSpeed + the **threshold calibration** that fills `config.pagespeed.minPerformanceScore`, the **tiling/cap derivation** that fills `config.tileSizeM` and `config.caps`, OpenRouter drafting gated by `compliance.js`, the dry-run/limit orchestrator, and the GitHub Actions cron. Legal review of the decision table also precedes any live outreach.
