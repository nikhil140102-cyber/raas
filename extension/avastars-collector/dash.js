// AvaStars Collector — run dashboard: live progress and a picture of what happened to the applicants.
// Plain SVG/HTML, no libraries. Colours follow a colour-blind-checked palette; every colour also has a text label.
const DASH_COLORS = {
  created: '#2a78d6', merged: '#1baf7a', skipped: '#b4b2a9', failed: '#d03b3b',
  pipeline: '#2a78d6', rejected: '#eb6834', nojob: '#b4b2a9', bars: '#2a78d6',
};
const BINS = [['0–39%', 0, 39], ['40–59%', 40, 59], ['60–79%', 60, 79], ['80–100%', 80, 100]];

const dash = {
  s: null,
  reset(kind) {
    this.s = { kind, at: new Date().toISOString(), total: 0, done: 0, created: 0, merged: 0, failed: 0, skipped: 0, pipeline: 0, rejected: 0, nojob: 0, noResume: 0, scores: [], jobs: {}, started: Date.now(), finished: false, stopped: false };
    this.render();
  },
  addTotal(n, job) { this.s.total += n; if (job) this.job(job).found += n; this.render(); },
  job(title) { return (this.s.jobs[title] ||= { found: 0, sent: 0, rejected: 0, failed: 0 }); },
  skip(n) { this.s.skipped += n; this.render(); },
  /** data = the AvaStars reply for one applicant, or null when sending failed. */
  record(data, jobTitle, hadResume) {
    const s = this.s; s.done++;
    const j = jobTitle ? this.job(jobTitle) : null;
    if (!data) { s.failed++; if (j) j.failed++; this.render(); return; }
    s[data.status === 'merged' ? 'merged' : 'created']++;
    if (j) j.sent++;
    if (data.auto_rejected || data.stage === 'rejected') { s.rejected++; if (j) j.rejected++; } else if (data.stage) s.pipeline++; else s.nojob++;
    if (!hadResume) s.noResume++;
    if (typeof data.match === 'number') s.scores.push(data.match);
    this.render();
  },
  finish(stopped) { this.s.finished = true; this.s.stopped = Boolean(stopped); this.render(); chrome.storage.local.set({ lastDash: this.s }).catch(() => {}); },

  render() {
    const s = this.s; const box = $('dash');
    if (!s || !box) return;
    $('dashCard').hidden = false;
    box.replaceChildren();
    const pct = s.total ? Math.round((s.done / s.total) * 100) : (s.finished ? 100 : 0);
    const per = s.done ? (Date.now() - s.started) / s.done : 0;
    const left = !s.finished && s.done && s.total > s.done ? Math.ceil((per * (s.total - s.done)) / 60000) : 0;
    const when = new Date(s.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

    // 1) Progress
    box.append(el('div', { class: 'row between' },
      el('span', { class: 'big', text: `${pct}%` }),
      el('span', { class: 'tiny muted', text: s.finished ? `${s.stopped ? 'Stopped' : 'Finished'} · ${when}` : `${s.done} of ${s.total || '…'} sent${left ? ` · about ${left} min left` : ''}` })));
    const bar = el('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': 'Progress' });
    bar.append(el('div', { style: `width:${pct}%` }));
    box.append(bar);

    // 2) What was sent
    box.append(stacked('Sent to AvaStars', [
      ['New profiles', s.created, DASH_COLORS.created], ['Already in AvaStars (updated)', s.merged, DASH_COLORS.merged],
      ['Skipped (sent before)', s.skipped, DASH_COLORS.skipped], ['Failed', s.failed, DASH_COLORS.failed, '✕'],
    ]));
    // 3) Decision in AvaStars
    box.append(stacked('Decision in AvaStars', [
      ['In the pipeline (Pending)', s.pipeline, DASH_COLORS.pipeline], ['Auto-rejected (below the job\'s cut-off)', s.rejected, DASH_COLORS.rejected],
      ['Resume database only (no job)', s.nojob, DASH_COLORS.nojob],
    ], s.noResume ? `${s.noResume} came without a resume, so they have no match % yet.` : ''));
    // 4) Match % spread
    if (s.scores.length) box.append(histogram(s.scores));
    // 5) Per job
    const jobs = Object.entries(s.jobs);
    if (jobs.length) {
      const t = el('table', { class: 'mini' });
      t.append(el('thead', {}, el('tr', {}, el('th', { text: 'Indeed job' }), el('th', { text: 'Found' }), el('th', { text: 'Sent' }), el('th', { text: 'Rejected' }))));
      const tb = el('tbody');
      for (const [title, v] of jobs) tb.append(el('tr', {}, el('td', { text: title }), el('td', { text: String(v.found) }), el('td', { text: String(v.sent) }), el('td', { text: String(v.rejected) })));
      t.append(tb);
      box.append(el('div', { class: 'chart' }, el('div', { class: 'ctitle', text: 'By job' }), t));
    }
  },
};

