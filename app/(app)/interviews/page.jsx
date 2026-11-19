import Link from 'next/link';
import { q } from '@/lib/db';
import { Header, Pill, Flash } from '@/components/ui';
import { fmtDate, lakh, hoursLeft, REJECT_REASONS } from '@/lib/util';
import { scheduleInterview, recordOutcome, saveOffer } from '../../_actions/interviews';

export const metadata = { title: 'Interviews & offers — AvaStars Hire' };
const OFFER_STATUS = { negotiating: 'amber', offered: 'blue', accepted: 'green', joined: 'indigo', dropped: 'red' };

export default async function InterviewsPage({ searchParams }) {
  const sp = await searchParams;
  const upcoming = await q(`
    SELECT i.*, c.name, c.id AS cid, jb.title, cl.name AS client FROM interviews i
    JOIN applications a ON a.id = i.application_id JOIN candidates c ON c.id = a.candidate_id JOIN jobs jb ON jb.id = a.job_id LEFT JOIN clients cl ON cl.id = jb.client_id
    WHERE i.status = 'scheduled' ORDER BY i.scheduled_at`);
  const recent = await q(`
    SELECT i.*, c.name, jb.title FROM interviews i JOIN applications a ON a.id = i.application_id JOIN candidates c ON c.id = a.candidate_id JOIN jobs jb ON jb.id = a.job_id
    WHERE i.status = 'done' ORDER BY i.scheduled_at DESC LIMIT 10`);
  const offers = await q(`
    SELECT a.id AS app_id, c.name, c.id AS cid, c.ectc, jb.title, cl.name AS client, o.* FROM applications a
    JOIN candidates c ON c.id = a.candidate_id JOIN jobs jb ON jb.id = a.job_id LEFT JOIN clients cl ON cl.id = jb.client_id
    LEFT JOIN offers o ON o.application_id = a.id
    WHERE a.stage = 'selected' OR o.id IS NOT NULL ORDER BY o.updated_at DESC NULLS FIRST`);
  const candidates = await q(`
    SELECT a.id, c.name, jb.title FROM applications a JOIN candidates c ON c.id = a.candidate_id JOIN jobs jb ON jb.id = a.job_id
    WHERE a.stage IN ('interview','forwarded','selected') ORDER BY (a.client_decision = 'yes') DESC NULLS LAST, a.updated_at DESC`);
  const reasons = await q(`SELECT COALESCE(client_reason, reject_reason, 'Other') AS r, count(*)::int AS n FROM applications WHERE stage = 'rejected' AND updated_at > now() - interval '30 days' GROUP BY 1 ORDER BY 2 DESC LIMIT 6`);
  const maxR = Math.max(1, ...reasons.map((r) => r.n));

  return (
    <>
      <Header title="Interviews & offers" sub="Step 6: client interviews, feedback within 24 hours, negotiation and closure" />
      <Flash msg={sp.msg} />
      <div className="cols">
        <section className="col-main" style={{ gap: 20 }}>
          <div className="card flush">
            <div className="card-head"><h2>Upcoming interviews</h2></div>
            {upcoming.length ? (
              <div className="tablewrap">
                <table className="t" style={{ minWidth: 860 }}>
                  <thead><tr><th>Candidate</th><th>Round</th><th>When (IST)</th><th>Feedback due</th><th>Record outcome</th></tr></thead>
                  <tbody>
                    {upcoming.map((i) => {
                      const due = new Date(new Date(i.scheduled_at).getTime() + 24 * 36e5);
                      const h = hoursLeft(due);
                      const past = new Date(i.scheduled_at) < new Date();
                      return (
                        <tr key={i.id}>
                          <td className="namecell"><Link href={`/candidates/${i.cid}?app=${i.application_id}`}>{i.name}</Link><div>{i.title}{i.client ? ` · ${i.client}` : ''}</div></td>
                          <td>{i.round}{i.meeting_link ? <div className="tiny"><a href={i.meeting_link} target="_blank" rel="noreferrer">Meeting link</a></div> : null}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(i.scheduled_at)}</td>
                          <td>{past ? <Pill tone={h < 0 ? 'red' : 'amber'}>{h < 0 ? `Overdue ${-h}h` : `Due in ${h}h`}</Pill> : <Pill tone="gray">After interview</Pill>}</td>
                          <td>
                            <form action={recordOutcome} className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                              <input type="hidden" name="interview_id" value={i.id} />
                              <label className="sr" htmlFor={`o-${i.id}`}>Outcome</label>
                              <select id={`o-${i.id}`} name="outcome" style={{ minHeight: 36, width: 140 }}><option value="next">Next round</option><option value="selected">Selected</option><option value="rejected">Rejected</option></select>
                              <label className="sr" htmlFor={`r-${i.id}`}>Reason</label>
                              <select id={`r-${i.id}`} name="reason" style={{ minHeight: 36, width: 150 }}><option value="">Reason (if rejected)</option>{REJECT_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
                              <label className="sr" htmlFor={`f-${i.id}`}>Feedback</label>
                              <input id={`f-${i.id}`} name="feedback" placeholder="Client feedback" style={{ minHeight: 36, width: 180 }} />
                              <button className="btn sm" type="submit">Save</button>
                            </form>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <div className="empty">No interviews scheduled.</div>}
          </div>

          <div className="card flush">
            <div className="card-head"><h2>Negotiation & closure</h2><span className="small muted">Selected candidates</span></div>
            {offers.length ? (
              <div className="stack" style={{ gap: 0 }}>
                {offers.map((o) => (
                  <form key={o.app_id} action={saveOffer} className="row" style={{ padding: '14px 20px', borderTop: '1px solid var(--line)', alignItems: 'flex-end', gap: 10 }}>
                    <input type="hidden" name="app_id" value={o.app_id} />
                    <div style={{ flex: '1 1 200px' }} className="namecell"><Link href={`/candidates/${o.cid}?app=${o.app_id}`}>{o.name}</Link><div>{o.title}{o.client ? ` · ${o.client}` : ''} · expects {lakh(o.ectc)}</div></div>
                    <label className="field">Offered (₹ L)<input name="offered_ctc" type="number" step="any" defaultValue={o.offered_ctc ?? ''} style={{ width: 110 }} /></label>
                    <label className="field">Status<select name="status" defaultValue={o.status || 'negotiating'} style={{ width: 140 }}>{Object.keys(OFFER_STATUS).map((s) => <option key={s}>{s}</option>)}</select></label>
                    <label className="field">Joining<input name="joining_date" type="date" defaultValue={o.joining_date ? new Date(o.joining_date).toISOString().slice(0, 10) : ''} style={{ width: 160 }} /></label>
                    <label className="field" style={{ flex: '1 1 180px' }}>Note<input name="note" defaultValue={o.note || ''} /></label>
                    <button className="btn sm" type="submit" style={{ minHeight: 44 }}>Save</button>
                    {o.status ? <Pill tone={OFFER_STATUS[o.status]}>{o.status}</Pill> : null}
                  </form>
                ))}
              </div>
            ) : <div className="empty">No selected candidates yet.</div>}
          </div>

          {recent.length ? (
            <section className="card">
              <h2>Recent interview outcomes</h2>
              {recent.map((i) => <div key={i.id} className="row small" style={{ justifyContent: 'space-between' }}><span><span className="strong">{i.name}</span> · {i.title} · {i.round}</span><span className="muted">{i.outcome}{i.feedback ? ` — ${i.feedback}` : ''}</span></div>)}
            </section>
          ) : null}
        </section>

        <aside className="col-side">
          <form action={scheduleInterview} className="card">
            <h2>Schedule an interview</h2>
            <label className="field">Candidate<select name="app_id" required>{candidates.length ? candidates.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.title}</option>) : <option value="">No candidates with the client yet</option>}</select></label>
            <label className="field">Round<input name="round" defaultValue="Technical interview" /></label>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <label className="field" style={{ flex: 1 }}>Date<input name="date" type="date" required /></label>
              <label className="field" style={{ flex: 1 }}>Time (IST)<input name="time" type="time" defaultValue="16:00" /></label>
            </div>
            <label className="field">Meeting link<input name="meeting_link" type="url" placeholder="Google Meet or Teams link" /></label>
            <label className="row small" style={{ gap: 10, flexWrap: 'nowrap' }}><input type="checkbox" name="notify" defaultChecked style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} /> Email calendar invite to candidate and client</label>
            <button className="btn primary" type="submit">Schedule and send invites</button>
          </form>
          <section className="card">
            <h2>Rejection reasons (30 days)</h2>
            {reasons.length ? reasons.map((r) => (
              <div key={r.r} className="stack" style={{ gap: 6 }}>
                <div className="row small" style={{ justifyContent: 'space-between' }}><span>{r.r}</span><span className="strong">{r.n}</span></div>
                <div className="bar"><div style={{ width: `${(r.n / maxR) * 100}%`, background: 'var(--red)' }} /></div>
              </div>
            )) : <p className="small muted">None yet.</p>}
          </section>
        </aside>
      </div>
    </>
  );
}
