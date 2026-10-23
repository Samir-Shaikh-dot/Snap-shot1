const $ = id => document.getElementById(id);
const state = {records:[], latest:null, history:[]};
const safe = v => String(v ?? '—');
function colorOf(n, supplied='') {
  const c = String(supplied || '').toLowerCase();
  if (c) return c;
  const map = {0:'red,violet',1:'green',2:'red',3:'green',4:'red',5:'green,violet',6:'red',7:'green',8:'red',9:'green'};
  return map[Number(n)] || '';
}
function normalizeHistory(body) {
  const d = body?.data;
  let arr = Array.isArray(d) ? d : (d?.list || d?.records || d?.items || d?.data || []);
  if (!Array.isArray(arr)) return [];
  return arr.map(x => ({
    issue: x.issueNumber ?? x.issue ?? x.period ?? x.drawNumber ?? x.expect,
    number: x.number ?? x.resultNumber ?? x.openNumber ?? x.result,
    color: x.color ?? x.colour ?? '',
    time: x.openTime ?? x.time ?? x.drawTime ?? x.createTime ?? ''
  })).filter(x => x.number !== undefined && x.number !== null);
}
function isPanel(r){return /\/Energy\/GetPanel/i.test(r.url)}
function isHistory(r){return /GetHistoryIssuePage\.json|WinGo_(?:1M|30S)\.json/i.test(r.url)}
function parseSnapshot(r) {
  const b=r.body, d=b?.data || b;
  const snap=d?.snapshot;
  if (!snap) return null;
  return {issue:d.issueNumber ?? d.currentIssueNumber ?? '', phase:d.phase ?? '', snapNo:snap.snapNo ?? '', list:Array.isArray(snap.list)?snap.list:[], capturedAt:r.capturedAt};
}
function analyze() {
  const arr=state.history.slice(0,500);
  if (!arr.length) { $('analysis').textContent='History response captured, but its data shape did not contain recognizable result rows yet.'; $('rows').innerHTML=''; return; }
  const counts=Array(10).fill(0), sizes={Big:0,Small:0}, colors={red:0,green:0,violet:0};
  arr.forEach(x=>{
    const n=Number(x.number); if(Number.isInteger(n)&&n>=0&&n<=9) counts[n]++;
    if(Number.isFinite(n)) sizes[n>=5?'Big':'Small']++;
    String(colorOf(n,x.color)).split(',').forEach(c=>{c=c.trim().toLowerCase();if(colors[c]!==undefined)colors[c]++});
  });
  const top=counts.map((n,i)=>({i,n})).sort((a,b)=>b.n-a.n).slice(0,3).map(x=>`${x.i} (${x.n})`).join(', ');
  const last=arr.slice(0,10).map(x=>Number(x.number)).filter(Number.isFinite);
  const streak=last.length ? last[0]>=5?'Big':'Small' : '—';
  let len=0; for(const n of last){if((n>=5?'Big':'Small')===streak)len++;else break;}
  $('analysis').innerHTML=`<div><b>${arr.length}</b> observed results analyzed (up to 500)</div><p>Most frequent numbers: <b>${top || '—'}</b></p><p>Big/Small: <b>${sizes.Big}</b> Big · <b>${sizes.Small}</b> Small</p><p>Recent size streak: <b>${streak}</b> × ${len}</p><p>Color counts: Red ${colors.red} · Green ${colors.green} · Violet ${colors.violet}</p><p class="muted">These are historical frequencies, not a reliable forecast.</p>`;
  $('rows').innerHTML=arr.slice(0,100).map(x=>{
    const n=Number(x.number), size=Number.isFinite(n)?(n>=5?'Big':'Small'):'—';
    return `<tr><td>${safe(x.issue)}</td><td>${safe(x.number)}</td><td>${size}</td><td>${safe(colorOf(x.number,x.color))}</td><td>${safe(x.time)}</td></tr>`;
  }).join('');
}
async function load() {
  const data=await chrome.storage.local.get(['wingoRecords']);
  state.records=Array.isArray(data.wingoRecords)?data.wingoRecords:[];
  state.latest=null; state.history=[];
  for(const r of state.records) {
    if(isPanel(r)) {const s=parseSnapshot(r);if(s)state.latest=s;}
    if(isHistory(r)) {const h=normalizeHistory(r.body); if(h.length)state.history=h;}
  }
  $('total').textContent=state.records.length;
  $('historyCount').textContent=state.history.length;
  $('snap').textContent=state.latest?.snapNo ? `#${state.latest.snapNo}` : '—';
  $('status').textContent=state.records.length?'Capturing from browser tab':'Waiting for site data';
  if(state.latest) {
    $('snapshot').innerHTML=`Issue <b>${safe(state.latest.issue)}</b> · Phase <b>${safe(state.latest.phase)}</b> · Snapshot <b>${safe(state.latest.snapNo)}</b>`;
    $('numbers').innerHTML=state.latest.list.slice().sort((a,b)=>Number(a.number)-Number(b.number)).map(x=>`<div class="ball"><strong>${safe(x.number)}</strong><small>${safe(x.percent)}% · rank ${safe(x.rank)}</small></div>`).join('');
  } else $('snapshot').textContent='No Energy Panel response captured yet. Open the original Wingo page, log in normally if required, and open the Energy Panel once.';
  analyze();
}
$('refresh').addEventListener('click',load);
$('clear').addEventListener('click',async()=>{if(confirm('Delete all captured Wingo data stored by this extension?')){await chrome.storage.local.set({wingoRecords:[]});await load();}});
$('export').addEventListener('click',async()=>{
 const blob=new Blob([JSON.stringify(state.records,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='wingo-captured-data.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
chrome.runtime.onMessage.addListener((msg)=>{
 if(msg?.type==='WINGO_CAPTURED') load();
});
load();

function showStatus(){chrome.runtime.sendMessage({type:'WINGO_GET_STATUS'},r=>{if(!r)return;const lp=r.lastPoll,ls=r.lastSync;$('status').textContent=lp?(lp.ok?'Live API OK · '+(lp.issue||'issue received'):'API error · '+lp.message):'Waiting for first live request';$('firebaseStatus').textContent=ls?ls.message:(r.settings.databaseUrl?'Firebase configured; waiting for capture':'Firebase URL not configured');$('databaseUrl').value=r.settings.databaseUrl||'';$('gameCode').value=r.settings.gameCode||'WinGo_1M';$('autoEnabled').checked=!!r.settings.enabled;});}
$('saveSettings').addEventListener('click',()=>{chrome.runtime.sendMessage({type:'WINGO_SET_SETTINGS',settings:{databaseUrl:$('databaseUrl').value.trim(),gameCode:$('gameCode').value,enabled:$('autoEnabled').checked}},r=>{if(!r?.ok){$('firebaseStatus').textContent=r?.error||'Could not save settings';return;}showStatus();});});
chrome.runtime.onMessage.addListener(m=>{if(m?.type==='WINGO_STATUS_UPDATED')showStatus();});
showStatus();
const fetchBtn=$('fetchLive');
if(fetchBtn) fetchBtn.addEventListener('click',()=>{
 fetchBtn.disabled=true;fetchBtn.textContent='Fetching…';
 chrome.runtime.sendMessage({type:'WINGO_FETCH_SIGNED',gameCode:'WinGo_1M'},response=>{
  fetchBtn.disabled=false;fetchBtn.textContent='Fetch signed API';
  if(chrome.runtime.lastError){$('status').textContent=chrome.runtime.lastError.message;return;}
  if(!response?.ok){$('status').textContent='Fetch failed: '+(response?.error||'unknown error');return;}
  load();$('status').textContent='Signed Energy API response captured';
 });
});
