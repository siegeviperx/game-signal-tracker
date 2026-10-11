-- Milestone C1: external provider identifiers for canonical games.
-- Additive migration: preserves existing games and aliases.
-- Provider identifiers are not automatically verified by this migration.

CREATE TABLE IF NOT EXISTS external_game_ids (
    id INTEGER PRIMARY KEY,
    game_id INTEGER NOT NULL,
    provider TEXT NOT NULL CHECK (length(trim(provider)) > 0),
    external_id TEXT NOT NULL CHECK (length(trim(external_id)) > 0),
    match_status TEXT NOT NULL DEFAULT 'candidate'
        CHECK (match_status IN ('candidate', 'verified', 'rejected')),
    match_method TEXT NOT NULL,
    verified_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (game_id) REFERENCES games(id),
    UNIQUE (provider, external_id)
);

CREATE INDEX IF NOT EXISTS idx_external_game_ids_game_id
    ON external_game_ids(game_id);

CREATE INDEX IF NOT EXISTS idx_external_game_ids_status
    ON external_game_ids(provider, match_status);
