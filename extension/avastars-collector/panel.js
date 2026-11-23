// AvaStars Collector side panel: scan the open portal page, filter by applied date, send to AvaStars Hire.
const $ = (id) => document.getElementById(id);
const SOURCES = ['Indeed', 'Naukri', 'LinkedIn', 'Foundit', 'Shine', 'Apna', 'WorkIndia', 'Other'];
const PORTALS = [[/indeed\./i, 'Indeed'], [/naukri\./i, 'Naukri'], [/linkedin\./i, 'LinkedIn'], [/foundit\./i, 'Foundit'], [/shine\.com/i, 'Shine'], [/apna\.co/i, 'Apna'], [/workindia\./i, 'WorkIndia']];
const portalOf = (url) => (PORTALS.find(([re]) => re.test(url || '')) || [])[1] || '';

const state = { appUrl: '', apiKey: '', jobs: [], ai: false, list: [], skip: new Set(), tab: null, resumeFor: null, links: [], busy: false };

// ------------------------------------------------------------------ dates (India time)
const todayIST = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const shiftDays = (day, n) => { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d) + n * 86400000).toISOString().slice(0, 10); };
const fmt = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'no date');
function presets() {
  const t = todayIST();
  return [['Today', t, t], ['Yesterday', shiftDays(t, -1), shiftDays(t, -1)], ['7 days', shiftDays(t, -6), t], ['30 days', shiftDays(t, -29), t], ['All', '', '']];
}
const keyOf = (a) => (a.email || a.phone || `${(a.name || '').toLowerCase()}|${(a.job_title || '').toLowerCase()}`);

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== false && v !== null && v !== undefined) n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids) if (kid !== null && kid !== undefined) n.append(kid);
  return n;
}

