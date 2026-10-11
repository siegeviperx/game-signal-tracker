// Bulk curator-assisted video association. No automatic claim of channel ownership.
const videoPattern=/^[A-Za-z0-9_-]{11}$/;
function safeHttps(value){
  try {const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash;}
  catch{return false;}
}
export function validateVideo(row){
  if(!row||!Number.isSafeInteger(row.game_id)||row.game_id<1||
    typeof row.video_id!=='string'||!videoPattern.test(row.video_id)||
    (row.title!=null&&(typeof row.title!=='string'||row.title.length>200))||
    !['candidate','verified'].includes(row.official_status||'candidate'))return null;
  const status=row.official_status||'candidate';
  if(status==='verified' && (!safeHttps(row.identity_evidence_url)||row.reviewer_confirmed!==true))return null;
  if(row.identity_evidence_url!=null&&!safeHttps(row.identity_evidence_url))return null;
  return {game_id:row.game_id,video_id:row.video_id,title:row.title||null,
    status,evidence:row.identity_evidence_url||null};
}
export async function importVideoLinks(env,records){
  if(!Array.isArray(records)||records.length<1||records.length>25)return {error:'invalid_batch_size'};
  const seen=new Set();let added=0,existing=0;
  for(const row of records){
    const normalized=validateVideo(row);
    if(!normalized||seen.has(normalized.video_id))return {error:'invalid_video_or_duplicate_in_batch'};
    seen.add(normalized.video_id);
  }
  const normalized=records.map(validateVideo);
  // First validate the whole batch for missing canonical games and wrong prior ownership.
  for(const item of normalized){
    const game=await env.DB.prepare('SELECT id FROM games WHERE id=?').bind(item.game_id).first();
    if(!game)return {error:'unknown_game_id',game_id:item.game_id};
    const linked=await env.DB.prepare('SELECT game_id FROM game_video_assets WHERE video_id=?').bind(item.video_id).first();
    if(linked&&linked.game_id!==item.game_id)return {error:'video_linked_to_other_game',video_id:item.video_id};
  }
  for(const item of normalized){
    const inserted=await env.DB.prepare(`INSERT OR IGNORE INTO game_video_assets
      (game_id,video_id,title,official_status,identity_evidence_url,verified_at)
      VALUES (?,?,?,?,?,CASE WHEN ?='verified' THEN unixepoch() ELSE NULL END)`)
      .bind(item.game_id,item.video_id,item.title,item.status,item.evidence,item.status).run();
    if(inserted.meta?.changes===1)added++;else existing++;
  }
  return {status:'ok',added,existing,warning:'Only explicitly curator-confirmed official videos marked verified can be sampled after source approval.'};
}
