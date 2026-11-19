import Link from 'next/link';
import { q, one } from '@/lib/db';
import { Header, Kpi, Pill, Flash } from '@/components/ui';
import { SCREENING_STATUS, fmtDate } from '@/lib/util';
import { providerName, buildScript } from '@/lib/voice';
import { callSettings } from '@/lib/screening';
import { callNow, simulateCall, askForSlot } from '../../_actions/screening';
import { saveJobQuestions, addSetToJob, saveSetFromJob, deleteSet } from '../../_actions/questions';
import { callQuestions, formatQuestions, questionSets } from '@/lib/questions';

export const metadata = { title: 'AI screening — AvaStars Hire' };

const TONE = { requested: 'gray', booked: 'indigo', calling: 'blue', completed: 'green', no_answer: 'amber', failed: 'red', declined: 'gray', human_requested: 'red' };

export default async function ScreeningPage({ searchParams }) {
  const sp = await searchParams;
  const jobId = Number(sp.job) || null;
  const provider = providerName();
  const settings = await callSettings();
  const k = await one(`SELECT count(*)::int AS sent, count(*) FILTER (WHERE slot_at IS NOT NULL)::int AS booked, count(*) FILTER (WHERE status = 'completed')::int AS done, round(avg(score)::numeric, 1)::float AS avg FROM screenings s JOIN applications a ON a.id = s.application_id WHERE ($1::int IS NULL OR a.job_id = $1)`, [jobId]);
  const rows = await q(`
    SELECT s.*, c.name, c.phone, c.id AS cid, jb.title, jb.id AS jid FROM screenings s
    JOIN applications a ON a.id = s.application_id JOIN candidates c ON c.id = a.candidate_id JOIN jobs jb ON jb.id = a.job_id
    WHERE ($1::int IS NULL OR a.job_id = $1)
    ORDER BY CASE s.status WHEN 'calling' THEN 0 WHEN 'human_requested' THEN 1 WHEN 'booked' THEN 2 WHEN 'no_answer' THEN 3 WHEN 'requested' THEN 4 ELSE 5 END, s.slot_at NULLS LAST, s.updated_at DESC LIMIT 100`, [jobId]);
  const live = rows.filter((r) => r.status === 'calling');
  const ready = await q(`
    SELECT a.id, c.name, jb.title FROM applications a JOIN candidates c ON c.id = a.candidate_id JOIN jobs jb ON jb.id = a.job_id
    WHERE a.stage = 'shortlisted' AND NOT EXISTS (SELECT 1 FROM screenings s WHERE s.application_id = a.id) AND ($1::int IS NULL OR a.job_id = $1) ORDER BY a.match_score DESC LIMIT 20`, [jobId]);
  const scriptJob = jobId ? await one('SELECT * FROM jobs WHERE id = $1', [jobId]) : await one(`SELECT * FROM jobs WHERE status = 'open' ORDER BY created_at DESC LIMIT 1`);
  const jobs = await q(`SELECT id, title FROM jobs WHERE status = 'open' ORDER BY created_at DESC`);
  const finalQs = scriptJob ? await callQuestions(scriptJob) : [];
  const script = scriptJob ? buildScript({ candidate: { name: 'Rohan' }, job: scriptJob, questions: finalQs }) : null;
  const scriptClient = scriptJob?.client_id ? await one('SELECT id, name, screening_questions FROM clients WHERE id = $1', [scriptJob.client_id]) : null;
  const sets = await questionSets();

  return (
    <>
      <Header title="AI screening" sub="Ask shortlisted candidates for a time, then the AI recruiter calls them and scores the answers">
        <form className="row" style={{ gap: 8 }}>
          <label className="sr" htmlFor="job">Job</label>
          <select id="job" name="job" defaultValue={jobId || ''} style={{ width: 260 }}><option value="">All jobs</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}</select>
          <button className="btn" type="submit">Show</button>
        </form>
      </Header>
      <Flash msg={sp.msg} tone={String(sp.msg || '').startsWith('Could not') ? 'warn' : 'ok'} />
      {provider === 'mock' ? <div className="notice info">Test mode: no real phone calls are made. Use “Simulate call” to paste a transcript. Set VOICE_PROVIDER to go live.</div> : null}

      <section className="grid-kpi" aria-label="Screening numbers">
        <Kpi icon="sparkles" tone="indigo" label="Slot requests sent" value={k.sent} /><Kpi icon="calendar" tone="blue" label="Slots booked" value={k.booked} /><Kpi icon="phone" tone="green" label="Calls completed" value={k.done} /><Kpi icon="sparkles" tone="violet" label="Average call score" value={k.avg ?? '—'} />
      </section>

      {scriptJob ? (
        <section id="questions" className="card" style={{ gap: 18 }}>
          <div className="header">
            <div className="titles"><h2>Call questions · {scriptJob.title}</h2><p className="small muted">Each job has its own questions. The client&apos;s standard questions are added after them. Pick another job at the top to edit its questions.</p></div>
            <span className="pill indigo">{finalQs.length} question(s) on the call</span>
          </div>
          <div className="cols" style={{ gap: 20 }}>
            <div className="col-main" style={{ gap: 12 }}>
              <form action={saveJobQuestions} className="stack" style={{ gap: 10 }}>
                <input type="hidden" name="job_id" value={scriptJob.id} />
                <label className="field">Questions for this job <span className="hint">One per line. Optional “| type”, e.g. “How many years of Java? | Number”.</span>
                  <textarea name="questions" rows={7} defaultValue={formatQuestions(scriptJob.screening_questions)} />
                </label>
                <div className="row"><button className="btn primary" type="submit">Save questions</button></div>
              </form>
              <div className="row" style={{ gap: 16, alignItems: 'flex-end' }}>
                <form action={addSetToJob} className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
                  <input type="hidden" name="job_id" value={scriptJob.id} />
                  <label className="field">Add from question library
                    <select name="set" style={{ minWidth: 220 }}>{sets.map((x) => <option key={x.name} value={x.name}>{x.name}{x.builtIn ? '' : ' (saved)'} · {x.questions.length}</option>)}</select>
                  </label>
                  <button className="btn" type="submit">Add to this job</button>
                </form>
                <form action={saveSetFromJob} className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
                  <input type="hidden" name="job_id" value={scriptJob.id} />
                  <label className="field">Save this job&apos;s questions as a set<input name="name" placeholder="e.g. Java backend" /></label>
                  <button className="btn" type="submit">Save set</button>
                </form>
              </div>
              {sets.some((x) => !x.builtIn) ? (
                <div className="row small" style={{ gap: 8 }}>
                  <span className="muted">Your saved sets:</span>
                  {sets.filter((x) => !x.builtIn).map((x) => (
                    <form key={x.name} action={deleteSet} className="row" style={{ gap: 4 }}>
                      <input type="hidden" name="job_id" value={scriptJob.id} /><input type="hidden" name="name" value={x.name} />
                      <span className="chip">{x.name}</span><button className="linkbtn" type="submit" aria-label={`Delete set ${x.name}`}>Delete</button>
                    </form>
                  ))}
                </div>
              ) : null}
              <div className="soft small">
                <strong>Client standard questions</strong>{scriptClient ? <> ({scriptClient.name}) · <Link href={`/clients/${scriptClient.id}`}>edit on the client page</Link></> : null}
                {(scriptClient?.screening_questions || []).length ? <ol style={{ margin: '6px 0 0', paddingLeft: 20 }}>{scriptClient.screening_questions.map((x, i) => <li key={i}>{x.q}</li>)}</ol> : <p className="muted" style={{ marginTop: 4 }}>{scriptClient ? 'None yet.' : 'This job has no client.'}</p>}
              </div>
            </div>
            <div className="col-side">
              <div className="stack" style={{ gap: 10 }}>
                <span className="small strong muted">What the candidate hears</span>
                <p className="small" style={{ padding: 12, borderRadius: 10, background: 'var(--accent-soft)', color: 'var(--accent-ink)', lineHeight: 1.55 }}>“{script.intro}”</p>
                {script.questions.length ? <ol className="small" style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>{script.questions.map((x, i) => <li key={i}>{x}</li>)}</ol> : <p className="small muted">No questions yet. Add some on the left.</p>}
                <p className="small" style={{ padding: 12, borderRadius: 10, background: 'var(--gray-bg)', lineHeight: 1.55 }}>“{script.outro}”</p>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <div className="cols">
        <section className="col-main">
          {live.map((r) => (
            <article key={r.id} className="card" style={{ border: '2px solid var(--blue)' }}>
              <div className="header"><div className="row" style={{ gap: 10 }}><span className="dot" style={{ background: 'var(--red)' }} aria-hidden="true" /><h2>Live call · {r.name} · {r.title}</h2></div><span className="small muted">Started {fmtDate(r.updated_at)}</span></div>
              <p className="small muted">The transcript and score appear here when the voice platform reports the call has ended.</p>
            </article>
          ))}

          {ready.length ? (
            <section className="card">
              <h2>Shortlisted, not asked yet ({ready.length})</h2>
              {ready.map((a) => (
                <form key={a.id} action={askForSlot} className="row" style={{ justifyContent: 'space-between' }}>
                  <input type="hidden" name="app_id" value={a.id} /><input type="hidden" name="back" value={`/screening${jobId ? `?job=${jobId}` : ''}`} />
                  <span><span className="strong">{a.name}</span> <span className="small muted">· {a.title}</span></span>
                  <button className="btn sm" type="submit">Send slot link</button>
                </form>
              ))}
            </section>
          ) : null}

          <div className="card flush">
            <div className="card-head"><h2>Call queue</h2><span className="small muted">Provider: {provider}</span></div>
            {rows.length ? (
              <div className="tablewrap">
                <table className="t" style={{ minWidth: 720 }}>
                  <thead><tr><th>Candidate</th><th>Slot</th><th>Status</th><th>Tries</th><th>Score</th><th>Action</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td className="namecell"><Link href={`/candidates/${r.cid}?app=${r.application_id}`}>{r.name}</Link><div>{r.title}</div></td>
                        <td style={{ whiteSpace: 'nowrap' }}>{r.slot_at ? fmtDate(r.slot_at) : '—'}</td>
                        <td><Pill tone={TONE[r.status]}>{SCREENING_STATUS[r.status] || r.status}</Pill>{r.status === 'failed' && r.summary ? <div className="tiny muted" style={{ marginTop: 4 }}>{r.summary}</div> : null}</td>
                        <td>{r.attempts}</td>
                        <td className="strong">{r.score ?? '—'}</td>
                        <td>
                          <div className="row" style={{ gap: 6 }}>
                            {r.status === 'completed' ? <Link className="btn sm" href={`/candidates/${r.cid}?app=${r.application_id}`}>View result</Link> : null}
                            {['booked', 'no_answer', 'failed', 'requested', 'human_requested'].includes(r.status) ? <form action={callNow}><input type="hidden" name="screening_id" value={r.id} /><button className="btn sm ai" type="submit">Call now</button></form> : null}
                            {provider === 'mock' && r.status === 'calling' ? (
                              <details>
                                <summary className="btn sm">Simulate call</summary>
                                <form action={simulateCall} className="stack card" style={{ position: 'absolute', zIndex: 5, width: 420, marginTop: 6, boxShadow: '0 8px 24px rgba(16,24,40,.12)' }}>
                                  <input type="hidden" name="screening_id" value={r.id} />
                                  <label className="field">Transcript<textarea name="transcript" rows={8} required placeholder={'AI: Hi, I am calling from AvaStars…\nCandidate: …'} /></label>
                                  <label className="field">Outcome<select name="outcome"><option value="completed">Call completed</option><option value="no_answer">No answer</option></select></label>
                                  <button className="btn primary" type="submit">Save result</button>
                                </form>
                              </details>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="empty">No screening calls yet. Tick candidates on the pipeline and choose “Ask for AI call slot”.</div>}
          </div>
        </section>

        <aside className="col-side">
          <section className="card">
            <div className="header"><h2>Call settings</h2><Link href="/settings" className="small strong" style={{ textDecoration: 'none' }}>Change</Link></div>
            {[['Voice platform', provider], ['Call window (IST)', `${settings.windowStart} – ${settings.windowEnd}`], ['Slot length', `${settings.slotMinutes} min`], ['Attempts if no answer', `${settings.maxAttempts}, ${settings.retryHours} hours apart`], ['Consent', 'At slot booking and call start']].map(([a, b]) => (
              <div key={a} className="row small" style={{ justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1px solid var(--line)' }}><span className="muted">{a}</span><span className="strong">{b}</span></div>
            ))}
          </section>
        </aside>
      </div>
    </>
  );
}