// ------------------------------------------------------------------ connection
const api = (path) => `${state.appUrl.replace(/\/+$/, '')}${path}`;
async function call(path, options = {}) {
  const res = await fetch(api(path), { ...options, headers: { Authorization: `Bearer ${state.apiKey}`, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `AvaStars returned HTTP ${res.status}`);
  return data;
}

async function connect() {
  if (!state.appUrl || !state.apiKey) { $('conn').textContent = 'Not connected — open Settings'; showSettings(true); return false; }
  $('conn').textContent = 'Connecting…';
  try {
    const data = await call('/api/inbound/jobs');
    state.jobs = data.jobs || []; state.ai = Boolean(data.ai);
    $('conn').textContent = `Connected · ${state.jobs.length} open job(s) · AI ${state.ai ? 'on' : 'off'}`;
    $('conn').className = 'tiny ok';
    await fillJobs();
    if (typeof renderIndeedJobs === 'function' && collector.jobs.length) renderIndeedJobs();
    return true;
  } catch (e) {
    $('conn').textContent = `Not connected: ${e.message}`; $('conn').className = 'tiny bad';
    return false;
  }
}

async function fillJobs() {
  const { jobChoice = 'auto' } = await chrome.storage.local.get('jobChoice');
  const sel = $('job'); sel.replaceChildren();
  sel.append(el('option', { value: 'auto', text: 'Matching job (by the job title on the page)' }));
  for (const j of state.jobs) sel.append(el('option', { value: String(j.id), text: `${j.title}${j.client ? ` · ${j.client}` : ''}` }));
  sel.append(el('option', { value: 'none', text: 'No job — resume database only' }));
  sel.value = [...sel.options].some((o) => o.value === jobChoice) ? jobChoice : 'auto';
}

function showSettings(open) {
  $('settings').hidden = !open;
  $('toggleSettings').setAttribute('aria-expanded', String(open));
}

// ------------------------------------------------------------------ current tab
async function refreshTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  state.tab = tab || null;
  const url = tab?.url || '';
  let host = '';
  try { host = url ? new URL(url).hostname : ''; } catch { /* ignore */ }
  $('pageName').textContent = host || (tab ? 'This site' : '—');
  const src = portalOf(url);
  if (src) $('source').value = src;
  let allowed = Boolean(url);
  if (url && /^https?:/.test(url)) allowed = await chrome.permissions.contains({ origins: [`${new URL(url).origin}/*`] });
  $('permBox').hidden = allowed || (url && !/^https?:/.test(url));
}

// ------------------------------------------------------------------ scanning
function grabPage() {
  const sel = String(window.getSelection() || '').trim();
  const text = sel.length > 40 ? sel : document.body.innerText;
  const links = [...document.querySelectorAll('a[href]')]
    .filter((a) => /^https?:/i.test(a.href) && (/(resume|\bcv\b|download)/i.test(`${a.textContent} ${a.getAttribute('aria-label') || ''} ${a.title || ''}`) || /\.(pdf|docx?)(\?|$)/i.test(a.href)))
    .map((a) => ({ href: a.href, label: (a.textContent || a.getAttribute('aria-label') || a.href).replace(/\s+/g, ' ').trim().slice(0, 60) }))
    .filter((l, i, arr) => arr.findIndex((x) => x.href === l.href) === i)
    .slice(0, 10);
  return { text: text.slice(0, 150000), url: location.href, selected: sel.length > 40, links };
}

async function scan() {
  if (state.busy) return;
  if (!state.tab?.id) { $('scanMsg').textContent = 'Open the portal page in this window first.'; return; }
  if (!(await connect())) { $('scanMsg').textContent = 'Connect to AvaStars first (Settings).'; return; }
  setBusy(true, 'scan', 'Reading the page…');
  try {
    let page;
    try {
      [{ result: page }] = await chrome.scripting.executeScript({ target: { tabId: state.tab.id }, func: grabPage });
    } catch (e) {
      $('permBox').hidden = false;
      throw new Error('This page can\'t be read yet. Click "Allow on this site" and scan again.');
    }
    if (!page?.text?.trim()) throw new Error('The page looks empty. Wait for it to load and scan again.');
    $('scanMsg').textContent = state.ai ? 'Finding applicants with AI… (up to a minute for long lists)' : 'Finding applicants…';
    const data = await call('/api/inbound/extract', { method: 'POST', body: JSON.stringify({ text: page.text, url: page.url, source: $('source').value }) });
    const before = new Set(state.list.map(keyOf));
    let added = 0;
    for (const a of data.applicants || []) {
      const k = keyOf(a);
      if (before.has(k)) continue;
      before.add(k); added++;
      state.list.push({ ...a, page_url: page.url, source: $('source').value });
    }
    const found = (data.applicants || []).length;
    state.links = page.links || [];
    state.resumeFor = found === 1 && state.links.length ? keyOf(data.applicants[0]) : null;
    $('scanMsg').textContent = `${found} applicant(s) found on this ${page.selected ? 'selection' : 'page'}${found !== added ? ` (${found - added} already in the list)` : ''}.${data.warning ? ` ${data.warning}` : ''}`;
    $('scanMsg').className = 'tiny';
    await saveList();
    render();
  } catch (e) {
    $('scanMsg').textContent = e.message; $('scanMsg').className = 'tiny bad';
  }
  setBusy(false, 'scan', 'Scan this page');
}

function setBusy(on, btn, label) {
  state.busy = on;
  $('scan').disabled = on; $('send').disabled = on;
  if (btn) $(btn).textContent = label;
}

// ------------------------------------------------------------------ list
function visible() {
  const from = $('from').value; const to = $('to').value; const undated = $('undated').checked;
  return state.list.filter((a) => (a.applied_on ? (!from || a.applied_on >= from) && (!to || a.applied_on <= to) : (!from && !to) || undated));
}
const chosen = () => visible().filter((a) => !state.skip.has(keyOf(a)) && !a.sent);

function render() {
  const vis = visible();
  $('listCard').hidden = !state.list.length;
  $('listTitle').textContent = `Applicants (${state.list.length})`;
  $('listCount').textContent = `${chosen().length} to send · ${vis.length} in date range${state.list.length - vis.length ? ` · ${state.list.length - vis.length} outside` : ''}`;
  const box = $('list'); box.replaceChildren();
  for (const a of vis) {
    const k = keyOf(a);
    const off = state.skip.has(k) || a.sent;
    const cb = el('input', { type: 'checkbox', 'aria-label': `Send ${a.name || a.email || ''}`, checked: !off, disabled: Boolean(a.sent),
      onchange: () => { if (state.skip.has(k)) state.skip.delete(k); else state.skip.add(k); render(); } });
    const contact = [a.email, a.phone].filter(Boolean).join(' · ') || 'No email or phone on the page';
    const bits = [fmt(a.applied_on), a.job_title, a.total_exp !== null && a.total_exp !== undefined ? `${a.total_exp} yrs` : '', a.location].filter(Boolean).join(' · ');
    box.append(el('div', { class: `person${off ? ' off' : ''}` }, cb,
      el('div', { class: 'name' }, a.name || 'No name', a.sent ? el('span', { class: `pill ${a.sent === 'failed' ? 'red' : 'green'}`, text: a.sent === 'failed' ? ' Failed' : ' Sent', style: 'margin-left:6px' }) : null),
      el('div', { class: 'meta', text: contact }),
      el('div', { class: 'meta', text: bits })));
  }
  const showResume = Boolean(state.resumeFor && state.links.length && state.list.some((a) => keyOf(a) === state.resumeFor && !a.sent));
  $('resumeBox').hidden = !showResume;
  if (showResume) {
    const sel = $('resumeLink'); sel.replaceChildren();
    for (const l of state.links) sel.append(el('option', { value: l.href, text: l.label || l.href }));
  }
  $('send').textContent = `Send ${chosen().length} to AvaStars`;
  $('send').disabled = state.busy || !chosen().length;
}

async function saveList() {
  await chrome.storage.session.set({ list: state.list, skip: [...state.skip] }).catch(() => {});
}

// ------------------------------------------------------------------ sending
function fetchInPage(url) {
  return (async () => {
    try {
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) return { error: `HTTP ${r.status}` };
      const blob = await r.blob();
      if (blob.size > 8 * 1024 * 1024) return { error: 'over 8 MB' };
      const buf = new Uint8Array(await blob.arrayBuffer()); let s = '';
      for (let i = 0; i < buf.length; i += 32768) s += String.fromCharCode.apply(null, buf.subarray(i, i + 32768));
      const cd = r.headers.get('content-disposition') || '';
      const m = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i);
      return { b64: btoa(s), mime: blob.type || r.headers.get('content-type') || '', name: m ? decodeURIComponent(m[1]) : (url.split('?')[0].split('/').pop() || 'resume') };
    } catch (e) { return { error: e.message }; }
  })();
}

