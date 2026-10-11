// Optional Steam sampled player-count collection; disabled until source rights approved.
// No implicit scraping, wishlists, sales, or forecast calculations.
const SOURCE = 'steam_current_players';
const METRIC = 'concurrent_players_sampled';
const MAX_LIMIT = 5;

export function parseSteamPlayerCount(payload) {
  const count = payload?.response?.player_count;
  if (payload?.response?.result !== 1 || !Number.isSafeInteger(count) || count < 0)
    return null;
  return count;
}
export function dayUTC(epoch) {
  if (!Number.isSafeInteger(epoch) || epoch < 0) throw new RangeError('epoch');
  return new Date(epoch * 1000).toISOString().slice(0,10);
}
export function sourceApproved(source) {
  return !!source && source.enabled === 1 && source.rights_status === 'approved';
}
export function aggregateSnapshot({existing, value, observedAt}) {
  if (value === null) return { // An unavailable metric is not zero.
    observed_count: existing?.observed_count ?? 0,
    missing_count: (existing?.missing_count ?? 0) + 1,
    value_min: existing?.value_min ?? null,
    value_max: existing?.value_max ?? null,
    value_last: existing?.value_last ?? null,
    last_observed_at: existing?.last_observed_at ?? null
  };
  return {
    observed_count: (existing?.observed_count ?? 0) + 1,
    missing_count: existing?.missing_count ?? 0,
    value_min: existing?.value_min == null ? value : Math.min(existing.value_min,value),
    value_max: existing?.value_max == null ? value : Math.max(existing.value_max,value),
    value_last: existing?.last_observed_at == null || observedAt >= existing.last_observed_at ? value : existing.value_last,
    last_observed_at: Math.max(existing?.last_observed_at ?? 0, observedAt)
  };
}
async function sampleSteam(appId) {
  // App ID comes only from the canonical external_game_ids table, never a public request.
  const url = `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${encodeURIComponent(appId)}`;
  try {
    const resp = await fetch(url, {headers:{Accept:'application/json'}, signal:AbortSignal.timeout(8000)});
    if (!resp.ok) return {value:null,reason:`http_${resp.status}`,url};
    const count = parseSteamPlayerCount(await resp.json());
    return count === null ? {value:null,reason:'missing_or_invalid_count',url} : {value:count,reason:null,url};
  } catch (e) {
    return {value:null,reason:e?.name === 'TimeoutError' ? 'timeout' : 'request_failed',url};
  }
}
async function recordSnapshot(env, mapping, result, timestamp) {
  const status = result.value === null ? 'missing' : 'observed';
  const inserted = await env.DB.prepare(`INSERT OR IGNORE INTO signal_observations
    (game_id,mapping_id,identity_key,scope,source_id,platform,metric,unit,observed_at,collection_status,value,missing_reason,evidence_url)
    VALUES (?,?,?,'listing',?,'PC (Steam)',?,'players',?,?,?,?,?)`)
    .bind(mapping.game_id,mapping.id,`listing:${mapping.id}`,SOURCE,METRIC,timestamp,status,result.value,result.reason,result.url).run();
  // Derive aggregates from immutable raw observations on every attempt. This is
  // idempotent and can repair a previous interrupted aggregate write.
  const day=dayUTC(timestamp);
  const summary=await env.DB.prepare(`SELECT
      SUM(CASE WHEN collection_status='observed' THEN 1 ELSE 0 END) AS observed_count,
      SUM(CASE WHEN collection_status='missing' THEN 1 ELSE 0 END) AS missing_count,
      MIN(value) AS value_min,MAX(value) AS value_max
      FROM signal_observations WHERE identity_key=? AND source_id=? AND metric=?
      AND observed_at>=? AND observed_at<?`)
    .bind(`listing:${mapping.id}`,SOURCE,METRIC,Date.parse(day+'T00:00:00Z')/1000,
      Date.parse(day+'T00:00:00Z')/1000+86400).first();
  const latest=await env.DB.prepare(`SELECT value,observed_at FROM signal_observations
      WHERE identity_key=? AND source_id=? AND metric=? AND collection_status='observed'
      AND observed_at>=? AND observed_at<? ORDER BY observed_at DESC,id DESC LIMIT 1`)
    .bind(`listing:${mapping.id}`,SOURCE,METRIC,Date.parse(day+'T00:00:00Z')/1000,
      Date.parse(day+'T00:00:00Z')/1000+86400).first();
  await env.DB.prepare(`INSERT INTO signal_daily
    (game_id,mapping_id,identity_key,scope,source_id,platform,metric,unit,day_utc,observed_count,missing_count,
      value_min,value_max,value_last,last_observed_at,updated_at)
    VALUES (?,?,?,'listing',?,'PC (Steam)',?,'players',?,?,?,?,?,?,?,unixepoch())
    ON CONFLICT(source_id,identity_key,metric,day_utc) DO UPDATE SET
      observed_count=excluded.observed_count, missing_count=excluded.missing_count,
      value_min=excluded.value_min,value_max=excluded.value_max,value_last=excluded.value_last,
      last_observed_at=excluded.last_observed_at,updated_at=excluded.updated_at`)
    .bind(mapping.game_id,mapping.id,`listing:${mapping.id}`,SOURCE,METRIC,day,summary?.observed_count??0,
      summary?.missing_count??0,summary?.value_min??null,summary?.value_max??null,
      latest?.value??null,latest?.observed_at??null).run();
  return inserted.meta?.changes === 1;
}

