import {json,clampInt,safeSearch} from './core.js';
import {syncGames,matchExternalIds} from './igdb.js';
const ALLOWED=['GET','OPTIONS'];
const rowGame=g=>({...g,genres:JSON.parse(g.genres_json||'[]'),platforms:JSON.parse(g.platforms_json||'[]'),genres_json:undefined,platforms_json:undefined,forecast:{status:'insufficient_data',probability:null,reason_codes:['MODEL_NOT_VALIDATED']}});
function cors(req,env){const origin=req.headers.get('Origin');return origin && origin===env.CORS_ORIGIN?origin:env.CORS_ORIGIN||'*';}
async function handler(req,env){
  const url=new URL(req.url),path=url.pathname.replace(/\/$/,'')||'/';
  const origin=cors(req,env);
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type'}});
  if(path==='/admin/sync-igdb' && req.method==='POST'){
    if(!env.ADMIN_TOKEN||req.headers.get('Authorization')!==`Bearer ${env.ADMIN_TOKEN}`) return json({error:'unauthorized'},401,origin);
    return json(await syncGames(env),200,origin);
  }
  if(path==='/admin/match-external-ids' && req.method==='POST'){
    if(!env.ADMIN_TOKEN||req.headers.get('Authorization')!==`Bearer ${env.ADMIN_TOKEN}`) return json({error:'unauthorized'},401,origin);
    const cursorRaw=url.searchParams.get('cursor')||'0';
    const limitRaw=url.searchParams.get('limit')||'20';
    if(!/^\d+$/.test(cursorRaw)||!/^\d+$/.test(limitRaw)||!Number.isSafeInteger(Number(cursorRaw))||Number(limitRaw)<1||Number(limitRaw)>50)
      return json({error:'invalid_pagination',hint:'cursor must be a nonnegative integer; limit 1–50'},400,origin);
    return json(await matchExternalIds(env,{cursor:Number(cursorRaw),limit:Number(limitRaw)}),200,origin);
  }
  if(!ALLOWED.includes(req.method)) return json({error:'method_not_allowed'},405,origin);
  if(path==='/health'){
    const src=await env.DB.prepare('SELECT enabled,rights_status,last_success_at FROM source_registry WHERE source_id=?').bind('igdb').first();
    return json({status:src?.enabled?'operational':'setup_required',igdb:src||null,forecast_status:'not_validated'},200,origin);
  }
  if(path==='/games'||path==='/calendar'){
    const limit=clampInt(url.searchParams.get('limit'),24,100),page=clampInt(url.searchParams.get('page'),1,1000),offset=(page-1)*limit;
    const search=safeSearch(url.searchParams.get('q'));
    const platform=safeSearch(url.searchParams.get('platform'));
    const params=[],filters=[];
    if(search){filters.push('(g.name LIKE ? OR EXISTS(SELECT 1 FROM aliases a WHERE a.game_id=g.id AND a.alias LIKE ?))');params.push(`%${search}%`,`%${search}%`);}
    if(platform){filters.push('g.platforms_json LIKE ?');params.push(`%${platform}%`);}
    const where=filters.length?'WHERE '+filters.join(' AND '):'';
    const sql=`SELECT g.*, (SELECT MIN(start_at) FROM release_dates r WHERE r.game_id=g.id AND r.start_at IS NOT NULL) AS next_release FROM games g ${where} ORDER BY CASE WHEN next_release IS NULL THEN 1 ELSE 0 END, next_release ASC, g.name ASC LIMIT ? OFFSET ?`;
    const rows=await env.DB.prepare(sql).bind(...params,limit,offset).all();
    return json({data:rows.results.map(rowGame),page,limit,source:'IGDB',forecast_status:'not_validated'},200,origin);
  }
  if(path==='/calendar/month'){
    const month=url.searchParams.get('month');
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||'')) return json({error:'invalid_month',hint:'Use YYYY-MM'},400,origin);
    const [year,mon]=month.split('-').map(Number);
    const from=Math.floor(Date.UTC(year,mon-1,1)/1000);
    const until=Math.floor(Date.UTC(year,mon,1)/1000);
    const platform=safeSearch(url.searchParams.get('platform'));
    const limit=clampInt(url.searchParams.get('limit'),100,500);
    const sql=`SELECT r.game_id,r.igdb_release_id,r.platform,r.region,r.precision,r.label,r.start_at,r.end_at,r.observed_at,g.name,g.cover_url
      FROM release_dates r JOIN games g ON g.id=r.game_id
      WHERE r.start_at >= ? AND r.start_at < ?
      AND (? = '' OR r.platform LIKE ?)
      ORDER BY r.start_at ASC,g.name ASC LIMIT ?`;
    const rows=await env.DB.prepare(sql).bind(from,until,platform,`%${platform}%`,limit).all();
    return json({month,source:'IGDB',date_semantics:'Observed IGDB release dates; not independently confirmed',data:rows.results,limit},200,origin);
  }
  const match=path.match(/^\/game\/(\d+)$/);
  if(match){
    const id=Number(match[1]);
    const g=await env.DB.prepare('SELECT * FROM games WHERE id=?').bind(id).first();
    if(!g)return json({error:'not_found'},404,origin);
    const releases=await env.DB.prepare('SELECT platform,region,precision,label,start_at,end_at,confirmed,observed_at FROM release_dates WHERE game_id=? ORDER BY start_at').bind(id).all();
    const history=await env.DB.prepare('SELECT previous_label,new_label,changed_at FROM date_history WHERE game_id=? ORDER BY changed_at DESC LIMIT 50').bind(id).all();
    const observations=await env.DB.prepare('SELECT igdb_release_id,platform,region,precision,label,start_at,end_at,observed_at FROM release_observations WHERE game_id=? ORDER BY observed_at DESC LIMIT 100').bind(id).all();
    return json({game:rowGame(g),releases:releases.results,observed_date_changes:history.results,release_observations:observations.results,confirmed_date_changes:[],note:'IGDB date observations are not independently verified first-party announcements'},200,origin);
  }
  if(path==='/forecasts'||path.startsWith('/forecasts/')) return json({status:'insufficient_data',probability:null,reason_codes:['MODEL_NOT_VALIDATED']},200,origin);
  if(path==='/stats'){
    const r=await env.DB.prepare('SELECT COUNT(*) AS games FROM games').first();return json({games:r.games,forecast_status:'not_validated'},200,origin);
  }
  return json({error:'not_found'},404,origin);
}
export default {
  async fetch(req,env){try{return await handler(req,env);}catch(e){console.error('request_failed',e?.message);return json({error:'service_unavailable'},503,env.CORS_ORIGIN||'*');}},
  async scheduled(event,env,ctx){ctx.waitUntil(syncGames(env).catch(e=>console.error('sync_failed',e?.message)));}
};
