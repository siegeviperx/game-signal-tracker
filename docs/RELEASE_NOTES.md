# C2 Multi-Source Data & Momentum Engine — Release notes
**Date:** 2026-10-11  
**Baseline:** Deployed C1 Signal Foundation (`0005_signal_foundation.sql`, one-to-many Steam mappings).  
**Controlling requirements:** Existing `docs/TECHNICAL_REQUIREMENTS.md` **v0.4**; do **not** overwrite it.

## Implemented this batch

1. **IGDB bounded catalog backfill:** New admin `POST /admin/sync-igdb-page?scope=upcoming&cursor=0&limit=25`, optional `scope=all`. Keyset traversal and shared existing game/release persistence. Does not claim comprehensive TBA coverage; all-catalog sweep is manually initiated and quota bounded.
2. **Verified Twitch category crosswalk:** `POST /admin/match-twitch`, batching exact IGDB IDs against official Twitch Get Games with `igdb_id`; adds verified Twitch identifiers only after source approval, preserving existing Steam entries and variant suffixes.
3. **Multi-source measurement:** Authenticated `POST /admin/collect-twitch` and `/admin/collect-youtube`, bounded, with source rights checks, missingness, durable raw observations, daily rollups and provenance. Twitch is limited to 100 streams; YouTube is curated-video-level.
4. **YouTube curator import:** `POST /admin/import-videos` accepts 1–25 reviewed/candidate video associations, no name-guessing of official channels. See `tools/video-batch-example.json` and `tools/import-reviewed-videos.ps1`.
5. **Editorial feed evidence:** `editorial_feeds`, deduplicated metadata (`editorial_articles`), conservative candidate entity matching, authenticated review actions, and `GET /game/:id/news` for reviewed links only. No feed URL is auto-seeded.
6. **Descriptive momentum:** `GET /trending`, full seven-day vs prior-week velocity, basic genre+platform cohort normalization, coverage weighting, peer-size and independent-source gating. Returns `insufficient_data` until justified. This is *not* ML or a launch forecast.
7. **Public frontend:** `trending.html` and `trending.js`, source-readiness table, editorial evidence in Signal Lab, charts separated by metric/units, and navigation from Discover.
8. **Tests, scripts and deploy workflow:** offline SQLite migration test, independent Node test suite, browser GitHub installation guide, resumable Windows PowerShell collector and backfill, review checklist.

## Operational contracts

- `/health`, `/stats`, `/games`, `/calendar`, `/game/:id`, `/game/:id/signals`, `/game/:id/variants`, `/admin/sync-igdb`, `/admin/match-external-ids` and `/forecasts` remain available.
- Forecasts remain `insufficient_data` and `probability:null` (no trained or backtested forecasting model).
- No automatic source activation; no secrets in frontend or repository.
- Existing C1 tables remain intact; migration `0006_multisource_momentum.sql` only adds source registry rows and new tables/indexes.
- Deploy workflow executes **tests, migration, then Worker deploy**, after the `main` commit. If migration fails, Worker deploy is skipped; review Actions before proceeding.

## Known limitations / honest next steps

- Twitch access/rights must be approved; only then can Twitch crosswalks and viewer sampling run. The first 100 streams cannot be represented as total viewership.
- YouTube videos must be explicitly curated; ownership is not inferred from game-title search results. Retention/refresh policy must be checked before source activation.
- Publisher RSS feed URLs and article matches require source-level and feed-level review; candidates are not automatically treated as truth.
- Momentum is withheld until enough observations and comparable peers exist; no synthetic/fabricated numbers are shown. An on-demand board temporarily caps 3,000 games or 10,000 daily signal rows; a materialized rollup becomes necessary at scale.
- No trained model, historical Steam launch-week outcome dataset, calibration report, LLM enrichment, RSS semantic event extraction, or credible sales/reception forecast is included here.
- The public `/games` browse endpoint is still limited by its own pagination implementation; catalog backfill does not fix every TBA discovery or ranking limitation.