export async function collectSteamSignals(env,{cursor=0,limit=5}={}) {
  if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT)
    throw new RangeError('invalid pagination');
  const source = await env.DB.prepare('SELECT * FROM signal_source_registry WHERE source_id=?').bind(SOURCE).first();
  if (!sourceApproved(source)) return {status:'disabled',source_id:SOURCE,reason:'SOURCE_RIGHTS_NOT_APPROVED',processed:0,done:false};
  const rows = await env.DB.prepare(`SELECT id,game_id,external_id,variant_code,match_status
    FROM external_game_ids WHERE provider='steam' AND match_status IN ('candidate','verified')
      AND id>? ORDER BY id ASC LIMIT ?`).bind(cursor,limit).all();
  const mappings = rows.results;
  if (!mappings.length) return {status:'ok',processed:0,observed:0,missing:0,done:true,next_cursor:null};
  const started = Math.floor(Date.now()/1000);
  const run = await env.DB.prepare(`INSERT INTO signal_collection_runs(source_id,started_at,status)
    VALUES (?,?,'running')`).bind(SOURCE,started).run();
  const runId = run.meta?.last_row_id;
  let observed=0,missing=0;
  for (const mapping of mappings) {
    // Source is sampled once per mapped storefront listing, never inferred across editions.
    const result = await sampleSteam(mapping.external_id);
    const saved = await recordSnapshot(env,mapping,result,Math.floor(Date.now()/1000));
    if (saved) {if(result.value === null) missing++;else observed++;}
  }
  const next = mappings[mappings.length-1].id;
  const more = await env.DB.prepare(`SELECT id FROM external_game_ids
    WHERE provider='steam' AND match_status IN ('candidate','verified') AND id>? LIMIT 1`).bind(next).first();
  if (runId) await env.DB.prepare(`UPDATE signal_collection_runs SET status='complete',finished_at=?,
    processed=?,observed=?,missing=?,next_cursor=? WHERE id=?`)
    .bind(Math.floor(Date.now()/1000),mappings.length,observed,missing,more?next:null,runId).run();
  if(observed) await env.DB.prepare('UPDATE signal_source_registry SET last_success_at=? WHERE source_id=?').bind(Math.floor(Date.now()/1000),SOURCE).run();
  if(missing) await env.DB.prepare('UPDATE signal_source_registry SET last_failure_at=? WHERE source_id=?').bind(Math.floor(Date.now()/1000),SOURCE).run();
  return {status:'ok',processed:mappings.length,observed,missing,next_cursor:more?next:null,done:!more,
    metric:METRIC,unit:'players',meaning:'Point-in-time sampled CCU, not true peak; variant-level; candidates unverified'};
}
export async function listGameSignals(env,gameId,{limit=100}={}) {
  const rows = await env.DB.prepare(`SELECT d.day_utc,d.mapping_id,d.identity_key,d.scope,e.provider,e.external_id,e.variant_code,
    e.match_status,d.source_id,d.platform,d.metric,d.unit,d.observed_count,d.missing_count,
    d.value_min,d.value_max,d.value_last,d.last_observed_at
    FROM signal_daily d LEFT JOIN external_game_ids e ON e.id=d.mapping_id
    WHERE d.game_id=? ORDER BY d.day_utc DESC,d.mapping_id LIMIT ?`).bind(gameId,limit).all();
  return {game_id:gameId,status:rows.results.length?'observations_available':'insufficient_data',
    rows:rows.results,warning:'Daily maximum is maximum of sampled observations, NOT actual daily peak. No game-level summation across editions.'};
}
export async function exportSignals(env,{cursor=0,limit=200}={}) {
  if(!Number.isSafeInteger(cursor)||cursor<0||!Number.isSafeInteger(limit)||limit<1||limit>500) throw new RangeError('pagination');
  const r=await env.DB.prepare(`SELECT o.id,o.game_id,o.mapping_id,o.identity_key,o.scope,e.variant_code,e.external_id,e.match_status,
    o.source_id,o.platform,o.metric,o.unit,o.observed_at,o.collected_at,o.collection_status,o.value,o.missing_reason
    FROM signal_observations o LEFT JOIN external_game_ids e ON e.id=o.mapping_id
    WHERE o.id>? ORDER BY o.id LIMIT ?`).bind(cursor,limit).all();
  const rows=r.results,next=rows.at(-1)?.id??null;
  const more=next===null?false:!!(await env.DB.prepare('SELECT id FROM signal_observations WHERE id>? LIMIT 1').bind(next).first());
  return {rows,next_cursor:more?next:null,done:!more};
}
