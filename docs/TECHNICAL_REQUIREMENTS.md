# Game Signal Tracker — Technical Requirements v0.3 — Consolidated Source of Truth

**Status:** Consolidated requirements and implementation handoff (not a claim of production readiness)  
**Updated:** 2026-10-10  
**Baseline:** `game-signal-tracker-requirements.md` v0.1 and `game-signal-tracker-v0.2-requirements.md` (AI Signal Tracker v4-derived architecture)  
**Audience:** Gamers, analysts, developers, publishers, and gaming industry professionals

## 0. Conventions and decision record

- **MUST** = mandatory for the stated release; **SHOULD** = preferred; **MAY** = optional.
- **P0** = prerequisite; **MVP** = first public release; **P2/P3** = subsequent releases.
- **[BASELINE]** = carried from v0.1; **[PROPOSED]** = v0.2 design decision; **[VERIFY]** = external capability, terms, quota, or access requiring confirmation before implementation.
- No numeric predictive claims are valid before model evaluation. All sample UI scores are synthetic placeholders.

### 0.1 Key decisions
1. **[BASELINE]** Game-centric canonical entities, release-date precision and history, article-to-game evidence links, separate deployment from AI Signal Tracker.
2. **[PROPOSED]** Two product modes share one canonical dataset: consumer discovery and analyst intelligence. No user accounts in MVP.
3. **[PROPOSED]** Separate *observed metrics*, *momentum indices*, *model forecasts*, and *realized outcomes*. Never call a manually weighted index a trained forecast.
4. **[PROPOSED]** Initial measurable target: Steam launch-week peak concurrent players (CCU) and relative breakout vs comparable Steam releases; other platforms get discovery scores and release tracking until appropriate labels exist.
5. **[PROPOSED]** Predictions are immutable, versioned, timestamped, and evaluated only against subsequent outcomes.
6. **[PROPOSED]** Public forecast publication requires coverage, sample-size, and calibration gates; otherwise show **Insufficient data**.
7. **[VERIFY]** API licensing, commercial use, availability, pricing, rate limits, and robots/terms must be checked during P0. No scraping assumed permissible.

## 1. Product definition and users

### 1.1 Product promise
Answer: *Which upcoming games are gaining unexpected attention, what may happen at launch, how confident are we, and what evidence changed the forecast?*

### 1.2 User journeys
**Gamers:** discover emerging titles by genre/platform/release window; compare momentum to peers; see verified release updates; maintain a browser-local watchlist; read a plain-English explanation with source links.

**Industry professionals:** filter by publisher, genre, price tier when legally available, platform and lead time; inspect signal trajectories, comparable games, forecast versions, uncertainty, model accuracy, and data coverage; export aggregated results where permitted.

### 1.3 Product terminology
- **Momentum index (0–100):** descriptive composite of observable signals; NOT a probability.
- **Breakout event:** a precisely defined outcome above a benchmark threshold within a comparable cohort (see §7).
- **Breakout probability:** calibrated estimated probability of that event, not a subjective AI score.
- **Launch engagement forecast:** forecast of a measurable Steam CCU outcome with prediction interval; not sales.
- **Release risk:** likelihood of date-window movement, only when a separately validated model exists.
- **Confidence / quality:** model calibration plus coverage and data-quality status, not model certainty.

## 2. Scope

### 2.1 MVP MUST
- Canonical game directory; platform/region release dates with precision and change history.
- Upcoming releases (rolling 12 months), long-horizon/TBA discovery, and at least 14 days of post-launch monitoring.
- First-party and approved editorial feed ingestion; canonical article evidence and rumor classification.
- Persistent historical signal observations and daily aggregates.
- Explainable momentum leaderboard; genre- and platform-relative normalization; data freshness indicators.
- Consumer-friendly Breakout Watch, Trending, Calendar, Delays, Game Detail, and Methodology views.
- Versioned *baseline forecasts* only for cohorts that pass validation and data gates; otherwise forecast withheld.
- Forecast evaluation dashboard for any published forecasts, with public definitions and limitations.
- Local watchlist with browser storage; no accounts.

### 2.2 P2 SHOULD
- Scheduled YouTube publisher-channel metrics where API access permits; Reddit via approved access; additional platform-native signals.
- Historical supervised model, comparable-games retrieval, watchlist notifications, and analyst CSV export.
- Release-window risk model if enough trustworthy delay-history labels exist.

### 2.3 P3 MAY
- Licensed sales/revenue estimates, global console performance, analyst workspaces, multi-user accounts, paid feeds, and localized markets.

