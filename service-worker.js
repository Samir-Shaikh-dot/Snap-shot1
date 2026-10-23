importScripts('signature.js');
const API_KEY='AIzaSyBFo3mjjNoUCm75asniZ5yscY3Gu0YAC5E';
const PROJECT_ID='wingo-pro-7dca6';
const SNAPSHOT_ALARM='wingo-live-poll';
const PERIOD_ALARM='wingo-period-poll';
const DEFAULTS={enabled:true,gameCode:'WinGo_1M',databaseUrl:'',firebaseEnabled:true};
async function settings(){return {...DEFAULTS,...await chrome.storage.local.get(Object.keys(DEFAULTS))};}
function normUrl(v){return String(v||'').trim().replace(/\/+$/,'');}
function issueOf(body){const d=body?.data||body;return String(d.issueNumber??d.currentIssueNumber??d.issue??'');}
function panelOf(body){const d=body?.data||body;const s=d?.snapshot;return !!(s&&Array.isArray(s.list));}
async function firebaseToken(){
 const x=await chrome.storage.local.get(['firebaseAuth']);let a=x.firebaseAuth;
 if(a?.idToken&&a.expires>Date.now()+60000)return a.idToken;
 if(a?.refreshToken){try{const r=await fetch(`https://securetoken.googleapis.com/v1/token?key=${API_KEY}`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:a.refreshToken})});if(r.ok){const d=await r.json();a={idToken:d.id_token,refreshToken:d.refresh_token,expires:Date.now()+Number(d.expires_in||3600)*1000};await chrome.storage.local.set({firebaseAuth:a});return a.idToken;}}catch(e){}}
 const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({returnSecureToken:true})});if(!r.ok)throw new Error('Firebase anonymous auth failed; enable Anonymous provider in Firebase Authentication.');const d=await r.json();a={idToken:d.idToken,refreshToken:d.refreshToken,expires:Date.now()+Number(d.expiresIn||3600)*1000};await chrome.storage.local.set({firebaseAuth:a});return a.idToken;
}
async function firebasePut(rec){const s=await settings();const root=normUrl(s.databaseUrl);if(!root||!s.firebaseEnabled)return false;const t=await firebaseToken();const issue=issueOf(rec.body)||'no-issue';const snap=rec.body?.data?.snapshot||{};const stamp=String(snap.snapNo??rec.capturedAt??Date.now());const key=(issue+'_'+stamp).replace(/[^a-zA-Z0-9_-]/g,'_');const r=await fetch(`${root}/wingoLive/records/${key}.json?auth=${encodeURIComponent(t)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(rec)});if(!r.ok)throw new Error(`Firebase write HTTP ${r.status}`);return true;}
async function saveRecord(rec){const old=await chrome.storage.local.get(['wingoRecords']);const arr=Array.isArray(old.wingoRecords)?old.wingoRecords:[];const body=rec.body||{};const d=body.data||body;const snap=d.snapshot||{};const id=String(d.issueNumber||d.currentIssueNumber||'')+'|'+String(snap.snapNo??'')+'|'+String(rec.url||'');const dupe=arr.some(x=>{const xd=x.body?.data||x.body||{};return String(xd.issueNumber||xd.currentIssueNumber||'')+'|'+String((xd.snapshot||{}).snapNo??'')+'|'+String(x.url||'')===id;});if(!dupe){arr.unshift({...rec,source:rec.source||'live-poll'});arr.splice(1000);await chrome.storage.local.set({wingoRecords:arr});}
 try{const synced=await firebasePut(rec);await chrome.storage.local.set({lastSync:{at:Date.now(),ok:true,message:synced?'Firebase synced':'Saved locally; Firebase URL not configured'}});}catch(e){await chrome.storage.local.set({lastSync:{at:Date.now(),ok:false,message:String(e.message||e)}});}
 chrome.runtime.sendMessage({type:'WINGO_CAPTURED'}).catch(()=>{});
}
async function poll(){const s=await settings();if(!s.enabled)return;const gameCode=s.gameCode==='WinGo_30S'?'WinGo_30S':'WinGo_1M';const params=wingoSignParams({gameCode,language:'en'});const url=`https://api.ar-lottery01.com/api/Energy/GetPanel?${new URLSearchParams(params).toString()}`;try{const r=await fetch(url,{method:'GET',cache:'no-store'});const text=await r.text();let body;try{body=JSON.parse(text)}catch{body={raw:text}};if(!r.ok)throw new Error(`Energy/GetPanel HTTP ${r.status}`);if(body?.code!==undefined&&Number(body.code)!==0)throw new Error(`API code ${body.code}: ${body.message||'request rejected'}`);if(!panelOf(body))throw new Error('API responded, but response has no recognizable data.snapshot.list; not counted as a snapshot.');await saveRecord({url,status:r.status,capturedAt:Date.now(),body,source:'signed-auto-poll'});await chrome.storage.local.set({lastPoll:{at:Date.now(),ok:true,issue:issueOf(body),message:'Live Energy Panel received'}});}catch(e){await chrome.storage.local.set({lastPoll:{at:Date.now(),ok:false,message:String(e.message||e)}});}chrome.runtime.sendMessage({type:'WINGO_STATUS_UPDATED'}).catch(()=>{});}
async function pollPeriods(){
 const s=await settings(); if(!s.enabled)return;
 const gameCode=s.gameCode==='WinGo_30S'?'WinGo_30S':'WinGo_1M';
 const url=`https://draw.ar-lottery01.com/WinGo/${gameCode}.json?ts=${Date.now()}`;
 try{
  const r=await fetch(url,{method:'GET',cache:'no-store'}); const text=await r.text(); let body;
  try{body=JSON.parse(text)}catch{body={raw:text}}
  if(!r.ok)throw new Error(`Period API HTTP ${r.status}`);
  if(!body||typeof body!=='object'||body.raw)throw new Error('Period API returned non-JSON data');
  await saveRecord({url,status:r.status,capturedAt:Date.now(),body,source:'period-auto-poll'});
  await chrome.storage.local.set({lastPeriodPoll:{at:Date.now(),ok:true,message:'Period endpoint response received'}});
 }catch(e){await chrome.storage.local.set({lastPeriodPoll:{at:Date.now(),ok:false,message:String(e.message||e)}})}
 chrome.runtime.sendMessage({type:'WINGO_STATUS_UPDATED'}).catch(()=>{});
}
async function start(){
 const s=await settings();
 if(s.enabled){
  // MV3 alarms are used for the one-minute period poll. The 10-second snapshot
  // cadence is driven by the open Wingo tab's content script.
  chrome.alarms.create(PERIOD_ALARM,{periodInMinutes:1});
  chrome.alarms.create(SNAPSHOT_ALARM,{periodInMinutes:0.5});
  await poll(); await pollPeriods();
 }else{chrome.alarms.clear(SNAPSHOT_ALARM);chrome.alarms.clear(PERIOD_ALARM);}
}
chrome.runtime.onInstalled.addListener(async()=>{const s=await chrome.storage.local.get(Object.keys(DEFAULTS));await chrome.storage.local.set({...DEFAULTS,...s});await start();});
chrome.runtime.onStartup.addListener(start);
chrome.alarms.onAlarm.addListener(a=>{if(a.name===SNAPSHOT_ALARM)poll();if(a.name===PERIOD_ALARM)pollPeriods();});
chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
 if(msg?.type==='WINGO_TICK'){poll();sendResponse({ok:true});return true;}
 if(msg?.type==='WINGO_CAPTURE'&&msg.payload){saveRecord(msg.payload).then(()=>sendResponse({ok:true})).catch(e=>sendResponse({ok:false,error:String(e.message||e)}));return true;}
 if(msg?.type==='WINGO_GET_STATUS'){Promise.all([settings(),chrome.storage.local.get(['lastPoll','lastSync','wingoRecords'])]).then(([s,d])=>sendResponse({settings:s,lastPoll:d.lastPoll||null,lastSync:d.lastSync||null,count:(d.wingoRecords||[]).length}));return true;}
 if(msg?.type==='WINGO_SET_SETTINGS'){(async()=>{const cur=await settings();const next={...cur,...msg.settings};await chrome.storage.local.set(next);if(next.enabled){chrome.alarms.create(SNAPSHOT_ALARM,{periodInMinutes:0.5});chrome.alarms.create(PERIOD_ALARM,{periodInMinutes:1});await poll();await pollPeriods();}else{chrome.alarms.clear(SNAPSHOT_ALARM);chrome.alarms.clear(PERIOD_ALARM);}sendResponse({ok:true});})().catch(e=>sendResponse({ok:false,error:String(e.message||e)}));return true;}
 if(msg?.type==='WINGO_FETCH_SIGNED'){poll().then(async()=>{const d=await chrome.storage.local.get(['lastPoll']);sendResponse({ok:!!d.lastPoll?.ok,error:d.lastPoll?.message||''});}).catch(e=>sendResponse({ok:false,error:String(e.message||e)}));return true;}
});