async function resumeFor(a) {
  if (!state.resumeFor || keyOf(a) !== state.resumeFor || !$('attachResume').checked || !state.tab?.id) return null;
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: state.tab.id }, func: fetchInPage, args: [$('resumeLink').value] });
  if (!result || result.error) return { error: result?.error || 'could not download' };
  let name = result.name;
  if (!/\.\w{2,4}$/.test(name)) name += /pdf/.test(result.mime) ? '.pdf' : /word|officedocument/.test(result.mime) ? '.docx' : '';
  return { resume_base64: result.b64, resume_filename: name, resume_mime: result.mime };
}

async function send() {
  const items = chosen();
  if (!items.length || state.busy) return;
  if (!(await connect())) return;
  setBusy(true, 'send', 'Sending…');
  const job = $('job').value;
  const report = $('report'); report.replaceChildren();
  const tally = { created: 0, merged: 0, failed: 0, resumes: 0 };
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const a = items[next++];
      const body = {
        name: a.name, email: a.email, phone: a.phone, location: a.location, applied_on: a.applied_on, job_title: a.job_title,
        current_title: a.current_title, current_company: a.current_company, total_exp: a.total_exp, notice_days: a.notice_days,
        cctc: a.cctc, ectc: a.ectc, skills: a.skills, profile_url: a.profile_url, source: a.source || $('source').value,
        notes: `Collected with the Chrome extension from ${a.page_url || 'a portal page'}.`,
      };
      if (/^\d+$/.test(job)) body.job_id = job; else if (job === 'auto') body.auto_job = '1';
      let line;
      try {
        const r = await resumeFor(a);
        if (r && !r.error) { Object.assign(body, r); tally.resumes++; }
        const data = await call('/api/inbound/candidate', { method: 'POST', body: JSON.stringify(body) });
        a.sent = data.status === 'merged' ? 'merged' : 'created';
        tally[a.sent]++;
        line = [a.name || a.email, `${data.status === 'merged' ? 'Updated' : 'New'}${data.job ? ` · ${data.job}` : ''}${data.match !== null && data.match !== undefined ? ` · ${data.match}%` : ''}${r?.error ? ' · resume not attached' : ''}`, 'green'];
      } catch (e) {
        a.sent = 'failed'; tally.failed++;
        line = [a.name || a.email || 'Applicant', e.message, 'red'];
      }
      report.append(el('div', { class: 'logline tiny' }, el('span', { text: line[0] }), el('span', { class: `pill ${line[2]}`, text: line[1].slice(0, 60), title: line[1] })));
      $('send').textContent = `Sending… ${tally.created + tally.merged + tally.failed}/${items.length}`;
    }
  };
  await Promise.all([worker(), worker()]);
  report.prepend(el('div', { class: 'strong', text: `Done: ${tally.created} new · ${tally.merged} updated${tally.failed ? ` · ${tally.failed} failed` : ''}` }));
  // Failed ones stay selectable so they can be sent again.
  for (const a of items) if (a.sent === 'failed') delete a.sent;
  call('/api/inbound/run', { method: 'POST', body: JSON.stringify({ source: $('source').value, total: items.length, ...tally, from: $('from').value, to: $('to').value }) }).catch(() => {});
  await saveList();
  setBusy(false, 'send', '');
  render();
}

