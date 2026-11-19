'use client';
import { useEffect, useRef, useState } from 'react';
import { saveJob, aiDraftDescription, aiSuggestQuestions, importJD } from '../../_actions/jobs';
import { SubmitButton } from '@/components/client';

const CONDITIONS = ['Immediate joiners preferred', 'Stability: 2+ years in last job', 'Notice period buyout possible', 'Relocation support available'];
const REQUIRED = [['title', 'Job title'], ['openings', 'Number of openings'], ['description', 'Job description'], ['ctc_max', 'Salary package'], ['location', 'Job location'], ['work_mode', 'Work mode'], ['exp_min', 'Experience'], ['mandatory_skills', 'Mandatory skills'], ['employment_type', 'Employment type'], ['joining_timeline', 'Joining timeline'], ['rounds', 'Interview process']];

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
      const map = { rounds: (src.interview_rounds || []).length, mandatory_skills: (src.mandatory_skills || []).length };
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

  const [imp, setImp] = useState({ open: !job.id, busy: false, msg: '', err: '' });
  async function runImport(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setImp((x) => ({ ...x, busy: true, msg: '', err: '' }));
    try {
      const res = await importJD(fd);
      if (res.error) throw new Error(res.error);
      const form = formRef.current;
      let n = 0;
      for (const [k, v] of Object.entries(res.fields)) {
        if (v === '' || v === null || v === undefined) continue;
        const el = form.elements[k];
        if (!el) continue;
        if (el instanceof RadioNodeList) { for (const r of el) r.checked = r.value === String(v); n += 1; continue; }
        if (el.tagName === 'SELECT' && ![...el.options].some((o) => (o.value || o.text) === String(v))) continue;
        el.value = String(v);
        n += 1;
      }
      setFilled(countFilled(new FormData(form)));
      setImp({ open: false, busy: false, err: '', msg: `Filled ${n} fields from the JD${res.by === 'ai' ? ' using AI' : ''}. Check them below, then save.` });
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (er) { setImp((x) => ({ ...x, busy: false, err: er.message })); }
  }
  async function paste(name) {
    setErr('');
    try {
      const text = await navigator.clipboard.readText();
      const el = formRef.current.elements[name];
      const at = el.selectionStart ?? el.value.length;
      el.value = el.value.slice(0, at) + text + el.value.slice(el.selectionEnd ?? at);
      setFilled(countFilled(new FormData(formRef.current)));
    } catch { setErr('Your browser blocked clipboard access. Click in the box and press Ctrl+V instead.'); }
  }

  const hm = job.hm_notes || {};
  const sel = clientId || job.client_id || '';

  return (
    <>
    <section className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--accent)' }}>
      <div className="header">
        <div className="titles"><h2>Import a JD</h2><p className="small muted">Upload the client's job description (PDF, Word, text or a screenshot) or paste it. The form below fills itself in.</p></div>
        <button type="button" className="btn sm" onClick={() => setImp((x) => ({ ...x, open: !x.open }))}>{imp.open ? 'Hide' : 'Import JD'}</button>
      </div>
      {imp.msg ? <div className="notice info">{imp.msg}</div> : null}
      {imp.open ? (
        <form onSubmit={runImport} className="stack">
          <label className="field">JD file<input type="file" name="file" accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,.webp" /></label>
          <label className="field">…or paste the JD text<textarea name="text" rows={6} placeholder="Paste the full job description here" /></label>
          {imp.err ? <p className="error" role="alert">{imp.err}</p> : null}
          <div><button type="submit" className="btn ai" disabled={imp.busy}>{imp.busy ? 'Reading the JD…' : 'Fill the form from this JD'}</button></div>
        </form>
      ) : null}
    </section>
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
          <h2>2. Skills and certifications</h2>
          <label className="field">Mandatory skills * <span className="hint">Comma separated</span><input name="mandatory_skills" defaultValue={(job.mandatory_skills || []).join(', ')} placeholder="AWS, Terraform, Kubernetes (EKS), CI/CD" /></label>
          <label className="field">Preferred skills (good to have)<input name="preferred_skills" defaultValue={(job.preferred_skills || []).join(', ')} /></label>
          <div className="grid">
            <label className="field">Required certifications <span className="hint">Comma separated; counted like must-have skills</span><input name="required_certs" defaultValue={(job.required_certs || []).join(', ')} placeholder="AWS Solutions Architect Associate" /></label>
            <label className="field">Preferred certifications <span className="hint">Good to have</span><input name="preferred_certs" defaultValue={(job.preferred_certs || []).join(', ')} placeholder="CKA, Terraform Associate" /></label>
          </div>
        </section>

        <section className="card">
          <div className="header"><h2>3. Job description *</h2><div className="row" style={{ gap: 8 }}><button type="button" className="btn sm" onClick={() => paste('description')}>Paste</button><button type="button" className="btn ai sm" onClick={() => ai('jd')} disabled={!!busy}>{busy === 'jd' ? 'Writing…' : 'Draft with AI from the fields above'}</button></div></div>
          <label className="field">Responsibilities, must-have and good-to-have<textarea name="description" rows={10} defaultValue={job.description || ''} /></label>
        </section>

        <section className="card">
          <div className="header">
            <div className="titles"><h2>4. Screening questions <span className="small muted">(optional)</span></h2><p className="small muted">The AI screening bot asks these on the call. One per line; add “| type” to label the answer type.</p></div>
            <div className="row" style={{ gap: 8 }}><button type="button" className="btn sm" onClick={() => paste('questions')}>Paste</button><button type="button" className="btn ai sm" onClick={() => ai('questions')} disabled={!!busy}>{busy === 'questions' ? 'Thinking…' : 'Suggest questions from JD'}</button></div>
          </div>
          <label className="field"><span className="sr">Questions</span><textarea name="questions" rows={6} defaultValue={(job.screening_questions || []).map((x) => `${x.q} | ${x.type}`).join('\n')} placeholder="What is your current CTC and expected CTC? | Salary" /></label>
          {err ? <p className="error" role="alert">{err}</p> : null}
        </section>

        <section className="card">
          <h2>5. Interview process *</h2>
          <label className="field">One round per line: “Round — Who takes it”<textarea name="rounds" rows={4} defaultValue={(job.interview_rounds || []).map((r) => `${r.name}${r.by ? ` — ${r.by}` : ''}`).join('\n') || 'AI screening call — AvaStars bot\nTechnical interview — Client panel\nHiring manager round — Hiring manager\nHR and offer — Client HR'} /></label>
        </section>


        <section className="card">
          <div className="titles"><h2>6. Hiring manager call</h2><p className="small muted">Notes from the formal call with the hiring manager</p></div>
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
    </>
  );
}
