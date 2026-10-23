(() => {
  const $ = id => document.getElementById(id);

  const DATABASE_URL = 'https://wingo-pro-7dca6-default-rtdb.firebaseio.com';
  const KEY = 'wingoLabFirebaseDatabaseUrl';
  const RECORDS_PATH = 'wingoLab/records';

  // Firebase Web app configuration supplied for wingo-pro-7dca6.
  // This file uses Firebase Auth + Realtime Database REST endpoints.
  const cfg = {
    apiKey: 'AIzaSyBFo3mjjNoUCm75asniZ5yscY3Gu0YAC5E',
    authDomain: 'wingo-pro-7dca6.firebaseapp.com',
    projectId: 'wingo-pro-7dca6',
    storageBucket: 'wingo-pro-7dca6.firebasestorage.app',
    messagingSenderId: '412633550979',
    appId: '1:412633550979:web:fbe49c283644331e654bb6',
    measurementId: 'G-JSFTSX6BNR'
  };

  const cleanUrl = value => String(value || '').trim().replace(/\/+$/, '');

  const status = (message, ok = false) => {
    const el = $('firebaseStatus');
    if (el) {
      el.textContent = message;
      el.style.color = ok ? '#22c55e' : '';
    }
  };

  function databaseRoot() {
    const url = cleanUrl(localStorage.getItem(KEY) || DATABASE_URL);
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Firebase Realtime Database URL is invalid.');
    }

    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:' ||
        !(host.endsWith('.firebasedatabase.app') || host.endsWith('.firebaseio.com'))) {
      throw new Error('Use the Realtime Database URL, not the Firebase Console URL.');
    }
    return url;
  }

  async function readError(response) {
    let detail = '';
    try {
      const data = await response.json();
      detail = data?.error?.message || data?.error || '';
    } catch {}
    return detail ? `Firebase HTTP ${response.status}: ${detail}` : `Firebase HTTP ${response.status}. Check Authentication and Realtime Database rules.`;
  }

  async function token() {
    let saved;
    try {
      saved = JSON.parse(sessionStorage.getItem('wingoFirebaseAuth') || 'null');
    } catch {}

    if (saved?.idToken && saved.expires > Date.now() + 60000) {
      return saved.idToken;
    }

    if (saved?.refreshToken) {
      const refreshResponse = await fetch(
        `https://securetoken.googleapis.com/v1/token?key=${cfg.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: saved.refreshToken
          })
        }
      );

      if (refreshResponse.ok) {
        const data = await refreshResponse.json();
        const next = {
          idToken: data.id_token,
          refreshToken: data.refresh_token,
          expires: Date.now() + Number(data.expires_in || 3600) * 1000
        };
        sessionStorage.setItem('wingoFirebaseAuth', JSON.stringify(next));
        return next.idToken;
      }
    }

    const signInResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${cfg.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnSecureToken: true })
      }
    );

    if (!signInResponse.ok) {
      throw new Error(await readError(signInResponse));
    }

    const data = await signInResponse.json();
    sessionStorage.setItem('wingoFirebaseAuth', JSON.stringify({
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expires: Date.now() + Number(data.expiresIn || 3600) * 1000
    }));
    return data.idToken;
  }

  async function db(path, options = {}) {
    const idToken = await token();
    const url = `${databaseRoot()}/${path}.json?auth=${encodeURIComponent(idToken)}`;
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(await readError(response));
    if (response.status === 204) return null;
    return response.json();
  }

  const urlInput = $('firebaseUrl');
  if (urlInput) {
    // Fill the correct database URL automatically if this browser has no saved URL.
    const savedUrl = cleanUrl(localStorage.getItem(KEY));
    if (!savedUrl || !/\.firebasedatabase\.app$|\.firebaseio\.com$/i.test(new URL(savedUrl).hostname)) {
      localStorage.setItem(KEY, DATABASE_URL);
      urlInput.value = DATABASE_URL + '/';
    } else {
      urlInput.value = savedUrl + '/';
    }
  }

  const saveButton = $('saveFirebaseUrl');
  if (saveButton) {
    saveButton.addEventListener('click', () => {
      try {
        const url = cleanUrl(urlInput?.value || DATABASE_URL);
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' ||
            !(/\.firebasedatabase\.app$|\.firebaseio\.com$/i.test(parsed.hostname))) {
          throw new Error('Paste the Realtime Database URL, not the Firebase Console URL.');
        }
        localStorage.setItem(KEY, url);
        if (urlInput) urlInput.value = url + '/';
        status('Firebase database URL saved', true);
      } catch (error) {
        status(error.message || 'Invalid Firebase database URL');
      }
    });
  }

  const pushButton = $('firebasePush');
  if (pushButton) {
    pushButton.addEventListener('click', async () => {
      try {
        const records = window.wingoLabGetRecords();
        if (!records.length) throw new Error('No captured data to save. Start the collector first.');
        status('Saving captured records…');

        for (const record of records) {
          const body = record.body || {};
          const data = body.data || body;
          const issue = String(data.issueNumber || data.currentIssueNumber || body.issueNumber || '');
          const snapshot = data.snapshot || {};
          const key = (issue || String(record.capturedAt || Date.now()))
            .replace(/[^a-zA-Z0-9_-]/g, '_') + '_' +
            String(snapshot.snapNo || record.capturedAt || Date.now())
              .replace(/[^a-zA-Z0-9_-]/g, '_');

          await db(`${RECORDS_PATH}/${key}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(record)
          });
        }

        status(`Saved ${records.length} records to Firebase`, true);
      } catch (error) {
        status(error.message || 'Firebase save failed');
      }
    });
  }

  const loadButton = $('firebaseLoad');
  if (loadButton) {
    loadButton.addEventListener('click', async () => {
      try {
        status('Loading from Firebase…');
        const data = await db(RECORDS_PATH);
        const records = data && typeof data === 'object' ? Object.values(data) : [];
        if (!records.length) {
          throw new Error('No captured records found in Firebase yet. Start the collector and wait for a response.');
        }
        window.wingoLabLoadRecords(records);
        status(`Loaded ${records.length} captured records`, true);
      } catch (error) {
        status(error.message || 'Firebase load failed');
      }
    });
  }
})();