/** One horizontal stacked bar with a legend that carries the numbers (colour is never the only cue). */
function stacked(title, parts, note = '') {
  const total = parts.reduce((a, p) => a + p[1], 0);
  const wrap = el('div', { class: 'chart' }, el('div', { class: 'ctitle', text: title }));
  const bar = el('div', { class: 'stack-bar', role: 'img', 'aria-label': `${title}: ${parts.map((p) => `${p[0]} ${p[1]}`).join(', ')}` });
  if (!total) bar.append(el('div', { class: 'seg empty', style: 'width:100%' }));
  for (const [label, n, color] of parts) {
    if (!n) continue;
    bar.append(el('div', { class: 'seg', style: `width:${(n / total) * 100}%;background:${color}`, title: `${label}: ${n} (${Math.round((n / total) * 100)}%)` }));
  }
  wrap.append(bar);
  const legend = el('div', { class: 'legend' });
  for (const [label, n, color, icon] of parts) {
    legend.append(el('span', { class: 'lg' }, el('i', { style: `background:${color}` }), el('span', { text: `${icon ? `${icon} ` : ''}${label}` }), el('b', { text: `${n}${total ? ` · ${Math.round((n / total) * 100)}%` : ''}` })));
  }
  wrap.append(legend);
  if (note) wrap.append(el('div', { class: 'tiny muted', text: note }));
  return wrap;
}

/** Column chart of match % in four bands, with the count on each column. */
function histogram(scores) {
  const counts = BINS.map(([, lo, hi]) => scores.filter((x) => x >= lo && x <= hi).length);
  const max = Math.max(1, ...counts);
  const W = 300; const H = 110; const gap = 10; const bw = (W - gap * (BINS.length - 1)) / BINS.length;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H + 34}`); svg.setAttribute('class', 'hist'); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Match %: ${BINS.map((b, i) => `${b[0]} ${counts[i]}`).join(', ')}`);
  const add = (tag, attrs, text) => { const n = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text !== undefined) n.textContent = text; svg.append(n); return n; };
  add('line', { x1: 0, y1: H, x2: W, y2: H, stroke: '#d9d8d2', 'stroke-width': 1 });
  BINS.forEach(([label], i) => {
    const h = counts[i] ? Math.max(4, (counts[i] / max) * (H - 18)) : 0;
    const x = i * (bw + gap);
    if (h) {
      const r = add('path', { d: `M${x},${H} V${H - h + 4} Q${x},${H - h} ${x + 4},${H - h} H${x + bw - 4} Q${x + bw},${H - h} ${x + bw},${H - h + 4} V${H} Z`, fill: DASH_COLORS.bars });
      const t = document.createElementNS(ns, 'title'); t.textContent = `${label}: ${counts[i]} applicant(s)`; r.append(t);
    }
    add('text', { x: x + bw / 2, y: H - h - 5, 'text-anchor': 'middle', class: 'hv' }, String(counts[i]));
    add('text', { x: x + bw / 2, y: H + 16, 'text-anchor': 'middle', class: 'hl' }, label);
  });
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  return el('div', { class: 'chart' }, el('div', { class: 'ctitle', text: `Match % (average ${avg}%)` }), svg);
}

(async () => {
  const { lastDash } = await chrome.storage.local.get('lastDash');
  if (lastDash) { dash.s = lastDash; dash.render(); }
})();
