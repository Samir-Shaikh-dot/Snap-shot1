(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = { records: [], history: [], snapshots: [], sources: [], page: 0, theme: 'dark' };
  const colors = {0:'red,violet',1:'green',2:'red',3:'green',4:'red',5:'green,violet',6:'red',7:'green',8:'red',9:'green'};
  let toastTimer;
  function toast(message) {
    const el=$('toast'); el.textContent=message; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),2600);
  }
  function safeText(v){return v===undefined||v===null||v===''?'—':String(v);}
  function dateText(v){
    if(v===undefined||v===null||v==='')return '—';
    if(typeof v==='number') { const d=new Date(v<1e12?v*1000:v); return Number.isNaN(d.getTime())?'—':d.toLocaleString(); }
    const s=String(v); if(/^\d{10,13}$/.test(s)){const n=Number(s);const d=new Date(s.length===10?n*1000:n);return Number.isNaN(d.getTime())?s:d.toLocaleString();}
    const d=new Date(s);return Number.isNaN(d.getTime())?s:d.toLocaleString();
  }
  function unwrapImport(value){
    if(Array.isArray(value)) return value;
    if(value && Array.isArray(value.records)) return value.records;
    if(value && Array.isArray(value.data) && value.data.some(x=>x && (x.body||x.url))) return value.data;
    if(value && value.body && typeof value.body==='object') return [value];
    if(value && value.data && value.data.snapshot) return [{url:'/Energy/GetPanel',body:value,capturedAt:Date.now()}];
    if(value && value.snapshot) return [{url:'/Energy/GetPanel',body:{data:value},capturedAt:Date.now()}];
    if(value && (value.issueNumber || value.period || value.issue) && (value.number!==undefined || value.result!==undefined)) return [{url:'manual/history',body:{data:[value]},capturedAt:Date.now()}];
    throw new Error('JSON format not recognized. Import the collector JSON export or a supported API response.');
  }
  function historyFromBody(body){
    const root=body?.data??body;
    const candidates=[root,root?.list,root?.records,root?.items,root?.data,root?.list?.records,root?.result?.list];
    let arr=candidates.find(Array.isArray);
    if(!arr)return [];
    return arr.map(x=>{
      if(!x||typeof x!=='object')return null;
      const raw=x.number??x.resultNumber??x.openNumber??x.result??x.winNumber??x.lotteryNumber;
      if(raw===undefined||raw===null)return null;
      return {issue:x.issueNumber??x.issue??x.period??x.drawNumber??x.expect??x.issue_no??'',number:Number(raw),color:x.color??x.colour??'',time:x.openTime??x.time??x.drawTime??x.createTime??x.timestamp??'',game:x.gameCode??x.game??''};
    }).filter(x=>Number.isInteger(x.number)&&x.number>=0&&x.number<=9);
  }
  function getSnapshot(r){
    const root=r?.body?.data??r?.body??r;
    const snap=root?.snapshot??root?.data?.snapshot;
    if(!snap||!Array.isArray(snap.list))return null;
    return {issue:root.issueNumber??root.currentIssueNumber??'',phase:root.phase??'',snapNo:snap.snapNo??'',list:snap.list,capturedAt:r.capturedAt??Date.now(),url:r.url??''};
  }
  function sourceType(r){
    const url=String(r?.url??'');
    if(/Energy\/GetPanel/i.test(url)||getSnapshot(r))return 'Energy Panel snapshot';
    if(/GetHistoryIssuePage|HistoryIssue|WinGo_(?:1M|30S)\.json/i.test(url)||historyFromBody(r?.body).length)return 'History API';
    return 'Other response';
  }
  function processRecords(records){
    state.records=records.filter(x=>x&&typeof x==='object').slice(0,10000);
    state.history=[];state.snapshots=[];state.sources=[];
    const seen=new Set();
    for(const r of state.records){
      const type=sourceType(r);
      state.sources.push({type,url:String(r.url??'Imported data'),count:1});
      const snap=getSnapshot(r);if(snap)state.snapshots.push(snap);
      const rows=historyFromBody(r.body??r);
      if(rows.length){
        for(const row of rows){
          const key=[row.issue,row.number,row.time].join('|');
          if(!seen.has(key)){seen.add(key);state.history.push(row);}
        }
      }
    }
    // Some exports are already normalized history rows, without response wrappers.
    if(!state.history.length){
      for(const r of state.records){
        const rows=historyFromBody(r);
        for(const row of rows)state.history.push(row);
      }
    }
    state.history.sort((a,b)=>{
      const ai=Number(a.issue),bi=Number(b.issue);
      if(Number.isFinite(ai)&&Number.isFinite(bi)&&ai!==bi)return bi-ai;
      const at=Date.parse(a.time),bt=Date.parse(b.time);
      if(Number.isFinite(at)&&Number.isFinite(bt))return bt-at;
      return 0;
    });
    render();
    window.dispatchEvent(new CustomEvent('wingo:records-updated', {detail:{records:state.records}}));
  }
  window.wingoLabGetRecords = () => state.records;
  window.wingoLabLoadRecords = records => processRecords(Array.isArray(records) ? records : []);
  window.addEventListener('storage', () => {});
  function rowColor(n,supplied){
    const raw=String(supplied??'').toLowerCase();
    if(raw.includes('violet')||raw.includes('purple'))return 'violet';
    if(raw.includes('green'))return 'green';
    if(raw.includes('red'))return 'red';
    return colors[n]||'';
  }
  function countStats(){
    const number=Array(10).fill(0),size={Big:0,Small:0},color={red:0,green:0,violet:0};
    state.history.forEach(r=>{
      number[r.number]++;
      size[r.number>=5?'Big':'Small']++;
      rowColor(r.number,r.color).split(',').forEach(c=>{if(color[c]!==undefined)color[c]++;});
    });
    return {number,size,color};
  }
  function renderSnapshot(){
    const s=state.snapshots[state.snapshots.length-1];
    $('metricSnapshots').textContent=state.snapshots.length;
    if(!s){$('metricIssue').textContent='—';$('metricPhase').textContent='No phase data';$('snapshotSummary').textContent='No Energy Panel snapshot found in the imported file.';$('snapshotNumbers').innerHTML='';$('snapshotTime').textContent='No snapshot loaded';return;}
    $('metricIssue').textContent=safeText(s.issue);
    $('metricPhase').textContent=`Phase: ${safeText(s.phase)}`;
    $('snapshotSummary').innerHTML=`<div><span class="muted">Issue</span> <b>${safeText(s.issue)}</b> &nbsp; <span class="muted">Phase</span> <b>${safeText(s.phase)}</b> &nbsp; <span class="muted">Snapshot</span> <b>${safeText(s.snapNo)}</b></div>`;
    $('snapshotTime').textContent=dateText(s.capturedAt);
    const list=s.list.slice().sort((a,b)=>Number(a.number)-Number(b.number));
    $('snapshotNumbers').innerHTML=list.map(x=>`<div class="snapshot-tile"><b>${safeText(x.number)}</b><small>${safeText(x.percent)}% · rank ${safeText(x.rank)}</small></div>`).join('');
  }
  function renderFrequency(stats){
    const max=Math.max(1,...stats.number);
    $('frequencyChart').innerHTML=stats.number.map((n,i)=>`<div class="bar-item"><span class="bar-value">${n}</span><div class="bar-track"><div class="bar-fill" style="height:${n/max*100}%"></div></div><span class="bar-label">${i}</span></div>`).join('');
    const top=stats.number.map((n,i)=>({n,i})).sort((a,b)=>b.n-a.n)[0];
    $('metricTop').textContent=state.history.length?String(top.i):'—';
    $('metricTopSub').textContent=state.history.length?`${top.n} observed occurrences`:'Not enough data';
  }
  function setProgress(id,value,total){$(id).style.width=(total?Math.round(value/total*100):0)+'%';}
  function renderSummary(stats){
    const total=state.history.length;
    $('bigCount').textContent=stats.size.Big;$('smallCount').textContent=stats.size.Small;
    $('redCount').textContent=stats.color.red;$('greenCount').textContent=stats.color.green;$('violetCount').textContent=stats.color.violet;
    setProgress('bigBar',stats.size.Big,total);setProgress('smallBar',stats.size.Small,total);
    setProgress('redBar',stats.color.red,total);setProgress('greenBar',stats.color.green,total);setProgress('violetBar',stats.color.violet,total);
    if(!total){$('streakValue').textContent='—';$('streakSub').textContent='No data';return;}
    const latest=state.history[0].number>=5?'Big':'Small';let len=0;
    for(const r of state.history){if((r.number>=5?'Big':'Small')!==latest)break;len++;}
    $('streakValue').textContent=latest;$('streakSub').textContent=`${len} in a row in imported history`;
  }
  function renderSources(){
    const map=new Map();
    state.sources.forEach(s=>{const key=s.type;map.set(key,(map.get(key)||0)+1);});
    if(!map.size){$('sourceSummary').innerHTML='<div class="empty-state">No imported source data yet.</div>';return;}
    $('sourceSummary').innerHTML=[...map.entries()].map(([name,count])=>`<div class="source-item"><div><b>${name}</b><small>Imported response records</small></div><span class="source-count">${count} files/records</span></div>`).join('');
  }
  function renderTable(){
    const q=$('searchHistory').value.trim().toLowerCase(),pageSize=Number($('pageSize').value);
    const rows=state.history.filter(r=>String(r.issue).toLowerCase().includes(q)||String(r.number).includes(q)||String(r.color).toLowerCase().includes(q));
    const pages=Math.max(1,Math.ceil(rows.length/pageSize));state.page=Math.min(state.page,pages-1);
    const current=rows.slice(state.page*pageSize,(state.page+1)*pageSize);
    $('historyRows').innerHTML=current.length?current.map(r=>{
      const c=rowColor(r.number,r.color),size=r.number>=5?'Big':'Small';
      return `<tr><td>${safeText(r.issue)}</td><td><span class="number-chip ${c.split(',')[0]}">${r.number}</span></td><td><span class="size-chip ${size.toLowerCase()}">${size}</span></td><td>${safeText(r.color||c)}</td><td>${dateText(r.time)}</td></tr>`;
    }).join(''):'<tr><td colspan="5" class="empty-cell">No matching rows. Import history JSON or change search.</td></tr>';
    $('tableInfo').textContent=`${rows.length} records · Page ${state.page+1} of ${pages}`;
    $('prevPage').disabled=state.page<=0;$('nextPage').disabled=state.page>=pages-1;
  }
  function render(){
    const game=$('gameSelect').value;
    const hist=state.history;
    $('metricHistory').textContent=hist.length;
    const stats=countStats();renderSnapshot();renderFrequency(stats);renderSummary(stats);renderSources();renderTable();
    $('connectionPill').textContent=state.records.length?'Captured data loaded':'Waiting for live data';
  }
  $('importFile').addEventListener('change',async e=>{
    const file=e.target.files?.[0];if(!file)return;
    try{const parsed=JSON.parse(await file.text());processRecords(unwrapImport(parsed));toast(`Imported ${state.records.length} response record(s).`);}
    catch(err){toast(err.message||'Could not import JSON.');}
    e.target.value='';
  });
  $('exportData').addEventListener('click',()=>{
    if(!state.records.length){toast('No data to export. Import a file or load sample data first.');return;}
    const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),records:state.records},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='wingo-prediction-lab-export.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Export started.');
  });
  $('clearData').addEventListener('click',()=>{if(confirm('Clear all data currently loaded in this page? This will not affect original site data.')){state.records=[];processRecords([]);toast('Loaded data cleared.');}});
  $('searchHistory').addEventListener('input',()=>{state.page=0;renderTable();});
  $('pageSize').addEventListener('change',()=>{state.page=0;renderTable();});
  $('prevPage').addEventListener('click',()=>{state.page=Math.max(0,state.page-1);renderTable();});
  $('nextPage').addEventListener('click',()=>{state.page++;renderTable();});
  $('gameSelect').addEventListener('change',render);
  $('themeToggle').addEventListener('click',()=>{document.body.classList.toggle('light');state.theme=document.body.classList.contains('light')?'light':'dark';});
  render();
})();