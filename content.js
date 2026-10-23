(() => {
  try {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('page-hook.js');
    s.async = false;
    (document.documentElement || document.head).appendChild(s);
    s.onload = () => s.remove();
  } catch (e) {}
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.__wingoLab !== true) return;
    const payload = event.data.payload;
    if (!payload || typeof payload !== 'object') return;
    chrome.runtime.sendMessage({type: 'WINGO_CAPTURE', payload}).catch(() => {});
  });
})();
// While the supported Wingo tab is visible, trigger Energy Panel polling every
// 10 seconds. Chrome MV3 alarms cannot reliably run at 10-second intervals.
if (!window.__wingoLabSnapshotTicker) {
  window.__wingoLabSnapshotTicker = true;
  const tick = () => {
    if (document.visibilityState === 'visible') {
      chrome.runtime.sendMessage({type: 'WINGO_TICK'}).catch(() => {});
    }
  };
  setTimeout(tick, 1000);
  setInterval(tick, 10000);
}
