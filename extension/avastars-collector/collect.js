// AvaStars Collector — "Collect from Indeed": pick Indeed jobs, then every applicant in the date range
// (with their resume) is sent to AvaStars Hire. Uses helpers from panel.js ($, el, state, call, connect, todayIST).
const collector = { jobs: [], running: false, stop: false };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MONTHS3 = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** Indeed shows "Applied 9:50 am" (today), "Applied Nov 21" or "Applied Nov 21, 2025". Returns YYYY-MM-DD or null. */
function parseApplied(text, today = todayIST()) {
  const s = String(text || '').toLowerCase();
  if (!s) return null;
  if (/today|just now|\bhours? ago|\bminutes? ago/.test(s)) return today;
  if (/yesterday/.test(s)) return shiftDays(today, -1);
  let m = s.match(/(\d+)\s*(day|week|month)s?\s*ago/);
  if (m) return shiftDays(today, -Number(m[1]) * ({ day: 1, week: 7, month: 30 }[m[2]]));
  m = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?/);
  if (m) {
    const mo = MONTHS3[m[1]]; const d = Number(m[2]);
    let y = m[3] ? Number(m[3]) : Number(today.slice(0, 4));
    let day = `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (!m[3] && day > today) { y -= 1; day = `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
    return day;
  }
  if (/\b\d{1,2}:\d{2}\s*(am|pm)\b/.test(s)) return today;
  return null;
}

