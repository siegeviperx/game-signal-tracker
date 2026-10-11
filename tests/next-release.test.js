import test from 'node:test';
import assert from 'node:assert/strict';
import {suffixForIndex,nextSuffix,variantLabel} from '../worker/src/variants.js';
import {parseSteamPlayerCount,dayUTC,sourceApproved,aggregateSnapshot,collectSteamSignals} from '../worker/src/signals.js';
import {matchExternalIds} from '../worker/src/igdb.js';

test('variant suffixes remain stable beyond z',()=>{
  assert.equal(suffixForIndex(0),'a');assert.equal(suffixForIndex(25),'z');
  assert.equal(suffixForIndex(26),'aa');assert.equal(suffixForIndex(27),'ab');
  assert.equal(nextSuffix(['a','b','d']),'c');
  assert.equal(variantLabel(105490,'b'),'105490.b');
});
test('Steam zero is an observed zero; invalid/missing is null',()=>{
  assert.equal(parseSteamPlayerCount({response:{result:1,player_count:0}}),0);
  assert.equal(parseSteamPlayerCount({response:{result:1,player_count:57}}),57);
  assert.equal(parseSteamPlayerCount({response:{result:2,player_count:0}}),null);
  assert.equal(parseSteamPlayerCount({response:{result:1}}),null);
  assert.equal(parseSteamPlayerCount({response:{result:1,player_count:-1}}),null);
  assert.equal(dayUTC(0),'1970-01-01');
});
test('source rights require explicit approval AND enabled',()=>{
  assert.equal(sourceApproved({enabled:1,rights_status:'approved'}),true);
  assert.equal(sourceApproved({enabled:0,rights_status:'approved'}),false);
  assert.equal(sourceApproved({enabled:1,rights_status:'review_required'}),false);
});
test('missing readings do not change observed value; samples do',()=>{
  const start=aggregateSnapshot({existing:null,value:100,observedAt:100});
  const missing=aggregateSnapshot({existing:start,value:null,observedAt:101});
  assert.deepEqual([missing.observed_count,missing.missing_count,missing.value_last],[1,1,100]);
  const next=aggregateSnapshot({existing:missing,value:0,observedAt:102});
  assert.deepEqual([next.value_min,next.value_max,next.value_last],[0,100,0]);
});

test('matcher retains multiple candidates and preserves verified entries on rerun',async()=>{
  const previous=globalThis.fetch;
  const mappings=[{id:1,game_id:23248,provider:'steam',external_id:'323190',variant_code:'a',match_status:'verified'}];
  const games=[23248,105490].sort((a,b)=>a-b);
  let counter=2;
  const DB={prepare(sql){const build=(...params)=>{
    const norm=sql.replace(/\s+/g,' ').trim().toUpperCase();
    return {
      async first(){
        if(norm.includes('SOURCE_REGISTRY') && norm.includes('IGDB'))return {enabled:1};
        if(norm.startsWith('SELECT ID FROM GAMES WHERE ID >'))return games.find(id=>id>params[0])?{id:games.find(id=>id>params[0])}:null;
        if(norm.includes('FROM EXTERNAL_GAME_IDS WHERE PROVIDER=? AND EXTERNAL_ID=?')){
          return mappings.find(x=>x.provider===params[0]&&x.external_id===params[1])||null;
        }
        throw Error('Unsupported first query: '+sql);
      },
      async all(){
        if(norm.startsWith('SELECT ID FROM GAMES WHERE ID >'))return {results:games.filter(id=>id>params[0]).slice(0,params[1]).map(id=>({id}))};
        if(norm.includes('FROM EXTERNAL_GAME_IDS WHERE GAME_ID=?'))return {results:mappings.filter(x=>x.game_id===params[0])};
        throw Error('Unsupported all query: '+sql);
      },
      async run(){
        if(norm.startsWith('INSERT OR IGNORE INTO EXTERNAL_GAME_IDS')){
          const [game_id,external_id,variant_code]=params;
          if(mappings.some(x=>x.provider==='steam'&&x.external_id===external_id))return {meta:{changes:0}};
          mappings.push({id:counter++,game_id,provider:'steam',external_id,variant_code,match_status:'candidate'});
          return {meta:{changes:1}};
        }
        throw Error('Unsupported run query: '+sql);
      }
    };
  };return {...build(),bind(...params){return build(...params)}};}};
  globalThis.fetch=async url=>({ok:true,async json(){
    if(String(url).includes('external_game_sources'))return [{id:1,name:'Steam'}];
    if(String(url).includes('external_games'))return [
      {game:105490,external_game_source:1,uid:'744200'},
      {game:105490,external_game_source:1,uid:'1419270'},
      {game:23248,external_game_source:1,uid:'323190'}
    ];
    throw Error('Unexpected fetch: '+url);
  }});
  const env={DB,IGDB_CLIENT_ID:'test-id',IGDB_CLIENT_SECRET:'test-secret',CACHE:{async get(){return {access_token:'test-token'};}}};
  try{
    const first=await matchExternalIds(env,{cursor:0,limit:20});
    assert.equal(first.matched,2);assert.equal(first.already_mapped,1);
    assert.equal(first.ambiguous_games,1);assert.equal(first.conflicts,0);
    assert.deepEqual(mappings.filter(x=>x.game_id===105490).map(x=>x.variant_code),['a','b']);
    const again=await matchExternalIds(env,{cursor:0,limit:20});
    assert.equal(again.matched,0);assert.equal(again.already_mapped,3);
    assert.equal(mappings[0].match_status,'verified');
  }finally{globalThis.fetch=previous;}
});

test('disabled source cannot trigger any upstream HTTP request',async()=>{
  const prev=globalThis.fetch;let fetched=false;
  globalThis.fetch=async()=>{fetched=true;throw Error('MUST NOT CALL');};
  const env={DB:{prepare(){return {bind(){return {async first(){return {enabled:0,rights_status:'review_required'};}};}};}}};
  try {const r=await collectSteamSignals(env);assert.equal(r.status,'disabled');assert.equal(fetched,false);}
  finally {globalThis.fetch=prev;}
});
