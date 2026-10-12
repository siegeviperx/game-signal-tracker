-- C2: additive multi-source research foundation. No data sources auto-enabled.
-- Requires 0005_signal_foundation.sql to have been applied. Existing mapping rows unchanged.
INSERT OR IGNORE INTO signal_source_registry
  (source_id, provider, description, enabled, rights_status, access_method, attribution)
VALUES
  ('twitch_category_viewers','twitch',
   'Snapshot of viewers in up to 100 public streams for a verified Twitch category; NOT full Twitch audience',
   0,'review_required','Twitch Helix /streams with category ID','Twitch Helix; collection timestamp and category ID'),
  ('youtube_video_views','youtube',
   'Official or approved video-level cumulative views; NOT game sales or unique viewers',
   0,'review_required','YouTube Data API v3 videos.list','YouTube Data API; video ID and timestamp'),
  ('editorial_rss','editorial',
   'Article metadata from explicitly reviewed RSS/Atom feeds; articles require game-link review',
   0,'review_required','Publisher/editorial RSS or Atom feed','Publisher/feed title, source URL, published date');

-- Twitch category IDs are stored in existing external_game_ids using provider=twitch.
-- YouTube video IDs are assets, NOT game-platform IDs.
CREATE TABLE IF NOT EXISTS game_video_assets (
 id INTEGER PRIMARY KEY,
 game_id INTEGER NOT NULL REFERENCES games(id),
 provider TEXT NOT NULL DEFAULT 'youtube' CHECK (provider='youtube'),
 video_id TEXT NOT NULL UNIQUE CHECK(length(video_id)=11),
 title TEXT,
 official_status TEXT NOT NULL DEFAULT 'candidate'
   CHECK(official_status IN ('candidate','verified','rejected')),
 identity_evidence_url TEXT,
 created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 verified_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_video_game ON game_video_assets(game_id,official_status);

-- Review must approve the exact feed URL independently of source-level rights approval.
CREATE TABLE IF NOT EXISTS editorial_feeds (
 id INTEGER PRIMARY KEY,
 source_id TEXT NOT NULL REFERENCES signal_source_registry(source_id),
 publisher TEXT NOT NULL,
 feed_url TEXT NOT NULL UNIQUE,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
 review_status TEXT NOT NULL DEFAULT 'review_required'
   CHECK (review_status IN ('review_required','approved','denied','suspended')),
 reviewed_at INTEGER,
 last_success_at INTEGER,
 last_error_code TEXT,
 created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS editorial_articles (
 id INTEGER PRIMARY KEY,
 feed_id INTEGER NOT NULL REFERENCES editorial_feeds(id),
 url TEXT NOT NULL UNIQUE,
 title TEXT NOT NULL,
 published_at INTEGER,
 discovered_at INTEGER NOT NULL DEFAULT (unixepoch()),
 updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_article_date ON editorial_articles(published_at DESC);
CREATE TABLE IF NOT EXISTS editorial_game_links (
 article_id INTEGER NOT NULL REFERENCES editorial_articles(id),
 game_id INTEGER NOT NULL REFERENCES games(id),
 match_status TEXT NOT NULL DEFAULT 'candidate'
   CHECK (match_status IN ('candidate','verified','rejected')),
 match_method TEXT NOT NULL,
 verified_at INTEGER,
 PRIMARY KEY(article_id,game_id)
);
CREATE INDEX IF NOT EXISTS idx_ed_game_status ON editorial_game_links(game_id,match_status);

-- Per-request bounded run diagnostics for reproducible audits.
CREATE INDEX IF NOT EXISTS idx_source_runs ON signal_collection_runs(source_id,started_at DESC);
