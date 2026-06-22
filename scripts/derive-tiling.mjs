import { pathToFileURL } from 'node:url';
import { CANDIDATE_CATEGORIES } from '../src/categories.js';
import { config } from '../src/config.js';
import { expandDiscoveryQueries } from '../src/expand.js';

const DEFAULT_TILE_SIZES = [3000, 4000, 5000, 6000, 8000, 10000];

export function deriveTilingSummaries({ categories, center, radiusM, tileSizes, rankPreference = 'distance' }) {
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) {
    throw new Error('config.center is required before deriving tiling estimates');
  }
  return tileSizes.map((tileSizeM) => {
    const rows = expandDiscoveryQueries({ categories, center, radiusM, tileSizeM, rankPreference });
    const nearby = rows.filter((r) => r.query_mode === 'nearby').length;
    const text = rows.filter((r) => r.query_mode === 'text').length;
    return { tileSizeM, nearby, text, total: rows.length };
  });
}

function cli() {
  const sizes = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  const tileSizes = sizes.length ? sizes : DEFAULT_TILE_SIZES;
  const summaries = deriveTilingSummaries({
    categories: CANDIDATE_CATEGORIES,
    center: config.center,
    radiusM: config.radiusM,
    tileSizes,
  });
  summaries.forEach((s) => console.log(JSON.stringify(s)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli();
}
