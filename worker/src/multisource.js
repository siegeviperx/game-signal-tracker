import {token} from './igdb.js';
import {sourceAllowed,isCount,recordMetric} from './measurements.js';
const CONFIG={
  twitch:{source:'twitch_category_viewers',provider:'twitch',metric:'top_100_live_stream_viewers_sampled',unit:'viewers'},
  youtube:{source:'youtube_video_views',provider:'youtube',metric:'cumulative_video_views',unit:'views'}
};
export function parseTwitchStreams(body){
  if(!Array.isArray(body?.data))return null;
  if(body.data.length>100)return null;
  let total=0;
  for(const stream of body.data){if(!isCount(stream.viewer_count))return null;total+=stream.viewer_count;}
  return Number.isSafeInteger(total)?total:null;
}
export function parseYouTubeViews(body,id){
  const item=(body?.items||[]).find(x=>x.id===id);
  const count=item?.statistics?.viewCount;
  if(typeof count!=='string'||!/^(0|[1-9]\d*)$/.test(count))return null;
  const number=Number(count);
  return isCount(number)?number:null;
}
async function loadApproved(env,source){
  const row=await env.DB.prepare('SELECT enabled,rights_status FROM signal_source_registry WHERE source_id=?').bind(source).first();
  return sourceAllowed(row);
}
async function page(env,provider,cursor,limit){
  if(provider==='youtube'){
    const r=await env.DB.prepare(`SELECT id,game_id,video_id AS external_id FROM game_video_assets
      WHERE official_status='verified' AND id>? ORDER BY id LIMIT ?`).bind(cursor,limit).all();
    return r.results.map(x=>({...x,mapping_id:null,identity_key:`youtube:video:${x.external_id}`}));
  }
  const r=await env.DB.prepare(`SELECT id,game_id,external_id FROM external_game_ids
    WHERE provider='twitch' AND match_status='verified' AND id>? ORDER BY id LIMIT ?`).bind(cursor,limit).all();
  return r.results.map(x=>({...x,mapping_id:x.id,identity_key:`listing:${x.id}`}));
}
async function hasMore(env,provider,cursor){
  const sql=provider==='youtube'?
    `SELECT id FROM game_video_assets WHERE official_status='verified' AND id>? LIMIT 1`:
    `SELECT id FROM external_game_ids WHERE provider='twitch' AND match_status='verified' AND id>? LIMIT 1`;
  return !!(await env.DB.prepare(sql).bind(cursor).first());
}
async function sampleTwitch(env,categoryId,access){
  const url=`https://api.twitch.tv/helix/streams?game_id=${encodeURIComponent(categoryId)}&first=100`;
  try {
    const res=await fetch(url,{headers:{'Client-ID':env.IGDB_CLIENT_ID,'Authorization':`Bearer ${access}`},signal:AbortSignal.timeout(8000)});
    if(!res.ok)return {value:null,reason:`http_${res.status}`};
    const value=parseTwitchStreams(await res.json());
    return value===null?{value:null,reason:'invalid_response'}:{value,reason:null};
  }catch{return {value:null,reason:'request_failed'};}
}
async function sampleYouTube(env,videoId){
  const url=new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part','statistics');url.searchParams.set('id',videoId);
  url.searchParams.set('key',env.YOUTUBE_API_KEY);
  try {
    const res=await fetch(url,{signal:AbortSignal.timeout(8000)});
    if(!res.ok)return {value:null,reason:`http_${res.status}`};
    const value=parseYouTubeViews(await res.json(),videoId);
    return value===null?{value:null,reason:'unavailable_or_invalid_video'}:{value,reason:null};
  }catch{return {value:null,reason:'request_failed'};}
}
export async function collectMultiSource(env,{provider,cursor=0,limit=5}={}){
  const cfg=CONFIG[provider];
  if(!cfg)return {status:'invalid_provider'};
  if(!Number.isSafeInteger(cursor)||cursor<0||!Number.isInteger(limit)||limit<1||limit>5)
    throw new RangeError('invalid pagination');
  if(!await loadApproved(env,cfg.source))return {status:'disabled',reason:'SOURCE_RIGHTS_NOT_APPROVED',source_id:cfg.source,processed:0,done:false};
  if(provider==='youtube'&&!env.YOUTUBE_API_KEY)return {status:'configuration_required',source_id:cfg.source,reason:'YOUTUBE_API_KEY_MISSING'};
  if(provider==='twitch'&&(!env.IGDB_CLIENT_ID||!env.IGDB_CLIENT_SECRET))
    return {status:'configuration_required',source_id:cfg.source,reason:'TWITCH_OAUTH_CREDENTIALS_MISSING'};
  const items=await page(env,provider,cursor,limit);
  if(!items.length)return {status:'ok',source_id:cfg.source,processed:0,observed:0,missing:0,next_cursor:null,done:true};
  const auth=provider==='twitch'?await token(env):null;
  let observed=0,missing=0;
  const run=await env.DB.prepare(`INSERT INTO signal_collection_runs(source_id,started_at,status)
    VALUES (?,unixepoch(),'running')`).bind(cfg.source).run();
  const runId=run.meta?.last_row_id;
  for(const item of items){
    const answer=provider==='twitch'?await sampleTwitch(env,item.external_id,auth):await sampleYouTube(env,item.external_id);
    const evidenceUrl=provider==='twitch'?'https://www.twitch.tv/directory':
      `https://www.youtube.com/watch?v=${encodeURIComponent(item.external_id)}`;
    const result=await recordMetric(env,{gameId:item.game_id,mappingId:item.mapping_id,
      identityKey:item.identity_key,sourceId:cfg.source,platform:provider==='twitch'?'Twitch':'YouTube',
      metric:cfg.metric,unit:cfg.unit,value:answer.value,missingReason:answer.reason,
      evidenceUrl,observedAt:Math.floor(Date.now()/1000)});
    if(result.inserted){if(answer.value===null)missing++;else observed++;}
  }
  const next=items.at(-1).id,more=await hasMore(env,provider,next);
  if(runId)await env.DB.prepare(`UPDATE signal_collection_runs
    SET status='complete',finished_at=unixepoch(),processed=?,observed=?,missing=?,next_cursor=? WHERE id=?`)
    .bind(items.length,observed,missing,more?next:null,runId).run();
  const field=observed?'last_success_at':'last_failure_at';
  await env.DB.prepare(`UPDATE signal_source_registry SET ${field}=unixepoch() WHERE source_id=?`).bind(cfg.source).run();
  return {status:'ok',source_id:cfg.source,processed:items.length,observed,missing,next_cursor:more?next:null,
    done:!more,meaning:provider==='twitch'?'Viewer sum across up to 100 top category streams at sample time; incomplete coverage':
      'Cumulative views for each explicitly verified YouTube video; not unique viewers, popularity probability, or sales'};
}
