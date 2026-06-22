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
