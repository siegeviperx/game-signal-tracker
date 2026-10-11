# C2 operations — start data collection without guesswork

## 1. Current operations and safe order

1. Deploy the source-neutral schema and Worker/UI overlay. Confirm `/sources`, `/trending`, `/game/23248/variants` respond.
2. Expand IGDB using its already approved integration: use `tools/run-c2-batch.ps1 -Task catalog -Scope upcoming -MaxBatches 20`. This requires the existing `ADMIN_TOKEN` entered locally and will process at most 25 games per request. The script keeps cursor checkpoints and response logs without storing the token. `scope=all` traverses the entire IGDB catalogue and can require many API calls; don't use it automatically or claim full coverage after a short run.
3. After source-rights review, activate Twitch in the **D1 Console** by changing an existing registry row (this is *not* a schema migration). Example, only after documented approval:

   ```sql
   UPDATE signal_source_registry
   SET enabled=1,rights_status='approved',approved_at=unixepoch(),
       review_notes='OWNER MUST REPLACE WITH ACTUAL REVIEW EVIDENCE AND DATE'
   WHERE source_id='twitch_category_viewers';
   ```

   Then run `tools/run-c2-batch.ps1 -Task twitch-map -MaxBatches 10` to map IGDB IDs to Twitch categories using official Helix Get Games. The crosswalk checks exact returned `igdb_id`, so you don't manually match ambiguous names. Run `-Task twitch` to collect a small batch after confirming quotas and source rights.
4. If YouTube Data API rights, quota, attribution and retention are approved, add `YOUTUBE_API_KEY` as a **Cloudflare Worker secret** in the dashboard, approve `youtube_video_views` in the D1 source registry, and import curator-reviewed video IDs in batches using `tools/import-reviewed-videos.ps1 -JsonPath <path>`. Candidate videos are not collected. Only verified video IDs with review evidence are collected using `-Task youtube`.
5. For editorial RSS, review **each exact feed URL** and publisher's terms. Approve `editorial_rss` source and separately insert approved feed rows into `editorial_feeds` with `review_status='approved'`, `enabled=1`. Example pattern (replace placeholder with real verified URL):

   ```sql
   INSERT INTO editorial_feeds(source_id,publisher,feed_url,review_status,enabled,reviewed_at)
   VALUES ('editorial_rss','REVIEWED PUBLISHER','https://verified.example/feed.xml','approved',1,unixepoch());
   ```

   Use `tools/run-c2-batch.ps1 -Task editorial` for controlled ingestion. Candidate title associations do not appear as confirmed evidence until reviewed through authenticated `/admin/editorial-review`.
6. Only after validating request volume, retention and cost, optionally enable scheduled collection by setting Worker environment flags to string `true`:
   `TWITCH_COLLECTION_ENABLED`, `YOUTUBE_COLLECTION_ENABLED`, `EDITORIAL_COLLECTION_ENABLED`. The existing six-hour cron performs small sharded collections. Without the flag, new source crons stay off even when registry approves the source.

## 2. Core API inventory

| Endpoint | Method / access | Use |
|---|---|---|
| `/admin/sync-igdb-page?scope=upcoming&cursor=0&limit=25` | POST, admin | Cursor IGDB backfill without replacing current sync |
| `/admin/match-twitch?cursor=0&limit=20` | POST, admin | Official Twitch IGDB-ID crosswalk; rights-gated |
| `/admin/collect-twitch?cursor=0&limit=3` | POST, admin | Sample up to three verified Twitch categories |
| `/admin/collect-youtube?cursor=0&limit=3` | POST, admin | Sample up to three curator-verified videos |
| `/admin/import-videos` | POST JSON, admin | Curate at most 25 video identities; requires proof for verified status |
| `/admin/collect-editorial?cursor=0&limit=2` | POST, admin | Fetch two source-approved editorial feeds |
| `/admin/editorial-review?cursor=0&limit=25` | GET, admin | Retrieve candidate article-game links |
| `/admin/editorial-review` | POST JSON, admin | Approve or reject article association |
| `/sources` | GET, public | Read source rights/readiness without tokens |
| `/trending` | GET, public | Gated descriptive momentum leaderboard |
| `/game/{igdb_id}/news` | GET, public | Reviewed article evidence only |

Article review body: `{"article_id":123,"game_id":23248,"decision":"verified"}` or `"rejected"`. These decisions review *article-to-game association*, not an article's assertions or the release date.

## 3. Data rules

- Keep `external_game_ids` canonical IDs and all existing variants, including `23248.a`, intact. Twitch IDs get separate suffixes under the same IGDB game. YouTube videos use `game_video_assets`, not `external_game_ids`.
- No SteamDB scraping, Google Trends scraping, Reddit scraping, paywall bypass, or invented wishlists/sales.
- Missing values stay null; real zero observations remain zero. Store source, timestamp, unit and identity.
- Never add counts across multiple Steam variants or across unrelated YouTube videos. Twitch sample includes at most top 100 streams and **does not** represent all game-category viewers.
- No numeric forecasts or global “success score” without labeled outcomes, point-in-time validation and calibration.

## 4. Safe operational rollback

- To stop an approved feed, set its `enabled=0` and `rights_status='suspended'` in `signal_source_registry` (plus relevant cron flag false). Do **not** delete D1 migrations or drop tables.
- To roll back a bad Worker/frontend deployment, revert the committed code in GitHub; D1 migration is additive and remains applied. Avoid trying to run `0006` again by hand.
- If rights require removal of historical records, determine retention actions from the terms review; merely stopping ingestion may be insufficient.
- If an upstream collector returns `disabled` or `configuration_required`, do not retry endlessly. Check registry approval, credentials and quota.

## 5. Research/forecasting usage

`forecasting/build_snapshot.py` (included if absent from earlier batch) produces point-in-time research features from the authenticated JSONL signal export. It **does not train or publish** forecasts. Candidate-mapped variants are excluded from training by default. Model development requires permitted historical outcomes, representative cohorts and chronological holdouts.
