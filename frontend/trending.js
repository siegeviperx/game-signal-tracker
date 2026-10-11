import {API_BASE} from './config.js';
const $=id=>document.getElementById(id);
const cell=(row,text)=>{const td=document.createElement('td');td.textContent=String(text);row.append(td);return td;};
const api=async path=>{const r=await fetch(API_BASE+path);if(!r.ok)throw Error(`API ${r.status}`);return r.json();};
const when=x=>x?new Date(Number(x)*1000).toLocaleDateString():'Not collected';
async function refresh(){
  $('momentum-status').textContent='Checking collection coverage…';
  try{
    const [board,sources]=await Promise.all([api('/trending?limit=50'),api('/sources')]);
    $('trending-rows').replaceChildren();$('source-rows').replaceChildren();
    if(board.status==='capacity_limited')$('momentum-status').textContent=`Insufficient infrastructure for an on-demand board: ${board.reason}. No index published.`;
    else $('momentum-status').textContent=board.eligible_games?
      `${board.eligible_games} games meet the provisional criteria; ${board.all_games} games considered. Updated ${when(board.generated_at)}.`:
      'Insufficient multi-source history, coverage, or comparable peers. No momentum index is published yet.';
    for(const item of board.rows||[]){
      const row=document.createElement('tr');
      cell(row,item.name);cell(row,item.momentum_index==null?'Withheld':item.momentum_index);
      cell(row,item.cohort);cell(row,item.eligible_sources);
      cell(row,`${Math.round((item.source_coverage||0)*100)}%`);
      const td=document.createElement('td'),a=document.createElement('a');a.href=`signals.html?game=${encodeURIComponent(item.game_id)}`;
      a.textContent='View evidence';td.append(a);row.append(td);$('trending-rows').append(row);
    }
    for(const item of sources.sources||[]){
      const row=document.createElement('tr');
      cell(row,item.source_id);cell(row,item.provider);cell(row,item.rights_status);
      cell(row,item.enabled?'Enabled':'Disabled');cell(row,when(item.last_success_at));
      $('source-rows').append(row);
    }
  }catch(e){$('momentum-status').textContent=`Could not load data: ${e.message}`;}
}
$('refresh').addEventListener('click',refresh);refresh();
