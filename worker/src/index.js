import {json,clampInt,safeSearch} from './core.js';
import {syncGames,syncGamesPage,matchExternalIds} from './igdb.js';
import {collectSteamSignals,listGameSignals,exportSignals} from './signals.js';
import {collectMultiSource} from './multisource.js';
import {collectEditorial,listEditorialReview,reviewEditorialLink,gameEditorial} from './editorial.js';
import {momentumDashboard} from './momentum.js';
import {matchTwitchCategories} from './twitch-mapping.js';
import {importVideoLinks} from './video-import.js';
const ALLOWED=['GET','OPTIONS'];
const rowGame=g=>({...g,genres:JSON.parse(g.genres_json||'[]'),platforms:JSON.parse(g.platforms_json||'[]'),genres_json:undefined,platforms_json:undefined,forecast:{status:'insufficient_data',probability:null,reason_codes:['MODEL_NOT_VALIDATED']}});
function cors(req,env){const origin=req.headers.get('Origin');return origin && origin===env.CORS_ORIGIN?origin:env.CORS_ORIGIN||'*';}
function isAdmin(req,env){return !!env.ADMIN_TOKEN&&req.headers.get('Authorization')===`Bearer ${env.ADMIN_TOKEN}`;}
function adminJson(data,status,origin){const response=json(data,status,origin);response.headers.set('Cache-Control','no-store, private');return response;}
function paging(url,{defaultLimit=20,maxLimit=50}={}){
  const cursorRaw=url.searchParams.get('cursor')||'0',limitRaw=url.searchParams.get('limit')||String(defaultLimit);
  if(!/^\d+$/.test(cursorRaw)||!/^[1-9]\d*$/.test(limitRaw)||!Number.isSafeInteger(Number(cursorRaw))||!Number.isSafeInteger(Number(limitRaw))||Number(limitRaw)>maxLimit) return null;
  return {cursor:Number(cursorRaw),limit:Number(limitRaw)};
}
async function handler(req,env){
  const url=new URL(req.url),path=url.pathname.replace(/\/$/,'')||'/';
  const origin=cors(req,env);
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type'}});
  if(path==='/admin/sync-igdb' && req.method==='POST'){
    if(!isAdmin(req,env))return adminJson({error:'unauthorized'},401,origin);
    return adminJson(await syncGames(env),200,origin);
  }
  if(path==='/admin/match-external-ids' && req.method==='POST'){
    if(!isAdmin(req,env))return adminJson({error:'unauthorized'},401,origin);
    const params=paging(url);if(!params)return adminJson({error:'invalid_pagination',hint:'cursor nonnegative; limit 1–50'},400,origin);
    return adminJson(await matchExternalIds(env,params),200,origin);
  }
  if(path==='/admin/match-twitch' && req.method==='POST'){
    if(!isAdmin(req,env))return adminJson({error:'unauthorized'},401,origin);
    const params=paging(url,{defaultLimit:20,maxLimit:25});
    if(!params)return adminJson({error:'invalid_pagination'},400,origin);
    return adminJson(await matchTwitchCategories(env,params),200,origin);
  }
  if(path==='/admin/sync-igdb-page' && req.method==='POST'){
    if(!isAdmin(req,env))return adminJson({error:'unauthorized'},401,origin);
    const params=paging(url,{defaultLimit:25,maxLimit:50});
    if(!params)return adminJson({error:'invalid_pagination'},400,origin);
    const scope=url.searchParams.get('scope')||'upcoming';
    if(!['upcoming','all'].includes(scope))return adminJson({error:'invalid_scope'},400,origin);
    return adminJson(await syncGamesPage(env,{...params,scope}),200,origin);
  }
  const multi=path.match(/^\/admin\/collect-(twitch|youtube)$/);
  if(multi && req.method==='POST'){
    if(!isAdmin(req,env))return adminJson({error:'unauthorized'},401,origin);
    const params=paging(url,{defaultLimit:3,maxLimit:5});
    if(!params)return adminJson({error:'invalid_pagination'},400,origin);
    return adminJson(await collectMultiSource(env,{provider:multi[1],...params}),200,origin);
  }
  if(path==='/admin/collect-editorial' && req.method==='POST'){
    if(!isAdmin(req,env))return adminJson({error:'unauthorized'},401,origin);
    const params=paging(url,{defaultLimit:2,maxLimit:3});
    if(!params)return adminJson({error:'invalid_pagination'},400,origin);
    return adminJson(await collectEditorial(env,params),200,origin);
  }
  if(path==='/admin/import-videos' && req.method==='POST'){
    if(!isAdmin(req,env))return adminJson({error:'unauthorized'},401,origin);
    if(Number(req.headers.get('Content-Length')||'0')>16000)return adminJson({error:'body_too_large'},413,origin);
    const raw=await req.text();if(raw.length>16000)return adminJson({error:'body_too_large'},413,origin);
    let body;try{body=JSON.parse(raw);}catch{return adminJson({error:'invalid_json'},400,origin);}
    const result=await importVideoLinks(env,body?.videos);
    return adminJson(result,result.error?400:200,origin);
  }
  if(path==='/admin/editorial-review' && req.method==='GET'){
    if(!isAdmin(req,env))return adminJson({error:'unauthorized'},401,origin);
    const params=paging(url,{defaultLimit:25,maxLimit:50});
    if(!params)return adminJson({error:'invalid_pagination'},400,origin);
    return adminJson(await listEditorialReview(env,params),200,origin);
  }
  if(path==='/admin/editorial-review' && req.method==='POST'){
    if(!isAdmin(req,env))return adminJson({error:'unauthorized'},401,origin);
    if(Number(req.headers.get('Content-Length')||'0')>4096)return adminJson({error:'body_too_large'},413,origin);
    const raw=await req.text();if(raw.length>4096)return adminJson({error:'body_too_large'},413,origin);
    let data;try{data=JSON.parse(raw);}catch{return adminJson({error:'invalid_json'},400,origin);}
    const result=await reviewEditorialLink(env,{articleId:data.article_id,gameId:data.game_id,decision:data.decision});
    return adminJson(result,result.error?400:200,origin);
  }
  if(path==='/admin/collect-steam-signals' && req.method==='POST'){
    if(!isAdmin(req,env))return adminJson({error:'unauthorized'},401,origin);
    const params=paging(url,{defaultLimit:5,maxLimit:5});
    if(!params)return adminJson({error:'invalid_pagination',hint:'cursor nonnegative; limit 1–5'},400,origin);
    return adminJson(await collectSteamSignals(env,params),200,origin);
  }
  if(path==='/admin/export-signals' && req.method==='GET'){
    if(!isAdmin(req,env))return adminJson({error:'unauthorized'},401,origin);
    const params=paging(url,{defaultLimit:200,maxLimit:500});
    if(!params)return adminJson({error:'invalid_pagination',hint:'cursor nonnegative; limit 1–500'},400,origin);
    return adminJson(await exportSignals(env,params),200,origin);
  }
  if(!ALLOWED.includes(req.method))return json({error:'method_not_allowed'},405,origin);
  if(path==='/health'){
    const src=await env.DB.prepare('SELECT enabled,rights_status,last_success_at FROM source_registry WHERE source_id=?').bind('igdb').first();
    const signalSrc=await env.DB.prepare('SELECT enabled,rights_status,last_success_at FROM signal_source_registry WHERE source_id=?').bind('steam_current_players').first();
    return json({status:src?.enabled?'operational':'setup_required',igdb:src||null,
      signal_sources:{steam_current_players:signalSrc||null},forecast_status:'not_validated'},200,origin);
  }
  if(path==='/sources'){
    const rows=await env.DB.prepare(`SELECT source_id,provider,description,enabled,rights_status,
      last_success_at,last_failure_at FROM signal_source_registry ORDER BY source_id`).all();
    return json({sources:rows.results,warning:'Approval is source-specific; enabled does not establish data coverage.'},200,origin);
  }
  if(path==='/trending'){
    const limit=clampInt(url.searchParams.get('limit'),20,100);
    return json(await momentumDashboard(env,{limit}),200,origin);
  }
  const news=path.match(/^\/game\/(\d+)\/news$/);
  if(news){
    const id=Number(news[1]);
    const g=await env.DB.prepare('SELECT id FROM games WHERE id=?').bind(id).first();
    if(!g)return json({error:'not_found'},404,origin);
    return json(await gameEditorial(env,id,{limit:clampInt(url.searchParams.get('limit'),25,100)}),200,origin);
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
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||''))return json({error:'invalid_month',hint:'Use YYYY-MM'},400,origin);
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
  const signals=path.match(/^\/game\/(\d+)\/signals$/);
  if(signals){
    const id=Number(signals[1]);
    const g=await env.DB.prepare('SELECT id FROM games WHERE id=?').bind(id).first();
    if(!g)return json({error:'not_found'},404,origin);
    return json(await listGameSignals(env,id,{limit:clampInt(url.searchParams.get('limit'),100,500)}),200,origin);
  }
  const variants=path.match(/^\/game\/(\d+)\/variants$/);
  if(variants){
    const id=Number(variants[1]);
    const g=await env.DB.prepare('SELECT id FROM games WHERE id=?').bind(id).first();
    if(!g)return json({error:'not_found'},404,origin);
    const r=await env.DB.prepare(`SELECT provider,external_id,variant_code,match_status,match_method,verified_at
      FROM external_game_ids WHERE game_id=? ORDER BY variant_code,provider`).bind(id).all();
    return json({game_id:id,variants:r.results.map(e=>({...e,designation:`${id}.${e.variant_code||'unassigned'}`})),
      note:'Designations are internal labels; candidate IDs are not independently verified.'},200,origin);
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
  if(path==='/forecasts'||path.startsWith('/forecasts/'))return json({status:'insufficient_data',probability:null,reason_codes:['MODEL_NOT_VALIDATED']},200,origin);
  if(path==='/stats'){
    const r=await env.DB.prepare('SELECT COUNT(*) AS games FROM games').first();
    const s=await env.DB.prepare('SELECT COUNT(*) AS observations, COUNT(DISTINCT game_id) AS games_with_signals FROM signal_observations').first();
    return json({games:r.games,observations:s.observations,games_with_signals:s.games_with_signals,forecast_status:'not_validated'},200,origin);
  }
  return json({error:'not_found'},404,origin);
}
export default {
  async fetch(req,env){try{return await handler(req,env);}catch(e){console.error('request_failed',e?.message);return json({error:'service_unavailable'},503,env.CORS_ORIGIN||'*');}},
  async scheduled(event,env,ctx){
    ctx.waitUntil(syncGames(env).catch(e=>console.error('sync_failed',e?.message)));
    // Explicit double opt-in: config flag AND source rights approval. Default remains disabled.
    if(env.STEAM_COLLECTION_ENABLED==='true') ctx.waitUntil((async()=>{
      const key='gst:steam:collection_cursor';
      const cursor=Number(await env.CACHE.get(key)||0);
      const result=await collectSteamSignals(env,{cursor:Number.isSafeInteger(cursor)?cursor:0,limit:5});
      if(result.status==='ok')await env.CACHE.put(key,String(result.done?0:result.next_cursor));
    })().catch(e=>console.error('steam_collection_failed',e?.message)));
    for(const [provider,flag,limit] of [['twitch','TWITCH_COLLECTION_ENABLED',2],['youtube','YOUTUBE_COLLECTION_ENABLED',2]]){
      if(env[flag]!=='true')continue;
      ctx.waitUntil((async()=>{
        const key=`gst:c2:cursor:${provider}`;
        const cursor=Number(await env.CACHE.get(key)||0);
        const result=await collectMultiSource(env,{provider,cursor:Number.isSafeInteger(cursor)?cursor:0,limit});
        if(result.status==='ok')await env.CACHE.put(key,String(result.done?0:result.next_cursor));
      })().catch(()=>console.error('multisource_collection_failed',provider)));
    }
    if(env.EDITORIAL_COLLECTION_ENABLED==='true')ctx.waitUntil((async()=>{
      const key='gst:c2:cursor:editorial',cursor=Number(await env.CACHE.get(key)||0);
      const result=await collectEditorial(env,{cursor:Number.isSafeInteger(cursor)?cursor:0,limit:1});
      if(result.status==='ok')await env.CACHE.put(key,String(result.done?0:result.next_cursor));
    })().catch(()=>console.error('editorial_collection_failed')));
  }
};
