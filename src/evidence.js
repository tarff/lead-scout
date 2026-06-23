// Human-readable, explicit phrasing for the machine reason codes that qualify()
// emits. The sheet's "Why It Qualified" column is written from these so a
// non-engineer can read, at a glance, why each lead was flagged. Where a number
// drives the flag (LCP, speed score) it is pulled from the lead row so the
// phrasing is specific, not generic.
//
// IMPORTANT: no phrase may contain a comma. evidence_summary is comma-joined and
// split back on ', ' for resume (see reasonsFromEvidence in pipeline.js), so a
// comma inside a phrase would corrupt the reason count on a resumed run.

const PHRASES = {
  no_website: () => 'No website found — strongest prospect',
  site_unreachable: () => 'Website won\'t load — server not responding',
  no_https: () => 'Insecure site — no HTTPS padlock',
  low_performance: (lead) => {
    const s = lead.pagespeed_score;
    return s === '' || s == null
      ? 'Low Google speed score'
      : `Low Google speed score (${s}/100)`;
  },
  high_lcp: (lead) => {
    const ms = Number(lead.lcp_ms);
    return Number.isFinite(ms) && ms > 0
      ? `Slow to load main content (${(ms / 1000).toFixed(1)}s)`
      : 'Slow to load main content';
  },
  missing_pagespeed: () => 'Speed test still pending',
  'failed_audit:viewport': () => 'Not mobile-friendly — no mobile viewport',
  'failed_audit:font-size': () => 'Text too small to read on mobile',
  'failed_audit:tap-targets': () => 'Buttons/links too close to tap on mobile',
};

export function humanizeReason(code, lead = {}) {
  const fn = PHRASES[code];
  if (fn) return fn(lead);
  if (code.startsWith('failed_audit:')) {
    return `Mobile usability issue — ${code.slice('failed_audit:'.length)}`;
  }
  return code; // unknown code: surface it rather than silently hide it
}

export function humanizeReasons(reasons, lead = {}) {
  return (reasons || []).map((r) => humanizeReason(r, lead));
}
