'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const MAX_BYTES = 4 * 1024 * 1024; // Vercel rejects request bodies over about 4.5 MB

/** Uploads files one by one (keeps each request short) and shows live progress. */
export default function Uploader({ jobs }) {
  const input = useRef(null);
  const router = useRouter();
  const [over, setOver] = useState(false);
  const [jobId, setJobId] = useState('');
  const [items, setItems] = useState([]);
  const [running, setRunning] = useState(false);

  async function run(files) {
    const list = [...files].filter((f) => /\.(pdf|docx|txt|jpe?g|png|webp)$/i.test(f.name));
    const skipped = files.length - list.length;
    if (!list.length) { setItems([{ name: 'No PDF, Word, TXT or image files selected', status: 'failed' }]); return; }
    setRunning(true);
    setItems([...list.map((f) => ({ name: f.name, status: 'waiting' })), ...(skipped ? [{ name: `${skipped} file(s) skipped — not PDF/DOCX/TXT/JPG/PNG`, status: 'failed' }] : [])]);
    for (let i = 0; i < list.length; i++) {
      setItems((prev) => prev.map((it, k) => (k === i ? { ...it, status: 'reading' } : it)));
      const fd = new FormData();
      fd.set('file', list[i]);
      if (jobId) fd.set('job_id', jobId);
      let result;
      if (list[i].size > MAX_BYTES) {
        result = { status: 'failed', error: `File is ${(list[i].size / 1048576).toFixed(1)} MB; the online limit is 4 MB. Compress the PDF (e.g. ilovepdf.com) and upload again.` };
      } else {
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const res = await fetch('/api/resumes/upload', { method: 'POST', body: fd });
            const raw = await res.text();
            let data; try { data = JSON.parse(raw); } catch { data = null; }
            if (res.status === 413) result = { status: 'failed', error: 'File is too large for the server (4 MB limit). Compress the PDF and upload again.' };
            else if (!data) result = { status: 'failed', error: res.status === 504 ? 'Timed out reading this file. Try it again on its own.' : `Server error (HTTP ${res.status}). Try again.` };
            else result = res.ok ? data : { status: 'failed', error: data.error || `HTTP ${res.status}` };
            break;
          } catch (e) {
            // Network hiccup: try once more before giving up.
            result = { status: 'failed', error: 'Upload interrupted (network or file too large). Check your connection and try this file again.' };
            if (attempt === 1) await new Promise((r) => setTimeout(r, 1500));
          }
        }
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
        <h2>Drop PDF, Word or image resumes here</h2>
        <p className="sub">Up to 200 at once. Each one is read, de-duplicated and given a match % for every open job. Strong matches go straight into the pipeline.</p>
        <div className="row" style={{ justifyContent: 'center', alignItems: 'flex-end' }}>
          <label className="field" style={{ textAlign: 'left' }}>Tag to job (optional)
            <select value={jobId} onChange={(e) => setJobId(e.target.value)} disabled={running}>
              <option value="">All open jobs (score against each)</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}{j.client ? ` · ${j.client}` : ''}</option>)}
            </select>
          </label>
          <button type="button" className="btn primary" onClick={() => input.current?.click()} disabled={running}>{running ? 'Uploading…' : 'Choose files'}</button>
          <input ref={input} type="file" multiple accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,.webp" className="sr" onChange={(e) => { run(e.target.files); e.target.value = ''; }} aria-label="Choose resume files" />
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
