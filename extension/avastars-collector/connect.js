// AvaStars Collector — runs on AvaStars Hire pages only to (1) tell the app the extension is installed and
// (2) receive the one-click "Connect" from the app's Chrome extension page. It reads nothing else on the page.
(() => {
  document.documentElement.setAttribute('data-avastars-ext', chrome.runtime.getManifest().version);
  window.addEventListener('message', async (e) => {
    if (e.source !== window || e.origin !== window.location.origin) return;
    const d = e.data || {};
    if (d.type === 'AVASTARS_LI_CONNECT') {
      // "Send connection request" on the Sourcing page: the extension opens the profile and sends it.
      const url = String(d.url || '');
      const ack = (r) => window.postMessage({ type: 'AVASTARS_LI_CONNECT_ACK', id: d.id, ...r }, window.location.origin);
      if (!/^https:\/\/(www\.)?linkedin\.com\/in\/[^/?#]+\/?$/i.test(url)) { ack({ ok: false, error: 'Not a LinkedIn profile link.' }); return; }
      const r = await chrome.runtime.sendMessage({ type: 'avs-li-connect', url, name: String(d.name || '').slice(0, 80) }).catch((err) => ({ ok: false, error: err.message }));
      ack(r || { ok: false, error: 'The extension did not answer. Reload it in chrome://extensions.' });
      return;
    }
    if (d.type === 'AVASTARS_LI_POST') {
      // "Create post on LinkedIn" on the Post & announce page: open LinkedIn and write the post in.
      const ack = (r) => window.postMessage({ type: 'AVASTARS_LI_POST_ACK', id: d.id, ...r }, window.location.origin);
      const text = String(d.text || '').slice(0, 3000);
      if (!text.trim()) { ack({ ok: false, error: 'The post is empty.' }); return; }
      const r = await chrome.runtime.sendMessage({ type: 'avs-li-post', text, jobId: Number(d.jobId) || null }).catch((err) => ({ ok: false, error: err.message }));
      ack(r || { ok: false, error: 'The extension did not answer. Reload it in chrome://extensions.' });
      return;
    }
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
