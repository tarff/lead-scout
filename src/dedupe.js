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
