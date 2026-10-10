export function json(data, status = 200, origin = '*') {
  return new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8','access-control-allow-origin':origin,'cache-control':'public, max-age=60','x-content-type-options':'nosniff'}});
}
export function clampInt(input, fallback, max) {
  const n = Number(input);
  return Number.isInteger(n) && n > 0 ? Math.min(n,max) : fallback;
}
export function precisionLabel(category, timestamp, human) {
  const labels = {0:'day',1:'month',2:'quarter',3:'year',4:'TBA',5:'season',6:'TBA',7:'TBA'};
  const precision = labels[category] ?? (timestamp ? 'day':'TBA');
  return {precision,label:human || (timestamp ? new Date(timestamp*1000).toISOString().slice(0,10) : 'TBA')};
}
export function releaseRange(category, timestamp) {
  if (!timestamp) return [null,null];
  const d = new Date(timestamp*1000);
  const year=d.getUTCFullYear(), month=d.getUTCMonth();
  const utc=(y,m,day)=>Math.floor(Date.UTC(y,m,day)/1000);
  if(category===3) return [utc(year,0,1),utc(year+1,0,1)-1];
  if(category===2){const q=Math.floor(month/3)*3;return [utc(year,q,1),utc(year,q+3,1)-1];}
  if(category===1) return [utc(year,month,1),utc(year,month+1,1)-1];
  if(category===5) return [null,null]; // seasonal range requires region-specific interpretation
  return [utc(year,month,d.getUTCDate()),utc(year,month,d.getUTCDate()+1)-1];
}
export function safeSearch(s) {return String(s||'').trim().slice(0,80);}
