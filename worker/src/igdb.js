import {precisionLabel,releaseRange} from './core.js';
import {nextSuffix} from './variants.js';
const IGDB='https://api.igdb.com/v4';
export async function token(env){
  if(!env.IGDB_CLIENT_ID||!env.IGDB_CLIENT_SECRET) throw new Error('IGDB credentials not configured');
  const cached=await env.CACHE.get('igdb:token','json');
  if(cached?.access_token) return cached.access_token;
  const url=new URL('https://id.twitch.tv/oauth2/token');
  url.searchParams.set('client_id',env.IGDB_CLIENT_ID);
  url.searchParams.set('client_secret',env.IGDB_CLIENT_SECRET);
  url.searchParams.set('grant_type','client_credentials');
  const res=await fetch(url,{method:'POST'});
  if(!res.ok) throw new Error(`OAuth request failed: ${res.status}`);
  const data=await res.json();
  await env.CACHE.put('igdb:token',JSON.stringify(data),{expirationTtl:Math.max(60,data.expires_in-300)});
  return data.access_token;
}
export async function igdb(env,endpoint,query){
  const access=await token(env);
  const res=await fetch(`${IGDB}/${endpoint}`,{method:'POST',headers:{'Client-ID':env.IGDB_CLIENT_ID,'Authorization':`Bearer ${access}`,'Content-Type':'text/plain'},body:query});
  if(!res.ok) throw new Error(`IGDB ${endpoint} request failed: ${res.status}`);
  return res.json();
}
// Shared persistence for scheduled refresh and cursor-based backfill.
async function storeGames(env,rows,now){
  let stored=0, changed=0;
  for(const g of rows){
    const batch=[env.DB.prepare(`INSERT INTO games(id,slug,name,summary,cover_url,genres_json,platforms_json,igdb_updated_at,synced_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,name=excluded.name,summary=excluded.summary,cover_url=excluded.cover_url,genres_json=excluded.genres_json,platforms_json=excluded.platforms_json,igdb_updated_at=excluded.igdb_updated_at,synced_at=excluded.synced_at`).bind(g.id,g.slug||null,g.name,g.summary||null,g.cover?.image_id?`https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg`:null,JSON.stringify((g.genres||[]).map(x=>x.name)),JSON.stringify((g.platforms||[]).map(x=>x.name)),g.updated_at||null,now)];
    for(const r of g.release_dates||[]){
      const {precision,label}=precisionLabel(r.date_format,r.date,r.human);
      const [start,end]=releaseRange(r.date_format,r.date);
      const old=await env.DB.prepare('SELECT label FROM release_dates WHERE game_id=? AND igdb_release_id=?').bind(g.id,r.id).first();
      if(old && old.label!==label){
        batch.push(env.DB.prepare('INSERT OR IGNORE INTO date_history(game_id,igdb_release_id,previous_label,new_label,changed_at) VALUES(?,?,?,?,?)').bind(g.id,r.id,old.label,label,now));changed++;
      }
      batch.push(env.DB.prepare(`INSERT OR IGNORE INTO release_observations(game_id,igdb_release_id,platform,region,precision,label,start_at,end_at,observed_at,source_id) VALUES(?,?,?,?,?,?,?,?,?,'igdb')`).bind(g.id,r.id,r.platform?.name||null,r.region==null?null:String(r.region),precision,label,start,end,now));
      batch.push(env.DB.prepare(`INSERT INTO release_dates(game_id,igdb_release_id,platform,region,precision,label,start_at,end_at,confirmed,observed_at) VALUES(?,?,?,?,?,?,?,?,0,?) ON CONFLICT(game_id,igdb_release_id) DO UPDATE SET platform=excluded.platform,region=excluded.region,precision=excluded.precision,label=excluded.label,start_at=excluded.start_at,end_at=excluded.end_at,observed_at=excluded.observed_at`).bind(g.id,r.id,r.platform?.name||null,r.region==null?null:String(r.region),precision,label,start,end,now));
    }
    await env.DB.batch(batch);stored++;
  }
  await env.DB.prepare('UPDATE source_registry SET last_success_at=? WHERE source_id=?').bind(now,'igdb').run();
  return {status:'ok',stored,observed_date_changes:changed,at:now};
}

