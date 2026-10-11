"""Additive C2 D1 migration smoke tests. Run: python3 tests/c2_migration_test.py"""
import sqlite3
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

class MigrationTest(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        self.db.executescript('''
          CREATE TABLE games(id INTEGER PRIMARY KEY,name TEXT);
          CREATE TABLE external_game_ids(
            id INTEGER PRIMARY KEY,game_id INTEGER NOT NULL,provider TEXT NOT NULL,
            external_id TEXT NOT NULL,match_status TEXT NOT NULL,match_method TEXT NOT NULL,
            verified_at INTEGER, created_at INTEGER DEFAULT (unixepoch()),
            UNIQUE(provider,external_id), FOREIGN KEY(game_id) REFERENCES games(id));
          INSERT INTO games(id,name) VALUES (23248,'Frostpunk'), (105490,'Altiros');
          INSERT INTO external_game_ids(game_id,provider,external_id,match_status,match_method)
            VALUES (23248,'steam','323190','verified','manual_official_steam_listing');
        ''')
        self.db.executescript((ROOT/'tests/fixtures/0005_signal_foundation_fixture.sql').read_text(encoding='utf-8'))
        self.db.executescript((ROOT/'migrations/0006_multisource_momentum.sql').read_text(encoding='utf-8'))
    def tearDown(self):self.db.close()
    def test_preserves_verified_and_disables_every_new_source(self):
        self.assertEqual(self.db.execute("SELECT variant_code,match_status FROM external_game_ids WHERE game_id=23248").fetchone(),('a','verified'))
        statuses=self.db.execute("SELECT source_id,enabled,rights_status FROM signal_source_registry ORDER BY source_id").fetchall()
        self.assertEqual(len(statuses),4)
        self.assertTrue(all(enabled==0 and status=='review_required' for _,enabled,status in statuses))
    def test_one_to_many_and_video_identity_and_editorial_review(self):
        self.db.execute("INSERT INTO external_game_ids(game_id,provider,external_id,match_status,match_method,variant_code) VALUES (23248,'twitch','999999','verified','official','b')")
        self.db.execute("INSERT INTO game_video_assets(game_id,video_id,official_status) VALUES (23248,'aBcDeFgH123','verified')")
        self.db.execute("INSERT INTO editorial_feeds(source_id,publisher,feed_url) VALUES ('editorial_rss','Example','https://example.org/rss')")
        self.db.execute("INSERT INTO editorial_articles(feed_id,url,title,published_at) VALUES (1,'https://example.org/story','Frostpunk interview',100)")
        self.db.execute("INSERT INTO editorial_game_links(article_id,game_id,match_method) VALUES (1,23248,'unique_title_candidate')")
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM external_game_ids WHERE game_id=23248").fetchone()[0],2)
        self.assertEqual(self.db.execute("SELECT official_status FROM game_video_assets").fetchone()[0],'verified')
        self.assertEqual(self.db.execute("SELECT match_status FROM editorial_game_links").fetchone()[0],'candidate')
    def test_independent_multi_source_observation(self):
        self.db.execute("INSERT INTO signal_observations(game_id,identity_key,scope,source_id,metric,unit,observed_at,collection_status,value) VALUES (23248,'youtube:video:aBcDeFgH123','game','youtube_video_views','cumulative_video_views','views',123,'observed',0)")
        self.db.execute("INSERT INTO signal_observations(game_id,identity_key,scope,source_id,metric,unit,observed_at,collection_status,value,missing_reason) VALUES (23248,'youtube:video:aBcDeFgH123','game','youtube_video_views','cumulative_video_views','views',124,'missing',NULL,'unavailable')")
        self.assertEqual(self.db.execute('SELECT value FROM signal_observations WHERE observed_at=123').fetchone()[0],0)
        self.assertIsNone(self.db.execute('SELECT value FROM signal_observations WHERE observed_at=124').fetchone()[0])
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO signal_observations(game_id,identity_key,scope,source_id,metric,unit,observed_at,collection_status,value) VALUES (23248,'youtube:video:aBcDeFgH123','game','youtube_video_views','cumulative_video_views','views',123,'observed',1)")

if __name__=='__main__': unittest.main()
