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
      // IGDB metadata alone does not establish primary-source confirmation.
      if(old && old.label!==label){
        batch.push(env.DB.prepare('INSERT OR IGNORE INTO date_history(game_id,igdb_release_id,previous_label,new_label,changed_at) VALUES(?,?,?,?,?)').bind(g.id,r.id,old.label,label,now));changed++;
      }
      // Immutable source observation, retained for future chronological validation.
      // A repeated sync on the same second is deduplicated by the database constraint.
      batch.push(env.DB.prepare(`INSERT OR IGNORE INTO release_observations(game_id,igdb_release_id,platform,region,precision,label,start_at,end_at,observed_at,source_id) VALUES(?,?,?,?,?,?,?,?,?,'igdb')`).bind(g.id,r.id,r.platform?.name||null,r.region==null?null:String(r.region),precision,label,start,end,now));
      batch.push(env.DB.prepare(`INSERT INTO release_dates(game_id,igdb_release_id,platform,region,precision,label,start_at,end_at,confirmed,observed_at) VALUES(?,?,?,?,?,?,?,?,0,?) ON CONFLICT(game_id,igdb_release_id) DO UPDATE SET platform=excluded.platform,region=excluded.region,precision=excluded.precision,label=excluded.label,start_at=excluded.start_at,end_at=excluded.end_at,observed_at=excluded.observed_at`).bind(g.id,r.id,r.platform?.name||null,r.region==null?null:String(r.region),precision,label,start,end,now));
    }
    await env.DB.batch(batch);stored++;
  }
  await env.DB.prepare('UPDATE source_registry SET last_success_at=? WHERE source_id=?').bind(now,'igdb').run();
  return {status:'ok',stored,observed_date_changes:changed,at:now};
}
