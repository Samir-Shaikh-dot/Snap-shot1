(() => {
  const $ = id => document.getElementById(id);
  const KEY = 'wingoLabFirebaseDatabaseUrl';
  const cfg = {apiKey:'AIzaSyBFo3mjjNoUCm75asniZ5yscY3Gu0YAC5E',projectId:'wingo-pro-7dca6'};
  const cleanUrl = v => String(v||'').trim().replace(/\/+$/,'');
  const status = (msg, ok=false) => { const el=$('firebaseStatus'); if(el){el.textContent=msg;el.style.color=ok?'#22c55e':'';} };
  const databaseRoot = () => { const u=cleanUrl(localStorage.getItem(KEY)); if(!u) throw new Error('Paste your Firebase Realtime Database URL first.'); if(!/^https:\/\//i.test(u)) throw new Error('Database URL must start with https://'); return u; };
  async function token(){
    let saved; try{saved=JSON.parse(sessionStorage.getItem('wingoFirebaseAuth')||'null')}catch{}
    if(saved?.idToken && saved.expires>Date.now()+60000) return saved.idToken;
    if(saved?.refreshToken){
      const r=await fetch(`https://securetoken.googleapis.com/v1/token?key=${cfg.apiKey}`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:saved.refreshToken})});
      if(r.ok){const d=await r.json();const next={idToken:d.id_token,refreshToken:d.refresh_token,expires:Date.now()+Number(d.expires_in||3600)*1000};sessionStorage.setItem('wingoFirebaseAuth',JSON.stringify(next));return next.idToken;}
    }
    const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${cfg.apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({returnSecureToken:true})});
    if(!r.ok) throw new Error('Firebase anonymous sign-in failed. Enable Authentication → Sign-in method → Anonymous.');
    const d=await r.json();sessionStorage.setItem('wingoFirebaseAuth',JSON.stringify({idToken:d.idToken,refreshToken:d.refreshToken,expires:Date.now()+Number(d.expiresIn||3600)*1000}));return d.idToken;
  }
  async function db(path, opts={}){const t=await token();const u=`${databaseRoot()}/${path}.json?auth=${encodeURIComponent(t)}`;const r=await fetch(u,opts);if(!r.ok)throw new Error(`Firebase HTTP ${r.status}. Check database URL, Anonymous Auth and database rules.`);return r.status===204?null:r.json();}
  $('firebaseUrl').value=localStorage.getItem(KEY)||'';
  $('saveFirebaseUrl').addEventListener('click',()=>{const u=cleanUrl($('firebaseUrl').value);if(!u){status('Enter database URL');return;}localStorage.setItem(KEY,u);status('Database URL saved in this browser',true);});
  $('firebasePush').addEventListener('click',async()=>{try{const records=window.wingoLabGetRecords();if(!records.length)throw new Error('No captured data to save. Start the collector first.');status('Saving captured records…');for(const rec of records){const body=rec.body||{};const data=body.data||body;const issue=String(data.issueNumber||data.currentIssueNumber||body.issueNumber||'');const snap=data.snapshot||{};const key=(issue||String(rec.capturedAt||Date.now())).replace(/[^a-zA-Z0-9_-]/g,'_')+'_'+String(snap.snapNo||rec.capturedAt||Date.now()).replace(/[^a-zA-Z0-9_-]/g,'_');await db(`wingoLive/records/${key}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(rec)});}status(`Saved ${records.length} records to Firebase`,true);}catch(e){status(e.message||'Firebase save failed');}});
  $('firebaseLoad').addEventListener('click',async()=>{try{status('Loading from Firebase…');const data=await db('wingoLive/records');const records=data&&typeof data==='object'?Object.values(data):[];if(!records.length)throw new Error('No captured records found in Firebase yet. Start the collector and wait for a response.');window.wingoLabLoadRecords(records);status(`Loaded ${records.length} captured records`,true);}catch(e){status(e.message||'Firebase load failed');}});
})();