### 2.4 Explicit exclusions
- No invented wishlist counts, sales, player counts, or probability percentages.
- No Steam follower metric mislabeled as wishlists.
- No model-training on post-launch information for pre-launch forecasts.
- No scraping behind login, paywall, access controls, or restrictive terms.
- No consumer identity profiling or unlicensed personal-data ingestion.

## 3. Data source strategy and access controls

| Tier | Source | Role | Integration gate |
|---|---|---|---|
| Primary | IGDB | Canonical game records, releases, platforms, aliases, crosswalk IDs | OAuth, licensing, quota, data freshness [VERIFY] |
| Primary | Steam Store / authorized Steam data | PC catalog metadata, release labels, app IDs | Endpoint reliability, permitted automated use [VERIFY] |
| Candidate | SteamDB | Public benchmarking of followers / wishlist rank (NOT actual wishlist totals) | No automated collection without permission or licensed access [VERIFY] |
| Candidate | YouTube Data API | Official trailer engagement and publisher channel uploads | Quota, consent/terms, stable video-to-game mapping [VERIFY] |
| Candidate | Twitch Helix | Pre-launch creator activity and launch streaming | OAuth, quota; low pre-launch coverage [VERIFY] |
| Candidate | Google Trends | Search-demand index | Approved acquisition method and reproducibility [VERIFY] |
| News | IGN, GameSpot, PC Gamer, Eurogamer, VGC, Gematsu, Polygon, Rock Paper Shotgun, Nintendo Life | Announcements, previews, date claims | Validate individual RSS/Atom feeds, rights, availability [VERIFY] |
| Official | PlayStation Blog, Xbox Wire, Nintendo, Steam News, publisher newsrooms | Release confirmation and primary evidence | Validate feeds/APIs and attribution [VERIFY] |
| Candidate | GDELT / Bing News RSS | Broad coverage discovery | Endpoint and usage policy [VERIFY] |
| Later | Reddit, Backloggd, ResetEra | Community interest | Permission, API/terms, representativeness [VERIFY] |
| Later | Gamalytic, VG Insights, Newzoo | Licensed comparables / commercial labels | Paid licensing and methodological limitations [VERIFY] |

**MUST:** source registry stores access method, rights status, attribution obligations, refresh cadence, freshness SLA, quota budget, last success, and failure mode. **MUST:** disable any source until P0 access validation passes. **MUST:** label unofficial or estimated measures clearly. **MUST:** distinguish source reliability for factual claims from predictive usefulness of consumer signals.

## 4. System architecture

```text
GitHub Pages / Vanilla JS (Pearlescent shell)
                  |
          Public read-only API
                  |
      Cloudflare Worker (routes + cron)
         |            |           |
         D1           KV       OpenAI API
  canonical DB    cache/locks  extraction only
         |
     daily aggregates + immutable forecast snapshots
         ^
         |
GitHub Actions / scheduled Python (offline training + scoring)
  -> fetch bounded feature extracts / authorized data
  -> train + time-split evaluate + calibrate
  -> publish signed/authorized model outputs via admin endpoint
```

**[BASELINE]** Separate repository, Worker, D1, and KV from AI Signal Tracker. Reuse URL normalization, entity decoding, hash IDs, circuit breakers, cron sharding, migrations, debug routes, and theme shell.

**[PROPOSED]** Training runs outside Cloudflare Workers. Scoring MAY run offline initially. Worker serves stored forecasts. GitHub Actions secrets MUST be scoped; publishing endpoint MUST authenticate and validate payload schema/model version. Keep private raw keys out of Pages and logs.

**[VERIFY]** Recheck Cloudflare cron, Worker CPU/subrequest/storage and D1/KV limits; GitHub Actions quotas; OpenAI model IDs, API pricing, structured-output support; third-party API rate limits. OpenAI model identifier MUST be configurable, not assumed to exist.

## 5. Canonical entity and evidence model

### 5.1 Retain from v0.1
`games`, `aliases`, `release_dates`, `date_history`, `articles`, `article_games`, `scan_log`; retain per-platform/region date ranges and precision. Every confirmed date transition and history row MUST commit atomically.

### 5.2 Required schema extensions (conceptual DDL)

