import {precisionLabel,releaseRange} from './core.js';
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
export async function syncGames(env){
  const source=await env.DB.prepare("SELECT enabled FROM source_registry WHERE source_id='igdb'").first();
  if(!source?.enabled) return {status:'disabled',reason:'IGDB source must pass rights review and be enabled explicitly'};
  const now=Math.floor(Date.now()/1000);
  const limit=Math.min(100,Math.max(1,Number(env.IGDB_SYNC_LIMIT)||100));
  const rows=await igdb(env,'games',`fields id,slug,name,summary,cover.image_id,genres.name,platforms.name,updated_at,release_dates.id,release_dates.date,release_dates.human,release_dates.date_format,release_dates.platform.name,release_dates.region; where release_dates.date >= ${now-86400} & release_dates.date <= ${now+366*86400}; sort release_dates.date asc; limit ${limit};`);
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

// Process a bounded page of existing D1 games; repeat using next_cursor until done.
// Never infer Steam IDs from game names, and never overwrite an existing mapping.
// Diagnostic details are returned for conflicts and unmatched games; no schema changes.
export async function matchExternalIds(env,{cursor=0,limit=20}={}){
  const source=await env.DB.prepare("SELECT enabled FROM source_registry WHERE source_id='igdb'").first();
  if(!source?.enabled) return {status:'disabled',reason:'IGDB source is not enabled'};
  if(!Number.isSafeInteger(cursor)||cursor<0||!Number.isSafeInteger(limit)||limit<1||limit>50)
    throw new RangeError('Invalid cursor or limit');

  const page=await env.DB.prepare('SELECT id FROM games WHERE id > ? ORDER BY id ASC LIMIT ?').bind(cursor,limit).all();
  const ids=page.results.map(row=>row.id);
  if(!ids.length) return {status:'ok',processed:0,matched:0,already_mapped:0,conflicts:0,unmatched:0,conflict_details:[],unmatched_details:[],next_cursor:null,done:true};

  // Resolve source IDs from the live IGDB registry; do not rely on deprecated category numbers.
  const sources=await igdb(env,'external_game_sources','fields id,name; limit 500;');
  const steamSourceIds=new Set(sources.filter(s=>/^steam$/i.test((s.name||'').trim())).map(s=>s.id));
  if(!steamSourceIds.size) return {status:'source_unresolved',reason:'No Steam provider found in IGDB external_game_sources; no mappings written',processed:0,next_cursor:cursor,done:false};

  const external=await igdb(env,'external_games',`fields id,game,uid,external_game_source,url; where game = (${ids.join(',')}); limit 500;`);
  const candidates=new Map();
  for(const item of external){
    const gameId=typeof item.game==='object'?item.game?.id:item.game;
    const providerId=typeof item.external_game_source==='object'?item.external_game_source?.id:item.external_game_source;
    if(!ids.includes(gameId)||!steamSourceIds.has(providerId)) continue;
    const uid=String(item.uid??'').trim();
    if(!/^\d+$/.test(uid)) continue;
    if(!candidates.has(gameId)) candidates.set(gameId,new Set());
    candidates.get(gameId).add(uid);
  }

  let matched=0,alreadyMapped=0,conflicts=0,unmatched=0;
  const conflictDetails=[];
  const unmatchedDetails=[];
  for(const id of ids){
    const choices=[...(candidates.get(id)||[])];
    if(!choices.length){
      unmatched++;
      unmatchedDetails.push({game_id:id,reason:'no_usable_steam_id_in_igdb'});
      continue;
    }
    // Multiple Steam editions may map to one IGDB game. Do not guess which is canonical.
    if(choices.length!==1){
      conflicts++;
      conflictDetails.push({game_id:id,reason:'multiple_steam_ids',steam_ids:choices});
      continue;
    }
    const uid=choices[0];
    const existing=await env.DB.prepare('SELECT game_id,external_id FROM external_game_ids WHERE provider=? AND (game_id=? OR external_id=?)').bind('steam',id,uid).all();
    const collisions=existing.results.filter(r=>r.game_id!==id||r.external_id!==uid);
    if(collisions.length){
      conflicts++;
      conflictDetails.push({game_id:id,reason:'existing_mapping_collision',steam_ids:[uid],existing_mappings:collisions});
      continue;
    }
    if(existing.results.some(r=>r.game_id===id&&r.external_id===uid)){alreadyMapped++;continue;}
    // IGDB-provided ID is a candidate until validated against Steam's official listing.
    const result=await env.DB.prepare(`INSERT OR IGNORE INTO external_game_ids
      (game_id,provider,external_id,match_status,match_method,verified_at)
      VALUES (?,'steam',?,'candidate','igdb_external_games',NULL)`).bind(id,uid).run();
    if(result.meta?.changes===1) matched++;
    else {
      conflicts++;
      conflictDetails.push({game_id:id,reason:'insert_ignored',steam_ids:[uid]});
    }
  }
  const nextCursor=ids[ids.length-1];
  const more=await env.DB.prepare('SELECT id FROM games WHERE id > ? LIMIT 1').bind(nextCursor).first();
  return {status:'ok',processed:ids.length,matched,already_mapped:alreadyMapped,conflicts,unmatched,
    conflict_details:conflictDetails,unmatched_details:unmatchedDetails,
    next_cursor:more?nextCursor:null,done:!more,
    note:'IGDB-sourced Steam IDs are candidates, not independently verified. Conflicts and multiple editions require review.'};
}
