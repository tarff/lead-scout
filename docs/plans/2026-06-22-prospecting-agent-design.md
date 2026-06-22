# Prospecting Agent — Design (v1)

- **Date:** 2026-06-22
- **Status:** Validated design, pre-implementation
- **Owner:** Tim — Ctrl Alt Develop

## Purpose

A compliant, scheduled tool that finds local small/medium businesses around
Hampton, VIC that have **no website or a poor one**, qualifies and scores them,
drafts a personalised outreach opener for each, and appends them to a Google
Sheet for Tim to **review and send**. The tool does the research legwork; a
human approves and sends all cold outreach.

## Compliance constraints (non-negotiable)

- **Australian Spam Act 2003** — no automated cold sending. The agent *prepares*
  outreach; the human reviews and sends it.
- **Domain reputation** — no automated cold-email firehose from
  `ctrlaltdevelop.io` (protects the live email + contact form).
- **Platform ToS** — use official Google APIs (Places, PageSpeed) only. No
  scraping of Google Maps, LinkedIn, or Facebook.
- Future opt-in nurture (subsystem C) *may* be automated end-to-end because
  consent exists.

**Compliance keystone:** agent prepares; human approves and sends all cold
outreach. This single boundary keeps the system legal and protects the domain.

## Scope (v1)

- **Subsystem A (Prospecting) only.** B (inbound monitoring) and C (opt-in
  nurture) are deferred.
- **Segment:** businesses with **no website** (hot) + businesses with a **poor
  website** (warm).
- **Targeting:** broad local SMB categories, **10 km radius around Hampton, VIC**.
- **Output:** a Google Sheet with a drafted opener and a `Contacted` column.

## Architecture & data flow

**Trigger:** GitHub Actions cron (weekly) + `workflow_dispatch` (manual). A
single Node.js script runs the stages and exits.

1. **Discover** — Places **Nearby Search** per category (centre = Hampton,
   radius = 10 km); handle paging (60-result cap per query → one query per
   category).
2. **Dedupe** — read existing `place_id`s from the sheet; skip known ones.
3. **Enrich** — Places **Place Details** (field-masked: website, phone, address)
   for *new* `place_id`s only.
4. **Qualify** — no website → **hot**; has website → **PageSpeed Insights**
   (mobile) → if it fails the ruleset → **warm**; good site → drop.
5. **Score** — no-site highest; poor-site by severity; small boost if a phone
   number exists (contactable).
6. **Draft** — OpenRouter (Claude Haiku 4.5) writes a one-line personalised
   opener per qualified lead, referencing the actual problem.
7. **Output** — append new rows to the Google Sheet.

**State:** the sheet is the single source of truth (dedupe by `place_id`). The
run is idempotent and resumable — a crashed run picks up cleanly next time.

## Components & stack

- **Node.js** single script, modular stages.
- **Google Cloud** project: Places API + PageSpeed Insights API, one API key,
  field masking, billing alert.
- **OpenRouter API** for drafting; model is a config value (default
  `anthropic/claude-haiku-4.5` — confirm exact slug on OpenRouter).
- **Google Sheets API** via a **service account** (share the sheet with the SA
  email).
- **Secrets** (GitHub Actions encrypted): `GOOGLE_API_KEY`, `OPENROUTER_API_KEY`,
  `GOOGLE_SHEETS_SA_JSON`, `SHEET_ID`.
- **Config file** (committed, non-secret): categories, Hampton centre
  coordinates, radius, PageSpeed threshold, per-run caps, model slug, dry-run
  flag.

## "Poor website" — data-driven threshold

- **No hardcoded guess.** Calibrate from real data: sample PageSpeed mobile
  performance scores of 30–50 real local sites, inspect the distribution, set
  the cutoff (e.g. bottom quartile), and **document the sample** that justified
  it.
- **Multi-signal ruleset:** low performance score **OR** mobile-friendly fail
  **OR** no HTTPS **OR** LCP clearly above ~2.5 s.
- Threshold lives in **config**; retune as more local data is gathered.

## Costs (target ~$0)

- Google Maps Platform **$200/month free credit** covers this scale.
- Cost drivers: Nearby Search + Place Details (new businesses only).
- PageSpeed: free. Sheets: free. GitHub Actions: free. OpenRouter: cents/week.
- **Controls:** hard per-run caps, dedupe-before-enrich, field masking, and a
  Google Cloud **billing alert (~$20)** as a backstop.
- Note: Google requires a **card on file** even for the free credit (accepted).

## Error handling

- **Per-item isolation** — one bad record never crashes the run.
- **Retries with backoff**; respect `429` rate limits (PageSpeed especially).
- **Idempotent/resumable** via sheet dedupe.
- **No silent truncation** — log when a per-run cap is hit ("cap reached, N
  skipped").
- **Fail-fast** on missing secrets.
- **Run summary** logged: discovered / new / hot / warm / drafted / appended /
  errors.

## Testing

- **Unit tests** on the pure logic (qualify, score, dedupe) with mocked API
  responses.
- **Dry-run mode** — full pipeline, no writes, no LLM calls; prints intended
  actions. Used for first runs and threshold tuning at zero cost.
- **Limit mode** — one category / tiny radius for cheap end-to-end validation.
- **`workflow_dispatch`** for on-demand runs during testing.

## Open items (before/at implementation)

- Finalise the broad SMB **category list** (Places types).
- Run the **threshold calibration** (one-off) to set the PageSpeed cutoff from
  real local data.
- Confirm the **OpenRouter model slug**.
- Set up the **Google Cloud** project + billing + API key; create the **service
  account** and share the sheet.

## Deferred (not v1)

- **Subsystem B** — inbound monitoring (real-time buying signals).
- **Subsystem C** — opt-in lead nurture (automated sending allowed due to
  consent).
