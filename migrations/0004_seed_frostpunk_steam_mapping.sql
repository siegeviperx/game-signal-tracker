-- Milestone C1: first verified external provider mapping.
-- User verified the official Steam listing for original Frostpunk (App ID 323190).
-- Canonical IGDB game id 23248 was confirmed in the existing games table.
-- Safe to re-run; never overwrite an existing provider ID mapping.

INSERT INTO external_game_ids
  (game_id, provider, external_id, match_status, match_method, verified_at)
SELECT 23248, 'steam', '323190', 'verified',
       'manual_official_steam_listing', unixepoch()
WHERE EXISTS (SELECT 1 FROM games WHERE id = 23248 AND name = 'Frostpunk')
  AND NOT EXISTS (
    SELECT 1 FROM external_game_ids
    WHERE provider = 'steam' AND external_id = '323190'
  );