```sql
CREATE TABLE source_registry (
  source_id TEXT PRIMARY KEY, name TEXT NOT NULL, access_method TEXT,
  rights_status TEXT NOT NULL, attribution TEXT, enabled INTEGER NOT NULL DEFAULT 0,
  refresh_minutes INTEGER, last_success_at INTEGER, notes TEXT
);
CREATE TABLE signal_observations (
  id TEXT PRIMARY KEY, game_id TEXT NOT NULL, source_id TEXT NOT NULL,
  metric TEXT NOT NULL, platform TEXT, region TEXT,
  observed_at INTEGER NOT NULL, ingested_at INTEGER NOT NULL,
  value REAL, unit TEXT NOT NULL, observation_status TEXT NOT NULL,
  provenance_url TEXT, source_record_id TEXT,
  UNIQUE(game_id, source_id, metric, platform, region, observed_at)
);
CREATE TABLE signal_daily (
  game_id TEXT NOT NULL, source_id TEXT NOT NULL, metric TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'all', region TEXT NOT NULL DEFAULT 'WW',
  day TEXT NOT NULL, value REAL, unit TEXT NOT NULL, coverage_status TEXT NOT NULL,
  PRIMARY KEY(game_id, source_id, metric, platform, region, day)
);
CREATE TABLE event_claims (
  id TEXT PRIMARY KEY, game_id TEXT NOT NULL, article_id TEXT,
  claim_type TEXT NOT NULL, claimed_label TEXT, evidence_url TEXT,
  evidence_class TEXT NOT NULL, verification_status TEXT NOT NULL,
  observed_at INTEGER NOT NULL, resolved_at INTEGER
);
CREATE TABLE historical_outcomes (
  game_id TEXT NOT NULL, platform TEXT NOT NULL, outcome_name TEXT NOT NULL,
  window_start INTEGER NOT NULL, window_end INTEGER NOT NULL,
  value REAL, unit TEXT NOT NULL, label_source TEXT NOT NULL,
  captured_at INTEGER NOT NULL, quality_status TEXT NOT NULL,
  PRIMARY KEY(game_id, platform, outcome_name, window_start)
);
CREATE TABLE forecast_models (
  model_version TEXT PRIMARY KEY, target_name TEXT NOT NULL,
  training_cutoff INTEGER NOT NULL, feature_schema_version TEXT NOT NULL,
  cohort_definition TEXT NOT NULL, artifact_hash TEXT,
  validation_report_url TEXT, deployment_status TEXT NOT NULL
);
CREATE TABLE game_forecasts (
  forecast_id TEXT PRIMARY KEY, game_id TEXT NOT NULL,
  platform TEXT NOT NULL, target_name TEXT NOT NULL,
  as_of INTEGER NOT NULL, target_window_start INTEGER, target_window_end INTEGER,
  model_version TEXT NOT NULL, point_value REAL, lower_value REAL,
  upper_value REAL, probability REAL, prediction_status TEXT NOT NULL,
  reason_code TEXT, evidence_snapshot_hash TEXT NOT NULL,
  published_at INTEGER NOT NULL
);
CREATE TABLE forecast_evaluations (
  forecast_id TEXT PRIMARY KEY, outcome_value REAL, evaluated_at INTEGER,
  absolute_error REAL, interval_covered INTEGER, brier_component REAL,
  evaluation_status TEXT NOT NULL
);
CREATE TABLE game_comparables (
  game_id TEXT NOT NULL, comparable_game_id TEXT NOT NULL,
  as_of INTEGER NOT NULL, model_version TEXT NOT NULL,
  similarity_score REAL, rationale TEXT,
  PRIMARY KEY(game_id, comparable_game_id, as_of, model_version)
);
```

### 5.3 Data quality invariants
- All raw values MUST include unit, source, collection time, ingestion time, platform/region when relevant, and collection status (`ok`, `missing`, `rate_limited`, `not_applicable`, `stale`, `invalid`).
- `NULL`/missing MUST NOT be imputed to zero without an explicitly documented and validated rule.
- Signal history MUST retain daily aggregates across multiple release cycles; prune only high-frequency observations after successful aggregation and retention checks.
- Claims from articles MUST NOT mutate `release_dates` until verified by an accepted authority; unconfirmed claims live in `event_claims`, not as confirmed `date_history` changes.
- Forecast records MUST be append-only after publication; corrections require a new record with a link to the superseded forecast.
- Resolve title aliases with IGDB IDs, platform/edition distinction, and review queue for ambiguous matches.
- Prevent duplicate media coverage from multiplying signal counts; retain original article provenance.

## 6. Ingestion and enrichment

### 6.1 Entity sync
- IGDB MUST seed and periodically update canonical records, with 12-month releases plus TBA and longer-horizon high-interest games.
- Refresh upcoming/watchlisted entities more frequently within quota; full sweep at least daily when supported.
- Release precision MUST support day/month/quarter/year/season/TBA and region/platform; distinguish announced vs inferred dates.