export async function syncGames(env){
  const source=await env.DB.prepare("SELECT enabled FROM source_registry WHERE source_id='igdb'").first();
  if(!source?.enabled) return {status:'disabled',reason:'IGDB source must pass rights review and be enabled explicitly'};
  const now=Math.floor(Date.now()/1000);
  const limit=Math.min(100,Math.max(1,Number(env.IGDB_SYNC_LIMIT)||100));
  const rows=await igdb(env,'games',`fields id,slug,name,summary,cover.image_id,genres.name,platforms.name,updated_at,release_dates.id,release_dates.date,release_dates.human,release_dates.date_format,release_dates.platform.name,release_dates.region; where release_dates.date >= ${now-86400} & release_dates.date <= ${now+366*86400}; sort release_dates.date asc; limit ${limit};`);
  return storeGames(env,rows,now);
}

// Explicit admin-only keyset backfill; each call is bounded, and caller checkpoints next_cursor.
// scope=all is expensive and deliberately never launched on a cron.
export async function syncGamesPage(env,{cursor=0,limit=25,scope='upcoming'}={}){
  if(!Number.isSafeInteger(cursor)||cursor<0||!Number.isSafeInteger(limit)||limit<1||limit>50||
     !['upcoming','all'].includes(scope))throw new RangeError('invalid catalog pagination');
  const source=await env.DB.prepare("SELECT enabled FROM source_registry WHERE source_id='igdb'").first();
  if(!source?.enabled)return {status:'disabled',reason:'IGDB source not enabled'};
  const now=Math.floor(Date.now()/1000);
  const window=scope==='upcoming'?` & release_dates.date >= ${now-14*86400} & release_dates.date <= ${now+548*86400}`:'';
  const fields='id,slug,name,summary,cover.image_id,genres.name,platforms.name,updated_at,release_dates.id,release_dates.date,release_dates.human,release_dates.date_format,release_dates.platform.name,release_dates.region';
  const rows=await igdb(env,'games',`fields ${fields}; where id > ${cursor}${window}; sort id asc; limit ${limit};`);
  if(!Array.isArray(rows)||rows.some(r=>!Number.isSafeInteger(r.id)||r.id<=cursor))throw new Error('IGDB invalid backfill page');
  const result=await storeGames(env,rows,now);
  const next=rows.at(-1)?.id??null;
  return {...result,scope,processed:rows.length,next_cursor:rows.length===limit?next:null,
    done:rows.length<limit,
    note:'Cursor traversal of selected IGDB scope; repeated calls checkpoint by IGDB ID. No TBA completeness claim.'};
}

