# Game Signal Tracker — Milestone A (working source foundation)

**Authoritative specification:** `docs/TECHNICAL_REQUIREMENTS.md` v0.3. **Handoff:** `docs/PROJECT_HANDOFF.md`.

A free public game-discovery site with a static GitHub Pages frontend, Cloudflare Worker read API, D1 database, KV-backed IGDB OAuth cache, and an authorized IGDB sync. Future paid analyst features are architectural extension points, **not implemented**. No fake game data, no claimed forecasts.

## Implemented
- Responsive Discover, Calendar (date-sorted view), browser-local watchlist, search/platform filters, game details, analyst density toggle, transparent unavailable-forecast status.
- `GET /games`, `/calendar`, `/game/:id`, `/health`, `/stats`, `/forecasts/:id` (explicitly unavailable), authenticated `POST /admin/sync-igdb`.
- IGDB OAuth token cache, bounded synchronization, canonical game IDs, release precision, observed date changes, D1 migrations, six-hour cron, basic unit tests.

## Important limitations
- This is a source-code milestone, **not a deployed live application**. Live IGDB records appear only after credentials, rights review, source approval, migrations, and initial sync.
- The current IGDB sync is bounded to the first batch of upcoming releases, not yet a comprehensive 12-month/TBA catalog; pagination and backfill are next.
- IGDB date changes are *observations*, **not verified official delay announcements**. First-party verification and claim review are next milestone.
- No article ingestion, historical signals, momentum, ML training, paid accounts, or validated probabilities yet. Calendar is currently a chronological card view, not a month grid.
- Source access/rights and current Cloudflare limits require independent verification before public deployment. This code does not assert a license grant.

## Local setup
1. Install Node 22+, run `npm install` and `npm test`.
2. Create a Cloudflare D1 database `game-signal-tracker-db` and KV namespace, and replace placeholder IDs in `worker/wrangler.toml`.
3. Run `npm run db:migrate:local` (or `npm run db:migrate:remote` for the deployed database).
4. After confirming IGDB/Twitch API terms and permitted use, configure Worker secrets with `npx wrangler secret put IGDB_CLIENT_ID --config worker/wrangler.toml`, similarly `IGDB_CLIENT_SECRET` and `ADMIN_TOKEN`. Do not commit `.dev.vars` or secrets.
5. Explicitly approve the source after review: `npx wrangler d1 execute game-signal-tracker-db --remote --config worker/wrangler.toml --command "UPDATE source_registry SET enabled=1,rights_status='APPROVED' WHERE source_id='igdb';"` (for local use replace `--remote` with `--local`).
6. Run `npm run dev` (Worker at `http://localhost:8787`). Trigger initial sync using a bearer token in a local HTTP client, not in the browser or source repository: `POST http://localhost:8787/admin/sync-igdb` with header `Authorization: Bearer <ADMIN_TOKEN>`.
7. Serve frontend with `cd frontend && python -m http.server 8000`. Open `http://localhost:8000`.
8. For production: deploy Worker with `npm run deploy:worker`, update `frontend/config.js` with Worker HTTPS URL, update `CORS_ORIGIN` to the actual GitHub Pages origin, then publish the `frontend/` directory via GitHub Pages. Never place OAuth or admin secrets in frontend files.

## Next engineering increments
- Source rights and terms matrix with recorded approval evidence.
- Comprehensive IGDB cursor/pagination sync, TBA coverage, aliases and edition distinction, robust region/date precision mapping.
- Primary-source release verification and atomic confirmed date history; article/evidence pipeline.
- Additional integration tests against local D1, pagination totals, CORS hardening and abuse controls.

## Future commercial design
Public endpoints remain read-only. Later analyst capabilities should use separate authenticated routes, entitlement checks, rate limits and permitted commercial data licenses; no account or payment dependency is introduced in MVP.
