CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY, slug TEXT, name TEXT NOT NULL, summary TEXT,
  cover_url TEXT, genres_json TEXT NOT NULL DEFAULT '[]', platforms_json TEXT NOT NULL DEFAULT '[]',
  igdb_updated_at INTEGER, synced_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_games_name ON games(name);
CREATE TABLE IF NOT EXISTS aliases (
  game_id INTEGER NOT NULL REFERENCES games(id), alias TEXT NOT NULL,
  PRIMARY KEY(game_id,alias)
);
CREATE TABLE IF NOT EXISTS release_dates (
  game_id INTEGER NOT NULL REFERENCES games(id), igdb_release_id INTEGER NOT NULL,
  platform TEXT, region TEXT, precision TEXT NOT NULL, label TEXT NOT NULL,
  start_at INTEGER, end_at INTEGER, confirmed INTEGER NOT NULL DEFAULT 0,
  observed_at INTEGER NOT NULL, PRIMARY KEY(game_id,igdb_release_id)
);
CREATE INDEX IF NOT EXISTS idx_release_start ON release_dates(start_at);
CREATE TABLE IF NOT EXISTS date_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER NOT NULL, igdb_release_id INTEGER NOT NULL,
  previous_label TEXT, new_label TEXT NOT NULL, changed_at INTEGER NOT NULL,
  UNIQUE(game_id,igdb_release_id,previous_label,new_label)
);
CREATE TABLE IF NOT EXISTS source_registry (
  source_id TEXT PRIMARY KEY, name TEXT NOT NULL, access_method TEXT,
  rights_status TEXT NOT NULL, attribution TEXT, enabled INTEGER NOT NULL DEFAULT 0,
  refresh_minutes INTEGER, last_success_at INTEGER, notes TEXT
);
CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL UNIQUE,
  source_id TEXT, published_at INTEGER, ingested_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS article_games (
  article_id TEXT NOT NULL, game_id INTEGER NOT NULL,
  PRIMARY KEY(article_id,game_id)
);
CREATE TABLE IF NOT EXISTS event_claims (
  id TEXT PRIMARY KEY, game_id INTEGER NOT NULL, article_id TEXT,
  claim_type TEXT NOT NULL, claimed_label TEXT, evidence_url TEXT,
  evidence_class TEXT NOT NULL, verification_status TEXT NOT NULL,
  observed_at INTEGER NOT NULL, resolved_at INTEGER
);
CREATE TABLE IF NOT EXISTS scan_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT NOT NULL,
  started_at INTEGER NOT NULL, completed_at INTEGER, status TEXT NOT NULL,
  fetched INTEGER NOT NULL DEFAULT 0, error TEXT
);
INSERT OR IGNORE INTO source_registry(source_id,name,access_method,rights_status,enabled,notes)
VALUES ('igdb','IGDB','Twitch OAuth + IGDB API','PENDING_REVIEW',0,'Enable only after access and license verification');
