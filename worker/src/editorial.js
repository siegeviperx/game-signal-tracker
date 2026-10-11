import {sourceAllowed} from './measurements.js';
const SOURCE='editorial_rss';
const MAX_XML_BYTES=750000;
const escapeRe = s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function decodeXml(s){
  return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi,'$1')
    .replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{
      const num=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):parseInt(n,10);
      return num>0&&num<=0x10ffff?String.fromCodePoint(num):'';
    }).replace(/&(?:amp|lt|gt|quot|apos);/gi,m=>({
      '&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"
    })[m.toLowerCase()]||m).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
}
export function canonicalArticleUrl(raw){
  try {
    const u=new URL(raw);
    const host=u.hostname.toLowerCase();
    const blocked=host==='localhost'||host.endsWith('.local')||host.endsWith('.internal')||
      host==='[::1]'||host==='::1'||host==='0.0.0.0'||/^127\./.test(host)||/^10\./.test(host)||
      /^192\.168\./.test(host)||/^169\.254\./.test(host)||
      /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host);
    if(u.protocol!=='https:' || u.username || u.password || blocked || host.length<4)return null;
    u.hash='';
    for(const key of [...u.searchParams.keys()])if(/^utm_/i.test(key)||['fbclid','gclid'].includes(key.toLowerCase()))u.searchParams.delete(key);
    return u.toString();
  }catch{return null;}
}
const tag=(str,t)=>{
  const m=str.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${t}\\s*>`,'i'));
  return m?decodeXml(m[1]):null;
};
export function parseEditorialXml(xml){
  if(typeof xml!=='string'||xml.length>MAX_XML_BYTES)return [];
  const result=[];
  const entries=[...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1\s*>/gi)].slice(0,60);
  for(const [,type,body] of entries){
    const title=tag(body,'title');
    const rssUrl=tag(body,'link');
    const atomLink=body.match(/<link\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*\/?\s*>/i)?.[2];
    const url=canonicalArticleUrl(type.toLowerCase()==='entry'?(atomLink||rssUrl):(rssUrl||atomLink));
    if(!title||title.length>300||!url)continue;
    const rawDate=tag(body,'pubDate')||tag(body,'published')||tag(body,'updated');
    const milliseconds=rawDate?Date.parse(rawDate):NaN;
    const publishedAt=Number.isFinite(milliseconds)&&milliseconds>=0?Math.floor(milliseconds/1000):null;
    result.push({title,url,publishedAt});
  }
  return result;
}
async function boundedFeed(url){
  const parsed=canonicalArticleUrl(url);
  if(!parsed)throw new Error('invalid_feed_url');
  const res=await fetch(parsed,{headers:{Accept:'application/rss+xml, application/atom+xml, application/xml, text/xml'},
    redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!res.ok)throw new Error(`http_${res.status}`);
  const reader=res.body?.getReader();if(!reader)throw new Error('no_response_body');
  const chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>MAX_XML_BYTES)throw new Error('feed_too_large');chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return new TextDecoder().decode(bytes);
}
function nameInTitle(name,title){
  if(!name||name.length<6)return false;
  const escaped=escapeRe(name.toLowerCase());
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`,'i').test(title.toLowerCase());
}
export function uniqueGameCandidate(title,known){
  const matched=new Set();
  for(const game of known)if(nameInTitle(game.name,title))matched.add(game.id);
  return matched.size===1?[...matched][0]:null;
}
async function resolveTitle(env,title){
  // Database performs initial lookup; regex checks word boundaries after the query.
  const r=await env.DB.prepare(`SELECT id,name FROM games
    WHERE length(name)>=6 AND ? LIKE '%' || name || '%' ORDER BY length(name) DESC LIMIT 8`)
    .bind(title).all();
  const a=await env.DB.prepare(`SELECT game_id AS id,alias AS name FROM aliases
    WHERE length(alias)>=6 AND ? LIKE '%' || alias || '%' ORDER BY length(alias) DESC LIMIT 8`)
    .bind(title).all();
  // No model guesses and no unreviewed article counts in public momentum.
  return uniqueGameCandidate(title,[...r.results,...a.results]);
}
export async function collectEditorial(env,{cursor=0,limit=2}={}){
  if(!Number.isSafeInteger(cursor)||cursor<0||!Number.isInteger(limit)||limit<1||limit>3)
    throw new RangeError('invalid pagination');
  const source=await env.DB.prepare('SELECT enabled,rights_status FROM signal_source_registry WHERE source_id=?').bind(SOURCE).first();
  if(!sourceAllowed(source))return {status:'disabled',source_id:SOURCE,reason:'SOURCE_RIGHTS_NOT_APPROVED'};
  const feedRows=await env.DB.prepare(`SELECT id,feed_url FROM editorial_feeds
    WHERE source_id=? AND enabled=1 AND review_status='approved' AND id>?
    ORDER BY id LIMIT ?`).bind(SOURCE,cursor,limit).all();
  let fetched=0,articles=0,candidates=0,errors=0;
  for(const feed of feedRows.results){
    try {
      const items=parseEditorialXml(await boundedFeed(feed.feed_url));fetched++;
      for(const article of items){
        const inserted=await env.DB.prepare(`INSERT OR IGNORE INTO editorial_articles(feed_id,url,title,published_at)
          VALUES (?,?,?,?)`).bind(feed.id,article.url,article.title,article.publishedAt).run();
        if(inserted.meta?.changes!==1)continue;
        articles++;
        const gameId=await resolveTitle(env,article.title);
        if(gameId){
          await env.DB.prepare(`INSERT OR IGNORE INTO editorial_game_links(article_id,game_id,match_method)
            SELECT id,?,'unique_title_candidate' FROM editorial_articles WHERE url=?`)
            .bind(gameId,article.url).run();candidates++;
        }
      }
      await env.DB.prepare(`UPDATE editorial_feeds SET last_success_at=unixepoch(),last_error_code=NULL WHERE id=?`).bind(feed.id).run();
    }catch(e){errors++;
      // Persist only sanitized error class, not remote URLs or credentials.
      const code=/^http_\d{3}$/.test(e?.message)?e.message:'feed_failure';
      await env.DB.prepare('UPDATE editorial_feeds SET last_error_code=? WHERE id=?').bind(code,feed.id).run();
    }
  }
  const last=feedRows.results.at(-1)?.id??null;
  const more=last===null?false:!!(await env.DB.prepare(`SELECT id FROM editorial_feeds WHERE source_id=? AND enabled=1
    AND review_status='approved' AND id>? LIMIT 1`).bind(SOURCE,last).first());
  if(fetched)await env.DB.prepare('UPDATE signal_source_registry SET last_success_at=unixepoch() WHERE source_id=?').bind(SOURCE).run();
  return {status:'ok',processed_feeds:feedRows.results.length,fetched_feeds:fetched,inserted_articles:articles,
    candidate_links:candidates,feed_errors:errors,next_cursor:more?last:null,done:!more,
    note:'Unique headline associations are review candidates, never verified claims or release-date changes.'};
}
export async function listEditorialReview(env,{cursor=0,limit=25}={}){
  const rows=await env.DB.prepare(`SELECT a.id AS article_id,a.title,a.url,a.published_at,f.publisher,
    l.game_id,g.name AS game_name,l.match_method
    FROM editorial_game_links l JOIN editorial_articles a ON a.id=l.article_id
    JOIN editorial_feeds f ON f.id=a.feed_id JOIN games g ON g.id=l.game_id
    WHERE l.match_status='candidate' AND a.id>? ORDER BY a.id LIMIT ?`)
    .bind(cursor,limit).all();
  return {rows:rows.results,next_cursor:rows.results.at(-1)?.article_id??null};
}
export async function reviewEditorialLink(env,{articleId,gameId,decision}){
  if(!Number.isSafeInteger(articleId)||articleId<1||!Number.isSafeInteger(gameId)||gameId<1||
     !['verified','rejected'].includes(decision))return {error:'invalid_review'};
  const result=await env.DB.prepare(`UPDATE editorial_game_links
    SET match_status=?, verified_at=CASE WHEN ?='verified' THEN unixepoch() ELSE NULL END
    WHERE article_id=? AND game_id=? AND match_status='candidate'`)
    .bind(decision,decision,articleId,gameId).run();
  return {status:result.meta?.changes===1?'ok':'not_updated',article_id:articleId,game_id:gameId,decision};
}
export async function gameEditorial(env,gameId,{limit=25}={}){
  const rows=await env.DB.prepare(`SELECT a.title,a.url,a.published_at,f.publisher,l.match_method
    FROM editorial_game_links l JOIN editorial_articles a ON a.id=l.article_id
    JOIN editorial_feeds f ON f.id=a.feed_id
    WHERE l.game_id=? AND l.match_status='verified'
    ORDER BY COALESCE(a.published_at,a.discovered_at) DESC LIMIT ?`).bind(gameId,limit).all();
  return {game_id:gameId,articles:rows.results,
    note:'Game links reviewed; publisher claims and release dates are not independently verified.'};
}