### 6.2 News/event pipeline
1. Fetch only validated, enabled sources with bounded retries and circuit breakers.
2. Canonicalize URL; deduplicate by URL and near-duplicate title/event clusters.
3. Preselect up to three candidate game entities via aliases and platform/edition context.
4. OpenAI model returns strict structured extraction: `game_ids`, `event_type`, `priority`, `claim_text`, `claim_date`, `evidence_type`, `is_rumor`, `short_explanation`, `confidence`.
5. Validate output against schema and candidate set; unknown entities and low-confidence matches go to review queue.
6. Confirmed primary-source date updates follow explicit verification rules; rumors cannot change calendar.
7. Retain source links and timestamp for all displayed explanations.

### 6.3 Source cadence and reliability
- Different cadences by volatility and quota: canonical records daily; important date claims hourly where feasible; approved social/video metrics daily; forecasts daily or after material signal events.
- Circuit breaker state and last-good cached content MUST be exposed through health diagnostics.
- Cron MUST shard ingestion; public requests MUST NOT trigger expensive third-party fetches.
- Client-supplied watchlist IDs MUST NOT cause unbounded server work or bypass per-source budgets; use bounded prioritization queue.

## 7. Predictive analytics specification

### 7.1 Target definitions
**Target A (MVP descriptive):** `momentum_index_0_100` — genre/platform/lead-time-normalized index of *observed* demand signals. Clearly label not predictive.

**Target B (first trained forecast):** `steam_breakout_7d_probability` — probability that Steam launch-week peak CCU exceeds a prespecified peer-cohort threshold (e.g., 75th percentile) among games with similar genre, platform, developer/publisher scale proxies, and release period. Define and freeze cohort algorithm before evaluation. Exclude games lacking outcome labels.

**Target C (P2):** `steam_peak_ccu_7d` — distributional estimate of maximum concurrent players within first seven days after launch, with an 80% prediction interval. Explicitly exclude global sales interpretations.

**Target D (P2):** `release_window_change_probability` — probability that a currently announced date/window moves later before launch, trained on confirmed date histories and carefully defined observation cutoffs. Do not publish until history is adequate.

### 7.2 Feature engineering
- Snapshot at standardized lead times: 180/90/30/7 days before release, plus daily rolling predictions.
- Potential features, only if permitted and observed: IGDB interest, Steam followers or authorized rank, 7/30-day interest velocity, trailer engagement, unique independent news events, search-demand index, creator activity, publisher cadence, genre, platform, franchise indicator, release window precision, prior delays.
- Normalize relative to platform, genre, cohort size, release-year, and days-to-launch; cap outliers and flag missingness.
- Account for exposure bias: AAA franchises, publisher marketing budgets, platform visibility, regional coverage, and source availability.
- Store feature schema version, as-of timestamp, and immutable snapshot hash for each forecast.

### 7.3 Momentum index (not ML)
Start with a **configurable**, explicitly provisional composite of normalized available components. Example initial weights: Steam-interest proxy 30%, search interest 20%, video engagement 20%, independent editorial coverage 15%, community 10%, creator activity 5%. These weights MUST NOT be represented as empirically validated. Missing features require documented renormalization *and* a visible coverage penalty; when coverage falls below threshold, withhold score.

### 7.4 Training and evaluation
- Baseline: cohort prevalence and regularized logistic regression for breakout; simple comparable median for CCU.
- Challenger: gradient-boosted trees only if sufficient labeled examples justify complexity.
- Strict chronological splits by launch date; group all snapshots of the same game in one partition; never let a future release, revised release date, or post-launch feature leak into an earlier forecast.
- Fit scalers, encoders, imputers, calibration, and comparable selection only on training periods.
- Evaluate on later held-out release cohorts and by genre, platform, publisher scale, lead-time bucket, and missing-data pattern.
- Breakout metrics: Brier score, log loss, ROC-AUC/PR-AUC where suitable, calibration curve, top-k precision, and performance vs cohort-prevalence baseline.
- CCU metrics: MAE, median absolute error, interval coverage, and error by popularity band; consider log-scale modeling.
- Publish only when improvement over baseline is demonstrated out-of-time and probability calibration is acceptable under predefined thresholds. Thresholds MUST be selected before test-set review.
- Reassess quarterly or after enough new releases; document drift and retraining triggers.

