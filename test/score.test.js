import { test } from 'node:test';
import assert from 'node:assert/strict';
import { score, priorityLabel } from '../src/score.js';

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

test('priorityLabel reads in plain language for each tier', () => {
  assert.match(priorityLabel('hot'), /no website/i);
  assert.match(priorityLabel('broken'), /won't load/i);
  assert.equal(priorityLabel('warm', 3), 'Warm — weak website (3 issues)');
  assert.equal(priorityLabel('warm', 1), 'Warm — weak website (1 issue)');
  assert.match(priorityLabel('needs_pagespeed'), /pending/i);
  assert.match(priorityLabel('dropped'), /fine/i);
});

test('a broken (unreachable) site ranks at the top tier, with the no-website hots', () => {
  const broken = { qualification: 'broken', reasons: ['site_unreachable'] };
  assert.ok(score(broken, {}) > score(warm3, {}));
  assert.equal(score(broken, {}), score(hot, {})); // same tier as no-website leads
});
