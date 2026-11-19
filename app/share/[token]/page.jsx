import { notFound } from 'next/navigation';
import { q, one } from '@/lib/db';
import PublicHeader from '@/components/PublicHeader';
import { lakh, notice, initials, hoursLeft, REJECT_REASONS } from '@/lib/util';
import { clientDecision } from '../../_actions/share';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Candidates for review — AvaStars', robots: { index: false } };

export default async function SharePage({ params }) {
  const { token } = await params;
  const share = await one('SELECT s.*, j.title, j.id AS jid, cl.name AS client FROM shares s JOIN jobs j ON j.id = s.job_id LEFT JOIN clients cl ON cl.id = j.client_id WHERE s.token = $1', [token]);
  if (!share) notFound();
  const ids = (share.application_ids || []).map(Number);
  const people = await q(`
    SELECT a.id, a.match_score, a.client_decision, a.client_reason, a.client_comment, c.name, c.current_title, c.current_company, c.location, c.total_exp, c.cctc, c.ectc, c.notice_days, c.availability,
      (SELECT row_to_json(x) FROM (SELECT score, summary FROM screenings WHERE application_id = a.id AND status = 'completed' ORDER BY id DESC LIMIT 1) x) AS scr
    FROM applications a JOIN candidates c ON c.id = a.candidate_id WHERE a.id = ANY($1::int[]) ORDER BY a.match_score DESC NULLS LAST`, [ids]);
  const decided = people.filter((p) => p.client_decision).length;
  const h = hoursLeft(share.due_at);
  const shortName = (n) => { const p = String(n).split(/\s+/); return `${p[0]} ${p[1] ? p[1][0] + '.' : ''}`; };

  return (
    <div style={{ minHeight: '100vh' }}>
      <PublicHeader title="AvaStars" href="#" right={
        <div className="row" style={{ gap: 10 }}>
          {share.client ? <span className="small muted">Shared with {share.client}</span> : null}
          <span className={`pill ${decided === people.length ? 'green' : h < 0 ? 'red' : 'amber'}`} style={{ height: 32 }}>{decided === people.length ? 'All decided — thank you' : h < 0 ? `Feedback overdue by ${-h} h` : `Feedback due in ${h} h · 24-hour SLA`}</span>
        </div>
      } />
      <main className="container" style={{ maxWidth: 1080 }}>
        <div className="stack" style={{ gap: 6 }}>
          <h1>{share.title}</h1>
          <p className="sub" style={{ fontSize: 15 }}>{people.length} screened candidate(s) for your review. Shortlist for interview or reject with a reason; we pass the outcome back to each candidate.</p>
        </div>
        <span className="chip" style={{ alignSelf: 'flex-start', background: '#fff', border: '1px solid var(--border)' }}>{decided} of {people.length} decided</span>
        {people.map((p) => (
          <article key={p.id} className="card" style={{ padding: 22, gap: 16 }}>
            <div className="row" style={{ justifyContent: 'space-between', gap: 16 }}>
              <div className="row" style={{ gap: 14, flexWrap: 'nowrap' }}>
                <span style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, flex: 'none' }}>{initials(p.name)}</span>
                <div className="stack" style={{ gap: 2 }}><h2>{shortName(p.name)}</h2><span className="small muted">{[p.current_title, p.current_company, p.location].filter(Boolean).join(' · ')}</span></div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                {p.match_score !== null ? <span className="pill green" style={{ height: 28, borderRadius: 6, fontSize: 13 }}>Match {p.match_score}</span> : null}
                {p.scr?.score ? <span className="pill blue" style={{ height: 28, borderRadius: 6, fontSize: 13 }}>Call {p.scr.score}</span> : null}
              </div>
            </div>
            <div className="facts soft">
              <div className="fact"><span>Experience</span><span>{p.total_exp ? `${p.total_exp} yrs` : '—'}</span></div>
              <div className="fact"><span>Current CTC</span><span>{lakh(p.cctc)}</span></div>
              <div className="fact"><span>Expected CTC</span><span>{lakh(p.ectc)}</span></div>
              <div className="fact"><span>Notice period</span><span>{notice(p.notice_days)}</span></div>
              <div className="fact"><span>Available for interview</span><span>{p.availability || 'Ask us'}</span></div>
            </div>
            {p.scr?.summary ? <p style={{ lineHeight: 1.6, color: 'var(--ink2)' }}><strong style={{ color: 'var(--ink)' }}>Screening notes: </strong>{p.scr.summary}</p> : null}
            <div className="row" style={{ gap: 10 }}>
              <a className="btn" href={`/share/${token}/resume/${p.id}`}>Download resume (PDF)</a>
              <span className="spacer" />
              {p.client_decision ? (
                <form action={clientDecision} className="row" style={{ gap: 10 }}>
                  <input type="hidden" name="token" value={token} /><input type="hidden" name="app_id" value={p.id} /><input type="hidden" name="decision" value="undo" />
                  <span className={`pill ${p.client_decision === 'yes' ? 'green' : 'red'}`} style={{ height: 32 }}>{p.client_decision === 'yes' ? 'Shortlisted for interview' : `Rejected${p.client_reason ? ` · ${p.client_reason}` : ''}`}</span>
                  <button className="btn" type="submit">Undo</button>
                </form>
              ) : (
                <form action={clientDecision} className="row" style={{ gap: 10, alignItems: 'flex-end' }}>
                  <input type="hidden" name="token" value={token} /><input type="hidden" name="app_id" value={p.id} />
                  <label className="field">Comment (optional)<input name="comment" style={{ width: 200 }} /></label>
                  <label className="field">Reason if rejecting<select name="reason" style={{ width: 200 }}><option value="">Choose a reason</option>{REJECT_REASONS.map((r) => <option key={r}>{r}</option>)}</select></label>
                  <button className="btn danger" type="submit" name="decision" value="no">Reject</button>
                  <button className="btn success" type="submit" name="decision" value="yes">Shortlist for interview</button>
                </form>
              )}
            </div>
          </article>
        ))}
        <p className="small muted" style={{ textAlign: 'center' }}>Questions? Reply to the email from your AvaStars recruiter. This link is private to you.</p>
      </main>
    </div>
  );
}
