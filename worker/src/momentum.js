// C2 exploratory descriptive momentum, v1. NOT a probability or trained forecast.
// No summing multi-SKU player counts or different video audience identities.
const WEIGHTS={
  twitch_category_viewers:0.25,
  youtube_video_views:0.35,
  steam_current_players:0.20,
  editorial_rss:0.20
};
const MIN_PEERS=5;
const REQUIRED_SOURCES=2;
const MIN_WEIGHT=0.50;
const DAYS=86400000;
const shift=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*DAYS).toISOString().slice(0,10);
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
const safeRatio=(recent,prior)=>Math.log2((recent+1)/(prior+1));
export function calculateMovement(points,{today,window=7,cumulative=false}={}){
  if(!today||![7,30].includes(window))throw new RangeError('window');
  const map=new Map(points.filter(x=>x.value_last!=null&&Number.isFinite(x.value_last)&&x.value_last>=0)
    .map(x=>[x.day_utc,Number(x.value_last)]));
  let samples=[];
  if(cumulative){
    const ordered=[...map].sort((a,b)=>a[0].localeCompare(b[0]));
    for(let i=1;i<ordered.length;i++){
      const [day,val]=ordered[i],[prev,prevVal]=ordered[i-1];
      if(Date.parse(day+'T00:00:00Z')-Date.parse(prev+'T00:00:00Z')!==DAYS)continue;
      if(val<prevVal)continue; // counter reset/removed content; don't manufacture velocity
      samples.push([day,val-prevVal]);
    }
  }else samples=[...map];
  const recent=[],prior=[];
  for(const [day,val] of samples){
    if(day>=shift(today,-window)&&day<today)recent.push(val);
    else if(day>=shift(today,-2*window)&&day<shift(today,-window))prior.push(val);
  }
  const minDays=window===7?3:12;
  if(recent.length<minDays||prior.length<minDays)return {status:'insufficient_history',recent_days:recent.length,prior_days:prior.length};
  const current=mean(recent),baseline=mean(prior);
  return {status:'observed',recent_mean:current,prior_mean:baseline,log2_ratio:safeRatio(current,baseline),
    recent_days:recent.length,prior_days:prior.length};
}
export function cohortKey(genresJson,platformsJson){
  let genres=[],platforms=[];
  try{genres=JSON.parse(genresJson||'[]');platforms=JSON.parse(platformsJson||'[]');}catch{}
  const genre=(genres[0]||'Unclassified').toLowerCase();
  const platform=platforms.some(x=>/pc|windows|mac|linux/i.test(x))?'PC':
    platforms.some(x=>/playstation/i.test(x))?'PlayStation':
    platforms.some(x=>/xbox/i.test(x))?'Xbox':
    platforms.some(x=>/switch|nintendo/i.test(x))?'Nintendo':'Other';
  return `${genre}|${platform}`;
}
export function scoreBoard(games,signalRows,articleRows,{today=new Date().toISOString().slice(0,10)}={}){
  const gameById=new Map(games.map(g=>[g.id,g]));
  const buckets=new Map();
  for(const row of signalRows){
    if(!gameById.has(row.game_id)||!WEIGHTS[row.source_id])continue;
    // A video is a game-level asset, but its identity is per video, not summed at game level.
    if(row.mapping_id!=null&&row.match_status!=='verified')continue;
    const key=`${row.game_id}|${row.source_id}|${row.identity_key}`;
    if(!buckets.has(key))buckets.set(key,[]);
    buckets.get(key).push(row);
  }
  const selected=new Map();
  for(const [key,points] of buckets){
    const [gameId,sourceId]=key.split('|');
    const analysis=calculateMovement(points,{today,window:7,cumulative:sourceId==='youtube_video_views'});
    if(analysis.status!=='observed')continue;
    const selectedKey=`${gameId}|${sourceId}`;
    const current=selected.get(selectedKey);
    // Fixed single identity per game/source; highest history count, then lexical tie-break.
    const count=analysis.recent_days+analysis.prior_days;
    if(!current||count>current.days||(count===current.days&&key<current.key))
      selected.set(selectedKey,{...analysis,key,days:count,source_id:sourceId,identity_key:points[0].identity_key});
  }
  // Verified article links only; dedupe syndicated title copies across outlets.
  const articleByGame=new Map();
  for(const a of articleRows){
    const id=a.game_id;
    if(!gameById.has(id))continue;
    if(!articleByGame.has(id))articleByGame.set(id,new Map());
    const dedupe=String(a.title||'').toLowerCase().replace(/\s+/g,' ').trim();
    if(!dedupe)continue;
    const old=articleByGame.get(id).get(dedupe);
    if(!old||a.published_at<old.published_at)articleByGame.get(id).set(dedupe,a);
  }
  for(const [gameId,articles] of articleByGame){
    const recent=[],prior=[],outlets=new Set();
    for(const a of articles.values()){
      if(!a.published_at)continue;
      const day=new Date(a.published_at*1000).toISOString().slice(0,10);
      if(day>=shift(today,-7)&&day<today){recent.push(a);outlets.add(a.publisher);}
      else if(day>=shift(today,-14)&&day<shift(today,-7)){prior.push(a);outlets.add(a.publisher);}
    }
    // Counting individual mentions is not predictive; require sustained independent evidence.
    if(recent.length+prior.length>=3&&outlets.size>=2)
      selected.set(`${gameId}|editorial_rss`,{status:'observed',source_id:'editorial_rss',
        identity_key:`editorial:game:${gameId}`,recent_mean:recent.length/7,prior_mean:prior.length/7,
        log2_ratio:safeRatio(recent.length/7,prior.length/7),recent_days:7,prior_days:7,
        articles_14d:recent.length+prior.length,independent_publishers:outlets.size});
  }
  const comparable=new Map();
  for(const [key,item] of selected){
    const [id,source]=key.split('|');
    const game=gameById.get(Number(id));
    if(!game)continue;
    const peerKey=`${cohortKey(game.genres_json,game.platforms_json)}|${source}`;
    if(!comparable.has(peerKey))comparable.set(peerKey,[]);
    comparable.get(peerKey).push(item.log2_ratio);
  }
  const result=[];
  for(const game of games){
    const components=[];
    for(const [source,weight] of Object.entries(WEIGHTS)){
      const item=selected.get(`${game.id}|${source}`);
      if(!item)continue;
      const cohort=`${cohortKey(game.genres_json,game.platforms_json)}|${source}`;
      const peers=comparable.get(cohort)||[];
      if(peers.length<MIN_PEERS){components.push({...item,weight,peer_count:peers.length,comparable:false});continue;}
      const smaller=peers.filter(x=>x<item.log2_ratio).length;
      const tied=peers.filter(x=>x===item.log2_ratio).length;
      const percentile=100*(smaller+tied/2)/peers.length;
      components.push({...item,weight,peer_count:peers.length,comparable:true,peer_percentile:percentile});
    }
    const valid=components.filter(x=>x.comparable);
    const coverage=valid.reduce((n,x)=>n+x.weight,0);
    const hasScore=valid.length>=REQUIRED_SOURCES&&coverage>=MIN_WEIGHT;
    const raw=hasScore?valid.reduce((n,x)=>n+x.peer_percentile*x.weight,0)/coverage:null;
    result.push({game_id:game.id,name:game.name,cohort:cohortKey(game.genres_json,game.platforms_json),
      status:hasScore?'provisional_descriptive_index':'insufficient_data',
      momentum_index:hasScore?Math.round(raw*coverage*10)/10:null,
      source_coverage:Math.round(coverage*100)/100,eligible_sources:valid.length,components,
      reasons:hasScore?[]:[valid.length<REQUIRED_SOURCES?'INSUFFICIENT_INDEPENDENT_SOURCES':null,
        coverage<MIN_WEIGHT?'LOW_WEIGHTED_COVERAGE':null,
        components.some(x=>!x.comparable)?'INSUFFICIENT_COMPARABLE_PEERS':null].filter(Boolean)});
  }
  return result;
}
export async function momentumDashboard(env,{limit=20}={}){
  const cacheKey='gst:c2:momentum:v1';
  const cached=await env.CACHE?.get(cacheKey,'json');
  if(cached?.generated_at && Date.now()/1000-cached.generated_at<900)return {...cached,rows:cached.rows.slice(0,limit)};
  const games=await env.DB.prepare('SELECT id,name,genres_json,platforms_json FROM games ORDER BY id LIMIT 3000').all();
  const total=await env.DB.prepare('SELECT COUNT(*) AS total FROM games').first();
  // A cap is safer than silently scoring only a prefix of a large table.
  if(total.total>3000)return {status:'capacity_limited',rows:[],reason:'Board requires materialized cohorts above 3000 games'};
  const today=new Date().toISOString().slice(0,10),from=shift(today,-62);
  const daily=await env.DB.prepare(`SELECT d.game_id,d.source_id,d.metric,d.identity_key,d.mapping_id,
    d.day_utc,d.value_last,e.match_status
    FROM signal_daily d JOIN signal_source_registry s ON s.source_id=d.source_id
    LEFT JOIN external_game_ids e ON e.id=d.mapping_id
    WHERE s.enabled=1 AND s.rights_status='approved' AND d.day_utc>=?
      AND (d.mapping_id IS NULL OR e.match_status='verified')
    ORDER BY d.game_id,d.source_id,d.identity_key,d.day_utc LIMIT 10001`).bind(from).all();
  if(daily.results.length>10000)return {status:'capacity_limited',rows:[],reason:'Signal volume exceeds read-on-demand cap'};
  const ytVerified=await env.DB.prepare(`SELECT game_id,video_id FROM game_video_assets WHERE official_status='verified'`).all();
  const allowedVideos=new Set(ytVerified.results.map(x=>`${x.game_id}|youtube:video:${x.video_id}`));
  const filtered=daily.results.filter(x=>x.source_id!=='youtube_video_views'||allowedVideos.has(`${x.game_id}|${x.identity_key}`));
  const approvedNews=await env.DB.prepare(`SELECT enabled,rights_status FROM signal_source_registry WHERE source_id='editorial_rss'`).first();
  let articles=[];
  if(approvedNews?.enabled===1&&approvedNews.rights_status==='approved'){
    const ar=await env.DB.prepare(`SELECT l.game_id,a.title,a.published_at,f.publisher
      FROM editorial_game_links l JOIN editorial_articles a ON a.id=l.article_id
      JOIN editorial_feeds f ON f.id=a.feed_id
      WHERE l.match_status='verified' AND f.enabled=1 AND f.review_status='approved'
       AND a.published_at>=? ORDER BY a.published_at DESC LIMIT 5001`)
      .bind(Date.parse(from+'T00:00:00Z')/1000).all();
    if(ar.results.length>5000)return {status:'capacity_limited',rows:[],reason:'News volume exceeds on-demand cap'};
    articles=ar.results;
  }
  const board=scoreBoard(games.results,filtered,articles,{today});
  const ranked=board.filter(x=>x.momentum_index!==null).sort((a,b)=>b.momentum_index-a.momentum_index);
  const result={status:ranked.length?'provisional_descriptive_index':'insufficient_data',
    generated_at:Math.floor(Date.now()/1000),method_version:'c2-peer-percentile-v1',
    min_peers:MIN_PEERS,min_independent_sources:REQUIRED_SOURCES,required_coverage:MIN_WEIGHT,
    eligible_games:ranked.length,all_games:games.results.length,
    note:'Descriptive ranking of observed 7-day movement vs prior week among same genre/platform peers; NOT a forecast, probability, wishlists or sales.',
    rows:ranked};
  if(env.CACHE)await env.CACHE.put(cacheKey,JSON.stringify(result),{expirationTtl:900});
  return {...result,rows:ranked.slice(0,limit)};
}