### 7.5 Forecast publication and uncertainty
- Every result MUST show target definition, time horizon, `as_of`, model version, data freshness, comparable cohort, key evidence, and limitations.
- A probability MUST be calibrated and tied to a precisely defined event. A confidence label MUST NOT be derived solely from model confidence or LLM prose.
- Missing historical outcomes, thin cohorts, stale inputs, and out-of-distribution titles MUST yield `insufficient_data` or a wider interval according to validated rules.
- Forecast changes MUST be attributed to changed input signals or model version; never silently rewrite history.
- AI-generated narrative MUST summarize stored numeric results and citations only, and MUST NOT produce new numbers.

## 8. API routes and contracts

| Endpoint | Access | Output |
|---|---|---|
| `GET /games` | Public | Paginated filterable canonical games; platform, genre, date, momentum |
| `GET /game/:id` | Public | Canonical metadata, release ranges, verified history, source-linked events |
| `GET /calendar` | Public | Precision-aware releases grouped by period and TBA |
| `GET /delays` | Public | Confirmed date transitions; separate unconfirmed claims |
| `GET /trending` | Public | Momentum scores, component contributions, freshness |
| `GET /breakouts` | Public | Published breakout forecasts, status, cohort, as-of |
| `GET /forecasts/:gameId` | Public | Versioned forecasts and explanations by target/platform |
| `GET /comparables/:gameId` | Public | Historical peers and similarity rationale |
| `GET /forecast-accuracy` | Public | Aggregate backtest/live results, cohort breakdown, methodology |
| `GET /trends` | Public | Bounded historical signal aggregates |
| `GET /briefing` | Public | Daily/weekly cached news + forecast-change summary |
| `GET /search` | Public | Alias-aware game/article search |
| `GET /methodology` | Public | Model cards, target definitions, data-source caveats |
| `GET /health`, `/stats` | Public sanitized | Freshness, degradation, aggregate system health |
| `POST /admin/forecast-publish` | Bearer auth | Validated signed/authorized immutable forecast batch |
| `POST /admin/scan-now`, `/admin/cleanup`, `/admin/review` | Bearer auth | Operations |

**MUST:** pagination, input bounds, API response versioning, appropriate CORS allowlist, rate limiting, and caching. Never expose credentials or internal stack traces. Admin authentication MUST use secret comparison, TLS, and restricted deployment permissions. Include an idempotency key for forecast publishing.

### 8.1 Example forecast response
```json
{
  "game_id": "igdb:12345",
  "platform": "PC",
  "target": "steam_breakout_7d_probability",
  "status": "insufficient_data",
  "probability": null,
  "as_of": "2026-10-09T00:00:00Z",
  "model_version": "baseline-v0",
  "reason_codes": ["INSUFFICIENT_HISTORY"],
  "source_freshness": "partial",
  "methodology_url": "/methodology"
}
```

## 9. Frontend and UX

### 9.1 Navigation
Default **Discover / Breakout Watch**, then **Trending**, **Release Calendar**, **Delays**, **Game Detail**, **Briefing**, **Forecast Accuracy**, **Methodology**. Desktop offers analyst filters and drilldowns; mobile prioritizes readable cards and simplified explanations.

### 9.2 Game card MUST show
Cover; canonical name; genre/platform; release date with precision; momentum and change (if available); forecast target and probability **only if validated**; forecast freshness; confirmed delay count; source coverage; watchlist toggle.

### 9.3 Game detail MUST show
- Observed signal trends separately from forecast distributions.
- Drivers of momentum and drivers of forecast change; source-linked news events.
- Comparable historical games and why they were selected.
- Prediction as-of date, model version, interval, calibration disclaimer, and outcomes when available.
- Official release history and clearly marked rumors/unconfirmed claims.
- Accessible color-independent statuses, responsive tables, keyboard controls, and loading/error/empty states.

### 9.4 User modes
A simple **Discover / Analyst** presentation toggle MAY change density and terminology, not underlying values. Same forecast cannot have different numerical values in different modes. Store preferences/watchlists locally with guarded `localStorage` access. No backend user profiles in MVP.

## 10. Security, governance, and operations

- MUST use secret env vars for Twitch/IGDB, OpenAI API, optional sources, and admin token; never bundle them into frontend.
- MUST log ingestion counts, failure rates, costs, quotas, and forecast-publish actions without leaking credentials or personal data.
- MUST show source provenance and distinguish first-party confirmation, editorial reporting, and rumors.
- MUST implement source-specific usage controls and respect attribution and retention terms.
- SHOULD implement a model card with data sources, target, training window, cohorts, known biases, evaluation, limitations, and update policy.
- SHOULD support reproducible training artifacts and versioned feature definitions.
- MUST preserve service continuity when IGDB or a secondary source fails; stale data gets a visible timestamp.
- MUST avoid exposing private API credentials in GitHub Pages, GitHub Actions logs, or public debug endpoints.

