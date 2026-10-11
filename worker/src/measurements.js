// Reusable point-in-time, missingness-aware signal storage. Never imputes zero.
export function sourceAllowed(row) {
  return !!row && Number(row.enabled)===1 && row.rights_status==='approved';
}
export function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}
export function utcDay(epoch) {
  return new Date(epoch*1000).toISOString().slice(0,10);
}
export async function recordMetric(env,{gameId,mappingId=null,identityKey,sourceId,platform=null,
  metric,unit,value,missingReason=null,evidenceUrl=null,observedAt=Math.floor(Date.now()/1000)}) {
  if(!Number.isSafeInteger(gameId) || gameId<1 || !Number.isSafeInteger(observedAt) || observedAt<0)
    throw new RangeError('invalid game or timestamp');
  if(!identityKey || !sourceId || !metric || !unit) throw new TypeError('metric identity required');
  if(value!==null && (!Number.isFinite(value) || value<0)) throw new RangeError('invalid signal value');
  const missing=value===null;
  if(missing && !missingReason) throw new TypeError('missing value requires reason');
  const scope=mappingId==null?'game':'listing';
  const params=[gameId,mappingId,identityKey,scope,sourceId,platform,metric,unit,observedAt,
    missing?'missing':'observed',value,missing?missingReason:null,evidenceUrl];
  const saved=await env.DB.prepare(`INSERT OR IGNORE INTO signal_observations
    (game_id,mapping_id,identity_key,scope,source_id,platform,metric,unit,observed_at,collection_status,value,missing_reason,evidence_url)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...params).run();
  // Reconstruct daily rollup from immutable raw records, safe on retries/interrupted runs.
  const day=utcDay(observedAt),start=Date.parse(day+'T00:00:00Z')/1000;
  const summary=await env.DB.prepare(`SELECT
    SUM(CASE WHEN collection_status='observed' THEN 1 ELSE 0 END) AS observed_count,
    SUM(CASE WHEN collection_status='missing' THEN 1 ELSE 0 END) AS missing_count,
    MIN(value) AS value_min, MAX(value) AS value_max
    FROM signal_observations WHERE source_id=? AND identity_key=? AND metric=?
    AND observed_at>=? AND observed_at<?`)
    .bind(sourceId,identityKey,metric,start,start+86400).first();
  const last=await env.DB.prepare(`SELECT value,observed_at FROM signal_observations
    WHERE source_id=? AND identity_key=? AND metric=? AND collection_status='observed'
      AND observed_at>=? AND observed_at<?
    ORDER BY observed_at DESC,id DESC LIMIT 1`)
    .bind(sourceId,identityKey,metric,start,start+86400).first();
  await env.DB.prepare(`INSERT INTO signal_daily
    (game_id,mapping_id,identity_key,scope,source_id,platform,metric,unit,day_utc,
      observed_count,missing_count,value_min,value_max,value_last,last_observed_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,unixepoch())
    ON CONFLICT(source_id,identity_key,metric,day_utc) DO UPDATE SET
      observed_count=excluded.observed_count,missing_count=excluded.missing_count,
      value_min=excluded.value_min,value_max=excluded.value_max,value_last=excluded.value_last,
      last_observed_at=excluded.last_observed_at,updated_at=excluded.updated_at`)
    .bind(gameId,mappingId,identityKey,scope,sourceId,platform,metric,unit,day,
      summary?.observed_count??0,summary?.missing_count??0,summary?.value_min??null,
      summary?.value_max??null,last?.value??null,last?.observed_at??null).run();
  return {inserted:saved.meta?.changes===1,status:missing?'missing':'observed'};
}
