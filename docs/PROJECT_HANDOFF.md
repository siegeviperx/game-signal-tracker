# Game Signal Tracker — Project Handoff / Conversation Summary

**Updated:** 2026-10-10  
**Canonical requirements:** `game-signal-tracker-TECHNICAL_REQUIREMENTS.md` (consolidated v0.3)  
**Status:** Project owner confirms no existing Game Signal Tracker prototype. Build from scratch; no live implementation exists.

## 1. Origin and original request
The user has an AI Signal Tracker at `https://siegeviperx.github.io/Ai-signal-tracker/?v=3` and wants a video-game equivalent that goes beyond reporting news. They uploaded `game-signal-tracker-requirements.md` v0.1, derived from their AI Signal Tracker v4 architecture, and asked which sites to include and how to turn it into a **predictive forecaster for popular upcoming video games**.

## 2. v0.1 baseline
The original design was game-entity-centric, seeded by IGDB rather than article-centric, with platform/region release dates, precision and version history, aliases/entity resolution, linked news articles, delay tracking, hype ranking, watchlist, and briefings. It proposed GitHub Pages + Cloudflare Worker/D1/KV and Claude Haiku for enrichment. Sources included IGDB, Steam Store, Twitch, RSS news, Bing RSS, GDELT, optional YouTube/RAWG. Reddit was excluded from initial scope. Signals were originally pruned after 90 days.

## 3. Strategic change agreed in discussion
The assistant recommended **two user experiences**: (a) consumer discovery, upcoming games, trending/breakout watch, calendar, local watchlist; and (b) industry analysis, peer-normalized demand, comparables, forecast uncertainty, release risk, and validation. User explicitly chose **both** audiences.

The product must separate:
- observed measurements (provenance and timestamps),
- descriptive momentum scores (not forecasts),
- statistical predictions (calibrated only after testing), and
- measured post-launch outcomes.

Four forecast concepts were discussed: breakout probability, anticipated demand trajectory, launch performance (start with Steam launch-week peak CCU rather than unsupported sales estimates), and release-date uncertainty. Focus initial validated forecasts on PC; console discovery remains supported. Train using historical time-sliced snapshots, strict chronological evaluation, comparable cohorts, and published accuracy metrics. Historical signal data must persist longer than 90 days.

## 4. Sources discussed
Primary: IGDB; Steam Store; SteamDB as a research/benchmark candidate (do **not** mistake follower counts for actual wishlist totals). Demand/engagement candidates: YouTube official channels, Twitch, Google Trends. Editorial: IGN, GameSpot, PC Gamer, Polygon, Eurogamer, VGC, Gematsu, Rock Paper Shotgun, Nintendo Life, Push Square. Official: PlayStation Blog, Xbox Wire, Nintendo, Steam News, publisher newsrooms. Later/conditional: Reddit, ResetEra, Backloggd, Gamalytic, VG Insights, Newzoo. Each requires current licensing/API/terms and quota verification; do not assume scraping is permitted.

## 5. Architecture direction
Reuse the user's Pearlescent frontend look and inexpensive Cloudflare/GitHub deployment architecture, but add a long-term time-series store, source-rights registry, historical outcomes, immutable forecasts, evaluation tables, model/version tracking, and offline Python/scikit-learn training (e.g. scheduled GitHub Actions). LLMs handle entity disambiguation, event extraction, summarization, and grounded explanations—not numeric forecasting. Keep frontend and backend separated; secrets server-side only.

## 6. Model-provider decision
After discussion of v0.2 requirements and an assistant-described demonstration, the user asked whether to switch from Claude to ChatGPT versions. **Yes: OpenAI API is the selected provider** for article classification, entity matching where deterministic methods fail, structured event extraction, and briefings. Use configurable low-cost OpenAI models for routine tasks; verify exact available model IDs and pricing during build. No Anthropic dependency in the new implementation. The OpenAI API is billed/configured separately from a ChatGPT subscription. Quantitative forecasts remain independent statistical models.

## 7. Project artifacts and correction
- `game-signal-tracker-requirements.md`: original v0.1 design input.
- `game-signal-tracker-v0.2-requirements.md`: earlier predictive requirements draft, with some superseded Claude references.
- `game-signal-tracker-TECHNICAL_REQUIREMENTS.md`: **current consolidated source of truth**, including OpenAI integration and clean-start implementation plan.
- `GAME_SIGNAL_TRACKER_PROJECT_HANDOFF.md`: this continuity summary.

**Explicit owner correction:** There is **no existing Game Signal Tracker prototype**. Earlier assistant statements claiming a prototype was built are not to be used as the project baseline. Some demonstration files were generated during the conversation, but they are excluded from the authoritative handoff. The project must be implemented from scratch.

## 8. Actual build status
**Not built:** accepted Game Signal Tracker frontend, live IGDB/Steam integrations, news ingestion, Cloudflare Worker/D1/KV backend, OpenAI API integration, trained forecasting model, validated predictions, automated tests, or production deployment. Existing AI Signal Tracker is a separate inspiration, not a Game Signal Tracker codebase.

## 9. Immediate next steps for the new project
1. Read `game-signal-tracker-TECHNICAL_REQUIREMENTS.md` first. It overrides earlier requirements when they conflict.
2. Create the Game Signal Tracker repository and application from scratch; use the requirements and agreed product direction as the design baseline.
3. Phase 0: verify IGDB/Twitch access and terms, Steam/SteamDB access restrictions, approved feeds, OpenAI API model/pricing, Cloudflare quotas, and source for historical Steam CCU outcomes.
4. Create a modular repository, D1 schema/migrations, Worker API, IGDB sync, date history, and real-data frontend integration.
5. Add news ingestion + OpenAI enrichment, then historical signals and momentum.
6. Develop predictive model only once historical labels and time-aware feature snapshots are available; require evaluation before publishing probabilities.

## 10. Constraints and unresolved questions
- Aim for free/low-cost sources, minimal paid API spend, no always-on ML server.
- No fabricated actual wishlists, sales, release dates, confidence, or probabilities.
- Separate verified first-party announcements from rumors; do not let unconfirmed claims overwrite canonical dates.
- Need decisions on monthly budget, monetization intent, and permitted historical launch-outcome data.
- No live credentials or deployment are confirmed yet.

## 11. Copy/paste starter prompt for a new ChatGPT Project

> We're continuing the Game Signal Tracker project. Treat `game-signal-tracker-TECHNICAL_REQUIREMENTS.md` as the canonical source of truth and `GAME_SIGNAL_TRACKER_PROJECT_HANDOFF.md` as the conversation handoff. This is a gamer + industry predictive video game intelligence product inspired by my AI Signal Tracker. There is no existing Game Signal Tracker prototype or implementation; build it from scratch. We have chosen OpenAI API models instead of Claude for article enrichment and explanations, while statistical models handle real forecasting. Preserve Cloudflare Worker/D1/KV and GitHub Pages architecture unless justified otherwise. Start by establishing a new repository and building the real IGDB-backed MVP. Do not invent API access, forecast accuracy, or actual data. Maintain a changelog when requirements change.