// ------------------------------------------------------------------ resume catcher log
async function renderCatcher() {
  const { catcherLog = [] } = await chrome.storage.local.get('catcherLog');
  const box = $('catcherLog'); box.replaceChildren();
  for (const l of catcherLog.slice(0, 6)) {
    box.append(el('div', { class: 'logline' }, el('span', { text: l.file }), el('span', { class: l.ok ? 'ok' : 'bad', text: l.msg.slice(0, 80), title: l.msg })));
  }
}

// ------------------------------------------------------------------ start
async function init() {
  for (const s of SOURCES) $('source').append(el('option', { text: s }));
  const saved = await chrome.storage.local.get(['appUrl', 'apiKey', 'catcher', 'range', 'undated']);
  state.appUrl = saved.appUrl || ''; state.apiKey = saved.apiKey || '';
  $('appUrl').value = state.appUrl; $('apiKey').value = state.apiKey ? '••••••••' : '';
  $('catcher').checked = Boolean(saved.catcher);
  $('undated').checked = Boolean(saved.undated);
  const [from, to] = saved.range || presets()[2].slice(1);
  $('from').value = from; $('to').value = to;
  const sess = await chrome.storage.session.get(['list', 'skip']).catch(() => ({}));
  state.list = sess.list || []; state.skip = new Set(sess.skip || []);

  const chips = $('presets');
  const markChips = () => [...chips.children].forEach((c) => c.classList.toggle('on', c.dataset.from === $('from').value && c.dataset.to === $('to').value));
  for (const [label, a, b] of presets()) {
    chips.append(el('button', { type: 'button', class: 'chip', 'data-from': a, 'data-to': b, text: label, onclick: () => { $('from').value = a; $('to').value = b; dateChanged(); } }));
  }
  const dateChanged = () => { chrome.storage.local.set({ range: [$('from').value, $('to').value], undated: $('undated').checked }); markChips(); render(); };
  $('from').addEventListener('change', dateChanged); $('to').addEventListener('change', dateChanged); $('undated').addEventListener('change', dateChanged);
  markChips();

  $('toggleSettings').addEventListener('click', () => showSettings($('settings').hidden));
  $('saveSettings').addEventListener('click', async () => {
    const url = $('appUrl').value.trim().replace(/\/+$/, '');
    const key = $('apiKey').value.trim();
    if (!/^https?:\/\/[^\s]+$/i.test(url)) { $('settingsMsg').textContent = 'Enter the app address, e.g. https://raas-drab.vercel.app'; return; }
    state.appUrl = url;
    if (key && !/^•+$/.test(key)) state.apiKey = key;
    await chrome.storage.local.set({ appUrl: state.appUrl, apiKey: state.apiKey });
    $('settingsMsg').textContent = 'Testing…';
    const ok = await connect();
    $('settingsMsg').textContent = ok ? 'Connected ✓' : $('conn').textContent;
    if (ok) { $('apiKey').value = '••••••••'; setTimeout(() => showSettings(false), 800); }
  });
  $('allowSite').addEventListener('click', async () => {
    let origins = ['https://*/*', 'http://*/*'];
    try { if (state.tab?.url) origins = [`${new URL(state.tab.url).origin}/*`]; } catch { /* use all sites */ }
    const ok = await chrome.permissions.request({ origins });
    if (ok) { $('permBox').hidden = true; $('scanMsg').textContent = 'Allowed. Click Scan this page.'; }
  });
  $('job').addEventListener('change', () => chrome.storage.local.set({ jobChoice: $('job').value }));
  $('scan').addEventListener('click', scan);
  $('send').addEventListener('click', send);
  $('clearList').addEventListener('click', async () => { state.list = []; state.skip = new Set(); state.resumeFor = null; $('report').replaceChildren(); await saveList(); render(); });
  $('selAll').addEventListener('click', () => { for (const a of visible()) state.skip.delete(keyOf(a)); saveList(); render(); });
  $('selNone').addEventListener('click', () => { for (const a of visible()) state.skip.add(keyOf(a)); saveList(); render(); });
  $('catcher').addEventListener('change', () => chrome.storage.local.set({ catcher: $('catcher').checked }));
  chrome.storage.onChanged.addListener((changes) => { if (changes.catcherLog) renderCatcher(); });
  chrome.tabs.onActivated.addListener(refreshTab);
  chrome.tabs.onUpdated.addListener((id, info) => { if (id === state.tab?.id && (info.url || info.status === 'complete')) refreshTab(); });

  await refreshTab();
  render();
  renderCatcher();
  connect();
}

init();
