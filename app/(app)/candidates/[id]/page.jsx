import Link from 'next/link';
import { notFound } from 'next/navigation';
import { q, one } from '@/lib/db';
import { Header, Score, StagePill, Pill } from '@/components/ui';
import { AutoSelect, ConfirmButton } from '@/components/client';
import { STAGES, lakh, notice, fmtDate, initials, SCREENING_STATUS, REJECT_REASONS } from '@/lib/util';
import { moveStage, updateCandidate, addCandidateToJob, rescore, shareOne, deleteCandidate } from '../../../_actions/candidates';
import { askForSlot, callNow } from '../../../_actions/screening';

export default async function CandidatePage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const c = await one('SELECT * FROM candidates WHERE id = $1', [Number(id)]);
  if (!c) notFound();
  const apps = await q('SELECT a.*, j.title, j.mandatory_skills FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.candidate_id = $1 ORDER BY a.updated_at DESC', [c.id]);
  const app = apps.find((a) => String(a.id) === String(sp.app)) || apps[0] || null;
  const screening = app ? await one('SELECT * FROM screenings WHERE application_id = $1 ORDER BY id DESC LIMIT 1', [app.id]) : null;
  const files = await q('SELECT id, filename, created_at FROM files WHERE candidate_id = $1 ORDER BY created_at DESC', [c.id]);
  const acts = await q('SELECT * FROM activities WHERE candidate_id = $1 ORDER BY created_at DESC LIMIT 20', [c.id]);
  const openJobs = await q(`SELECT id, title FROM jobs WHERE status = 'open' AND id NOT IN (SELECT job_id FROM applications WHERE candidate_id = $1) ORDER BY created_at DESC`, [c.id]);
  const allScores = await q(`SELECT s.score, j.id AS job_id, j.title, j.min_score, a.id AS app_id, a.stage FROM candidate_scores s JOIN jobs j ON j.id = s.job_id LEFT JOIN applications a ON a.job_id = j.id AND a.candidate_id = s.candidate_id WHERE s.candidate_id = $1 AND j.status = 'open' ORDER BY s.score DESC`, [c.id]);
  const must = (app?.mandatory_skills || []).map((s) => s.toLowerCase());
  const md = app?.match_detail || {};
  const stageIdx = app ? STAGES.findIndex((s) => s.id === app.stage) : -1;
  const back = `/candidates/${c.id}?app=${app?.id || ''}`;

  return (
    <>
      <Header
        crumbs={<><Link href={app ? `/pipeline?job=${app.job_id}` : '/resumes'}>{app ? 'Pipeline' : 'Resume database'}</Link>{app ? <> / {app.title}</> : null} / {c.name}</>}
        title={
          <div className="row" style={{ gap: 16, flexWrap: 'nowrap' }}>
            <span style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, flex: 'none' }}>{initials(c.name)}</span>
            <div className="titles"><h1 style={{ fontSize: 24 }}>{c.name}</h1><p className="sub">{[c.current_title, c.current_company, c.location, c.email, c.phone].filter(Boolean).join(' · ')}</p></div>
          </div>
        }
      >
        {app ? <AutoSelect action={moveStage} name="stage" value={app.stage} label="Stage" options={STAGES.map((s) => ({ value: s.id, label: s.label }))} hidden={{ app_id: app.id }} /> : null}
        <Link href={`/candidates/${c.id}/resume?app=${app?.id || ''}`} className="btn">Edit resume for client</Link>
        {app ? <form action={shareOne}><input type="hidden" name="app_id" value={app.id} /><button className="btn primary" type="submit">Forward to client</button></form> : null}
      </Header>

      {apps.length > 1 ? (
        <nav className="tabs" aria-label="Jobs for this candidate">
          {apps.map((a) => <Link key={a.id} href={`/candidates/${c.id}?app=${a.id}`} aria-current={a.id === app.id ? 'page' : undefined}>{a.title} · {a.match_score ?? '—'}</Link>)}
        </nav>
      ) : null}

      {app && app.stage !== 'rejected' ? (
        <ol aria-label="Stage progress" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 8 }}>
          {STAGES.filter((s) => s.id !== 'rejected').map((s, i) => (
            <li key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="bar"><div style={{ width: i <= stageIdx ? '100%' : 0 }} /></div>
              <span className="tiny" style={{ fontWeight: i === stageIdx ? 700 : 500, color: i <= stageIdx ? 'var(--accent-ink)' : 'var(--muted)' }}>{s.label}</span>
            </li>
          ))}
        </ol>
      ) : app ? <div className="notice warn">Rejected{app.reject_reason ? `: ${app.reject_reason}` : ''}{app.client_comment ? ` — client comment: “${app.client_comment}”` : ''}</div> : null}

      <div className="cols">
        <div className="col-side" style={{ flex: '1 1 340px' }}>
          <form action={updateCandidate} className="card">
            <input type="hidden" name="id" value={c.id} />
            <div className="header"><h2>Key details</h2><button className="btn sm" type="submit">Save</button></div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
              <label className="field">Current CTC (₹ L)<input name="cctc" type="number" step="any" defaultValue={c.cctc ?? ''} /></label>
              <label className="field">Expected CTC (₹ L)<input name="ectc" type="number" step="any" defaultValue={c.ectc ?? ''} /></label>
              <label className="field">Notice (days)<input name="notice_days" type="number" defaultValue={c.notice_days ?? ''} /></label>
              <label className="field">Experience (yrs)<input name="total_exp" type="number" step="any" defaultValue={c.total_exp ?? ''} /></label>
              <label className="field">Location<input name="location" defaultValue={c.location || ''} /></label>
              <label className="field">Interview availability<input name="availability" defaultValue={c.availability || ''} placeholder="Weekdays after 4 PM" /></label>
            </div>
            <details>
              <summary className="small strong" style={{ cursor: 'pointer', color: 'var(--accent)' }}>Contact and job details</summary>
              <div className="stack" style={{ marginTop: 12 }}>
                <label className="field">Name<input name="name" defaultValue={c.name} /></label>
                <label className="field">Email<input name="email" type="email" defaultValue={c.email || ''} /></label>
                <label className="field">Phone (with +91)<input name="phone" type="tel" defaultValue={c.phone || ''} /></label>
                <label className="field">Current title<input name="current_title" defaultValue={c.current_title || ''} /></label>
                <label className="field">Current company<input name="current_company" defaultValue={c.current_company || ''} /></label>
              </div>
            </details>
            <label className="field">Skills <span className="hint">Comma separated</span><textarea name="skills" rows={3} defaultValue={(c.skills || []).join(', ')} /></label>
            <div className="row" style={{ gap: 6 }}>
              {(c.skills || []).map((s) => <span key={s} className={`chip${must.some((m) => m.includes(s.toLowerCase()) || s.toLowerCase().includes(m.replace(/\s*\(.*\)/, ''))) ? ' on' : ''}`}>{s}</span>)}
            </div>
            {app ? <span className="tiny muted">Indigo = must-have for {app.title}</span> : null}
          </form>

          <section className="card">
            <h2>Original resume</h2>
            {files.length ? files.map((f) => <a key={f.id} href={`/api/files/${f.id}`} className="small">{f.filename} · {fmtDate(f.created_at, false)}</a>) : <p className="small muted">No file.</p>}
            {c.summary ? <p className="small" style={{ color: 'var(--ink2)', lineHeight: 1.6 }}>{c.summary}</p> : null}
          </section>

          {allScores.length ? (
            <section className="card">
              <h2>Match % with open jobs</h2>
              {allScores.map((s) => (
                <div key={s.job_id} className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', gap: 10 }}>
                  <span className="small" style={{ minWidth: 0 }}>{s.app_id ? <Link href={`/candidates/${c.id}?app=${s.app_id}`}>{s.title}</Link> : s.title}<span className="tiny muted" style={{ display: 'block' }}>{s.app_id ? `In pipeline · ${s.stage}` : `Below the ${s.min_score}% cut-off`}</span></span>
                  <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                    <Score value={s.score} />
                    {!s.app_id ? <form action={addCandidateToJob}><input type="hidden" name="candidate_id" value={c.id} /><input type="hidden" name="job_id" value={s.job_id} /><button className="btn sm" type="submit">Add to pipeline</button></form> : null}
                  </div>
                </div>
              ))}
            </section>
          ) : null}
          {openJobs.length ? (
            <form action={addCandidateToJob} className="card">
              <h2>Add to another job</h2>
              <input type="hidden" name="candidate_id" value={c.id} />
              <label className="field"><span className="sr">Job</span><select name="job_id">{openJobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}</select></label>
              <button className="btn" type="submit">Add and score</button>
            </form>
          ) : null}
          <form action={deleteCandidate}><input type="hidden" name="id" value={c.id} /><ConfirmButton message="Delete this candidate and all their data? This cannot be undone." className="btn danger sm">Delete candidate (data request)</ConfirmButton></form>
        </div>

        <div className="col-main" style={{ flex: '2 1 480px' }}>
          {app ? (
            <section className="card">
              <div className="header">
                <h2>AI match for {app.title}</h2>
                <div className="row" style={{ gap: 8 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, padding: '6px 12px', borderRadius: 8, background: app.match_score >= 80 ? 'var(--green-bg)' : 'var(--amber-bg)', color: app.match_score >= 80 ? 'var(--green)' : 'var(--amber)' }}><span style={{ fontSize: 22, fontWeight: 700 }}>{app.match_score ?? '—'}%</span><span className="small strong">match</span></span>
                  <form action={rescore}><input type="hidden" name="app_id" value={app.id} /><button className="btn sm" type="submit">Re-score</button></form>
                </div>
              </div>
              {md.breakdown ? (
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                  {[['Must-have skills', md.breakdown.skills, 50], ['Preferred skills', md.breakdown.preferred, 10], ['Experience', md.breakdown.experience, 20], ['Budget fit', md.breakdown.budget, 10], ['Location', md.breakdown.location, 10]].map(([k, v, max]) => (
                    <div key={k} className="stack" style={{ gap: 6, padding: 12, border: '1px solid var(--line)', borderRadius: 10 }}>
                      <span className="tiny strong muted">{k}</span><span className="strong" style={{ fontSize: 15 }}>{v} / {max}</span>
                      <div className="bar"><div style={{ width: `${(v / max) * 100}%`, background: 'var(--green)' }} /></div>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
                <div style={{ flex: '1 1 240px' }}><div className="small strong" style={{ color: 'var(--green)' }}>Strengths</div><p className="small" style={{ color: 'var(--ink2)', marginTop: 4 }}>{(md.strengths || []).join(' · ') || '—'}</p></div>
                <div style={{ flex: '1 1 240px' }}><div className="small strong" style={{ color: 'var(--amber)' }}>Gaps</div><p className="small" style={{ color: 'var(--ink2)', marginTop: 4 }}>{(md.gaps || []).join(' · ') || '—'}</p></div>
              </div>
              {md.summary ? <p className="small muted">{md.summary}</p> : null}
              {md.capped ? <p className="small" style={{ color: 'var(--amber)' }}>Capped at 50% because fewer than half of the must-have skills were found.</p> : null}
              <span className="tiny muted">Scored by {md.by === 'ai' ? 'AI' : 'keyword rules (add an AI key for better matching)'}.</span>
            </section>
          ) : (
            <section className="card"><h2>Not linked to a job yet</h2><p className="small muted">Add this candidate to a job to score them.</p></section>
          )}

          {app ? (
            <section className="card">
              <div className="header">
                <div className="titles"><h2>AI screening call</h2>
                  <span className="small muted">{screening ? `${SCREENING_STATUS[screening.status] || screening.status}${screening.slot_at ? ` · slot ${fmtDate(screening.slot_at)}` : ''}${screening.duration_sec ? ` · ${Math.round(screening.duration_sec / 60)} min` : ''}${screening.consent ? ' · consent to record given' : ''}` : 'Not requested yet'}</span>
                </div>
                {screening?.score ? <Pill tone={screening.score >= 7 ? 'green' : 'amber'}>Call score {screening.score} / 10</Pill> : null}
              </div>
              <div className="row" style={{ gap: 8 }}>
                <form action={askForSlot}><input type="hidden" name="app_id" value={app.id} /><input type="hidden" name="back" value={back} /><button className="btn sm" type="submit">{screening ? 'Send slot link again' : 'Ask for a call slot'}</button></form>
                {screening && ['booked', 'no_answer', 'failed', 'requested', 'human_requested'].includes(screening.status) ? (
                  <form action={callNow}><input type="hidden" name="screening_id" value={screening.id} /><button className="btn sm ai" type="submit">Call now</button></form>
                ) : null}
                {screening?.recording_url ? <a className="btn sm" href={screening.recording_url} target="_blank" rel="noreferrer">Play recording</a> : null}
              </div>
              {screening?.summary ? <p className="soft small">{screening.summary}</p> : null}
              {screening?.status === 'completed' && !screening.score ? <p className="tiny muted">Transcript saved but not scored. Add ANTHROPIC_API_KEY to score calls automatically.</p> : null}
              {(screening?.answers || []).map((x, i) => (
                <div key={i} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
                  <span className={`score ${x.rating >= 8 ? 'green' : x.rating >= 6 ? 'amber' : 'gray'}`} style={{ width: 40 }}>{x.rating ?? '—'}</span>
                  <div className="stack" style={{ gap: 4 }}><span className="small strong">{x.q}</span><span className="small" style={{ color: 'var(--ink2)' }}>{x.a || '—'}</span></div>
                </div>
              ))}
              {screening?.transcript ? (
                <details><summary className="small strong" style={{ cursor: 'pointer', color: 'var(--accent)' }}>Read full transcript</summary><p className="soft small pre" style={{ marginTop: 8 }}>{screening.transcript}</p></details>
              ) : null}
            </section>
          ) : null}

          {app && app.stage !== 'rejected' ? (
            <form action={moveStage} className="card">
              <h2>Reject with a reason</h2>
              <input type="hidden" name="app_id" value={app.id} /><input type="hidden" name="stage" value="rejected" />
              <div className="row" style={{ alignItems: 'flex-end' }}>
                <label className="field" style={{ flex: '1 1 240px' }}>Reason<select name="reason">{REJECT_REASONS.map((r) => <option key={r}>{r}</option>)}</select></label>
                <button className="btn danger" type="submit">Reject</button>
              </div>
            </form>
          ) : null}

          <section className="card">
            <h2>Activity</h2>
            {acts.map((a) => (
              <div key={a.id} className="row small" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}><span className="muted" style={{ flex: 'none', width: 120 }}>{fmtDate(a.created_at)}</span><span style={{ color: 'var(--ink2)' }}>{a.text}</span></div>
            ))}
            {apps.map((a) => <div key={a.id} className="row small"><StagePill stage={a.stage} /><span>{a.title}</span><Score value={a.match_score} /></div>)}
          </section>
        </div>
      </div>
    </>
  );
}
