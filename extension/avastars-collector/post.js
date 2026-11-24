// AvaStars Collector — "Post a job": fills Indeed's / LinkedIn's post-a-job form from an AvaStars job.
// It never clicks Publish: the person checks the form and publishes it themselves, then clicks "I've published it".
// Uses helpers from panel.js ($, el, state, call, connect).
const poster = { kit: null, tabId: null, scheduleId: null, items: [] };

/** Runs inside the portal tab: fills every visible box whose label matches a field. Returns what it filled. */
function fillForm(fields) {
  const RULES = [
    [/^job title/i, /job ?title|position title|^title$|designation/i],
    [/^company/i, /^company( name)?$|company/i],
    [/location|city/i, /location|city|where will|job address/i],
    [/number of people|openings|vacanc/i, /how many|number of (people|hires|openings)|openings|hires/i],
    [/description/i, /description|about the (job|role)|job details|summary/i],
    [/apply on your website|url/i, /website|external url|apply.*url|application url/i],
  ];
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const labelOf = (e) => norm([
    e.getAttribute('aria-label'), e.getAttribute('placeholder'), e.getAttribute('name'), e.id && document.querySelector(`label[for="${CSS.escape(e.id)}"]`)?.textContent,
    e.closest('label')?.textContent, e.getAttribute('aria-labelledby') && e.getAttribute('aria-labelledby').split(' ').map((id) => document.getElementById(id)?.textContent).join(' '),
  ].filter(Boolean).join(' ')).slice(0, 200);
  const setValue = (e, v) => {
    e.focus();
    if (e.isContentEditable) {
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, v);
    } else {
      const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, v);
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    }
    e.dispatchEvent(new Event('blur', { bubbles: true }));
  };
  const boxes = [...document.querySelectorAll('input[type="text"], input:not([type]), input[type="url"], input[type="number"], textarea, [contenteditable="true"], [role="textbox"]')].filter(visible);
  const filled = []; const used = new Set();
  for (const f of fields) {
    const rule = RULES.find(([fl]) => fl.test(f.label));
    if (!rule || !f.value || /^(none|not disclosed|not specified)$/i.test(f.value)) continue;
    const box = boxes.find((b) => !used.has(b) && rule[1].test(labelOf(b)));
    if (!box) continue;
    const current = box.isContentEditable ? norm(box.textContent) : box.value;
    if (current && current.length > 3 && !/description/i.test(f.label)) { used.add(box); filled.push(`${f.label} (already filled)`); continue; }
    try { setValue(box, f.value); used.add(box); filled.push(f.label); } catch { /* ignore this box */ }
  }
  return { filled, url: location.href };
}

