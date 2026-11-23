'use client';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IMPORT_FIELDS, rowToApplicant, cleanApplicant, inRange, todayIST, shiftDays, matchJobTitle } from '@/lib/applicant';

const SOURCES = ['Indeed', 'Naukri', 'LinkedIn', 'Foundit', 'Shine', 'Apna', 'WorkIndia', 'Referral', 'Other'];
const RESUME_RE = /\.(pdf|docx|txt|jpe?g|png|webp)$/i;
const MAX_BYTES = 4 * 1024 * 1024;

function presets() {
  const t = todayIST();
  return [
    ['Today', t, t],
    ['Yesterday', shiftDays(t, -1), shiftDays(t, -1)],
    ['Last 7 days', shiftDays(t, -6), t],
    ['Last 30 days', shiftDays(t, -29), t],
    ['This month', `${t.slice(0, 8)}01`, t],
    ['All dates', '', ''],
  ];
}

const fmt = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ');

/** Finds the resume file that belongs to an applicant (email, phone or full name in the file name). */
function pickResume(files, used, a) {
  const local = a.email ? a.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const phone = a.phone ? a.phone.replace(/\D/g, '').slice(-10) : '';
  const names = words(a.name).split(' ').filter((w) => w.length >= 3);
  for (let i = 0; i < files.length; i++) {
    if (used.has(i)) continue;
    const n = words(files[i].name); const flat = n.replace(/ /g, '');
    if ((local.length >= 4 && flat.includes(local)) || (phone.length === 10 && flat.includes(phone)) || (names.length >= 2 && names.every((w) => n.includes(w)))) {
      used.add(i); return files[i];
    }
  }
  return null;
}

