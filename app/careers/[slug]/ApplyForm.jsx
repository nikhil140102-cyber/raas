'use client';
import { useState } from 'react';

export default function ApplyForm({ jobId, title }) {
  const [state, setState] = useState({ status: 'idle' });

  async function submit(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!fd.get('consent')) { setState({ status: 'error', error: 'Please tick the consent box.' }); return; }
    const file = fd.get('resume');
    if (!file || !file.size) { setState({ status: 'error', error: 'Please attach your resume.' }); return; }
    setState({ status: 'sending' });
    fd.set('job_id', String(jobId));
    try {
      const res = await fetch('/api/public/apply', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Something went wrong');
      setState({ status: 'done' });
    } catch (err) {
      setState({ status: 'error', error: err.message });
    }
  }

  if (state.status === 'done') {
    return <div className="card" style={{ background: 'var(--green-bg)', borderColor: '#ABEFC6' }}><h2 style={{ color: 'var(--green)' }}>Application received</h2><p>Thanks for applying for {title}. If your profile matches, we&apos;ll message you to book a short screening call.</p></div>;
  }

  return (
    <form onSubmit={submit} className="card" style={{ gap: 14 }} noValidate>
      <h2>Apply in 2 minutes</h2>
      <div className="grid">
        <label className="field">Full name *<input name="name" required autoComplete="name" /></label>
        <label className="field">Email *<input name="email" type="email" required autoComplete="email" /></label>
        <label className="field">Phone (WhatsApp) *<input name="phone" type="tel" required autoComplete="tel" placeholder="+91" /></label>
        <label className="field">Notice period
          <select name="notice_days" defaultValue="30"><option value="0">Immediate</option><option value="15">15 days</option><option value="30">30 days</option><option value="60">60 days</option><option value="90">90 days</option></select>
        </label>
        <label className="field">Current CTC (₹ L)<input name="cctc" inputMode="decimal" /></label>
        <label className="field">Expected CTC (₹ L)<input name="ectc" inputMode="decimal" /></label>
      </div>
      <label className="drop" style={{ padding: 20, cursor: 'pointer' }}>
        <span className="strong" style={{ color: 'var(--accent-ink)' }}>Upload resume (PDF or Word) *</span>
        <span className="tiny muted">Up to 5 MB</span>
        <input type="file" name="resume" accept=".pdf,.docx" required />
      </label>
      <label className="row small" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: 10, color: 'var(--ink2)' }}>
        <input type="checkbox" name="consent" style={{ width: 18, height: 18, marginTop: 1, accentColor: 'var(--accent)', flex: 'none' }} />
        <span>I agree that AvaStars may store my resume, share it with hiring companies and contact me, including a recorded screening call with an AI assistant.</span>
      </label>
      {state.status === 'error' ? <p className="error" role="alert">{state.error}</p> : null}
      <button className="btn primary" type="submit" disabled={state.status === 'sending'} style={{ minHeight: 48 }}>{state.status === 'sending' ? 'Sending…' : 'Submit application'}</button>
    </form>
  );
}
