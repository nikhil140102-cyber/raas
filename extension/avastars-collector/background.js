// AvaStars Collector — background worker.
// 1) Clicking the toolbar icon opens the side panel.
// 2) Optional "resume catcher": when you download a CV from a job portal, it is sent to AvaStars Hire.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});
chrome.runtime.onStartup?.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

const PORTALS = [
  [/indeed\./i, 'Indeed'], [/naukri\./i, 'Naukri'], [/linkedin\./i, 'LinkedIn'], [/foundit\./i, 'Foundit'],
  [/shine\.com/i, 'Shine'], [/apna\.co/i, 'Apna'], [/workindia\./i, 'WorkIndia'],
];
const portalOf = (url) => (PORTALS.find(([re]) => re.test(url || '')) || [])[1] || '';
const RESUME_EXT = /\.(pdf|docx?|rtf|txt|jpe?g|png)$/i;

async function log(entry) {
  const { catcherLog = [] } = await chrome.storage.local.get('catcherLog');
  catcherLog.unshift({ ...entry, at: new Date().toISOString() });
  await chrome.storage.local.set({ catcherLog: catcherLog.slice(0, 20) });
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf); let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

chrome.downloads.onChanged.addListener(async (delta) => {
  if (delta.state?.current !== 'complete') return;
  const cfg = await chrome.storage.local.get(['appUrl', 'apiKey', 'catcher', 'jobChoice']);
  if (!cfg.catcher || !cfg.appUrl || !cfg.apiKey) return;
  const [item] = await chrome.downloads.search({ id: delta.id });
  if (!item) return;
  const name = (item.filename || '').split(/[\\/]/).pop();
  const source = portalOf(item.referrer) || portalOf(item.finalUrl) || portalOf(item.url);
  if (!source || !RESUME_EXT.test(name)) return;
  const url = item.finalUrl || item.url;
  if (!/^https?:/i.test(url)) {
    await log({ file: name, ok: false, msg: 'The portal created this file in the page, so it could not be re-read. Drag it into AvaStars → Resumes → Upload.' });
    return;
  }
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`Portal returned ${res.status}`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 8 * 1024 * 1024) throw new Error('File is over 8 MB');
    const body = { source, resume_base64: toBase64(buf), resume_filename: name, resume_mime: res.headers.get('content-type') || '', notes: `Resume downloaded from ${source} (${item.referrer || url}).` };
    if (cfg.jobChoice && /^\d+$/.test(cfg.jobChoice)) body.job_id = cfg.jobChoice;
    const r = await fetch(`${cfg.appUrl.replace(/\/+$/, '')}/api/inbound/candidate`, {
      method: 'POST', headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) throw new Error(data.error || `AvaStars returned ${r.status}`);
    await log({ file: name, ok: true, msg: `${data.status === 'merged' ? 'Updated existing profile' : 'New profile'}${data.match !== null && data.match !== undefined ? ` · ${data.match}% match` : ''}${data.job ? ` · ${data.job}` : ''}`, id: data.candidate_id });
  } catch (e) {
    await log({ file: name, ok: false, msg: `${e.message}. Upload it in AvaStars → Resumes instead.` });
  }
});

// LinkedIn messages: the "Send to AvaStars" button next to a resume someone sent you.
async function sendLinkedInResume(m) {
  const cfg = await chrome.storage.local.get(['appUrl', 'apiKey', 'jobChoice']);
  if (!cfg.appUrl || !cfg.apiKey) throw new Error('Not connected. In AvaStars open "Chrome extension" and click Connect.');
  let b64 = m.b64; let mime = m.mime || '';
  if (!b64) {
    const res = await fetch(m.href, { credentials: 'include' });
    if (!res.ok) throw new Error(`LinkedIn didn't give the file (HTTP ${res.status}). Download it and upload it in AvaStars → Resumes.`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 8 * 1024 * 1024) throw new Error('The file is over 8 MB');
    b64 = toBase64(buf); mime = res.headers.get('content-type') || '';
  }
  let filename = m.filename || 'resume.pdf';
  if (!/\.\w{2,4}$/.test(filename)) filename += /pdf/.test(mime) ? '.pdf' : /word|officedocument/.test(mime) ? '.docx' : '';
  const body = {
    source: 'LinkedIn', name: m.name || '', profile_url: m.profile || '', resume_base64: b64, resume_filename: filename, resume_mime: mime,
    notes: `Resume sent in LinkedIn messages${m.page ? ` (${m.page})` : ''}.`,
  };
  if (cfg.jobChoice && /^\d+$/.test(cfg.jobChoice)) body.job_id = cfg.jobChoice;
  const r = await fetch(`${cfg.appUrl.replace(/\/+$/, '')}/api/inbound/candidate`, {
    method: 'POST', headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.ok) throw new Error(data.error || `AvaStars returned ${r.status}`);
  await log({ file: `LinkedIn: ${filename}`, ok: true, msg: `${data.status === 'merged' ? 'Updated existing profile' : 'New profile'}${data.match !== null && data.match !== undefined ? ` · ${data.match}% match` : ''}${data.job ? ` · ${data.job}` : ''}`, id: data.candidate_id });
  return { ok: true, candidate_id: data.candidate_id, merged: data.status === 'merged', match: data.match, job: data.job };
}

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (m?.type !== 'avs-linkedin-resume') return false;
  if (!/^https:\/\/([a-z0-9-]+\.)*linkedin\.com\//.test(sender?.url || '')) { reply({ ok: false, error: 'Not allowed from this page' }); return false; }
  sendLinkedInResume(m).then(reply).catch((e) => reply({ ok: false, error: e.message }));
  return true; // reply comes later
});
