(() => {
  if (window.__wingoLabHookInstalled) return;
  window.__wingoLabHookInstalled = true;
  const watched = (url) => {
    const u = String(url || '');
    return /\/Energy\/GetPanel(?:[/?]|$)/i.test(u) ||
           /GetHistoryIssuePage\.json/i.test(u) ||
           /WinGo_1M\.json/i.test(u) ||
           /WinGo_30S\.json/i.test(u);
  };
  const send = (url, body, status) => {
    if (!watched(url) || !body) return;
    try {
      let parsed = typeof body === 'string' ? JSON.parse(body) : body;
      if (!parsed || typeof parsed !== 'object') return;
      window.postMessage({
        __wingoLab: true,
        payload: {url: String(url), status: Number(status || 0), capturedAt: Date.now(), body: parsed}
      }, '*');
    } catch (_) {}
  };
  const oldFetch = window.fetch;
  if (oldFetch) {
    window.fetch = async function(...args) {
      const response = await oldFetch.apply(this, args);
      try {
        const url = args[0] && (args[0].url || args[0]);
        if (watched(url)) response.clone().text().then(text => send(url, text, response.status)).catch(() => {});
      } catch (_) {}
      return response;
    };
  }
  const XHR = window.XMLHttpRequest;
  if (XHR) {
    const oldOpen = XHR.prototype.open;
    XHR.prototype.open = function(method, url, ...rest) {
      this.__wingoLabUrl = url;
      return oldOpen.call(this, method, url, ...rest);
    };
    const oldSend = XHR.prototype.send;
    XHR.prototype.send = function(...args) {
      this.addEventListener('load', function() {
        try { if (watched(this.__wingoLabUrl)) send(this.__wingoLabUrl, this.responseText, this.status); } catch (_) {}
      });
      return oldSend.apply(this, args);
    };
  }
})();