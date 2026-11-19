'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Re-reads every stored resume and fills in missing details, with progress. */
export default function RereadRunner() {
  const router = useRouter();
  const [s, setS] = useState({ running: false, text: '' });
  async function run() {
    let after = 0; let total = null; let done = 0; let filled = 0;
    setS({ running: true, text: 'Starting…' });
    try {
      for (;;) {
        const res = await fetch('/api/reread', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ after }) });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
        if (total === null) total = d.remaining;
        done += d.processed; filled += d.filled; after = d.next;
        setS({ running: true, text: `${done} of ${total} resume(s) re-read` });
        if (d.done) break;
      }
      setS({ running: false, text: `Done. Details added to ${filled} profile(s). Run “Match all resumes” again so the scores use them.` });
      router.refresh();
    } catch (e) {
      setS({ running: false, text: `Stopped: ${e.message}` });
    }
  }
  return (
    <div className="stack" style={{ gap: 8 }}>
      <button type="button" className="btn" onClick={run} disabled={s.running}>{s.running ? 'Re-reading…' : 'Re-read details from resumes'}</button>
      {s.text ? <span className="small" style={{ color: 'var(--ink2)' }} aria-live="polite">{s.text}</span> : null}
    </div>
  );
}
