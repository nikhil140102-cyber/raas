'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/** Uploads files one by one (keeps each request short) and shows live progress. */
export default function Uploader({ jobs }) {
  const input = useRef(null);
  const router = useRouter();
  const [over, setOver] = useState(false);
  const [jobId, setJobId] = useState('');
  const [items, setItems] = useState([]);
  const [running, setRunning] = useState(false);

  async function run(files) {
    const list = [...files].filter((f) => /\.(pdf|docx|txt)$/i.test(f.name));
    const skipped = files.length - list.length;
    if (!list.length) { setItems([{ name: 'No PDF, DOCX or TXT files selected', status: 'failed' }]); return; }
    setRunning(true);
    setItems([...list.map((f) => ({ name: f.name, status: 'waiting' })), ...(skipped ? [{ name: `${skipped} file(s) skipped — not PDF/DOCX/TXT`, status: 'failed' }] : [])]);
    for (let i = 0; i < list.length; i++) {
      setItems((prev) => prev.map((it, k) => (k === i ? { ...it, status: 'reading' } : it)));
      const fd = new FormData();
      fd.set('file', list[i]);
      if (jobId) fd.set('job_id', jobId);
      let result;
      try {
        const res = await fetch('/api/resumes/upload', { method: 'POST', body: fd });
        result = await res.json();
        if (!res.ok) result = { status: 'failed', error: result.error || `HTTP ${res.status}` };
      } catch (e) {
        result = { status: 'failed', error: e.message };
      }
      setItems((prev) => prev.map((it, k) => (k === i ? { ...it, ...result } : it)));
    }
    setRunning(false);
    router.refresh();
  }

  const done = items.filter((i) => ['created', 'merged', 'failed'].includes(i.status)).length;
  const counts = { created: items.filter((i) => i.status === 'created').length, merged: items.filter((i) => i.status === 'merged').length, failed: items.filter((i) => i.status === 'failed').length };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div
        className={`drop${over ? ' over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!running) run(e.dataTransfer.files); }}
      >
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4" /><path d="M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
        <h2>Drop PDF or Word resumes here</h2>
        <p className="sub">Up to 200 at once. Each one is read, de-duplicated and given a match % for every open job. Strong matches go straight into the pipeline.</p>
        <div className="row" style={{ justifyContent: 'center', alignItems: 'flex-end' }}>
          <label className="field" style={{ textAlign: 'left' }}>Tag to job (optional)
            <select value={jobId} onChange={(e) => setJobId(e.target.value)} disabled={running}>
              <option value="">All open jobs (score against each)</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}{j.client ? ` · ${j.client}` : ''}</option>)}
            </select>
          </label>
          <button type="button" className="btn primary" onClick={() => input.current?.click()} disabled={running}>{running ? 'Uploading…' : 'Choose files'}</button>
          <input ref={input} type="file" multiple accept=".pdf,.docx,.txt" className="sr" onChange={(e) => { run(e.target.files); e.target.value = ''; }} aria-label="Choose resume files" />
        </div>
      </div>
      {items.length ? (
        <section className="card" aria-live="polite">
          <div className="header"><h2>Upload · {items.length} file(s)</h2><span className="small muted">{done} done</span></div>
          <div className="bar" style={{ height: 8 }}><div style={{ width: `${(done / items.length) * 100}%` }} /></div>
          <div className="row" style={{ gap: 8 }}>
            <span className="pill green">{counts.created} new profiles</span>
            <span className="pill blue">{counts.merged} duplicates merged</span>
            {counts.failed ? <span className="pill red">{counts.failed} failed</span> : null}
          </div>
          <div className="stack" style={{ gap: 6, maxHeight: 260, overflowY: 'auto' }}>
            {items.map((it, i) => (
              <div key={i} className="row small" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.candidateId ? <a href={`/candidates/${it.candidateId}${it.applicationId ? `?app=${it.applicationId}` : ''}`}>{it.name || it.name}</a> : it.name}</span>
                <span className={`pill ${it.status === 'created' ? 'green' : it.status === 'merged' ? 'blue' : it.status === 'failed' ? 'red' : 'gray'}`} title={it.error || ''}>
                  {it.status === 'failed' ? `Failed: ${it.error || ''}`.slice(0, 60) : it.status === 'reading' ? 'Reading…' : it.status === 'waiting' ? 'Waiting' : `${it.status === 'created' ? 'New' : 'Merged'}${it.score !== undefined && it.score !== null ? ` · ${it.score}% match${it.bestJob ? ` (${it.bestJob})` : ''}` : ' · no open jobs to match'}`}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
