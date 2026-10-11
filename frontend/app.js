import {API_BASE} from './config.js';
const $=id=>document.getElementById(id);
const state={page:1,view:'grid',analyst:false,rows:[],hasNext:false,calendarMonth:new Date().toISOString().slice(0,7),calendarRows:[],calendarLoading:false};
const watchKey='game-signal-watchlist-v1';
function watchlist(){try{return JSON.parse(localStorage.getItem(watchKey)||'[]')}catch{return []}}
function saveWatch(list){try{localStorage.setItem(watchKey,JSON.stringify(list))}catch{$('status').textContent='Watchlist storage is unavailable in this browser.'}}
function element(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text!=null)e.textContent=text;return e}
function dateText(epoch){if(!epoch)return 'Date TBA';return new Date(epoch*1000).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'})}
async function api(path){const r=await fetch(API_BASE+path);if(!r.ok)throw new Error(`API returned ${r.status}`);return r.json()}
function setCalendarVisibility(){
 const calendar=state.view==='calendar';
 $('calendar-controls').hidden=!calendar;
 $('calendar-note').hidden=!calendar;
 document.querySelector('.pagination').hidden=calendar;
 $('query').disabled=calendar;
 $('query').title=calendar?'Search applies to game cards, not the monthly calendar':'';
}
function shiftMonth(delta){
 const [year,month]=state.calendarMonth.split('-').map(Number);
 const date=new Date(Date.UTC(year,month-1+delta,1));
 state.calendarMonth=date.toISOString().slice(0,7);
 loadCalendar();
}
function renderCalendar(){
 const root=$('games');root.replaceChildren();
 const [year,month]=state.calendarMonth.split('-').map(Number);
 $('calendar-month-label').textContent=new Date(Date.UTC(year,month-1,1)).toLocaleDateString(undefined,{month:'long',year:'numeric',timeZone:'UTC'});
 const platform=$('platform').value;
 const rows=state.calendarRows.filter(r=>!platform||r.platform===platform);
 const groups=new Map();
 for(const r of rows){
   const key=[r.game_id,r.start_at,r.end_at,r.precision].join(':');
   if(!groups.has(key))groups.set(key,{...r,platforms:new Set()});
   if(r.platform)groups.get(key).platforms.add(r.platform);
 }
 const unique=[...groups.values()];
 unique.sort((a,b)=>(a.precision==='month'? -1:0)-(b.precision==='month'?-1:0)||a.start_at-b.start_at||a.name.localeCompare(b.name));
 $('status').className='status';
 $('status').textContent=`${unique.length} games / release windows · ${rows.length} platform release records · Source: IGDB (unconfirmed)`;
 if(!unique.length){root.append(element('div','empty','No observed releases match this month and platform. Try another month or platform.'));return}
 const monthOnly=unique.filter(r=>r.precision!=='day');
 const exact=unique.filter(r=>r.precision==='day');
 function section(title,items){
   if(!items.length)return;
   const heading=element('h3','calendar-section-title',title);root.append(heading);
   const grid=element('div','calendar-results');
   for(const r of items){
     const card=element('article','calendar-game');
     if(r.cover_url){const img=element('img','calendar-cover');img.src=r.cover_url;img.alt=`Cover art for ${r.name}`;img.loading='lazy';card.append(img)}
     const body=element('div','calendar-game-body');
     body.append(element('div','calendar-date',r.label||'Date unspecified'),element('h4','',r.name));
     body.append(element('div','muted',[...r.platforms].join(' · ')||'Platform unspecified'));
     body.append(element('span','chip',r.precision==='day'?'Observed day · Unconfirmed':'Approximate date · Unconfirmed'));
     const detailButton=element('button','open','View details →');
     detailButton.addEventListener('click',()=>detail(r.game_id));
     body.append(detailButton);card.append(body);grid.append(card);
   }
   root.append(grid);
 }
 section('Release window — date not exact',monthOnly);
 section('Day-specific release entries',exact);
}
async function loadCalendar(){
 if(state.view!=='calendar')return;
 const month=state.calendarMonth;
 $('games').replaceChildren(element('div','empty','Loading observed release dates…'));
 $('status').className='status';
 $('status').textContent='Loading monthly release calendar…';
 try{
   const data=await api('/calendar/month?month='+encodeURIComponent(month));
   if(state.view!=='calendar'||state.calendarMonth!==month)return;
   state.calendarRows=Array.isArray(data.data)?data.data:[];
   renderCalendar();
 }catch{
   if(state.view!=='calendar'||state.calendarMonth!==month)return;
   $('status').className='status error';
   $('status').textContent='Calendar API unavailable. Your game cards remain accessible in Cards view.';
   $('games').replaceChildren(element('div','empty','Could not load this month. Try Refresh or another month.'));
 }
}
async function load(){
 if(state.view==='calendar'){await loadCalendar();return}
 $('status').textContent='Loading source-backed game records…';$('games').replaceChildren();
 try{const p=new URLSearchParams({limit:'24',page:String(state.page)});const q=$('query').value.trim(),platform=$('platform').value;if(q)p.set('q',q);if(platform)p.set('platform',platform);
 const data=await api('/games?'+p);state.rows=data.data;state.hasNext=data.data.length===24;render();$('status').textContent=`${data.data.length} IGDB catalog records on this page · Forecasts: insufficient data`;
 }catch(e){$('status').textContent='Live data unavailable. Configure the Worker and approved IGDB integration to load real games.';$('status').className='status error';$('games').append(element('div','empty','No fabricated or demo game records are displayed. See README for deployment setup.'));}}
function render(){if(state.view==='calendar'){renderCalendar();return}const root=$('games');root.replaceChildren();const saved=watchlist();let rows=state.rows;if(state.view==='watchlist')rows=rows.filter(g=>saved.includes(g.id));
 if(!rows.length){root.append(element('div','empty',state.view==='watchlist'?'No watchlisted games on this page. Save games with the star icon.':'No games matched these filters.'));}
 for(const g of rows){const card=element('article','game'),cover=element('div','cover');if(g.cover_url){const img=element('img');img.src=g.cover_url;img.alt=`Cover art for ${g.name}`;img.loading='lazy';cover.append(img)}else cover.textContent='◈';card.append(cover);const body=element('div','game-body');body.append(element('div','muted',g.platforms.slice(0,2).join(' · ')||'Platform not specified'),element('h3','',g.name),element('div','muted',dateText(g.next_release)),element('span','chip','Forecast: insufficient data'));
 const bottom=element('div','game-bottom');const open=element('button','open','View details →');open.addEventListener('click',()=>detail(g.id));const star=element('button','watch'+(saved.includes(g.id)?' active':''),saved.includes(g.id)?'★':'☆');star.setAttribute('aria-label',saved.includes(g.id)?`Remove ${g.name} from watchlist`:`Add ${g.name} to watchlist`);star.addEventListener('click',()=>{const current=watchlist();saveWatch(current.includes(g.id)?current.filter(x=>x!==g.id):[...current,g.id]);render()});bottom.append(open,star);body.append(bottom);if(state.analyst)body.append(element('div','analyst-note','IGDB record · Numeric forecasts withheld · No observed demand signals yet'));card.append(body);root.append(card);}
 $('page').textContent=`Page ${state.page}`;$('prev').disabled=state.page===1;$('next').disabled=!state.hasNext;}
async function detail(id){const dialog=$('detail'),body=$('detail-content');body.replaceChildren(element('p','muted','Loading verified source metadata…'));dialog.showModal();try{const d=await api('/game/'+id),g=d.game;body.replaceChildren(element('div','eyebrow','GAME PROFILE / IGDB'),element('h2','',g.name),element('p','muted',g.platforms.join(' · ')),element('p','',g.summary||'No official summary in the current catalog record.'),element('h3','','Release records'));
 if(!d.releases.length)body.append(element('p','muted','No release date recorded.'));for(const r of d.releases){body.append(element('div','release',`${r.label} · ${r.platform||'Platform unspecified'} · Precision: ${r.precision} · IGDB observation (not independently confirmed)`));}body.append(element('h3','','Observed date changes'),element('p','muted',`${d.observed_date_changes.length} changes recorded in this database. These are not confirmed publisher delay announcements.`));body.append(element('div','analyst-note','Forecast unavailable: no validated statistical model.'));}catch{body.replaceChildren(element('p','error','Game details could not be loaded.'));}}
let debounce;$('query').addEventListener('input',()=>{clearTimeout(debounce);debounce=setTimeout(()=>{state.page=1;load()},300)});$('platform').addEventListener('change',()=>{state.page=1;if(state.view==='calendar')renderCalendar();else load()});$('reload').addEventListener('click',load);$('prev').addEventListener('click',()=>{state.page=Math.max(1,state.page-1);load()});$('next').addEventListener('click',()=>{if(state.hasNext){state.page++;load()}});$('close').addEventListener('click',()=>$('detail').close());$('mode').addEventListener('click',()=>{state.analyst=!state.analyst;$('mode').textContent=`Analyst view: ${state.analyst?'On':'Off'}`;$('mode').setAttribute('aria-pressed',String(state.analyst));render()});document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>{
 state.view=btn.dataset.view;
 document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('selected',x===btn));
 setCalendarVisibility();
 if(state.view==='calendar')loadCalendar();else render();
}));
$('calendar-prev').addEventListener('click',()=>shiftMonth(-1));
$('calendar-next').addEventListener('click',()=>shiftMonth(1));
setCalendarVisibility();api('/health').then(d=>{$('health').textContent=d.status==='operational'?'IGDB integration active':'Data source setup required'}).catch(()=>{$('health').textContent='API not connected'});load();
