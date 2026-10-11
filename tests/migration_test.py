"""Run offline with python tests/migration_test.py. Simulates current production schema."""
import sqlite3
import unittest
from pathlib import Path


class SignalMigrationTest(unittest.TestCase):
    def setUp(self):
        self.con = sqlite3.connect(':memory:')
        self.con.execute('PRAGMA foreign_keys=ON')
        self.con.executescript('''
        CREATE TABLE games(id INTEGER PRIMARY KEY, name TEXT);
        CREATE TABLE external_game_ids(
          id INTEGER PRIMARY KEY,game_id INTEGER NOT NULL,provider TEXT NOT NULL,
          external_id TEXT NOT NULL,match_status TEXT NOT NULL,match_method TEXT NOT NULL,
          verified_at INTEGER,created_at INTEGER DEFAULT (unixepoch()),
          UNIQUE(provider,external_id),FOREIGN KEY(game_id) REFERENCES games(id));
        INSERT INTO games VALUES (23248,'Frostpunk'), (105490,'Altiros');
        INSERT INTO external_game_ids(game_id,provider,external_id,match_status,match_method)
          VALUES (23248,'steam','323190','verified','manual'),
                 (105490,'steam','744200','candidate','igdb');
        ''')
        migration = Path(__file__).resolve().parents[1] / 'migrations/0005_signal_foundation.sql'
        self.con.executescript(migration.read_text(encoding='utf-8'))

    def tearDown(self):
        self.con.close()

    def test_additive_migration_preserves_prior_mappings(self):
        rows = self.con.execute('SELECT game_id,external_id,match_status,variant_code FROM external_game_ids ORDER BY game_id').fetchall()
        self.assertEqual(rows, [(23248,'323190','verified','a'),(105490,'744200','candidate','a')])
        source = self.con.execute("SELECT enabled,rights_status FROM signal_source_registry WHERE source_id='steam_current_players'").fetchone()
        self.assertEqual(source, (0,'review_required'))
        self.con.execute("INSERT INTO external_game_ids(game_id,provider,external_id,match_status,match_method,variant_code) VALUES (105490,'steam','1419270','candidate','igdb','b')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.con.execute("INSERT INTO external_game_ids(game_id,provider,external_id,match_status,match_method,variant_code) VALUES (105490,'steam','999','candidate','igdb','b')")
        self.assertEqual(self.con.execute('SELECT COUNT(*) FROM external_game_ids').fetchone()[0],3)

    def test_distinct_listing_and_game_level_metrics_without_zero_filling(self):
        self.con.execute('''INSERT INTO signal_observations
          (game_id,mapping_id,identity_key,scope,source_id,platform,metric,unit,observed_at,collection_status,value)
          VALUES (23248,1,'listing:1','listing','steam_current_players','PC','sampled_ccu','players',10,'observed',0)''')
        self.con.execute('''INSERT INTO signal_observations
          (game_id,mapping_id,identity_key,scope,source_id,platform,metric,unit,observed_at,collection_status,value,missing_reason)
          VALUES (23248,1,'listing:1','listing','steam_current_players','PC','sampled_ccu','players',11,'missing',NULL,'temporarily_unavailable')''')
        self.con.execute('''INSERT INTO signal_observations
          (game_id,mapping_id,identity_key,scope,source_id,platform,metric,unit,observed_at,collection_status,value)
          VALUES (23248,NULL,'game:23248','game','steam_current_players','PC','aggregate_example','count',12,'observed',5)''')
        zero = self.con.execute("SELECT value FROM signal_observations WHERE observed_at=10").fetchone()[0]
        missing = self.con.execute("SELECT value FROM signal_observations WHERE observed_at=11").fetchone()[0]
        self.assertEqual(zero,0)
        self.assertIsNone(missing)
        with self.assertRaises(sqlite3.IntegrityError):
            self.con.execute('''INSERT INTO signal_observations
              (game_id,mapping_id,identity_key,scope,source_id,metric,unit,observed_at,collection_status,value)
              VALUES (23248,1,'listing:1','listing','steam_current_players','sampled_ccu','players',10,'observed',100)''')
        with self.assertRaises(sqlite3.IntegrityError):
            self.con.execute('''INSERT INTO signal_observations
              (game_id,mapping_id,identity_key,scope,source_id,metric,unit,observed_at,collection_status,value)
              VALUES (23248,NULL,'game:23248','listing','steam_current_players','bad','count',40,'observed',1)''')


if __name__ == '__main__':
    unittest.main()
