-- Game Signal Tracker C1: additive multi-listing and source-neutral signal foundation.
-- Existing mappings, verified flags and IGDB primary keys are not replaced.
-- Wrangler runs each migration once, in filename order.
ALTER TABLE external_game_ids ADD COLUMN variant_code TEXT;
UPDATE external_game_ids SET variant_code = 'a' WHERE variant_code IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_external_game_variant
  ON external_game_ids(game_id,variant_code) WHERE variant_code IS NOT NULL;

-- Source approval is separate from the legacy IGDB source registry.
-- Newly defined feeds cannot run until BOTH enabled=1 and rights_status='approved'.
CREATE TABLE IF NOT EXISTS signal_source_registry (
  source_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  description TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  rights_status TEXT NOT NULL DEFAULT 'review_required'
    CHECK (rights_status IN ('review_required','approved','denied','suspended')),
  access_method TEXT NOT NULL,
  attribution TEXT,
  review_notes TEXT,
  approved_at INTEGER,
  last_success_at INTEGER,
  last_failure_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT OR IGNORE INTO signal_source_registry
 (source_id,provider,description,enabled,rights_status,access_method,attribution)
VALUES ('steam_current_players','steam',
 'Sampled concurrent players at request time; NOT peak CCU, wishlists, sales or prelaunch demand',
 0,'review_required','Steam ISteamUserStats/GetNumberOfCurrentPlayers API',
 'Steam; retain app ID, UTC observation time and collection status');

-- Game-level and listing-level observations share one extensible design:
--  scope='game'     => mapping_id NULL, identity_key='game:<IGDB_ID>'
--  scope='listing'  => mapping_id non-NULL, identity_key='listing:<mapping ID>'
-- No null-uniqueness loophole: identity_key is always non-null.
CREATE TABLE IF NOT EXISTS signal_observations (
  id INTEGER PRIMARY KEY,
  game_id INTEGER NOT NULL REFERENCES games(id),
  mapping_id INTEGER REFERENCES external_game_ids(id),
  identity_key TEXT NOT NULL CHECK (length(identity_key)>0),
  scope TEXT NOT NULL CHECK (scope IN ('game','listing')),
  source_id TEXT NOT NULL REFERENCES signal_source_registry(source_id),
  platform TEXT,
  metric TEXT NOT NULL,
  unit TEXT NOT NULL,
  observed_at INTEGER NOT NULL,
  collected_at INTEGER NOT NULL DEFAULT (unixepoch()),
  collection_status TEXT NOT NULL CHECK (collection_status IN ('observed','missing')),
  value REAL,
  missing_reason TEXT,
  evidence_url TEXT,
  CHECK ((scope='listing' AND mapping_id IS NOT NULL) OR
         (scope='game' AND mapping_id IS NULL)),
  CHECK ((collection_status='observed' AND value IS NOT NULL AND missing_reason IS NULL)
      OR (collection_status='missing' AND value IS NULL AND missing_reason IS NOT NULL)),
  UNIQUE (source_id,identity_key,metric,observed_at)
);
CREATE INDEX IF NOT EXISTS ix_signals_game_time ON signal_observations(game_id,observed_at DESC);
CREATE INDEX IF NOT EXISTS ix_signals_source_time ON signal_observations(source_id,observed_at DESC);

-- Durable daily rollups; each external listing or canonical game is independent.
-- Sample maximum is NOT a true daily peak, and values are never summed across SKUs.
CREATE TABLE IF NOT EXISTS signal_daily (
  game_id INTEGER NOT NULL REFERENCES games(id),
  mapping_id INTEGER REFERENCES external_game_ids(id),
  identity_key TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('game','listing')),
  source_id TEXT NOT NULL REFERENCES signal_source_registry(source_id),
  platform TEXT,
  metric TEXT NOT NULL,
  unit TEXT NOT NULL,
  day_utc TEXT NOT NULL,
  observed_count INTEGER NOT NULL DEFAULT 0,
  missing_count INTEGER NOT NULL DEFAULT 0,
  value_min REAL,
  value_max REAL,
  value_last REAL,
  last_observed_at INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY(source_id,identity_key,metric,day_utc)
);
CREATE INDEX IF NOT EXISTS ix_signal_daily_game_day ON signal_daily(game_id,day_utc DESC);

CREATE TABLE IF NOT EXISTS signal_collection_runs (
  id INTEGER PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES signal_source_registry(source_id),
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  processed INTEGER NOT NULL DEFAULT 0,
  observed INTEGER NOT NULL DEFAULT 0,
  missing INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('running','complete','partial','failed')),
  next_cursor INTEGER,
  error_code TEXT
);