// Match every IGDB-listed Steam app to a canonical game, with stable .a/.b suffixes.
// Preserve provider ID uniqueness across canonical games: collisions still require review.
export async function matchExternalIds(env,{cursor=0,limit=20}={}){
  const source=await env.DB.prepare("SELECT enabled FROM source_registry WHERE source_id='igdb'").first();
  if(!source?.enabled) return {status:'disabled',reason:'IGDB source is not enabled'};
  if(!Number.isSafeInteger(cursor)||cursor<0||!Number.isSafeInteger(limit)||limit<1||limit>50)
    throw new RangeError('Invalid cursor or limit');
  const page=await env.DB.prepare('SELECT id FROM games WHERE id > ? ORDER BY id ASC LIMIT ?').bind(cursor,limit).all();
  const ids=page.results.map(row=>row.id);
  if(!ids.length) return {status:'ok',processed:0,matched:0,already_mapped:0,conflicts:0,unmatched:0,
    ambiguous_games:0,conflict_details:[],unmatched_details:[],next_cursor:null,done:true};
  const sources=await igdb(env,'external_game_sources','fields id,name; limit 500;');
  const steamSourceIds=new Set(sources.filter(s=>/^steam$/i.test((s.name||'').trim())).map(s=>s.id));
  if(!steamSourceIds.size) return {status:'source_unresolved',reason:'Steam not found in IGDB external_game_sources; no writes',processed:0,next_cursor:cursor,done:false};
  // Do not silently truncate a full IGDB response page (max 500 records each).
  const external=[];
  for(let offset=0;offset<=2000;offset+=500){
    const batch=await igdb(env,'external_games',`fields id,game,uid,external_game_source,url; where game = (${ids.join(',')}); limit 500; offset ${offset};`);
    external.push(...batch);
    if(batch.length<500) break;
    if(offset===2000) return {status:'pagination_limit',reason:'Too many IGDB external game records in a batch; no mappings written',processed:0,next_cursor:cursor,done:false};
  }
  const candidates=new Map();
  for(const item of external){
    const gameId=typeof item.game==='object'?item.game?.id:item.game;
    const providerId=typeof item.external_game_source==='object'?item.external_game_source?.id:item.external_game_source;
    if(!ids.includes(gameId)||!steamSourceIds.has(providerId)) continue;
    const uid=String(item.uid??'').trim();
    if(!/^\d+$/.test(uid)) continue;
    if(!candidates.has(gameId))candidates.set(gameId,new Set());
    candidates.get(gameId).add(uid);
  }
  let matched=0,alreadyMapped=0,conflicts=0,unmatched=0,ambiguousGames=0;
  const conflictDetails=[],unmatchedDetails=[];
  for(const id of ids){
    const choices=[...(candidates.get(id)||[])].sort((a,b)=>a.length-b.length||a.localeCompare(b));
    if(!choices.length){unmatched++;unmatchedDetails.push({game_id:id,reason:'no_usable_steam_id_in_igdb'});continue;}
    if(choices.length>1)ambiguousGames++;
    const known=await env.DB.prepare('SELECT id,provider,external_id,variant_code FROM external_game_ids WHERE game_id=?').bind(id).all();
    const used=known.results.map(row=>row.variant_code).filter(Boolean);
    for(const uid of choices){
      const existing=await env.DB.prepare('SELECT game_id,external_id,variant_code FROM external_game_ids WHERE provider=? AND external_id=?').bind('steam',uid).first();
      if(existing){
        if(existing.game_id===id){alreadyMapped++;continue;}
        conflicts++;conflictDetails.push({game_id:id,reason:'external_id_shared_across_games',steam_id:uid,other_game_id:existing.game_id});continue;
      }
      const suffix=nextSuffix(used);
      const inserted=await env.DB.prepare(`INSERT OR IGNORE INTO external_game_ids
        (game_id,provider,external_id,match_status,match_method,verified_at,variant_code)
        VALUES (?,'steam',?,'candidate','igdb_external_games',NULL,?)`).bind(id,uid,suffix).run();
      if(inserted.meta?.changes===1){matched++;used.push(suffix);}
      else {conflicts++;conflictDetails.push({game_id:id,reason:'constraint_collision',steam_id:uid});}
    }
  }
  const nextCursor=ids.at(-1);
  const more=await env.DB.prepare('SELECT id FROM games WHERE id > ? LIMIT 1').bind(nextCursor).first();
  return {status:'ok',processed:ids.length,matched,already_mapped:alreadyMapped,conflicts,unmatched,
    ambiguous_games:ambiguousGames,conflict_details:conflictDetails,unmatched_details:unmatchedDetails,
    next_cursor:more?nextCursor:null,done:!more,
    note:'Multiple Steam IDs are retained as separate candidate variants; .a/.b labels do not imply edition correctness.'};
}
