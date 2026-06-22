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
  if (cfg.maxLcpMs != null && pagespeed.lcpMs != null && pagespeed.lcpMs > cfg.maxLcpMs) {
    reasons.push('high_lcp');
  }
  for (const a of pagespeed.failedAudits || []) {
    if (MOBILE_USABILITY_AUDITS.has(a)) reasons.push(`failed_audit:${a}`);
  }

  return reasons.length
    ? { qualification: 'warm', reasons }
    : { qualification: 'dropped', reasons: [] };
}
