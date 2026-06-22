import { tileCircle } from './tiling.js';
import { buildQueryKey } from './discovery.js';

export function expandDiscoveryQueries({ categories, center, radiusM, tileSizeM, rankPreference }) {
  const tiles = tileCircle(center, radiusM, tileSizeM);
  const rows = [];
  const seen = new Set();
  for (const { category, place_types } of categories) {
    for (const place_type of place_types) {
      for (const t of tiles) {
        const query_key = buildQueryKey({ category, place_type, tile_id: t.tile_id, rank_preference: rankPreference });
        if (seen.has(query_key)) continue;
        seen.add(query_key);
        rows.push({
          query_key, category, place_type, tile_id: t.tile_id, rank_preference: rankPreference,
          center_lat: t.lat, center_lng: t.lng, radius_m: t.radius, status: 'Pending',
          result_count: '', cap_hit: '', started_at: '', completed_at: '', last_error: '', updated_at: '',
        });
      }
    }
  }
  return rows;
}
