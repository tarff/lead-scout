// Committed, non-secret config. Secrets come from env (see .env.example).
// Values marked TODO are derived in the stage plan - DO NOT guess them.
export const config = {
  // TODO(stage plan: exact centroid) - confirm Hampton centre via Geocoding
  // before discovery runs. Null prevents a guessed coordinate from being used.
  center: null,
  radiusM: 10000, // design: 10km target radius around Hampton, VIC

  // TODO(stage plan: tiling/cost derivation) - searchNearby returns max 20
  // results/req, so tile size is chosen from category density + SKU pricing.
  tileSizeM: null,

  pagespeed: {
    // TODO(stage plan: threshold calibration) - cutoff set from sampled real
    // local sites; null means "perf-score signal disabled" until calibrated.
    minPerformanceScore: null,
    maxLcpMs: 2500, // Core Web Vitals "good" LCP upper bound (Google CWV)
    requireHttps: true,
  },

  // TODO(stage plan: pricing derivation) - hard per-run caps per paid SKU/stage.
  caps: { searchNearby: null, placeDetails: null, pagespeed: null, drafts: null },

  model: 'anthropic/claude-haiku-4.5', // confirmed on OpenRouter 2026-06-22
  dryRun: process.env.DRY_RUN !== 'false', // safe default: dry-run unless told otherwise
};
