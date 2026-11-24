// AvaStars Collector — "Post a job": fills Indeed's / LinkedIn's post-a-job form from an AvaStars job.
// It never clicks Publish: the person checks the form and publishes it themselves, then clicks "I've published it".
// Uses helpers from panel.js ($, el, state, call, connect).
const poster = { kit: null, tabId: null, scheduleId: null, items: [] };

/** Runs inside the portal tab: fills the job form. LinkedIn gets its own steps (search boxes with suggestions,
 * menus, the edit box behind the pencil); other sites are matched by field labels. Returns what it filled. */
async function fillForm(fields) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const val = (re) => (fields.find((f) => re.test(f.label))?.value || '').trim();
  const usable = (v) => v && !/^(none|not disclosed|not specified)$/i.test(v);
  const visible = (e) => { if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const setNative = (e, v) => {
    const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, v);
    e.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const press = (el) => { for (const t of ['mousedown', 'mouseup', 'click']) el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window })); };
  const filled = []; const skipped = [];

  /** Search box with a suggestion list (LinkedIn "typeahead"): type, wait for suggestions, pick the best one. */
  async function typeahead(input, text, { exactOnly = false, label }) {
    if (!input || !usable(text)) return;
    if (norm(input.value).toLowerCase() === text.toLowerCase()) { filled.push(`${label} (already)`); return; }
    input.focus(); setNative(input, ''); await wait(150); setNative(input, text);
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: text.slice(-1) }));
    let opts = [];
    for (let i = 0; i < 25 && !opts.length; i++) {
      await wait(200);
      const lb = document.getElementById(input.getAttribute('aria-controls') || '') || input.closest('div')?.parentElement?.querySelector('[role=listbox]');
      opts = lb ? [...lb.querySelectorAll('[role=option]')].filter(visible) : [];
    }
    const want = text.toLowerCase();
    const t = (o) => norm(o.textContent).toLowerCase();
    const exact = opts.find((o) => t(o) === want);
    const starts = opts.find((o) => t(o).startsWith(want));
    // Locations: prefer the city itself ("Pune City, Maharashtra, India") over a metro area or nearby town.
    const city = label === 'Job location'
      ? (opts.find((o) => t(o).startsWith(`${want},`)) || opts.find((o) => t(o).startsWith(`${want} city,`)) || opts.find((o) => t(o).startsWith(want) && /india$/.test(t(o))))
      : null;
    const pick = exact || city || (exactOnly ? null : (starts || opts[0]));
    if (pick) { press(pick); await wait(400); filled.push(label); }
    else if (exactOnly) { skipped.push(`${label} (no exact match on LinkedIn; left as it was)`); }
    else skipped.push(`${label} (no suggestion)`);
  }

  /** LinkedIn menu button (Workplace type, Job type, apply method): open it and click the matching option. */
  async function menu(button, choice, label) {
    if (!button || !usable(choice)) return false;
    if (norm(button.textContent).toLowerCase().includes(choice.toLowerCase())) { filled.push(`${label} (already)`); return true; }
    press(button); await wait(600);
    const opts = [...document.querySelectorAll('[role=option], .artdeco-dropdown__item')].filter(visible);
    const o = opts.find((x) => norm(x.textContent).replace(/^selected\s*/i, '').toLowerCase().startsWith(choice.toLowerCase()));
    if (o) { press(o); await wait(400); filled.push(label); return true; }
    press(button); skipped.push(`${label} (option "${choice}" not offered)`); return false;
  }

  const onLinkedIn = /(^|\.)linkedin\.com$/.test(location.hostname);
  if (onLinkedIn) {
    const title = val(/^job title/i);
    // Start page: only the title, then the person clicks "Start hiring".
    const startTitle = document.querySelector('input[id^="job-title-typeahead-input"]');
    if (startTitle && !document.querySelector('button[aria-label="Edit job details"]') && !document.querySelector('input[id^="company-typeahead-input"]')) {
      await typeahead(startTitle, title, { label: 'Job title' });
      return { filled, skipped, next: 'Click "Start hiring", then "Fill this page" again on the next screen.', url: location.href };
    }
    // Job details: open the edit box behind the pencil, then fill everything.
    const edit = document.querySelector('button[aria-label="Edit job details"]');
    if (edit && !document.querySelector('input[id^="company-typeahead-input"]')) { press(edit); await wait(1500); }
    if (document.querySelector('input[id^="company-typeahead-input"]')) {
      await typeahead(document.querySelector('input[id^="job-title-typeahead-input"]'), title, { label: 'Job title' });
      await typeahead(document.querySelector('input[id^="company-typeahead-input"]'), val(/^company/i), { exactOnly: true, label: 'Company' });
      await menu(document.querySelector('button[id^="workplace-type-selection-dropdown"]'), val(/workplace/i), 'Workplace type');
      await typeahead(document.querySelector('input[id^="location-typeahead-input"]'), val(/location/i), { label: 'Job location' });
      await menu(document.querySelector('button[id^="job-type"]'), val(/job type/i), 'Job type');
    }
    const editor = [...document.querySelectorAll('.ql-editor[contenteditable="true"], [role=textbox][contenteditable="true"]')].find(visible);
    const desc = val(/description/i);
    if (editor && usable(desc)) {
      editor.focus(); document.execCommand('selectAll', false, null); document.execCommand('insertText', false, desc);
      editor.dispatchEvent(new Event('input', { bubbles: true })); filled.push('Description');
    }
    // Job settings: the apply link only if "On an external website" is chosen.
    const applyTrigger = document.getElementById('apply-method-dropdown-trigger');
    if (applyTrigger) {
      const url = val(/apply on your website|url/i);
      const urlBox = [...document.querySelectorAll('input[type="url"], input[id^="apply-method-input"]')].find((i) => visible(i) && i.type !== 'email');
      if (urlBox && usable(url)) { urlBox.focus(); setNative(urlBox, url); urlBox.dispatchEvent(new Event('change', { bubbles: true })); filled.push('Apply link (external website)'); }
      else skipped.push('Apply method: stays "On LinkedIn". To send applicants to your careers page, choose "On an external website" there and click "Fill this page" again');
    }
    return { filled, skipped, url: location.href };
  }

  // Other sites (Indeed…): match boxes by their labels.
  const RULES = [
    [/^job title/i, /job ?title|position title|^title$|designation/i],
    [/^company/i, /^company( name)?$|company/i],
    [/location|city/i, /location|city|where will|job address/i],
    [/number of people|openings|vacanc/i, /how many|number of (people|hires|openings)|openings|hires/i],
    [/description/i, /description|about the (job|role)|job details|summary/i],
    [/apply on your website|url/i, /website|external url|apply.*url|application url/i],
  ];
  const labelOf = (e) => norm([
    e.getAttribute('aria-label'), e.getAttribute('placeholder'), e.getAttribute('name'), e.id && document.querySelector(`label[for="${CSS.escape(e.id)}"]`)?.textContent,
    e.closest('label')?.textContent, e.getAttribute('aria-labelledby') && e.getAttribute('aria-labelledby').split(' ').map((id) => document.getElementById(id)?.textContent).join(' '),
  ].filter(Boolean).join(' ')).slice(0, 200);
  const boxes = [...document.querySelectorAll('input[type="text"], input:not([type]), input[type="url"], input[type="number"], textarea, [contenteditable="true"], [role="textbox"]')].filter(visible);
  const used = new Set();
  for (const f of fields) {
    const rule = RULES.find(([fl]) => fl.test(f.label));
    if (!rule || !usable(f.value)) continue;
    const box = boxes.find((b) => !used.has(b) && rule[1].test(labelOf(b)));
    if (!box) continue;
    const current = box.isContentEditable ? norm(box.textContent) : box.value;
    if (current && current.length > 3 && !/description/i.test(f.label)) { used.add(box); filled.push(`${f.label} (already)`); continue; }
    try {
      box.focus();
      if (box.isContentEditable) { document.execCommand('selectAll', false, null); document.execCommand('insertText', false, f.value); }
      else { setNative(box, f.value); box.dispatchEvent(new Event('change', { bubbles: true })); }
      box.dispatchEvent(new Event('blur', { bubbles: true }));
      used.add(box); filled.push(f.label);
    } catch { /* skip this box */ }
  }
  return { filled, skipped, url: location.href };
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
    const settle = async () => {
      for (let w = 0; w < 30; w++) { const tt = await chrome.tabs.get(tabId).catch(() => null); if (!tt || tt.status === 'complete') break; await new Promise((r) => setTimeout(r, 500)); }
    };
    await settle();
    let result = await runInTab(tabId, fillForm, [poster.kit.fields]);
    if (!result?.filled?.length) { // the page may have redirected or still be drawing the form: try once more
      await new Promise((r) => setTimeout(r, 2500)); await settle();
      result = await runInTab(tabId, fillForm, [poster.kit.fields]);
    }
    const n = result?.filled?.length || 0;
    const extra = `${result?.skipped?.length ? ` Not filled: ${result.skipped.join('; ')}.` : ''}${result?.next ? ` ${result.next}` : ''}`;
    $('postMsg').textContent = n
      ? `Filled: ${result.filled.join(', ')}.${extra} Check everything; anything left can be copied below. Then click ${poster.kit.name}'s own Continue / Post button.`
      : (auto ? `When the job form is open, click "Fill this page". Fields that aren't filled can be copied below.` : 'No matching boxes on this page. Go to the step with the job title / description and click "Fill this page" again, or use Copy.');
    $('postMsg').className = n ? 'tiny strong ok' : 'tiny';
    if (result?.url && !$('liveUrl').value) $('liveUrl').placeholder = 'Paste the live job link after publishing';
  } catch (e) {
    if (auto) { // the automatic first try is optional: the page may still be logging in / redirecting
      $('postMsg').textContent = `When ${poster.kit.name}'s job form is open, click "Fill this page".`; $('postMsg').className = 'tiny';
      return;
    }
    $('postMsg').textContent = /Cannot access|permission/i.test(e.message)
      ? `The extension isn't allowed on this page. Click "Allow on this site" at the top, then "Fill this page".`
      : /frame|removed|closed/i.test(e.message) ? 'The page was still loading. Wait until the job form is showing, then click "Fill this page" again.' : e.message;
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
