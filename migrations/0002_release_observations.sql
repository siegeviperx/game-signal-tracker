-- Milestone B: immutable observation snapshots for release-date history.
-- This does not backfill prior observations or imply first-party confirmation.
CREATE TABLE IF NOT EXISTS release_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  igdb_release_id INTEGER NOT NULL,
  platform TEXT,
  region TEXT,
  precision TEXT NOT NULL,
  label TEXT NOT NULL,
  start_at INTEGER,
  end_at INTEGER,
  observed_at INTEGER NOT NULL,
  source_id TEXT NOT NULL DEFAULT 'igdb',
  UNIQUE(game_id, igdb_release_id, observed_at)
);
CREATE INDEX IF NOT EXISTS idx_release_observations_game ON release_observations(game_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_release_observations_release ON release_observations(igdb_release_id, observed_at DESC);
