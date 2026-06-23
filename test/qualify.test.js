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

test('a site that will not load => broken (top tier)', () => {
  const r = qualify({ website_url: 'http://dead.example' },
    { performanceScore: null, lcpMs: null, failedAudits: [], unreachable: true }, cfg);
  assert.equal(r.qualification, 'broken');
  assert.ok(r.reasons.includes('site_unreachable'));
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
  assert.equal(r.qualification, 'dropped');
});
