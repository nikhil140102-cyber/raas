import Link from 'next/link';
import { notFound } from 'next/navigation';
import { q, one } from '@/lib/db';
import { requireClientUser } from '@/lib/auth';
import { Pill } from '@/components/ui';
import { lakh, notice, initials, expRange, fmtDate, REJECT_REASONS } from '@/lib/util';
import { portalDecision } from '../../../_actions/portal';

const COLS = [
  ['review', 'For your review', (a) => a.stage === 'forwarded' && !a.client_decision],
  ['interview', 'Interview', (a) => a.stage === 'interview'],
  ['selected', 'Selected / offer', (a) => a.stage === 'selected'],
  ['joined', 'Joined', (a) => a.stage === 'joined'],
  ['no', 'Not selected', (a) => a.client_decision === 'no'],
];
/** The client's buttons for each column of the board. */
function Actions({ a, step }) {
  const id = <input type="hidden" name="app_id" value={a.id} />;
  const undo = (label) => (
    <form action={portalDecision}>{id}<input type="hidden" name="decision" value="undo" /><button className="linkbtn tiny" type="submit">{label}</button></form>
  );
  const decide = (yes, no) => (
    <form action={portalDecision} className="stack" style={{ gap: 6 }}>
      {id}
      <input name="comment" placeholder="Comment (optional)" aria-label="Comment" />
      <select name="reason" aria-label="Reason if rejecting" defaultValue=""><option value="">Reason if rejecting…</option>{REJECT_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
      <div className="row" style={{ gap: 6 }}>
        {yes ? <button className="btn sm success" type="submit" name="decision" value={yes[0]}>{yes[1]}</button> : null}
        <button className="btn sm danger" type="submit" name="decision" value="no">{no}</button>
      </div>
    </form>
  );
  if (step === 'review') return decide(['yes', 'Shortlist for interview'], 'Reject');
  if (step === 'interview') return <>{decide(['select', 'Select'], 'Reject')}{a.client_decision === 'yes' ? undo('Undo shortlist') : null}</>;
  if (step === 'selected') return <>{decide(null, 'Reject (offer withdrawn)')}{a.client_decision === 'selected' ? undo('Back to interview') : null}</>;
  if (step === 'no' && a.client_decision === 'no') return undo(a.client_prev_stage === 'interview' ? 'Undo (back to interview)' : a.client_prev_stage === 'selected' ? 'Undo (back to selected)' : 'Undo my decision');
  return null;
}

const shortName = (n) => { const p = String(n).split(/\s+/); return `${p[0]} ${p[1] ? `${p[1][0]}.` : ''}`; };

export default async function PortalJob({ params }) {
  const { id } = await params;
  const me = await requireClientUser();
  const job = await one('SELECT * FROM jobs WHERE id = $1 AND client_id = $2', [Number(id), me.client_id]);
  if (!job) notFound();
  const counts = await one(`SELECT count(*)::int AS sourced, count(*) FILTER (WHERE stage IN ('shortlisted','screening'))::int AS working FROM applications WHERE job_id = $1`, [job.id]);
  const apps = await q(`
    SELECT a.id, a.stage, a.match_score, a.client_decision, a.client_reason, a.client_prev_stage, a.client_comment, a.updated_at,
      c.name, c.current_title, c.current_company, c.location, c.total_exp, c.ectc, c.notice_days,
      (SELECT row_to_json(x) FROM (SELECT score, summary FROM screenings WHERE application_id = a.id AND status = 'completed' ORDER BY id DESC LIMIT 1) x) AS scr,
      (SELECT row_to_json(y) FROM (SELECT round, scheduled_at FROM interviews WHERE application_id = a.id ORDER BY scheduled_at DESC LIMIT 1) y) AS iv
    FROM applications a JOIN candidates c ON c.id = a.candidate_id
    WHERE a.job_id = $1 AND (a.stage IN ('forwarded','interview','selected','joined') OR a.client_decision IS NOT NULL)
    ORDER BY a.updated_at DESC`, [job.id]);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="small"><Link href="/portal">All requirements</Link> / {job.title}</div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="stack" style={{ gap: 2 }}>
          <h1>{job.title}</h1>
          <span className="sub">{[job.location, job.work_mode, expRange(job.exp_min, job.exp_max), `${job.openings} opening(s)`].filter(Boolean).join(' · ')}</span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Pill tone="gray">{counts.sourced} sourced</Pill>
          <Pill tone="blue">{counts.working} being screened by AvaStars</Pill>
        </div>
      </div>
      <div className="portal-board">
        {COLS.map(([key, label, test]) => {
          const list = apps.filter(test);
          return (
            <section key={key} className={`pcol pcol-${key}`}>
              <div className="pcol-head"><strong>{label}</strong><span className="muted">{list.length}</span></div>
              {!list.length ? <p className="tiny muted" style={{ padding: '6px 2px' }}>No one here yet.</p> : null}
              {list.map((a) => (
                <article key={a.id} className="pcard">
                  <div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
                    <span className="avatar sm">{initials(a.name)}</span>
                    <div className="stack" style={{ gap: 0, minWidth: 0 }}>
                      <strong>{shortName(a.name)}</strong>
                      <span className="tiny muted">{[a.current_title, a.current_company].filter(Boolean).join(' · ')}</span>
                    </div>
                  </div>
                  <div className="row tiny" style={{ gap: 6 }}>
                    {a.match_score !== null ? <Pill tone="green">Match {a.match_score}%</Pill> : null}
                    {a.scr?.score ? <Pill tone="blue">Call {a.scr.score}</Pill> : null}
                  </div>
                  <div className="facts tiny">
                    <div className="fact"><span>Exp</span><span>{a.total_exp ? `${a.total_exp} yrs` : '—'}</span></div>
                    <div className="fact"><span>ECTC</span><span>{lakh(a.ectc)}</span></div>
                    <div className="fact"><span>Notice</span><span>{notice(a.notice_days)}</span></div>
                    <div className="fact"><span>Location</span><span>{a.location || '—'}</span></div>
                  </div>
                  {a.scr?.summary ? <p className="tiny" style={{ margin: 0, color: 'var(--ink2)' }}>{a.scr.summary}</p> : null}
                  {a.iv?.scheduled_at && key === 'interview' ? <p className="tiny strong" style={{ margin: 0 }}>{a.iv.round}: {fmtDate(a.iv.scheduled_at)}</p> : null}
                  {key === 'no' && a.client_reason ? <p className="tiny muted" style={{ margin: 0 }}>Reason: {a.client_reason}</p> : null}
                  <a className="btn sm" href={`/portal/resume/${a.id}`}>Resume (PDF)</a>
                  <Actions a={a} step={key} />
                </article>
              ))}
            </section>
          );
        })}
      </div>
      <p className="tiny muted">Candidates appear here once AvaStars has screened them and shared them with you. Contact details stay with your AvaStars recruiter until an interview is arranged.</p>
    </div>
  );
}
