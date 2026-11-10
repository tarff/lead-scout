# PageSpeed threshold calibration

Derives `config.pagespeed.minPerformanceScore` from the **measured distribution of
real local-business site performance**, not a guessed cutoff.

## Method

Sample: **37 real local business websites** around Hampton/Brighton/Sandringham VIC,
harvested live from a Places (New) discovery + Place Details enrichment pass
(cafe / restaurant / hair_salon / dentist, 4 km tiles around the derived centroid),
2026-06-23. Each scored with `scripts/calibrate-threshold.mjs` → Google PageSpeed
Insights, **mobile** strategy (`src/pagespeed.js`).

Reproduce: `npm run calibrate -- <urls...>` (the site names are kept private;
the sites are numbered in the table below).

## Distribution (mobile performance score, 0–100)

```
sampled: 37 | min: 12 | q25: 42 | median: 54 | q75: 60 | max: 98
```

Local small-business sites perform poorly as a group — the **median is 54**
("needs improvement"), and a quarter score **42 or below**. This is the opportunity
the tool targets.

## Chosen cutoff: **minPerformanceScore = 42** (the 25th percentile)

`qualify` flags `low_performance` when `performanceScore < minPerformanceScore`
(`src/qualify.js`). Setting it at **q25 = 42** flags the **bottom quartile** of local
sites — the genuinely poor performers — as a qualification signal, while the broad
middle (also imperfect) is still caught by the independent `maxLcpMs` (2500 ms) and
mobile-usability audit signals. A higher cutoff (e.g. the median) would flag half of
all local sites and dilute the "notably poor" signal; q25 keeps it specific.

This is a relative-to-local-peers cutoff, deliberately conservative: it adds an
*extra* reason on top of LCP/HTTPS/usability signals rather than being the sole gate.

## Sample (sorted by score)

| Perf | LCP (ms) | Site |
|---|---|---|
| 12 | 25032 | Site 1 |
| 20 | 17423 | Site 2 |
| 30 | 22969 | Site 3 |
| 32 | 9598 | Site 4 |
| 33 | 11409 | Site 5 |
| 34 | 20030 | Site 6 |
| 34 | 12363 | Site 7 |
| 38 | 24375 | Site 8 |
| 40 | 24327 | Site 9 |
| 42 | 17600 | Site 10 |
| 45 | 19008 | Site 11 |
| 45 | 20200 | Site 12 |
| 46 | 11576 | Site 13 |
| 48 | 26431 | Site 14 |
| 49 | 8243 | Site 15 |
| 50 | 10027 | Site 16 |
| 52 | 17058 | Site 17 |
| 52 | 7091 | Site 18 |
| 54 | 4590 | Site 19 |
| 54 | 51032 | Site 20 |
| 54 | 12584 | Site 21 |
| 55 | 7331 | Site 22 |
| 56 | 58028 | Site 23 |
| 58 | 12001 | Site 24 |
| 59 | 6226 | Site 25 |
| 59 | 25382 | Site 26 |
| 60 | 9250 | Site 27 |
| 60 | 5401 | Site 28 |
| 61 | 7083 | Site 29 |
| 64 | 6033 | Site 30 |
| 64 | 8588 | Site 31 |
| 67 | 3257 | Site 32 |
| 69 | 6605 | Site 33 |
| 73 | 13756 | Site 34 |
| 86 | 3651 | Site 35 |
| 94 | 2327 | Site 36 |
| 98 | 1704 | Site 37 |
