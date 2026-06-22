# Cost model — tile size & per-SKU caps

Derives `config.tileSizeM` and `config.caps` from **published pricing + free-tier
limits + run frequency + measured query counts**. No guessed numbers: every value
below traces to a source in this file.

## 1. Pricing snapshot

Source: Google Maps Platform — *Core services pricing list*
(<https://developers.google.com/maps/billing-and-pricing/pricing>), captured
**2026-06-23**, page effective date **2026-06-19 UTC**.

Tier is set by the **field mask** (billed at the highest-tier field requested).

| SKU (as we call it) | Field mask we send | Tier hit | $/1,000 (0–100k) | Free calls / month |
|---|---|---|---|---|
| Nearby Search (New) | `places.id,displayName,primaryType,location,formattedAddress` | **Pro** | $32.00 | **5,000** |
| Text Search (New) | same as above | **Pro** | $32.00 | **5,000** |
| Place Details (New) | `id,websiteUri,nationalPhoneNumber,internationalPhoneNumber` | **Enterprise** (websiteUri + phone are Enterprise fields) | $20.00 | **1,000** |
| PageSpeed Insights | n/a | free | $0 | 25,000 / day |
| Sheets API | n/a | free | $0 | — |

Key facts confirmed against the pricing page:
- The free monthly allotment is **per individual SKU**, not pooled across a tier.
- The legacy **$200/month credit was discontinued (ended 2025-02-28)**; it does
  **not** apply. Cost control is therefore the per-SKU free caps above + the
  project's ~$20 billing alert.

**Binding constraint:** Place Details Enterprise — the priciest SKU ($20/1k) with
the smallest free cap (1,000/month). The whole cap design is sized to keep it free.

## 2. Run frequency

Cron is weekly (Task 14). A calendar month contains **at most 5** weekly runs, so
`runs_per_month_max = 5`. All monthly projections below use 5 (worst case).

## 3. Query counts per tile size

From `scripts/derive-tiling.mjs` (20 `place_types` + 2 `text_queries` across the
10 km radius around the derived Hampton centroid):

| tile | nearby queries | text queries |
|---|---|---|
| 3 km | 900 | 90 |
| 4 km | 500 | 50 |
| 5 km | 420 | 42 |
| 8 km / 10 km | 180 | 18 |

Discovery queries are persisted and marked `Completed` on success, so a full sweep
is paid **once** (first run); later weekly runs re-search ~nothing until queries are
reset. The per-run caps below still bound a worst case (e.g. a full reset).

## 4. Chosen tile size: **4,000 m**

Search cost does **not** discriminate between candidate sizes — every size's nearby
count is far inside the 5,000-free Nearby cap (3 km = 900 is the largest, still
< 5,000). So the deciding factor is **coverage**: `searchNearby` returns at most 20
results/request, so a tile must be small enough that a single (tile × place_type)
rarely exceeds 20 real businesses, or those extra businesses are silently truncated.

- 8–10 km (≈9 tiles): too coarse — dense types (cafe, restaurant, hair_salon) in a
  commercial strip will exceed 20 and be truncated.
- 3 km (45 tiles, 900 nearby): finest coverage but the most empty (tile × type)
  queries and longest runtime; 900 is 18% of the free Nearby cap.
- **4 km (25 tiles, 500 nearby): chosen.** 500 nearby = 10% of the 5,000 free Nearby
  cap with large headroom; ~2.5 km tile spacing keeps most suburban service-business
  types under the 20-result truncation in a single tile.

**Validation hook:** the pipeline marks a query `Capped` when a search returns ≥ 20
results — the empirical "tile too big" signal. The Task 13 limited live smoke
measures the cap-rate; if many queries come back `Capped`, drop to 3 km and re-derive.

## 5. Chosen caps

`caps` are **per-run** hard ceilings per SKU. Each is the largest value that keeps
its SKU inside the free monthly allotment at the worst-case 5 runs/month.

| cap | value | derivation | monthly worst case | free cap | result |
|---|---|---|---|---|---|
| `placeDetails` | **200** | `floor(1000 / 5)` — the Enterprise binding constraint | 200 × 5 = **1,000** | 1,000 | exactly free |
| `searchNearby` | **500** | covers a full 4 km first run (500 queries) in one pass | 500 × 5 = 2,500 | 5,000 | free, 2× headroom |
| `searchText` | **50** | covers a full 4 km first run (50 queries) | 50 × 5 = 250 | 5,000 | free |
| `pagespeed` | **200** | free SKU; matched to `placeDetails` enrichment throughput (only websites get scored) | n/a | 25k/day | free |
| `drafts` | **50** | LLM (Haiku); gated on manual compliance so few/run; bounds OpenRouter spend | ~$0.005/run | n/a | negligible |

**Projected monthly cost at these caps: ~$0** — every SKU stays within its free
tier. The ~$20 billing alert is headroom, not a target. If faster coverage of a
large region is wanted later, `placeDetails` can be raised toward ~430/run
(≈ 1,000 free + $20 ÷ $20/1k = 1,000 paid → 2,000/month) while staying under the
alert; revise here with the new math before changing config.
