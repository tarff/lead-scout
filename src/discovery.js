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