const STOP_WORDS = new Set(['and', 'the', 'for', 'with', 'job', 'role', 'opening', 'urgent', 'hiring', 'sr', 'jr']);
const tokens = (s) => new Set(String(s || '').toLowerCase().replace(/[^a-z0-9+#. ]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP_WORDS.has(w)));
/** Same rule as the app: the AvaStars job whose title words mostly appear in the Indeed title. */
function matchAva(title) {
  const t = tokens(title); let best = null; let score = 0;
  for (const j of state.jobs) {
    if (String(title).toLowerCase().includes(String(j.title).toLowerCase())) return j;
    const w = tokens(j.title); if (!w.size) continue;
    const s = [...w].filter((x) => t.has(x)).length / w.size;
    if (s > score) { score = s; best = j; }
  }
  return score >= 0.6 ? best : null;
}

// ------------------------------------------------------------------ tab helpers
// Indeed only builds its lists in a tab you can see, so the collector works in a visible tab
// (in this window) and brings it to the front while it reads. You get your tab back when it finishes.
async function waitLoaded(tabId) {
  for (let i = 0; i < 60; i++) {
    const t = await chrome.tabs.get(tabId).catch(() => null);
    if (!t) throw new Error('The Indeed tab was closed.');
    if (t.status === 'complete') return;
    await sleep(500);
  }
}
async function activeTab() {
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  return t || null;
}
async function openWorkTab(url) {
  const back = await activeTab();
  const tab = await chrome.tabs.create({ url, active: true, index: back ? back.index + 1 : undefined });
  await sleep(800); await waitLoaded(tab.id);
  return { tabId: tab.id, back: back?.id || null };
}
async function closeWorkTab(work) {
  if (!work) return;
  if (work.own !== false) await chrome.tabs.remove(work.tabId).catch(() => {});
  if (work.back && work.back !== work.tabId) await chrome.tabs.update(work.back, { active: true }).catch(() => {});
}
async function go(tabId, url) {
  await chrome.tabs.update(tabId, { url, active: true });
  await sleep(800); await waitLoaded(tabId);
}
async function inTab(tabId, func, args = []) {
  await chrome.tabs.update(tabId, { active: true }).catch(() => {});
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return res?.result;
}

// ------------------------------------------------------------------ jobs list
async function getMap() { return (await chrome.storage.local.get('indeedMap')).indeedMap || {}; }

/** Where an Indeed job's applicants go: the per-job choice, else the panel's "Add them to". */
function targetFor(job, map) {
  const per = map[job.id];
  const choice = per && per !== 'default' ? per : $('job').value;
  if (choice === 'none') return { choice, label: 'Resume database only' };
  if (/^\d+$/.test(choice)) {
    const j = state.jobs.find((x) => String(x.id) === choice);
    return { choice, label: j ? j.title : 'chosen job' };
  }
  const m = matchAva(job.title);
  return m ? { choice: String(m.id), label: `${m.title} (matched by title)` } : { choice: 'none', label: 'no matching AvaStars job, so resume database only' };
}

async function renderIndeedJobs() {
  const { indeedPicked = [], indeedLastRun = {} } = await chrome.storage.local.get(['indeedPicked', 'indeedLastRun']);
  const map = await getMap();
  const box = $('indeedJobs'); box.replaceChildren();
  for (const j of collector.jobs) {
    const cb = el('input', { type: 'checkbox', checked: indeedPicked.includes(j.id), 'aria-label': `Collect ${j.title}`,
      onchange: async () => {
        const cur = new Set((await chrome.storage.local.get('indeedPicked')).indeedPicked || []);
        if (cb.checked) cur.add(j.id); else cur.delete(j.id);
        await chrome.storage.local.set({ indeedPicked: [...cur] });
      } });
    const sel = el('select', { 'aria-label': `AvaStars job for ${j.title}`, class: 'tiny',
      onchange: async () => { const m = await getMap(); m[j.id] = sel.value; await chrome.storage.local.set({ indeedMap: m }); renderIndeedJobs(); } });
    const t = targetFor(j, map);
    sel.append(el('option', { value: 'default', text: `→ ${t.label}` }));
    for (const a of state.jobs) sel.append(el('option', { value: String(a.id), text: `→ ${a.title}${a.client ? ` · ${a.client}` : ''}` }));
    sel.append(el('option', { value: 'none', text: '→ Resume database only (no job)' }));
    sel.value = map[j.id] && [...sel.options].some((o) => o.value === map[j.id]) ? map[j.id] : 'default';
    const last = indeedLastRun[j.id];
    box.append(el('div', { class: 'job' }, cb,
      el('span', { class: 't', text: j.title }),
      el('span', { class: 'm', text: `${j.all} applicant(s) · ${j.fresh} new${j.status ? ` · ${j.status}` : ''}${last ? ` · last collected ${last}` : ''}` }),
      sel));
  }
  $('indeedOpts').hidden = !collector.jobs.length;
}

async function loadIndeed() {
  if (collector.running) return;
  if (!(await connect())) { $('collectMsg').textContent = 'Connect to AvaStars first (Settings).'; return; }
  $('collectMsg').textContent = 'Opening your Indeed jobs… (this takes up to 20 seconds)'; $('collectMsg').className = 'tiny strong';
  $('loadIndeed').disabled = true;
  let work = null;
  try {
    const cur = await activeTab();
    if (cur?.url && /^https:\/\/employers\.indeed\.com\/jobs/.test(cur.url)) work = { tabId: cur.id, back: null, own: false };
    else work = await openWorkTab(INDEED.jobsUrl);
    let r = await inTab(work.tabId, INDEED.readJobs);
    if (!r?.jobs?.length && !r?.loggedOut) { // slow first load: reload once and read again
      await go(work.tabId, INDEED.jobsUrl);
      r = await inTab(work.tabId, INDEED.readJobs);
    }
    if (r?.loggedOut) throw new Error('Log in to Indeed for Employers in this Chrome first, then try again.');
    collector.jobs = r?.jobs || [];
    if (!collector.jobs.length) {
      throw new Error(r?.rowCount
        ? `Indeed shows ${r.rowCount} job row(s) but none is posted yet (drafts are skipped). Finish posting the job on Indeed first.`
        : `Indeed didn't show your jobs list (page: ${r?.path || '?'} "${r?.title || ''}"). Open employers.indeed.com/jobs in this tab, wait until your jobs appear, then click "Load my Indeed jobs" again.`);
    }
    $('collectMsg').textContent = `${collector.jobs.length} Indeed job(s). Tick the ones to collect and check where each one goes.`;
    await chrome.storage.local.set({ indeedJobs: collector.jobs });
    await renderIndeedJobs();
  } catch (e) {
    $('collectMsg').textContent = /Cannot access|permission/i.test(e.message) ? 'Chrome blocked access to Indeed. In chrome://extensions open AvaStars Collector → Details → Site access → "On all sites" (or add indeed.com), then try again.' : e.message;
    $('collectMsg').className = 'tiny bad';
  }
  await closeWorkTab(work);
  $('loadIndeed').disabled = false;
}

// ------------------------------------------------------------------ collecting
function logLine(text, tone = '', candidateId = null) {
  const label = candidateId
    ? el('a', { href: `${state.appUrl.replace(/\/+$/, '')}/candidates/${candidateId}`, target: '_blank', rel: 'noreferrer', text })
    : el('span', { text });
  $('collectLog').prepend(el('div', { class: `logline tiny${tone ? ` ${tone}` : ''}` }, label));
}

async function collect() {
  if (collector.running) return;
  const { indeedPicked = [], indeedSent = [], indeedLastRun = {} } = await chrome.storage.local.get(['indeedPicked', 'indeedSent', 'indeedLastRun']);
  const map = await getMap();
  const sinceLast = $('indeedSince').checked;
  const picked = collector.jobs.filter((j) => indeedPicked.includes(j.id));
  if (!picked.length) { $('collectMsg').textContent = 'Tick at least one Indeed job.'; return; }
  if (!(await connect())) { $('collectMsg').textContent = 'Connect to AvaStars first (Settings).'; return; }
  const from = $('from').value; const to = $('to').value; const undated = $('undated').checked;
  const max = Number($('indeedMax').value) || 100;
  const withResumes = $('indeedResumes').checked; const skipSent = $('indeedSkip').checked;
  const status = $('indeedStatus').value;
  const sent = new Set(indeedSent);
  collector.running = true; collector.stop = false;
  $('collectMsg').textContent = 'Starting…'; $('collectMsg').className = 'tiny strong';
  dash.reset('Indeed'); $('dashTitle').textContent = 'Collecting from Indeed';
  $('collect').disabled = true; $('loadIndeed').disabled = true; $('stopCollect').hidden = false;
  $('collectLog').replaceChildren();
  const tally = { created: 0, merged: 0, failed: 0, resumes: 0, skipped: 0 };
  let total = 0; let work = null; let tabId;
  try {
    work = await openWorkTab(INDEED.listUrl(picked[0].id, status));
    tabId = work.tabId;
    for (const job of picked) {
      if (collector.stop || total >= max) break;
      const target = targetFor(job, map);
      const jobFrom = sinceLast && indeedLastRun[job.id] && (!from || indeedLastRun[job.id] > from) ? indeedLastRun[job.id] : from;
      // 1) Read the applicant list page by page; stop once a whole page is older than the start date.
      $('collectMsg').textContent = `${job.title}: reading the applicant list…`;
      await go(tabId, INDEED.listUrl(job.id, status));
      const people = []; let prevFirst = ''; let pages = 0;
      while (!collector.stop && pages < 60) {
        const list = await inTab(tabId, INDEED.readList, [prevFirst]);
        if (list?.loggedOut) throw new Error('Indeed logged you out. Log in again and re-run.');
        if (!list?.rows?.length) break;
        let older = 0;
        for (const r of list.rows) {
          const day = parseApplied(r.applied);
          if (day && to && day > to) continue;
          if (day && jobFrom && day < jobFrom) { older++; continue; }
          if (!day && (jobFrom || to) && !undated) continue;
          const cid = (() => { try { return new URL(r.href).searchParams.get('id') || r.href; } catch { return r.href; } })();
          if (skipSent && sent.has(cid)) { tally.skipped++; dash.skip(1); continue; }
          if (!people.some((p) => p.cid === cid)) people.push({ ...r, day, cid });
        }
        $('collectMsg').textContent = `${job.title}: page ${pages + 1} read · ${people.length} in range${list.counter ? ` (${list.counter})` : ''}`;
        if (people.length + total >= max || (jobFrom && older === list.rows.length) || !list.hasNext) break;
        prevFirst = list.rows[0].href;
        await inTab(tabId, INDEED.nextPage);
        pages++;
        await sleep(1500 + Math.random() * 1000);
      }
      const todo = people.slice(0, Math.max(0, max - total));
      dash.addTotal(todo.length, job.title);
      logLine(`${job.title} → ${target.label}: ${todo.length} applicant(s) to send${jobFrom && jobFrom !== from ? ` (since last collect, ${jobFrom})` : ''}${people.length > todo.length ? ` (limit ${max} reached)` : ''}`);
      // 2) Open each applicant, take the resume, send to AvaStars.
      for (let i = 0; i < todo.length && !collector.stop; i++) {
        const p = todo[i];
        $('collectMsg').textContent = `${job.title}: ${i + 1} of ${todo.length} — ${p.name || 'applicant'}`;
        const body = {
          name: p.name, location: p.location, applied_on: p.day, job_title: job.title, source: 'Indeed',
          profile_url: `https://employers.indeed.com/candidates/view?id=${encodeURIComponent(p.cid)}`,
          notes: `Indeed applicant for "${job.title}" (applied ${p.applied.replace(/^applied\s*/i, '') || 'date not shown'}).`,
        };
        if (/^\d+$/.test(target.choice)) body.job_id = target.choice;
        let note = '';
        if (withResumes) {
          try {
            await go(tabId, p.href);
            const prof = await inTab(tabId, INDEED.readProfile);
            if (prof?.b64) { body.resume_base64 = prof.b64; body.resume_filename = prof.filename; body.resume_mime = prof.mime; tally.resumes++; }
            else note = prof?.noResume ? ' · no resume on Indeed' : ` · ${prof?.error || 'resume not read'}`;
            if (!body.location && prof?.location) body.location = prof.location;
          } catch (e) { note = ` · resume not read (${e.message})`; }
        }
        try {
          const data = await call('/api/inbound/candidate', { method: 'POST', body: JSON.stringify(body) });
          const kind = data.status === 'merged' ? 'merged' : 'created';
          tally[kind]++; sent.add(p.cid);
          dash.record(data, job.title, Boolean(body.resume_base64));
          logLine(`${p.name || 'Applicant'} — ${kind === 'merged' ? 'updated' : 'new'}${data.job ? ` · ${data.job}` : ''}${data.match !== null && data.match !== undefined ? ` · ${data.match}%` : ''}${note}`, 'ok', data.candidate_id);
        } catch (e) {
          tally.failed++;
          dash.record(null, job.title, false);
          logLine(`${p.name || 'Applicant'} — failed: ${e.message}`, 'bad');
        }
        total++;
        if (total % 5 === 0) await chrome.storage.local.set({ indeedSent: [...sent].slice(-5000) });
        if (withResumes && i < todo.length - 1) await sleep(2000 + Math.random() * 2000);
      }
      if (!collector.stop && todo.length === people.length) {
        indeedLastRun[job.id] = to && to < todayIST() ? to : todayIST();
        await chrome.storage.local.set({ indeedLastRun });
      }
    }
    $('collectMsg').textContent = `${collector.stop ? 'Stopped' : 'Done'}: ${tally.created} new · ${tally.merged} updated · ${tally.resumes} resume(s)${tally.failed ? ` · ${tally.failed} failed` : ''}${tally.skipped ? ` · ${tally.skipped} already sent before` : ''}`;
    $('collectMsg').className = 'tiny strong ok';
  } catch (e) {
    $('collectMsg').textContent = `Stopped: ${e.message}`; $('collectMsg').className = 'tiny strong bad';
  }
  await chrome.storage.local.set({ indeedSent: [...sent].slice(-5000) });
  dash.finish(collector.stop);
  $('dashTitle').textContent = 'Last run (Indeed)';
  await closeWorkTab(work);
  renderIndeedJobs();
  if (total) call('/api/inbound/run', { method: 'POST', body: JSON.stringify({ source: 'Indeed', total, created: tally.created, merged: tally.merged, failed: tally.failed, resumes: tally.resumes, from, to }) }).catch(() => {});
  collector.running = false;
  $('collect').disabled = false; $('loadIndeed').disabled = false; $('stopCollect').hidden = true;
}

(async () => {
  const { indeedJobs = [] } = await chrome.storage.local.get('indeedJobs');
  collector.jobs = indeedJobs;
  if (indeedJobs.length) { $('indeedHint').textContent = 'Your Indeed jobs (click "Load my Indeed jobs" to refresh the counts).'; renderIndeedJobs(); }
  $('loadIndeed').addEventListener('click', loadIndeed);
  $('collect').addEventListener('click', collect);
  $('stopCollect').addEventListener('click', () => { collector.stop = true; $('collectMsg').textContent = 'Stopping after the current applicant…'; });
  $('job').addEventListener('change', renderIndeedJobs);
})();
