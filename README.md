# lead-scout

A compliant, scheduled lead-research tool for **Ctrl Alt Develop**. It finds
local small businesses around Hampton, VIC with **no website or a poor one**,
qualifies and scores them, drafts a personalised outreach opener for each, and
appends them to a Google Sheet for review.

**It does the research; a human reviews and sends all outreach** — no automated
cold sending (Australian Spam Act 2003).

- Design: [`docs/plans/2026-06-22-prospecting-agent-design.md`](docs/plans/2026-06-22-prospecting-agent-design.md)
- Setup: [`docs/SETUP.md`](docs/SETUP.md)
- Status: built and in use. It has run weekly on GitHub Actions since June 2026.

This public copy is for reading. Its scheduled run is switched off, because the
API keys live in a private copy. The local business sites used to set the
PageSpeed cutoff in [`docs/threshold-calibration.md`](docs/threshold-calibration.md)
are shown as numbers rather than names.
