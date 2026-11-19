'use client';
import { useEffect, useRef, useState } from 'react';
import { saveJob, aiDraftDescription, aiSuggestQuestions } from '../../_actions/jobs';
import { SubmitButton } from '@/components/client';

const CONDITIONS = ['Immediate joiners preferred', 'Stability: 2+ years in last job', 'Notice period buyout possible', 'Relocation support available'];
const REQUIRED = [['title', 'Job title'], ['openings', 'Number of openings'], ['description', 'Job description'], ['ctc_max', 'Salary package'], ['location', 'Job location'], ['work_mode', 'Work mode'], ['exp_min', 'Experience'], ['mandatory_skills', 'Mandatory skills'], ['employment_type', 'Employment type'], ['joining_timeline', 'Joining timeline'], ['rounds', 'Interview process'], ['contact_name', 'Client contact']];

export default function JobForm({ job = {}, clients = [], clientId }) {
  const formRef = useRef(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [filled, setFilled] = useState(0);
  useEffect(() => { setFilled(countFilled(new FormData(formRef.current))); }, []);

  function fields() {
    const fd = new FormData(formRef.current);
    return Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === 'string'));
  }
  function countFilled(src) {
    const get = (k) => {
      if (src instanceof FormData) return src.get(k);
      const map = { rounds: (src.interview_rounds || []).length, contact_name: src.client_contact?.name, mandatory_skills: (src.mandatory_skills || []).length };
      return k in map ? map[k] : src[k];
    };
    return REQUIRED.filter(([k]) => { const v = get(k); return v !== null && v !== undefined && String(v).trim() !== '' && v !== 0; }).length;
  }
  async function ai(kind) {
    setErr(''); setBusy(kind);
    try {
      const f = fields();
      if (!f.title) throw new Error('Fill in the job title first.');
      const text = kind === 'jd' ? await aiDraftDescription(f) : await aiSuggestQuestions(f);
      const el = formRef.current.elements[kind === 'jd' ? 'description' : 'questions'];
      el.value = text;
      setFilled(countFilled(new FormData(formRef.current)));
    } catch (e) { setErr(e.message); } finally { setBusy(''); }
  }

  const hm = job.hm_notes || {};
  const cc = job.client_contact || {};
  const sel = clientId || job.client_id || '';
  const client = clients.find((c) => String(c.id) === String(sel));

  return (
    <form ref={formRef} action={saveJob} onChange={() => setFilled(countFilled(new FormData(formRef.current)))} className="cols">
      {job.id ? <input type="hidden" name="id" value={job.id} /> : null}
      <div className="col-main" style={{ gap: 20 }}>
        <section className="card">
          <h2>1. Role basics</h2>
          <div className="grid">
            <label className="field">Client
              <select name="client_id" defaultValue={sel}>
                <option value="">Internal / no client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="field">Job title *<input name="title" required defaultValue={job.title || ''} /></label>
            <label className="field">Number of openings *<input name="openings" type="number" min="1" defaultValue={job.openings || 1} /></label>
            <label className="field">Employment type *
              <select name="employment_type" defaultValue={job.employment_type || 'Permanent'}><option>Permanent</option><option>Contract</option><option>Contract to hire</option></select>
            </label>
            <label className="field">Job location *<input name="location" defaultValue={job.location || ''} placeholder="Bangalore (Whitefield)" /></label>
            <label className="field">Joining timeline *
              <select name="joining_timeline" defaultValue={job.joining_timeline || 'Within 30 days'}><option>Immediate</option><option>Within 30 days</option><option>Within 60 days</option><option>Within 90 days</option></select>
            </label>
          </div>
          <div className="grid">
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <label className="field" style={{ flex: 1 }}>Experience from (yrs) *<input name="exp_min" type="number" step="any" defaultValue={job.exp_min ?? ''} /></label>
              <label className="field" style={{ flex: 1 }}>to (yrs)<input name="exp_max" type="number" step="any" defaultValue={job.exp_max ?? ''} /></label>
            </div>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <label className="field" style={{ flex: 1 }}>CTC from (₹ L) *<input name="ctc_min" type="number" step="any" defaultValue={job.ctc_min ?? ''} /></label>
              <label className="field" style={{ flex: 1 }}>to (₹ L)<input name="ctc_max" type="number" step="any" defaultValue={job.ctc_max ?? ''} /></label>
            </div>
          </div>
          <fieldset>
            <legend>Work mode *</legend>
            <div className="row" style={{ gap: 10 }}>
              {['Work from office', 'Hybrid', 'Remote'].map((m) => {
                const v = m === 'Work from office' ? 'WFO' : m;
                return <label key={v} className="check"><input type="radio" name="work_mode" value={v} defaultChecked={(job.work_mode || 'Hybrid') === v} /> {m}</label>;
              })}
            </div>
          </fieldset>
        </section>

        <section className="card">
          <h2>2. Skills</h2>
          <label className="field">Mandatory skills * <span className="hint">Comma separated</span><input name="mandatory_skills" defaultValue={(job.mandatory_skills || []).join(', ')} placeholder="AWS, Terraform, Kubernetes (EKS), CI/CD" /></label>
          <label className="field">Preferred skills (good to have)<input name="preferred_skills" defaultValue={(job.preferred_skills || []).join(', ')} /></label>
        </section>

        <section className="card">
          <div className="header"><h2>3. Job description *</h2><button type="button" className="btn ai sm" onClick={() => ai('jd')} disabled={!!busy}>{busy === 'jd' ? 'Writing…' : 'Draft with AI from the fields above'}</button></div>
          <label className="field">Responsibilities, must-have and good-to-have<textarea name="description" rows={10} defaultValue={job.description || ''} /></label>
        </section>

        <section className="card">
          <div className="header">
            <div className="titles"><h2>4. Screening questions <span className="small muted">(optional)</span></h2><p className="small muted">The AI screening bot asks these on the call. One per line; add “| type” to label the answer type.</p></div>
            <button type="button" className="btn ai sm" onClick={() => ai('questions')} disabled={!!busy}>{busy === 'questions' ? 'Thinking…' : 'Suggest questions from JD'}</button>
          </div>
          <label className="field"><span className="sr">Questions</span><textarea name="questions" rows={6} defaultValue={(job.screening_questions || []).map((x) => `${x.q} | ${x.type}`).join('\n')} placeholder="What is your current CTC and expected CTC? | Salary" /></label>
          {err ? <p className="error" role="alert">{err}</p> : null}
        </section>

        <section className="card">
          <h2>5. Interview process *</h2>
          <label className="field">One round per line: “Round — Who takes it”<textarea name="rounds" rows={4} defaultValue={(job.interview_rounds || []).map((r) => `${r.name}${r.by ? ` — ${r.by}` : ''}`).join('\n') || 'AI screening call — AvaStars bot\nTechnical interview — Client panel\nHiring manager round — Hiring manager\nHR and offer — Client HR'} /></label>
        </section>

        <section className="card">
          <h2>6. Client point of contact *</h2>
          <div className="grid">
            <label className="field">Name<input name="contact_name" defaultValue={cc.name || client?.contact_name || ''} /></label>
            <label className="field">Email <span className="hint">Shortlists are sent here</span><input name="contact_email" type="email" defaultValue={cc.email || client?.contact_email || ''} /></label>
            <label className="field">Phone<input name="contact_phone" type="tel" defaultValue={cc.phone || client?.contact_phone || ''} /></label>
          </div>
        </section>

        <section className="card">
          <div className="titles"><h2>7. Hiring manager call</h2><p className="small muted">Notes from the formal call with the hiring manager</p></div>
          <div className="grid">
            <label className="field">Hiring manager<input name="hm_manager" defaultValue={hm.manager || ''} /></label>
            <label className="field">Call date<input name="hm_date" type="date" defaultValue={hm.date || ''} /></label>
          </div>
          <div className="grid">
            <label className="field">Must-have criteria<textarea name="hm_must" rows={3} defaultValue={hm.must || ''} /></label>
            <label className="field">Flexible criteria<textarea name="hm_flexible" rows={3} defaultValue={hm.flexible || ''} /></label>
          </div>
          <fieldset>
            <legend>Other conditions</legend>
            <div className="row" style={{ gap: 10 }}>
              {CONDITIONS.map((c) => <label key={c} className="check"><input type="checkbox" name="hm_conditions" value={c} defaultChecked={(hm.conditions || []).includes(c)} /> {c}</label>)}
            </div>
          </fieldset>
        </section>
      </div>

      <aside className="col-side">
        <section className="card">
          <h2>{job.id ? 'Save changes' : 'Ready to publish?'}</h2>
          <div className="bar" style={{ height: 8 }}><div style={{ width: `${(filled / REQUIRED.length) * 100}%`, background: filled === REQUIRED.length ? 'var(--green)' : 'var(--accent)' }} /></div>
          <span className="small strong" style={{ color: 'var(--ink2)' }}>{filled} of {REQUIRED.length} required fields complete</span>
          <label className="field">Name shown on careers page <span className="hint">Leave empty to show “AvaStars”</span><input name="public_company" defaultValue={job.public_company || ''} placeholder="e.g. Leading AWS partner" /></label>
          <label className="field">Auto-reject below match score<input name="min_score" type="number" min="0" max="100" defaultValue={job.min_score ?? 60} /></label>
          <SubmitButton pendingText="Saving…">{job.id ? 'Save job' : 'Create job and choose portals'}</SubmitButton>
          <p className="tiny muted">The job goes live on your careers page straight away. LinkedIn, Indeed and Naukri get ready-made posts to paste.</p>
        </section>
      </aside>
    </form>
  );
}
