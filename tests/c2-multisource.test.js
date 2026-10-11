import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';
import {parseTwitchStreams,parseYouTubeViews,collectMultiSource} from '../worker/src/multisource.js';
import {canonicalArticleUrl,parseEditorialXml,uniqueGameCandidate,collectEditorial} from '../worker/src/editorial.js';
import {sourceAllowed,isCount} from '../worker/src/measurements.js';
import {calculateMovement,scoreBoard,cohortKey} from '../worker/src/momentum.js';
import {syncGamesPage} from '../worker/src/igdb.js';
import {exactTwitchMatches,matchTwitchCategories} from '../worker/src/twitch-mapping.js';
import {validateVideo} from '../worker/src/video-import.js';

const nowDay='2026-10-11';
const shift=n=>new Date(Date.parse(nowDay+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);

test('Twitch sample is a bounded top-100 stream sum, and zero remains valid',()=>{
  assert.equal(parseTwitchStreams({data:[]}),0);
  assert.equal(parseTwitchStreams({data:[{viewer_count:10},{viewer_count:7}]}),17);
  assert.equal(parseTwitchStreams({data:[{viewer_count:-1}]}),null);
  assert.equal(parseTwitchStreams({data:null}),null);
  assert.equal(parseTwitchStreams({data:Array.from({length:101},()=>({viewer_count:1}))}),null);
});
test('YouTube cumulative views parsed from selected video only',()=>{
  assert.equal(parseYouTubeViews({items:[{id:'abcdefghijk',statistics:{viewCount:'0'}}]},'abcdefghijk'),0);
  assert.equal(parseYouTubeViews({items:[{id:'abcdefghijk',statistics:{viewCount:'12400'}}]},'abcdefghijk'),12400);
  assert.equal(parseYouTubeViews({items:[{id:'other',statistics:{viewCount:'2'}}]},'abcdefghijk'),null);
  assert.equal(parseYouTubeViews({items:[{id:'abcdefghijk',statistics:{viewCount:'-3'}}]},'abcdefghijk'),null);
});
test('RSS and Atom parse metadata only with canonicalized source URL',()=>{
  const rss=`<rss><channel><item><title><![CDATA[Frostpunk 2 &amp; gameplay]]></title><link>https://example.org/story?utm_source=feed&amp;v=1</link><pubDate>Sat, 10 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>`;
  const parsed=parseEditorialXml(rss);
  assert.equal(parsed.length,1);assert.equal(parsed[0].title,'Frostpunk 2 & gameplay');
  assert.equal(parsed[0].url,'https://example.org/story?v=1');
  const atom=`<feed><entry><title>A new trailer</title><link rel="alternate" href="https://example.org/trailer"/><updated>2026-10-11T12:00:00Z</updated></entry></feed>`;
  assert.equal(parseEditorialXml(atom)[0].url,'https://example.org/trailer');
  assert.equal(canonicalArticleUrl('http://example.org/story'),null);
  assert.equal(canonicalArticleUrl('https://localhost/story'),null);
});
test('ambiguous exact title matching creates no auto game link',()=>{
  assert.equal(uniqueGameCandidate('Frostpunk 2 makes headlines',[{id:2,name:'Frostpunk 2'},{id:1,name:'Frostpunk'}]),null);
  assert.equal(uniqueGameCandidate('Frostpunk 2 makes headlines',[{id:2,name:'Frostpunk 2'}]),2);
  assert.equal(uniqueGameCandidate('New DLC announced',[{id:3,name:'Skyclimbers'}]),null);
});
test('all new sources are double gated: disabled source has zero network requests',async()=>{
  assert.equal(sourceAllowed({enabled:1,rights_status:'approved'}),true);
  assert.equal(sourceAllowed({enabled:0,rights_status:'approved'}),false);
  assert.equal(isCount(0),true);assert.equal(isCount(NaN),false);
  const old=globalThis.fetch;let fetched=0;
  globalThis.fetch=async()=>{fetched++;throw Error('must not access network');};
  const env={DB:{prepare(){return {bind(){return {async first(){return {enabled:0,rights_status:'approved'};}};}};}}};
  try{
    assert.equal((await collectMultiSource(env,{provider:'twitch'})).status,'disabled');
    assert.equal((await collectMultiSource(env,{provider:'youtube'})).status,'disabled');
    assert.equal((await collectEditorial(env)).status,'disabled');
    assert.equal(fetched,0);
  }finally{globalThis.fetch=old;}
});
test('rolling movement requires measurements in both full windows and excludes partial today',()=>{
  const points=Array.from({length:14},(_,i)=>({day_utc:shift(-14+i),value_last:i<7?10:20}));
  const observed=calculateMovement(points,{today:nowDay,window:7});
  assert.equal(observed.status,'observed');assert.equal(observed.recent_mean,20);assert.equal(observed.prior_mean,10);
  assert.equal(calculateMovement(points.slice(0,5),{today:nowDay,window:7}).status,'insufficient_history');
  assert.equal(calculateMovement([...points,{day_utc:nowDay,value_last:1e9}],{today:nowDay,window:7}).recent_mean,20);
});
test('cumulative video views use daily increments, not cumulative level',()=>{
  let count=1000;
  const points=Array.from({length:16},(_,i)=>{
    if(i>0)count+=i<9?10:30;
    return {day_utc:shift(-16+i),value_last:count};
  });
  const result=calculateMovement(points,{today:nowDay,window:7,cumulative:true});
  assert.equal(result.status,'observed');assert.equal(result.recent_mean,30);
  assert.equal(result.prior_mean,10);
});
test('same-genre/PC score requires independent sources and five comparable peers',()=>{
  const games=Array.from({length:5},(_,i)=>({id:100+i,name:`Game ${i}`,genres_json:'["Action"]',platforms_json:'["PC (Microsoft Windows)"]'}));
  const points=[];
  for(const g of games)for(let i=0;i<16;i++){
    const day=shift(-16+i);
    points.push({game_id:g.id,source_id:'twitch_category_viewers',identity_key:`listing:${g.id}`,
      mapping_id:g.id,match_status:'verified',day_utc:day,value_last:i<8?10+i:20+i+g.id-100});
    points.push({game_id:g.id,source_id:'youtube_video_views',identity_key:`youtube:video:${g.id}`,
      mapping_id:null,day_utc:day,value_last:1000+i*(i<8?10:20)+(g.id-100)*i});
  }
  const board=scoreBoard(games,points,[],{today:nowDay});
  assert.equal(board.length,5);
  assert.equal(board.every(x=>x.status==='provisional_descriptive_index'),true);
  assert.equal(board.every(x=>x.source_coverage>=0.5),true);
  assert.equal(cohortKey('["Action"]','["PlayStation 5"]'),'action|PlayStation');
  const withoutYouTube=scoreBoard(games,points.filter(p=>p.source_id==='twitch_category_viewers'),[],{today:nowDay});
  assert.equal(withoutYouTube.every(x=>x.momentum_index===null),true);
});
test('protected C2 endpoints reject public mutation; forecasts still abstain',async()=>{
  const env={ADMIN_TOKEN:'secret',CORS_ORIGIN:'https://siegeviperx.github.io'};
  for(const route of ['/admin/import-videos','/admin/match-twitch','/admin/sync-igdb-page','/admin/collect-twitch','/admin/collect-youtube',
    '/admin/collect-editorial','/admin/editorial-review']){
    const r=await worker.fetch(new Request('https://gst.invalid'+route,{method:'POST'}),env);
    assert.equal(r.status,401,route);assert.match(r.headers.get('cache-control'),/no-store/);
  }
  const r=await worker.fetch(new Request('https://gst.invalid/forecasts/23248'),env);
  assert.equal((await r.json()).probability,null);
});
test('catalog keyset handler rejects invalid arguments before upstream network calls',async()=>{
  await assert.rejects(()=>syncGamesPage({}, {cursor:-1}),RangeError);
  await assert.rejects(()=>syncGamesPage({}, {cursor:1,limit:100}),RangeError);
  await assert.rejects(()=>syncGamesPage({}, {scope:'not_a_scope'}),RangeError);
});

test('Helix exact IGDB crosswalk ignores records with mismatched IDs',()=>{
  const result=exactTwitchMatches({data:[
    {id:'509660',igdb_id:'23248',name:'Frostpunk'},
    {id:'222',igdb_id:'999',name:'Some other game'},
    {id:'oops',igdb_id:'105490'}
  ]},[23248,105490]);
  assert.deepEqual([...result.get(23248)],['509660']);
  assert.equal(result.has(105490),false);
});
test('disabled Twitch crosswalk does not fetch',async()=>{
  const old=globalThis.fetch;let called=0;
  globalThis.fetch=async()=>{called++;throw new Error('network forbidden');};
  const env={DB:{prepare(){return {async first(){return {enabled:0,rights_status:'review_required'};}};}}};
  try{assert.equal((await matchTwitchCategories(env)).status,'disabled');assert.equal(called,0);}
  finally{globalThis.fetch=old;}
});

test('video curator import cannot silently mark a guessed video official',()=>{
  assert.equal(validateVideo({game_id:23248,video_id:'abcdefghijk',official_status:'verified'}),null);
  assert.equal(validateVideo({game_id:23248,video_id:'abcdefghijk',official_status:'candidate'}).status,'candidate');
  assert.equal(validateVideo({game_id:23248,video_id:'abcdefghijk',official_status:'verified',
    reviewer_confirmed:true,identity_evidence_url:'https://www.youtube.com/watch?v=abcdefghijk'}).status,'verified');
  assert.equal(validateVideo({game_id:23248,video_id:'bad',official_status:'candidate'}),null);
});
