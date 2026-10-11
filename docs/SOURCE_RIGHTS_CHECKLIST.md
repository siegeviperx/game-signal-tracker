# C2 source approval gate — do not skip

**Every new provider is DISABLED in migration 0006.** The implementation does not imply permission to collect, store, display, or commercially reuse data. No source is enabled merely by deploying the ZIP. This is a checklist to complete before activation, not a grant of rights.

| Source ID | Technical method | Specific review needed | Default |
|---|---|---|---|
| `twitch_category_viewers` | Official Twitch Helix Get Games by `igdb_id`, then Streams by `game_id` | Twitch developer terms, authorization, quota, data retention, public reuse and attribution | Disabled / review required |
| `youtube_video_views` | YouTube Data API `videos.list(part=statistics,id=...)` | Google API key project, YouTube API Services Terms/Developer Policies, refresh/retention, public display, commercial use, quota, channel-owner identification | Disabled / review required |
| `editorial_rss` | Approved publisher RSS/Atom metadata | Each publisher's RSS syndication rights, metadata use/retention, attribution, robots/terms, copyright, redirect behavior | Disabled / review required |
| `steam_current_players` | Existing Steam ISteamUserStats API | Existing separate source gate; rights must be reviewed independently | Unchanged |

Official references for owner review:
- Twitch Helix: https://dev.twitch.tv/docs/api/reference/#get-games and https://dev.twitch.tv/docs/api/reference/#get-streams
- Twitch developer agreement: https://www.twitch.tv/p/en/legal/developer-agreement/
- YouTube videos.list: https://developers.google.com/youtube/v3/docs/videos/list
- YouTube API developer policies: https://developers.google.com/youtube/terms/developer-policies
- YouTube quotas: https://developers.google.com/youtube/v3/determine_quota_cost
- For each editorial source, inspect the publisher's current feed, license, redistribution and machine-access terms individually. **No publisher feed URLs are seeded or assumed approved.**

## Activation evidence required

Record source name, access agreement, permitted collection fields, rate limit/quota, whether automated historical storage is permitted, retention duration, attribution language, commercial-use constraints, cost budget, reviewer/date, and evidence URL. Store this rationale in `signal_source_registry.review_notes` or your governance tracking documentation. For RSS, each actual `editorial_feeds.feed_url` must separately be reviewed.

Before adding Twitch mappings or collecting data, `signal_source_registry.enabled=1` AND `rights_status='approved'` for that source. For scheduled operation an additional Worker environment flag must equal `true` (`TWITCH_COLLECTION_ENABLED`, `YOUTUBE_COLLECTION_ENABLED`, or `EDITORIAL_COLLECTION_ENABLED`). Absent flags default to off. Admin-only manual collection can run after rights approval, even if the cron flag is off.

If source rights change, set `enabled=0` and `rights_status='suspended'` promptly. Historical publication and storage may need removal under the relevant terms; simply disabling new collection may not satisfy licensing requirements.

## Measurement semantics

- Twitch `top_100_live_stream_viewers_sampled` = sum of viewers for at most the first 100 returned streams. It does **not** include all streams and is not a verified total category audience.
- YouTube `cumulative_video_views` = point-in-time public count for one independently reviewed video; not unique viewers, game sales, or all promotional activity. Video identities are stored independently to avoid double counting.
- Editorial headlines are *unverified game-association candidates* until explicitly reviewed. Article links do **not** confirm release dates or factual publisher claims.
- Steam `concurrent_players_sampled` is an instantaneous measurement, not a true daily or launch-week peak.
- The provisional momentum index needs two independent sources, matching genre/platform peers, and sufficient historical observations. It is not a statistical forecast.
