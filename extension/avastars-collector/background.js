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
  if (capturedIds.has(delta.id)) return;
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

// "Send to AvaStars" on a LinkedIn chat file: catch the download LinkedIn starts, send that file instead of saving it.
let capture = null; // { m, reply, timer }
const capturedIds = new Set();
chrome.downloads.onCreated.addListener(async (item) => {
  if (!capture) return;
  const url = item.finalUrl || item.url || '';
  const from = `${item.referrer || ''} ${url}`;
  if (!/linkedin\.com|licdn\.com|^blob:https:\/\/www\.linkedin\.com/.test(from)) return;
  const { m, reply, timer } = capture; capture = null; clearTimeout(timer);
  capturedIds.add(item.id);
  chrome.downloads.cancel(item.id).then(() => chrome.downloads.erase({ id: item.id })).catch(() => {});
  if (url.startsWith('blob:')) { reply({ ok: false, blob: url }); return; } // the page reads it and sends it back
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`LinkedIn didn't give the file (HTTP ${res.status}). Download it and upload it in AvaStars → Resumes.`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 8 * 1024 * 1024) throw new Error('The file is over 8 MB');
    reply(await sendLinkedInResume({ ...m, b64: toBase64(buf), mime: res.headers.get('content-type') || '' }));
  } catch (e) { reply({ ok: false, error: e.message }); }
});

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (!['avs-linkedin-resume', 'avs-linkedin-capture'].includes(m?.type)) return false;
  if (m.type === 'avs-linkedin-capture') {
    if (!/^https:\/\/([a-z0-9-]+\.)*linkedin\.com\//.test(sender?.url || '')) { reply({ ok: false, error: 'Not allowed from this page' }); return false; }
    if (capture) { clearTimeout(capture.timer); capture.reply({ ok: false, error: 'Another file was being sent. Click again.' }); }
    capture = { m, reply, timer: setTimeout(() => { if (capture?.reply === reply) { capture = null; reply({ ok: false, error: 'LinkedIn did not start the download. Wait for the chat to finish loading and click again.' }); } }, 20000) };
    return true;
  }
  if (!/^https:\/\/([a-z0-9-]+\.)*linkedin\.com\//.test(sender?.url || '')) { reply({ ok: false, error: 'Not allowed from this page' }); return false; }
  sendLinkedInResume(m).then(reply).catch((e) => reply({ ok: false, error: e.message }));
  return true; // reply comes later
});

// Scheduled job posts: every 10 minutes check what's due for this person; show a count on the
// toolbar icon and a Chrome notification for each newly due post.
async function checkDuePosts() {
  const cfg = await chrome.storage.local.get(['appUrl', 'apiKey', 'notifiedPosts']);
  if (!cfg.appUrl || !cfg.apiKey) return;
  try {
    const r = await fetch(`${cfg.appUrl.replace(/\/+$/, '')}/api/inbound/schedules`, { headers: { Authorization: `Bearer ${cfg.apiKey}` } });
    if (!r.ok) return;
    const { items = [] } = await r.json();
    const due = items.filter((x) => x.due);
    await chrome.action.setBadgeText({ text: due.length ? String(due.length) : '' });
    await chrome.action.setBadgeBackgroundColor({ color: '#B54708' });
    const seen = new Set(cfg.notifiedPosts || []);
    for (const s of due) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      chrome.notifications.create(`avs-post-${s.id}`, {
        type: 'basic', iconUrl: 'icons/icon128.png', priority: 2,
        title: `Time to post: ${s.title}`,
        message: `Publish it on ${s.portal === 'indeed' ? 'Indeed' : 'LinkedIn'}. Click the AvaStars icon → Post a job → Start.${s.note ? ` Note: ${s.note}` : ''}`,
      });
    }
    await chrome.storage.local.set({ notifiedPosts: [...seen].slice(-300) });
  } catch { /* offline: try again next time */ }
}
chrome.alarms.create('avs-due-posts', { periodInMinutes: 10, delayInMinutes: 1 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'avs-due-posts') checkDuePosts(); });
chrome.notifications.onClicked.addListener(async (id) => {
  if (!id.startsWith('avs-post-')) return;
  const win = await chrome.windows.getLastFocused().catch(() => null);
  try { await chrome.sidePanel.open({ windowId: win?.id }); } catch {
    const { appUrl } = await chrome.storage.local.get('appUrl');
    if (appUrl) chrome.tabs.create({ url: `${appUrl.replace(/\/+$/, '')}/` });
  }
  chrome.notifications.clear(id);
});

// Sourcing: "Save to AvaStars" on a LinkedIn profile.
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (m?.type !== 'avs-linkedin-prospect') return false;
  if (!/^https:\/\/([a-z0-9-]+\.)*linkedin\.com\/(in|search)\//.test(sender?.url || '')) { reply({ ok: false, error: 'Open a LinkedIn profile or search first' }); return false; }
  (async () => {
    const cfg = await chrome.storage.local.get(['appUrl', 'apiKey', 'jobChoice']);
    if (!cfg.appUrl || !cfg.apiKey) throw new Error('Not connected. In AvaStars open "Chrome extension" and click Connect.');
    const body = { ...m.profile };
    if (cfg.jobChoice && /^\d+$/.test(cfg.jobChoice)) body.job_id = cfg.jobChoice;
    const r = await fetch(`${cfg.appUrl.replace(/\/+$/, '')}/api/inbound/prospect`, { method: 'POST', headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) throw new Error(data.error || `AvaStars returned ${r.status}`);
    return data;
  })().then(reply).catch((e) => reply({ ok: false, error: e.message }));
  return true;
});
