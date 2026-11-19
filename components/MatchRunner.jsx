'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Scores every resume in the database against the given jobs, with live progress.
 * auto = start as soon as the page opens (used right after a job is created).
 */
export default function MatchRunner({ jobs, auto = false, label = 'Match all resumes to open jobs', force = false, className = 'btn ai' }) {
  const router = useRouter();
  const [state, setState] = useState({ running: false, line: '', done: false, added: 0, scored: 0 });
  const started = useRef(false);

  async function run() {
    if (started.current && auto) return;
    started.current = true;
    let added = 0; let scored = 0;
    setState({ running: true, line: 'Starting…', done: false, added, scored });
    try {
      for (const job of jobs) {
        let after = 0; let total = null; let doneForJob = 0;
        for (;;) {
          const res = await fetch('/api/match', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jobId: job.id, after, force }) });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          if (total === null) total = data.remaining;
          doneForJob += data.processed; scored += data.processed; added += data.added; after = data.next;
          setState({ running: true, line: `${job.title}: ${doneForJob} of ${total} resume(s) scored`, done: false, added, scored });
          if (data.done) break;
        }
      }
      setState({ running: false, line: '', done: true, added, scored });
      router.refresh();
    } catch (e) {
      setState({ running: false, line: `Stopped: ${e.message}`, done: false, added, scored });
    }
  }

  useEffect(() => { if (auto && jobs.length) run(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="stack" style={{ gap: 8 }}>
      <button type="button" className={className} onClick={run} disabled={state.running || !jobs.length}>{state.running ? 'Matching…' : label}</button>
      {state.running || state.line ? (
        <div className="stack" style={{ gap: 6 }} aria-live="polite">
          <span className="small" style={{ color: 'var(--ink2)' }}>{state.line}</span>
          {state.running ? <div className="bar"><div style={{ width: '100%', opacity: 0.5 }} /></div> : null}
        </div>
      ) : null}
      {state.done ? (
        <div className="notice ok" role="status">
          {state.scored ? `Scored ${state.scored} resume(s). ${state.added} strong match(es) added to the pipeline.` : 'Every resume is already scored for these jobs.'}
        </div>
      ) : null}
    </div>
  );
}