export default function Importer({ jobs, ai }) {
  const router = useRouter();
  const fileInput = useRef(null);
  const resumeInput = useRef(null);
  const [mode, setMode] = useState('file');
  const [source, setSource] = useState('Indeed');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [sheet, setSheet] = useState(null); // { name, headers, rows }
  const [mapping, setMapping] = useState({});
  const [showMap, setShowMap] = useState(false);
  const [pasted, setPasted] = useState('');
  const [found, setFound] = useState(null); // applicants from pasted text
  const [range, setRange] = useState(['', '']);
  const [undated, setUndated] = useState(false);
  const [jobChoice, setJobChoice] = useState('auto');
  const [skip, setSkip] = useState(() => new Set());
  const [resumes, setResumes] = useState([]);
  const [results, setResults] = useState(null);

  const applicants = useMemo(() => {
    if (mode === 'file' && sheet) return sheet.rows.map((r) => rowToApplicant(r, mapping));
    if (mode === 'paste' && found) return found.map((a) => cleanApplicant(a));
    return [];
  }, [mode, sheet, mapping, found]);
  const hasDates = applicants.some((a) => a.applied_on);
  const hasJobs = applicants.some((a) => a.job_title);
  const visible = applicants
    .map((a, i) => ({ ...a, i }))
    .filter((a) => (a.applied_on ? inRange(a.applied_on, range[0], range[1]) : (!range[0] && !range[1]) || undated || !hasDates));
  const chosen = visible.filter((a) => !skip.has(a.i));
  const jobFor = (a) => (jobChoice === 'auto' ? matchJobTitle(a.job_title, jobs) : jobChoice === 'none' ? null : jobs.find((j) => String(j.id) === jobChoice));

  function reset() {
    setSheet(null); setFound(null); setResults(null); setError(''); setWarning(''); setSkip(new Set()); setResumes([]); setRange(['', '']);
  }

  async function readFile(file) {
    if (!file) return;
    reset(); setBusy('Reading the file…');
    const fd = new FormData(); fd.set('file', file);
    try {
      const res = await fetch('/api/import/parse', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({ error: `Server error (HTTP ${res.status})` }));
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSheet({ name: file.name, headers: data.headers, rows: data.rows });
      setMapping(data.mapping);
      if (data.source) setSource(data.source);
      setJobChoice(data.mapping.job_title !== undefined ? 'auto' : 'none');
    } catch (e) { setError(e.message); }
    setBusy('');
  }

  async function readText() {
    reset(); setBusy(ai ? 'Finding applicants with AI…' : 'Finding applicants…');
    try {
      const res = await fetch('/api/import/text', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: pasted, source }) });
      const data = await res.json().catch(() => ({ error: `Server error (HTTP ${res.status})` }));
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setFound(data.applicants); setWarning(data.warning || '');
      if (!data.applicants.length) setError('No applicants found in that text. Copy the whole list or profile (Ctrl+A, Ctrl+C on the portal page) and try again.');
    } catch (e) { setError(e.message); }
    setBusy('');
  }

  async function addResumes(list) {
    const out = [];
    for (const f of list) {
      if (/\.zip$/i.test(f.name)) {
        setBusy(`Opening ${f.name}…`);
        try {
          const JSZip = (await import('jszip')).default;
          const zip = await JSZip.loadAsync(f);
          for (const entry of Object.values(zip.files)) {
            const base = entry.name.split('/').pop();
            if (entry.dir || !RESUME_RE.test(base) || base.startsWith('._')) continue;
            out.push(new File([await entry.async('blob')], base));
          }
        } catch { setError(`Could not open ${f.name}. Unzip it and choose the files instead.`); }
      } else if (RESUME_RE.test(f.name)) out.push(f);
    }
    setBusy('');
    setResumes((prev) => [...prev, ...out]);
  }

  async function send(applicant, jobId, resume) {
    const fd = new FormData();
    fd.set('applicant', JSON.stringify(applicant));
    fd.set('source', source);
    if (jobId) fd.set('job_id', String(jobId));
    if (resume) fd.set('resume', resume);
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch('/api/import/one', { method: 'POST', body: fd });
        const data = await res.json().catch(() => null);
        if (!data) return { status: 'failed', error: res.status === 504 ? 'Timed out. Try again.' : `Server error (HTTP ${res.status})` };
        return data;
      } catch {
        if (attempt === 2) return { status: 'failed', error: 'Network error. Try again.' };
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    return { status: 'failed', error: 'Unknown error' };
  }

  async function runImport() {
    const used = new Set();
    const tasks = chosen.map((a) => {
      const r = pickResume(resumes, used, a);
      return { label: a.name || a.email || a.phone, applicant: a, job: jobFor(a), resume: r && r.size <= MAX_BYTES ? r : null, big: r && r.size > MAX_BYTES };
    });
    // Resumes that didn't match a row by file name: the server reads them and merges by email/phone.
    resumes.forEach((f, i) => { if (!used.has(i)) tasks.push({ label: f.name, applicant: {}, job: jobChoice !== 'auto' && jobChoice !== 'none' ? jobFor({}) : null, resume: f.size <= MAX_BYTES ? f : null, big: f.size > MAX_BYTES, extra: true }); });
    const state = tasks.map((t) => ({ label: t.label, job: t.job?.title || '', status: 'waiting' }));
    setResults([...state]);
    setBusy(`Importing 0 of ${tasks.length}…`);
    let done = 0; let next = 0;
    const worker = async () => {
      while (next < tasks.length) {
        const k = next++;
        const t = tasks[k];
        let r;
        if (t.big) r = { status: t.extra ? 'failed' : 'created', error: 'Resume is over 4 MB, so it was skipped. Compress it and upload it from Resumes.' };
        if (!r || !t.extra) {
          const sent = await send(t.applicant, t.job?.id, t.resume);
          r = t.big && sent.status !== 'failed' ? { ...sent, note: 'Resume over 4 MB was skipped' } : sent;
        }
        state[k] = { ...state[k], ...r, job: r.job || state[k].job };
        done++;
        setResults([...state]);
        setBusy(`Importing ${done} of ${tasks.length}…`);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    const count = (s) => state.filter((x) => x.status === s).length;
    await fetch('/api/import/finish', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: mode, source, total: tasks.length, created: count('created'), merged: count('merged'), failed: count('failed'), resumes: resumes.length, from: range[0], to: range[1], file: sheet?.name || '' }),
    }).catch(() => {});
    setBusy('');
    router.refresh();
  }

  const counts = results ? {
    created: results.filter((r) => r.status === 'created').length,
    merged: results.filter((r) => r.status === 'merged').length,
    failed: results.filter((r) => r.status === 'failed').length,
    done: results.filter((r) => ['created', 'merged', 'failed'].includes(r.status)).length,
  } : null;
  const mappedCount = Object.values(mapping).filter((v) => v !== undefined && v !== '').length;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="card">
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div className="tabs" role="tablist" aria-label="Import method">
            {[['file', 'Excel / CSV file'], ['paste', 'Paste from a page']].map(([id, label]) => (
              <a key={id} href={`#${id}`} role="tab" aria-current={mode === id ? 'page' : undefined} onClick={(e) => { e.preventDefault(); if (!busy) { setMode(id); reset(); } }}>{label}</a>
            ))}
          </div>
          <label className="field" style={{ minWidth: 180 }}>Applicants came from
            <select value={source} onChange={(e) => setSource(e.target.value)} disabled={Boolean(busy)}>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select>
          </label>
        </div>

        {mode === 'file' ? (
          <div className="drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (!busy) readFile(e.dataTransfer.files[0]); }}>
            <h2 style={{ margin: 0 }}>{sheet ? `${sheet.name} · ${sheet.rows.length} row(s)` : 'Drop the applicants file you downloaded from the portal'}</h2>
            <p className="sub small muted" style={{ margin: 0 }}>Indeed: Candidates → select all → Export (CSV). Naukri: Responses → select all → Download Excel. CSV, .xlsx and the .xls files portals give are all fine.</p>
            <button type="button" className="btn primary" onClick={() => fileInput.current?.click()} disabled={Boolean(busy)}>{sheet ? 'Choose another file' : 'Choose file'}</button>
            <input ref={fileInput} type="file" accept=".csv,.xlsx,.xls,.txt,.tsv,.htm,.html,.xml" className="sr" aria-label="Choose applicants file" onChange={(e) => { readFile(e.target.files[0]); e.target.value = ''; }} />
          </div>
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            <label className="field">Open the applicant list or a candidate&apos;s profile on the portal, press Ctrl + A then Ctrl + C, and paste it here
              <textarea rows={7} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Paste the copied page or email here…" disabled={Boolean(busy)} />
            </label>
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              <button type="button" className="btn primary" onClick={readText} disabled={Boolean(busy) || !pasted.trim()}>Find applicants</button>
              <span className="tiny muted">{ai ? 'AI reads the names, contacts, dates and experience.' : 'AI is off: only applicants with a visible email or phone are found.'}</span>
            </div>
          </div>
        )}
        {busy ? <div className="notice info" aria-live="polite">{busy}</div> : null}
        {error ? <div className="notice warn" role="alert">{error}</div> : null}
        {warning ? <div className="notice warn">{warning}</div> : null}
      </section>

      {mode === 'file' && sheet ? (
        <section className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div><h2 style={{ margin: 0 }}>Columns</h2><p className="small muted" style={{ margin: 0 }}>{mappedCount} column(s) recognised. Check them if names or dates look wrong below.</p></div>
            <button type="button" className="btn sm" onClick={() => setShowMap((s) => !s)}>{showMap ? 'Hide columns' : 'Check columns'}</button>
          </div>
          {showMap ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
              {IMPORT_FIELDS.map(([field, label]) => (
                <label key={field} className="field">{label}
                  <select value={mapping[field] ?? ''} onChange={(e) => setMapping((m) => { const n = { ...m }; if (e.target.value === '') delete n[field]; else n[field] = Number(e.target.value); return n; })}>
                    <option value="">— not in file —</option>
                    {sheet.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </label>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {applicants.length ? (
        <section className="card">
          <h2 style={{ margin: 0 }}>Choose who to import</h2>
          <div className="row" style={{ gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="stack" style={{ gap: 6 }}>
              <span className="small strong">Applied between</span>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <input type="date" style={{ width: 170 }} value={range[0]} max={range[1] || undefined} onChange={(e) => setRange([e.target.value, range[1]])} aria-label="From date" />
                <span className="small muted">to</span>
                <input type="date" style={{ width: 170 }} value={range[1]} min={range[0] || undefined} onChange={(e) => setRange([range[0], e.target.value])} aria-label="To date" />
              </div>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {presets().map(([label, a, b]) => (
                  <button key={label} type="button" className={`chip${range[0] === a && range[1] === b ? ' on' : ''}`} onClick={() => setRange([a, b])}>{label}</button>
                ))}
              </div>
              {hasDates ? (
                <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={undated} onChange={(e) => setUndated(e.target.checked)} /> Also include rows with no applied date</label>
              ) : <span className="tiny muted">No applied dates found, so the date filter can&apos;t be used for this {mode === 'file' ? 'file' : 'text'}.</span>}
            </div>
            <label className="field" style={{ minWidth: 260 }}>Add them to
              <select value={jobChoice} onChange={(e) => setJobChoice(e.target.value)}>
                {hasJobs ? <option value="auto">The matching job (by the job title in the {mode === 'file' ? 'file' : 'text'})</option> : null}
                {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}{j.client ? ` · ${j.client}` : ''}</option>)}
                <option value="none">No job — just add to the resume database</option>
              </select>
            </label>
          </div>

          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span className="small"><strong>{chosen.length}</strong> of {visible.length} shown will be imported{visible.length !== applicants.length ? ` (${applicants.length - visible.length} hidden by the date filter)` : ''}.</span>
            <span className="row" style={{ gap: 6 }}>
              <button type="button" className="btn sm" onClick={() => setSkip(new Set())}>Select all</button>
              <button type="button" className="btn sm" onClick={() => setSkip(new Set(visible.map((a) => a.i)))}>Select none</button>
            </span>
          </div>
          <div className="tablewrap" style={{ maxHeight: 420, overflow: 'auto' }}>
            <table>
              <thead><tr><th aria-label="Import" /><th>Name</th><th>Email</th><th>Phone</th><th>Applied</th><th>Goes to job</th><th>Exp</th><th>Location</th></tr></thead>
              <tbody>
                {visible.slice(0, 300).map((a) => {
                  const j = jobFor(a);
                  return (
                    <tr key={a.i} style={skip.has(a.i) ? { opacity: 0.45 } : undefined}>
                      <td><input type="checkbox" checked={!skip.has(a.i)} aria-label={`Import ${a.name}`} onChange={() => setSkip((s) => { const n = new Set(s); if (n.has(a.i)) n.delete(a.i); else n.add(a.i); return n; })} /></td>
                      <td className="strong">{a.name || <span className="muted">No name</span>}</td>
                      <td className="small">{a.email || <span className="muted">—</span>}</td>
                      <td className="small">{a.phone || <span className="muted">—</span>}</td>
                      <td className="small">{fmt(a.applied_on)}</td>
                      <td className="small">{j ? j.title : <span className="muted">{jobChoice === 'auto' && a.job_title ? `No match for "${a.job_title.slice(0, 30)}"` : 'Database only'}</span>}</td>
                      <td className="small">{a.total_exp ?? '—'}</td>
                      <td className="small">{a.location || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {visible.length > 300 ? <p className="tiny muted">Showing the first 300 rows; all {chosen.length} selected will be imported.</p> : null}

          <div className="stack" style={{ gap: 8, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <span className="small strong">Resumes (optional)</span>
            <span className="tiny muted">Add the CVs you downloaded (PDF, Word, images, or the ZIP from Naukri). A CV is joined to its applicant when the file name has their name, email or phone; any others are read and merged by the email/phone inside them. Applicants without a CV go in as Pending, marked &quot;no resume yet&quot;.</span>
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <button type="button" className="btn sm" onClick={() => resumeInput.current?.click()} disabled={Boolean(busy)}>Add resume files or ZIP</button>
              {resumes.length ? <><span className="small">{resumes.length} resume file(s)</span><button type="button" className="btn sm" onClick={() => setResumes([])}>Clear</button></> : null}
              <input ref={resumeInput} type="file" multiple accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,.webp,.zip" className="sr" aria-label="Choose resume files" onChange={(e) => { addResumes([...e.target.files]); e.target.value = ''; }} />
            </div>
          </div>

          <div className="row" style={{ gap: 10 }}>
            <button type="button" className="btn primary" onClick={runImport} disabled={Boolean(busy) || (!chosen.length && !resumes.length)}>Import {chosen.length} applicant(s){resumes.length ? ` + ${resumes.length} resume(s)` : ''}</button>
          </div>
        </section>
      ) : null}

      {results ? (
        <section className="card" aria-live="polite">
          <div className="row" style={{ justifyContent: 'space-between' }}><h2 style={{ margin: 0 }}>Import report</h2><span className="small muted">{counts.done} of {results.length} done</span></div>
          <div className="bar" style={{ height: 8 }}><div style={{ width: `${(counts.done / Math.max(1, results.length)) * 100}%` }} /></div>
          <div className="row" style={{ gap: 8 }}>
            <span className="pill green">{counts.created} new</span>
            <span className="pill blue">{counts.merged} already in database (updated)</span>
            {counts.failed ? <span className="pill red">{counts.failed} need attention</span> : null}
          </div>
          <div className="stack" style={{ gap: 6, maxHeight: 300, overflowY: 'auto' }}>
            {results.map((r, i) => (
              <div key={i} className="row small" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 6, gap: 8 }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.candidateId ? <a href={`/candidates/${r.candidateId}${r.applicationId ? `?app=${r.applicationId}` : ''}`}>{r.name || r.label}</a> : r.label}{r.job ? <span className="muted"> · {r.job}</span> : null}</span>
                <span className={`pill ${r.status === 'created' ? 'green' : r.status === 'merged' ? 'blue' : r.status === 'failed' ? 'red' : 'gray'}`} title={r.error || r.note || ''}>
                  {r.status === 'failed' ? `Failed: ${r.error || ''}`.slice(0, 70) : r.status === 'waiting' ? 'Waiting' : `${r.status === 'created' ? 'New' : 'Updated'}${r.score !== undefined && r.score !== null ? ` · ${r.score}% match` : r.resume === false ? ' · no resume yet' : ''}${r.note ? ' · resume too big' : ''}`}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