## 11. Cost and performance constraints

- Default to free/low-cost validated sources, incremental fetching, cached enrichment, and bounded cron shards.
- No paid market-data subscription or always-on GPU/ML server required for MVP.
- Track cost per source, per enrichment batch, and per published forecast; set a configurable daily spend ceiling.
- OpenAI enrichment processes only high-value matched articles, with schema validation and circuit breakers. Model ID and batch size remain configurable rather than hardcoded assumptions.
- API endpoints SHOULD serve cached results without live third-party requests.
- Before implementation, benchmark actual Worker CPU/subrequests, D1 writes/storage, KV use, and GitHub Actions limits against current plans.

## 12. Delivery plan and exit gates

### Phase 0 — Feasibility and licensing (P0)
Deliver: source registry; IGDB OAuth proof; verified feed manifest; Steam access review; YouTube quota review; current Cloudflare/OpenAI limits; availability and legality matrix; target-outcome data feasibility report. **Exit:** at least one legal, reproducible demand-signal source and one legal, reproducible launch-outcome source identified, or narrow the prediction scope.

### Phase 1 — Entity and evidence core (MVP foundation)
Deliver: migrated schema, IGDB sync, aliases, date precision/history, claim verification, calendar/delays, article enrichment, operational health. **Exit:** canonical matching and date-change tests pass; outage resilience demonstrated.

### Phase 2 — Discovery and momentum (MVP public)
Deliver: approved signal ingestion, long-term daily aggregates, explainable index, peer normalization, Discover/Trending UI, watchlist, methodology, briefing. **Exit:** no fabricated values, provenance and missingness visible, source rights cleared.

### Phase 3 — Forecast validation (conditional MVP/P2)
Deliver: historical outcome dataset, reproducible snapshot features, cohort baseline, chronological backtest, model card, immutable forecast publishing. **Exit:** prespecified out-of-time calibration/performance thresholds pass; otherwise launch with momentum only and clearly mark forecasts unavailable.

### Phase 4 — Analyst intelligence (P2)
Deliver: CCU intervals, comparable drilldowns, analyst filters, forecast accuracy, optional authorized community/video feeds, export, alerts. **Exit:** evaluated live forecasts and model-drift monitoring.

## 13. Acceptance tests

1. **Entity resolution:** GTA 6 / GTA VI / Grand Theft Auto VI map to one canonical game; remasters/editions do not merge incorrectly.
2. **Date precision:** 2027, Q2 2027, and a precise day are represented as ranges and sorted without false exactness.
3. **Confirmed delay:** 2026 -> Q1 2027 writes one atomic confirmed date transition; repeat ingestion is idempotent.
4. **Rumor isolation:** unconfirmed date claim never mutates calendar or confirmed date history.
5. **Provenance:** every numerical signal links to source, unit, collection time, and status.
6. **Missingness:** unavailable Steam follower count is missing, not zero; UI visibly reduces coverage.
7. **History:** daily signal aggregates persist beyond 90 days and can reconstruct as-of snapshots.
8. **No leakage:** a 30-days-prelaunch snapshot cannot access post-launch values, future corrected release dates, or later model statistics.
9. **Chronological evaluation:** held-out games occur after training cutoff; no game appears in both training and test partitions.
10. **Calibration gate:** unvalidated model cannot publish probability; API returns `insufficient_data` with reason codes.
11. **Immutable prediction:** rerunning forecast ingestion never alters a published forecast; newer versions append.
12. **Evaluation:** actual outcome is matched to the original target/window and scored only after observation window closes.
13. **Degraded service:** 24-hour IGDB outage does not stop cached frontend/news; health reports degraded freshness.
14. **Access:** unauthenticated admin writes fail; public routes cannot trigger expensive source ingestion.
15. **Cost:** full day of scheduled runs stays within configured budget and verified per-invocation limits.
16. **Explainability:** forecast detail exposes target, peer definition, model version, as-of, limitations, and evidence links.
17. **UX:** mobile discovery and analyst detail display same underlying values and use accessible non-color-only status indicators.
18. **Source governance:** disabled or unapproved sources produce no scheduled automated requests.

