import {API_BASE} from './config.js';
const $ = id => document.getElementById(id);
const fmt = v => v == null ? 'Unavailable' : Number(v).toLocaleString();
const addCell = (row,txt) => {const td=document.createElement('td');td.textContent=String(txt);row.append(td);};
async function api(path){const r=await fetch(API_BASE+path);if(!r.ok)throw new Error(`API ${r.status}`);return r.json();}
$('search-form').addEventListener('submit',async event=>{
  event.preventDefault();$('feedback').textContent='Searching…';
  try {
    const q=$('game-query').value.trim();
    const result=await api('/games?limit=100&q='+encodeURIComponent(q));
    $('game-choice').replaceChildren();
    for(const g of result.data){const opt=document.createElement('option');opt.value=g.id;opt.textContent=`${g.name} (IGDB ${g.id})`;$('game-choice').append(opt);}
    $('feedback').textContent=`${result.data.length} results shown. Select a title.`;
  } catch(e){$('feedback').textContent=`Search unavailable: ${e.message}`;}
});
$('choose-form').addEventListener('submit',event=>{event.preventDefault();const id=$('game-choice').value;if(id)loadGame(id);});
let latestRows=[];
function draw(rows){
  const selected=$('signal-metric').value;
  rows=rows.filter(r=>`${r.source_id}|${r.metric}|${r.unit}`===selected);
  const canvas=$('signal-chart'),ctx=canvas.getContext('2d');
  const W=canvas.width,H=canvas.height;ctx.clearRect(0,0,W,H);
  ctx.strokeStyle='#344962';ctx.lineWidth=1;
  for(let t=0;t<=4;t++){const y=24+t*(H-48)/4;ctx.beginPath();ctx.moveTo(55,y);ctx.lineTo(W-18,y);ctx.stroke();}
  const groups=new Map();
  for(const r of rows){if(r.value_last==null)continue;const key=String(r.identity_key||r.mapping_id||'game');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
  const all=[...groups.values()].flat();
  if(!all.length){ctx.fillStyle='#d4e4f4';ctx.font='19px sans-serif';ctx.fillText('No collected observations yet',70,140);return;}
  const ts=all.map(r=>Date.parse(r.day_utc+'T00:00:00Z'));
  let minX=Math.min(...ts),maxX=Math.max(...ts);if(minX===maxX)maxX=minX+86400000;
  const maxY=Math.max(1,...all.map(r=>r.value_last));
  const palette=['#7bbdf5','#f2c879','#a9e3bc','#dcaaff','#ff9696'];
  let j=0;
  for(const [key,group] of groups){
    group.sort((a,b)=>a.day_utc.localeCompare(b.day_utc));ctx.strokeStyle=palette[j%palette.length];ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=2;
    ctx.beginPath();for(let i=0;i<group.length;i++){const r=group[i],x=55+(Date.parse(r.day_utc+'T00:00:00Z')-minX)/(maxX-minX)*(W-75),y=H-24-r.value_last/maxY*(H-48);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();
    for(const r of group){const x=55+(Date.parse(r.day_utc+'T00:00:00Z')-minX)/(maxX-minX)*(W-75),y=H-24-r.value_last/maxY*(H-48);ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();}
    ctx.font='13px sans-serif';ctx.fillText(`${key}`,65+120*j,20);j++;
  }
  ctx.fillStyle='#c4d4e5';ctx.font='13px sans-serif';ctx.fillText('0',24,H-20);ctx.fillText(fmt(maxY),10,25);
}
async function loadGame(id){
  $('feedback').textContent='Loading observed records…';
  try{
    const [detail,variants,signals,news]=await Promise.all([api('/game/'+id),api('/game/'+id+'/variants'),api('/game/'+id+'/signals?limit=500'),api('/game/'+id+'/news')]);
    $('profile').hidden=false;$('game-title').textContent=detail.game.name;
    $('variant-rows').replaceChildren();
    for(const v of variants.variants){const tr=document.createElement('tr');
      for(const s of [v.designation,v.provider,v.external_id,v.match_status])addCell(tr,s);$('variant-rows').append(tr);}
    $('signal-rows').replaceChildren();
    for(const r of signals.rows){const tr=document.createElement('tr');
      for(const s of [r.day_utc,r.variant_code?`${id}.${r.variant_code}`:'Canonical game',r.source_id,r.metric,fmt(r.value_last),fmt(r.value_max),r.observed_count,r.missing_count])addCell(tr,s);
      $('signal-rows').append(tr);}
    $('news-rows').replaceChildren();
    for(const article of news.articles||[]){const tr=document.createElement('tr'),td=document.createElement('td'),a=document.createElement('a');a.href=article.url;a.textContent=article.title;a.target='_blank';a.rel='noopener noreferrer';td.append(a);tr.append(td);addCell(tr,article.publisher);addCell(tr,article.published_at?new Date(article.published_at*1000).toLocaleDateString():'Unspecified');$('news-rows').append(tr);}
    $('news-note').textContent=(news.articles||[]).length?`${news.articles.length} reviewed game-linked articles (not independently validated release claims).`:'No reviewed article links yet.';
    $('signal-note').textContent=signals.rows.length?`${signals.rows.length} variant/day records. Sampled maximum is not a full daily peak; IDs marked candidate require validation.`:'No signal history yet. Source approval and collection are separate operational steps.';
    latestRows=signals.rows;
    const metricSelect=$('signal-metric');metricSelect.replaceChildren();
    const unique=[...new Set(signals.rows.map(r=>`${r.source_id}|${r.metric}|${r.unit}`))];
    for(const metric of unique){const opt=document.createElement('option');opt.value=metric;opt.textContent=metric.split('|').join(' · ');metricSelect.append(opt);}
    $('feedback').textContent=`Loaded ${variants.variants.length} external listings, ${signals.rows.length} daily observations.`;draw(signals.rows);
  }catch(e){$('feedback').textContent=`Could not load game signals: ${e.message}`;}
}
$('signal-metric').addEventListener('change',()=>draw(latestRows));
const preselected=new URLSearchParams(location.search).get('game');
if(preselected&&/^\d+$/.test(preselected))loadGame(preselected);
