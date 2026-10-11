// Exact IGDB->Twitch category mapping via official Helix Get Games?igdb_id=...
// No fuzzy title matching. Only runs after approved Twitch access and admin auth.
import {token} from './igdb.js';
import {nextSuffix} from './variants.js';
import {sourceAllowed} from './measurements.js';
export function exactTwitchMatches(data,requestedIds){
  const approved=new Set(requestedIds.map(String));
  if(!Array.isArray(data?.data))throw new TypeError('Invalid Twitch response');
  const result=new Map();
  for(const row of data.data){
    const id=String(row?.igdb_id??''),external=String(row?.id??'');
    if(!approved.has(id)||!/^[1-9]\d*$/.test(external))continue;
    if(!result.has(Number(id)))result.set(Number(id),new Set());
    result.get(Number(id)).add(external);
  }
  return result;
}
export async function matchTwitchCategories(env,{cursor=0,limit=20}={}){
  if(!Number.isSafeInteger(cursor)||cursor<0||!Number.isInteger(limit)||limit<1||limit>25)
    throw new RangeError('invalid pagination');
  const source=await env.DB.prepare(`SELECT enabled,rights_status FROM signal_source_registry
    WHERE source_id='twitch_category_viewers'`).first();
  if(!sourceAllowed(source))return {status:'disabled',reason:'SOURCE_RIGHTS_NOT_APPROVED'};
  if(!env.IGDB_CLIENT_ID||!env.IGDB_CLIENT_SECRET)return {status:'configuration_required',reason:'TWITCH_OAUTH_CREDENTIALS_MISSING'};
  const page=await env.DB.prepare(`SELECT id FROM games WHERE id>? ORDER BY id LIMIT ?`).bind(cursor,limit).all();
  const ids=page.results.map(x=>x.id);
  if(!ids.length)return {status:'ok',processed:0,matched:0,already_mapped:0,conflicts:0,unmatched:0,done:true,next_cursor:null};
  const url=new URL('https://api.twitch.tv/helix/games');
  for(const id of ids)url.searchParams.append('igdb_id',String(id));
  const access=await token(env);
  const res=await fetch(url,{headers:{'Client-ID':env.IGDB_CLIENT_ID,Authorization:`Bearer ${access}`},
    signal:AbortSignal.timeout(9000)});
  if(!res.ok)return {status:'upstream_error',upstream_status:res.status,next_cursor:cursor,processed:0};
  const candidates=exactTwitchMatches(await res.json(),ids);
  let matched=0,alreadyMapped=0,conflicts=0,unmatched=0,upgraded=0;
  const conflictDetails=[];
  for(const id of ids){
    const choices=[...(candidates.get(id)||[])].sort();
    if(!choices.length){unmatched++;continue;}
    const existing=await env.DB.prepare(`SELECT variant_code FROM external_game_ids WHERE game_id=?`).bind(id).all();
    const used=existing.results.map(x=>x.variant_code).filter(Boolean);
    for(const externalId of choices){
      const mapping=await env.DB.prepare(`SELECT game_id,external_id,match_status FROM external_game_ids
        WHERE provider='twitch' AND external_id=?`).bind(externalId).first();
      if(mapping){
        if(mapping.game_id!==id){conflicts++;conflictDetails.push({game_id:id,twitch_id:externalId,reason:'external_id_assigned_elsewhere'});continue;}
        alreadyMapped++;
        if(mapping.match_status==='candidate'){
          const update=await env.DB.prepare(`UPDATE external_game_ids SET match_status='verified',
            match_method='twitch_helix_igdb_id',verified_at=unixepoch()
            WHERE game_id=? AND provider='twitch' AND external_id=? AND match_status='candidate'`)
            .bind(id,externalId).run();
          if(update.meta?.changes===1)upgraded++;
        }
        continue;
      }
      const suffix=nextSuffix(used);
      const inserted=await env.DB.prepare(`INSERT OR IGNORE INTO external_game_ids
        (game_id,provider,external_id,match_status,match_method,verified_at,variant_code)
        VALUES (?,'twitch',?,'verified','twitch_helix_igdb_id',unixepoch(),?)`)
        .bind(id,externalId,suffix).run();
      if(inserted.meta?.changes===1){matched++;used.push(suffix);}else conflicts++;
    }
  }
  const next=ids.at(-1);
  const more=await env.DB.prepare('SELECT id FROM games WHERE id>? LIMIT 1').bind(next).first();
  return {status:'ok',processed:ids.length,matched,upgraded,already_mapped:alreadyMapped,
    conflicts,unmatched,conflict_details:conflictDetails,next_cursor:more?next:null,done:!more,
    note:'Verified ONLY when Twitch Get Games returns an exact IGDB ID. Category IDs are not Steam IDs.'};
}