## 14. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Historical launch labels inaccessible | No defensible supervised forecasts | P0 feasibility gate; launch descriptive momentum first |
| Steam-focused outcomes exclude console success | Misleading cross-platform claims | Platform-specific labels and prominent scope disclaimer |
| SteamDB/public chart access restrictions | Missing strong PC demand proxy | Permission/license gate; alternative authorized sources |
| High-profile franchise bias | AAA dominates rankings | Genre/platform/lead-time cohort normalization |
| Selection and survivorship bias | Inflated accuracy | Include unsuccessful/low-visibility historical launches where measurable; report coverage |
| Thin samples / sparse indie signals | Unstable probabilities | Abstention and wide intervals; minimum cohort gate |
| News syndication and marketing spikes | Artificial momentum | Cluster duplicate stories; use sustained velocity |
| IGDB date lag | Calendar stale | Primary-source verified claims; display source freshness |
| LLM entity mistakes | Misattributed events | Candidate restrictions, schema validation, human review queue |
| Time leakage | Invalid backtests | As-of feature snapshots and chronological splits |
| API/terms changes | Ingestion interruptions | Source registry, circuit breakers, substitution plan |
| Free-tier limits and shared account quotas | Unreliable schedules | Measure quotas; incremental sharding; spend cap |

## 15. Open decisions requiring evidence before code

1. Which permitted source will provide reproducible historical **Steam launch-week CCU** labels, including smaller games?
2. Can a legally accessible Steam-interest series be collected daily? If not, what signal replaces it?
3. What constitutes a valid breakout cohort and threshold, and how many historical games are available per cohort?
4. Are any sources or outputs intended for monetization? This changes source-license requirements.
5. What is the maximum daily/monthly operational budget, including OpenAI?
6. What is the forecast cadence, and what material change triggers a new forecast?
7. What are the pre-registered minimum calibration and predictive-performance thresholds?
8. Which platforms have enough comparable outcomes to support forecasts beyond PC?

## 16. Migration from v0.1

**Keep:** entity-centric IGDB foundation, separate deployment, release precision, canonical aliases, news linkage, validated feed ingestion, OpenAI-assisted classification, circuit breakers, scan/debug tooling, local watchlist, Pearlescent shell.

**Modify:** default Calendar -> Discover; `hype_score` -> clearly labeled momentum; `signals` 90-day pruning -> persistent daily history; article date claims -> separate verification queue; watchlist priority -> bounded; briefing -> add forecast-change summary; model ID and quotas -> configuration plus verification.

**Add:** source rights registry, time-series provenance, historical outcomes, immutable forecast snapshots, comparable cohorts, evaluation/model cards, offline training, forecast-publication gates, analyst view, accuracy dashboard.

**Do not claim:** validated predictive power, actual wishlists, sales forecasts, or cross-platform success until supported by licensed data and measured out-of-time evaluation.

---

**Recommended initial release positioning:** “Discover tomorrow's standout games using transparent momentum signals and verified release intelligence.” Add “forecast breakout probability” only when the prediction validation gate has been met.


## 17. OpenAI integration decision (approved direction, implementation pending)

- **Decision:** Replace Claude/Anthropic-based enrichment with OpenAI API models. Do not require Anthropic credentials or include Anthropic SDK dependencies in new code.
- **MUST:** Use `OPENAI_API_KEY` as a server-side Worker secret; `OPENAI_ENRICH_MODEL` and `OPENAI_BRIEF_MODEL` as configurable model identifiers. Confirm available model IDs, pricing, structured-output support, and rate limits at integration time; do not assume a specific model is available.
- **SHOULD:** Use a low-cost OpenAI mini-class model for article classification, entity disambiguation, and structured event extraction. Reserve a more capable OpenAI model for genuinely ambiguous investigations or higher-value weekly summaries only when justified by cost/quality tests.
- **MUST:** Prefer deterministic alias/entity matching first. LLM only confirms candidate IDs, identifies news event types, extracts cited release-date claims, and produces grounded explanations. Unknown titles go to a review queue.
- **MUST:** Enforce JSON-schema-validated responses, batch limits, retry/backoff, token/cost logging, input sanitization, timeout/circuit breaker, and a configurable spend ceiling. Do not trust article text as instructions.
- **MUST:** No OpenAI calls from the public browser; all model requests run behind authenticated/configured Worker routes or authorized scheduled jobs. No secrets in GitHub Pages or frontend bundles.
- **MUST:** AI prose may explain model results but may not invent forecast numbers, measured signals, citations, or confidence.
- **MUST:** Quantitative predictions remain independently trained/evaluated statistical models (e.g., Python/scikit-learn). OpenAI is not the source of numeric probability estimates.
- **NOTE:** A ChatGPT subscription and OpenAI API billing/credentials are separate; the deployed application requires an OpenAI API project/key and applicable API charges.

## 18. Project implementation status (2026-10-10)

