// Lexicographic rank: [qualification tier] >> [severity] >> [contactable].
// Multipliers are place-value separators for the ordering, NOT tuned weights.
const TIER = { hot: 3, broken: 3, warm: 2, needs_pagespeed: 1, dropped: 0 };

export function score(qual, lead) {
  const tier = TIER[qual.qualification];
  if (tier == null) throw new RangeError(`unknown qualification: ${qual.qualification}`);
  const severity = qual.qualification === 'warm' ? (qual.reasons?.length || 0) : 0;
  const contactable = lead?.phone ? 1 : 0;
  return tier * 1000 + severity * 10 + contactable;
}

// Plain-language version of the ranking for the human-facing "Priority" column.
// The numeric score above stays as a hidden sort key; this says, in words, what
// each lead is so a non-engineer doesn't have to decode a 4-digit number.
export function priorityLabel(qualification, issueCount = 0) {
  switch (qualification) {
    case 'hot':
      return '🔥 Best lead — no website at all';
    case 'broken':
      return '🔥 Website is broken — won\'t load';
    case 'warm':
      return `Warm — weak website (${issueCount} issue${issueCount === 1 ? '' : 's'})`;
    case 'needs_pagespeed':
      return 'Not yet rated — speed test pending';
    case 'dropped':
      return 'Low — website looks fine';
    default:
      return qualification || '';
  }
}
