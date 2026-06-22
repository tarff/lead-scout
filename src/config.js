// Committed, non-secret config. Secrets come from env (see .env.example).
// Values marked TODO are derived in the stage plan - DO NOT guess them.
export const config = {
  // Hampton, VIC centroid - Google Geocoding API (scripts/geocode-centre.mjs),
  // resolved 2026-06-23 from "Hampton VIC 3188, Australia".
  center: { lat: -37.9338333, lng: 145.0031893 },
  radiusM: 10000, // design: 10km target radius around Hampton, VIC

  // 4km tiles - docs/cost-model.md §4: 500 nearby queries/run (10% of the
  // 5,000-free Nearby cap), ~2.5km spacing to limit 20-result truncation.
  tileSizeM: 4000,

  pagespeed: {
    // Bottom-quartile (q25) of 37 sampled local sites - docs/threshold-calibration.md,
    // 2026-06-23. Sites scoring below this are flagged low_performance.
    minPerformanceScore: 42,
    maxLcpMs: 2500, // Core Web Vitals "good" LCP upper bound (Google CWV)
    requireHttps: true,
  },

  // Per-run hard caps per SKU - docs/cost-model.md §5. Each keeps its SKU inside
  // the free monthly tier at the worst-case 5 weekly runs/month (placeDetails is
  // the binding Enterprise SKU: floor(1000 free / 5 runs) = 200).
  caps: { searchNearby: 500, searchText: 50, placeDetails: 200, pagespeed: 200, drafts: 50 },

  model: 'anthropic/claude-haiku-4.5', // confirmed on OpenRouter 2026-06-22
  dryRun: process.env.DRY_RUN !== 'false', // safe default: dry-run unless told otherwise
};