async function loadSchedules() {
  try {
    const data = await call('/api/inbound/schedules');
    poster.items = data.items || [];
  } catch { poster.items = []; }
  const box = $('dueList'); box.replaceChildren();
  const due = poster.items.filter((x) => x.due);
  $('dueBadge').textContent = due.length ? `${due.length} due` : '';
  for (const s of poster.items.slice(0, 8)) {
    const when = new Date(s.scheduled_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    box.append(el('div', { class: `due-item${s.due ? ' due' : ''}` },
      el('span', { class: 't', text: `${s.title} → ${s.portal === 'indeed' ? 'Indeed' : 'LinkedIn'}` }),
      el('span', { class: 'm', text: `${s.due ? 'Due now' : when}${s.assignee ? ` · ${s.assignee}` : ''}${s.note ? ` · ${s.note}` : ''}` }),
      el('button', { type: 'button', class: 'btn sm primary', text: 'Start', onclick: () => { $('postJob').value = String(s.job_id); startPost(s.portal, s.id); } })));
  }
  $('dueWrap').hidden = !poster.items.length;
  chrome.action.setBadgeText({ text: due.length ? String(due.length) : '' }).catch(() => {});
}

function fillJobs2() {
  const sel = $('postJob'); const cur = sel.value; sel.replaceChildren();
  for (const j of state.jobs) sel.append(el('option', { value: String(j.id), text: `${j.title}${j.client ? ` · ${j.client}` : ''}` }));
  if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
}

async function startPost(portal, scheduleId = null) {
  if (!(await connect())) { $('postMsg').textContent = 'Connect to AvaStars first.'; return; }
  const jobId = $('postJob').value;
  if (!jobId) { $('postMsg').textContent = 'Pick a job.'; return; }
  $('postMsg').textContent = 'Getting the job details…'; $('postMsg').className = 'tiny strong';
  try {
    poster.kit = await call(`/api/inbound/postkit?job=${encodeURIComponent(jobId)}&portal=${portal}`);
    poster.scheduleId = scheduleId;
    renderKit();
    const tab = await chrome.tabs.create({ url: poster.kit.url, active: true });
    poster.tabId = tab.id;
    $('postMsg').textContent = `Opening ${poster.kit.name}… log in if asked, start a new job post, then click "Fill this page".`;
    // Try filling automatically once the page has loaded.
    setTimeout(() => fillNow(true), 6000);
  } catch (e) { $('postMsg').textContent = e.message; $('postMsg').className = 'tiny bad'; }
}

function renderKit() {
  const k = poster.kit; const box = $('kitFields'); box.replaceChildren();
  $('kitWrap').hidden = !k;
  if (!k) return;
  $('kitTitle').textContent = `${k.job.title} → ${k.name}`;
  for (const f of k.fields) {
    const copy = el('button', { type: 'button', class: 'btn sm', text: 'Copy', onclick: async () => { await navigator.clipboard.writeText(f.value); copy.textContent = 'Copied ✓'; setTimeout(() => { copy.textContent = 'Copy'; }, 1500); } });
    box.append(el('div', { class: 'kv' }, el('div', { class: 'kl', text: f.label }), el('div', { class: 'kvv', text: f.value.length > 160 ? `${f.value.slice(0, 160)}…` : f.value, title: f.value }), copy));
  }
}

async function fillNow(auto = false) {
  if (!poster.kit) return;
  let tabId = poster.tabId;
  const t = tabId ? await chrome.tabs.get(tabId).catch(() => null) : null;
  if (!t) { const [a] = await chrome.tabs.query({ active: true, currentWindow: true }); tabId = a?.id; poster.tabId = tabId; }
  try {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: fillForm, args: [poster.kit.fields] });
    const n = result?.filled?.length || 0;
    $('postMsg').textContent = n
      ? `Filled: ${result.filled.join(', ')}. Choose the drop-downs (job type, workplace…) and check everything, then click ${poster.kit.name}'s own Publish/Post button.`
      : (auto ? `When the job form is open, click "Fill this page". Fields that aren't filled can be copied below.` : 'No matching boxes on this page. Go to the step with the job title / description and click "Fill this page" again, or use Copy.');
    $('postMsg').className = n ? 'tiny strong ok' : 'tiny';
    if (result?.url && !$('liveUrl').value) $('liveUrl').placeholder = 'Paste the live job link after publishing';
  } catch (e) {
    $('postMsg').textContent = /Cannot access|permission/i.test(e.message) ? `The extension isn't allowed on this page. Click "Allow on this site" at the top, then "Fill this page".` : e.message;
    $('postMsg').className = 'tiny bad';
  }
}

async function published() {
  if (!poster.kit) return;
  const url = $('liveUrl').value.trim();
  try {
    const r = await call('/api/inbound/schedules/done', { method: 'POST', body: JSON.stringify({ job_id: poster.kit.job.id, portal: poster.kit.portal, url, schedule_id: poster.scheduleId }) });
    $('postMsg').textContent = `Saved: ${poster.kit.job.title} marked as posted on ${poster.kit.name}${r.schedules_closed ? ' and its schedule closed' : ''}.`;
    $('postMsg').className = 'tiny strong ok';
    poster.kit = null; poster.scheduleId = null; $('liveUrl').value = ''; renderKit(); loadSchedules();
  } catch (e) { $('postMsg').textContent = e.message; $('postMsg').className = 'tiny bad'; }
}

(async () => {
  $('postIndeed').addEventListener('click', () => startPost('indeed'));
  $('postLinkedIn').addEventListener('click', () => startPost('linkedin'));
  $('fillNow').addEventListener('click', () => fillNow(false));
  $('published').addEventListener('click', published);
  $('kitClose').addEventListener('click', () => { poster.kit = null; renderKit(); $('postMsg').textContent = ''; });
  // When the panel connects (or reconnects), refresh the job list and the due posts.
  const refresh = async () => { if (state.jobs.length) fillJobs2(); if (state.apiKey) await loadSchedules(); };
  setTimeout(refresh, 2500);
  setInterval(refresh, 5 * 60 * 1000);
  chrome.storage.onChanged.addListener((c) => { if (c.apiKey) setTimeout(refresh, 1500); });
})();
