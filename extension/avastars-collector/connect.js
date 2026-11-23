// AvaStars Collector — runs on AvaStars Hire pages only to (1) tell the app the extension is installed and
// (2) receive the one-click "Connect" from the app's Chrome extension page. It reads nothing else on the page.
(() => {
  document.documentElement.setAttribute('data-avastars-ext', chrome.runtime.getManifest().version);
  window.addEventListener('message', async (e) => {
    if (e.source !== window || e.origin !== window.location.origin) return;
    const d = e.data || {};
    if (d.type !== 'AVASTARS_CONNECT' || typeof d.key !== 'string' || !/^avsx_\d+_[0-9a-f]{48}$/.test(d.key)) return;
    // Only this page's own address is used, never one sent in the message.
    const appUrl = window.location.origin;
    const { appUrl: current } = await chrome.storage.local.get('appUrl');
    const switching = current && current.replace(/\/+$/, '') !== appUrl;
    const ok = window.confirm(`Connect AvaStars Collector to ${appUrl} as ${String(d.name || 'you').slice(0, 60)}?${switching ? `\n\nIt is now connected to ${current}; that will be replaced.` : ''}`);
    if (!ok) { window.postMessage({ type: 'AVASTARS_CONNECT_CANCELLED' }, appUrl); return; }
    await chrome.storage.local.set({ appUrl, apiKey: d.key, connectedAs: String(d.name || '').slice(0, 60) });
    window.postMessage({ type: 'AVASTARS_CONNECTED' }, appUrl);
  });
})();
