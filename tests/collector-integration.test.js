import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {collectSteamSignals,listGameSignals,exportSignals} from '../worker/src/signals.js';

// Real SQLite execution catches SQL placeholder mistakes and migration regressions.
function mockD1(db){
  return {prepare(sql){return {
    bind(...args){return {
      async all(){return {results:db.prepare(sql).all(...args)};},
      async first(){return db.prepare(sql).get(...args)??null;},
      async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}
    };}
  };}};
}
test('approved collector inserts durable observations and can export research rows',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec(`CREATE TABLE games(id INTEGER PRIMARY KEY,name TEXT);
    CREATE TABLE external_game_ids(id INTEGER PRIMARY KEY,game_id INTEGER NOT NULL,provider TEXT NOT NULL,
      external_id TEXT NOT NULL,match_status TEXT NOT NULL,match_method TEXT NOT NULL,
      verified_at INTEGER, UNIQUE(provider,external_id),FOREIGN KEY(game_id) REFERENCES games(id));
    INSERT INTO games VALUES(23248,'Frostpunk');
    INSERT INTO external_game_ids VALUES (1,23248,'steam','323190','verified','manual',1234);`);
  db.exec(readFileSync(new URL('../migrations/0005_signal_foundation.sql',import.meta.url),'utf8'));
  db.exec("UPDATE signal_source_registry SET enabled=1,rights_status='approved' WHERE source_id='steam_current_players'");
  const old=globalThis.fetch;
  globalThis.fetch=async url=>{
    assert.match(url,/api\.steampowered\.com/);
    return {ok:true,async json(){return {response:{result:1,player_count:0}};}};
  };
  try{
    const env={DB:mockD1(db)};
    const r=await collectSteamSignals(env,{cursor:0,limit:5});
    assert.equal(r.status,'ok'); assert.equal(r.observed,1);assert.equal(r.done,true);
    assert.equal(db.prepare('SELECT count(*) AS n FROM signal_observations').get().n,1);
    const daily=await listGameSignals(env,23248);
    assert.equal(daily.rows.length,1);
    assert.equal(daily.rows[0].value_last,0);
    assert.equal(daily.rows[0].observed_count,1);
    assert.equal(daily.rows[0].identity_key,'listing:1');
    const exportPage=await exportSignals(env,{cursor:0,limit:20});
    assert.equal(exportPage.rows.length,1);
    assert.equal(exportPage.rows[0].match_status,'verified');
    assert.equal(exportPage.rows[0].scope,'listing');
    // At most one sample per observed-second: reruns cannot duplicate records.
    await collectSteamSignals(env,{cursor:0,limit:5});
    assert.equal(db.prepare('SELECT count(*) AS n FROM signal_observations').get().n,1);
    assert.equal(db.prepare('SELECT observed_count AS n FROM signal_daily').get().n,1);
  } finally{globalThis.fetch=old;db.close();}
});