**Authoritative status supplied by the project owner: Game Signal Tracker is being built from scratch. There is no accepted existing prototype or implementation to extend.** Previous conversation messages described a generated demonstration, but the owner has explicitly corrected that characterization. Treat any previously generated demonstration files as non-authoritative and out of scope; do not use them as the starting codebase unless the owner later requests it.

**Not yet implemented or verified:** Game Signal Tracker frontend, IGDB/Steam integrations, live news/RSS ingestion, historical signal collection, D1/KV persistence, Cloudflare Worker endpoints/cron, OpenAI API integration, forecasting models, backtesting, automated tests, and production deployment.

**First implementation deliverable:** a new application repository, functional frontend and backend with real approved data, deployment instructions, and automated tests. Forecast probabilities must remain unavailable until validated. All example screenshots or fixture data must be labeled synthetic.

## 19. Engineering build contract and next implementation milestones

1. **Preserve v0.1 and v0.2 files as historical baselines; treat this consolidated v0.3 file as the controlling requirements source** for new implementation decisions. Record every material deviation in an explicit change log.
2. **Repo structure SHOULD:** `frontend/` (static UI), `worker/` (Cloudflare API and cron), `migrations/` (D1 SQL), `pipelines/` (ingestion and matching), `forecasting/` (offline Python training/scoring), `tests/`, `docs/`, `.github/workflows/`.
3. **Milestone A — Working real-data application:** source registry and terms checks; IGDB token lifecycle; canonical game/release schema and change history; Worker read endpoints; build the frontend using real IGDB game records; preserve clear freshness and attribution labels. No prediction claims.
4. **Milestone B — Evidence pipeline:** validate RSS/official feeds; ingest, canonicalize, match games, dedupe events, and enrich via OpenAI; review unmatched entities and date claims; source provenance and error telemetry.
5. **Milestone C — Descriptive discovery:** collect permitted longitudinal signals; implement missingness-aware momentum index, peer normalization, trend charts, explainable components, and watchlist. Maintain historical aggregates.
6. **Milestone D — Forecast research:** secure historical outcome labels, freeze target/cohort definitions, create point-in-time feature sets, train baseline, backtest chronologically, evaluate calibration and interval coverage; publish only when gates pass.
7. **Milestone E — Production hardening:** automated unit/integration tests, security checks, quota/cost alarms, model/data cards, source license review, operational runbook, monitoring, and deploy workflow.
8. **Acceptance for 'working application':** user can load the frontend, query actual canonical game data through Worker, filter/calendar/watchlist, inspect verified source-backed release changes and article evidence, and see honest 'insufficient data' statuses wherever forecasts are not validated.
9. **No credentials supplied yet:** Obtain IGDB/Twitch OAuth client credentials, Cloudflare account configuration, and OpenAI API key through deployment secrets only. Do not request secrets in chat or commit them to a repository.
10. **Prioritize integration and reproducibility over adding features:** start from a clean repository; prioritize real, licensed data with stable entity identity and history.

## 20. Decision log / unresolved questions

| Topic | Decision / status |
|---|---|
| User audiences | **Decided:** gamers + industry professionals |
| Product direction | **Decided:** predictive intelligence with transparent descriptive discovery |
| Language model provider | **Decided:** OpenAI instead of Claude/Anthropic |
| Quantitative forecasting | **Decided:** independent statistical models; no LLM-invented probabilities |
| Hosting baseline | **Proposed:** GitHub Pages + Cloudflare Worker/D1/KV; verify quotas |
| Existing Game Signal Tracker application | **Not built:** start from scratch |
| Data access and commercial licensing | **Unresolved:** must validate each source |
| OpenAI exact model IDs and pricing | **Unresolved:** verify when implementing |
| Historical Steam CCU data source | **Unresolved:** prerequisite to publish breakout forecasts |
| Daily/monthly spending cap | **Unresolved:** decide before enabling automated model calls |
| Revenue / monetization intent | **Unresolved:** may change permitted data sources |
| First live deployment | **Not performed** |

## 21. References and continuity

- Public inspiration: `https://siegeviperx.github.io/Ai-signal-tracker/?v=3` (user's existing AI Signal Tracker; no assertion that the live site was audited in this document).
- Original requirements: `game-signal-tracker-requirements.md` (v0.1).
- Prior predictive design: `game-signal-tracker-v0.2-requirements.md`.
- No existing Game Signal Tracker prototype is accepted as a project baseline. Build from scratch.
- Companion conversation handoff: `GAME_SIGNAL_TRACKER_PROJECT_HANDOFF.md`.
- External-source claims are **not newly verified** in this consolidation. Retain `[VERIFY]` flags and re-check access/terms/current API limits during Phase 0.
