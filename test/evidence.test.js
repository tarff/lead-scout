import { test } from 'node:test';
import assert from 'node:assert/strict';
import { humanizeReason, humanizeReasons } from '../src/evidence.js';

test('no_website => strongest-prospect phrasing', () => {
  assert.match(humanizeReason('no_website'), /No website found/);
});

test('site_unreachable explains the site will not load', () => {
  assert.match(humanizeReason('site_unreachable'), /won't load/i);
});

test('high_lcp embeds the measured load time in seconds', () => {
  assert.equal(humanizeReason('high_lcp', { lcp_ms: 4000 }), 'Slow to load main content (4.0s)');
});

test('high_lcp falls back to generic phrasing when no number is stored', () => {
  assert.equal(humanizeReason('high_lcp', {}), 'Slow to load main content');
});

test('low_performance embeds the score out of 100', () => {
  assert.equal(humanizeReason('low_performance', { pagespeed_score: 18 }), 'Low Google speed score (18/100)');
});

test('failed mobile audits get explicit phrasing', () => {
  assert.equal(humanizeReason('failed_audit:viewport'), 'Not mobile-friendly — no mobile viewport');
  assert.equal(humanizeReason('failed_audit:font-size'), 'Text too small to read on mobile');
});

test('unknown failed audit names degrade gracefully', () => {
  assert.equal(humanizeReason('failed_audit:image-alt'), 'Mobile usability issue — image-alt');
});

test('unknown codes are surfaced verbatim rather than hidden', () => {
  assert.equal(humanizeReason('some_future_code'), 'some_future_code');
});

test('no phrase contains a comma (resume splits evidence on ", ")', () => {
  const lead = { lcp_ms: 4000, pagespeed_score: 18 };
  const codes = ['no_website', 'site_unreachable', 'no_https', 'low_performance', 'high_lcp',
    'missing_pagespeed', 'failed_audit:viewport', 'failed_audit:font-size', 'failed_audit:tap-targets'];
  for (const phrase of humanizeReasons(codes, lead)) {
    assert.ok(!phrase.includes(','), `phrase contains a comma: ${phrase}`);
  }
});

test('humanizeReasons preserves count for resume severity scoring', () => {
  const reasons = ['no_https', 'high_lcp', 'low_performance'];
  const out = humanizeReasons(reasons, { lcp_ms: 4000, pagespeed_score: 20 }).join(', ');
  assert.equal(out.split(', ').length, reasons.length);
});
