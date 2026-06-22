# lead-scout — Phase 1: External Setup

Prerequisites that must exist before any pipeline code can run. You do the
clicking in the consoles; this checklist tracks what's collected. Secret values
go **straight into a local `.env` / GitHub secret — never paste them into chat.**
Non-secret IDs (project ID, service-account email, sheet ID) are fine to share.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done

## 1. Google Cloud project + billing
- [x] Create a GCP project. **Project ID: `lead-scout-500200`**.
- [ ] Link a **billing account** (card on file required even within free tiers).
- [ ] Set a **budget alert** at ~$20/month (Billing → Budgets & alerts).

## 2. Enable APIs
- [x] Places API (New)
- [x] PageSpeed Insights API
- [x] Google Sheets API

## 3. API key (Places + PageSpeed)
- [x] Create an API key (APIs & Services → Credentials).
- [x] **API restriction:** restricted to *Places API (New)* + *PageSpeed
      Insights API* only.
- [x] Store the key in `.env` as `GOOGLE_API_KEY` and as a GitHub secret.

## 4. Service account (Google Sheets)
- [x] Create a service account (`lead-scout-sheets`).
- [x] Create a **JSON key**, download it, save as `./service-account.json`
      (gitignored). Email: `lead-scout-sheets@lead-scout-500200.iam.gserviceaccount.com`.
- [ ] For CI: paste the JSON contents into the `GOOGLE_SHEETS_SA_JSON` secret.

## 5. Google Sheet
- [x] Create a new Google Sheet ("Lead Scout").
- [x] Add two tabs: `Leads` and `DiscoveryQueries` (headers added by code later).
- [x] **Share** the sheet with the service-account email as **Editor**.
- [x] **Sheet ID: `16ynGkm_HbdWg36969ObrDrqo66CcSbFNS_QzOrwCvjE`**
      → `.env` `SHEET_ID` + GitHub secret.

## 6. OpenRouter
- [x] Confirm model slug: `anthropic/claude-haiku-4.5` (confirmed 2026-06-22;
      $1/$5 per 1M input/output tokens).
- [x] Create an OpenRouter API key → `.env` `OPENROUTER_API_KEY` + GitHub secret.

## 7. Wire up local + CI
- [x] `cp .env.example .env` and fill in local values.
- [x] Add the four secrets to GitHub Actions:
      `GOOGLE_API_KEY`, `OPENROUTER_API_KEY`, `GOOGLE_SHEETS_SA_JSON`, `SHEET_ID`.

---
**Phase 1 verified end-to-end 2026-06-22** (`node verify-setup.mjs` → all green:
Sheets auth + both tabs, Places API New, PageSpeed). The build phase (scaffold →
pure logic → stages → Actions) can start. Threshold calibration (PageSpeed
sampling) and legal review of the contact-channel decision table also run before
going live.
