import Link from 'next/link';
import { q } from '@/lib/db';
import { requireClientUser } from '@/lib/auth';
import { Pill } from '@/components/ui';
import { expRange, fmtDate } from '@/lib/util';

// Counts per job. Candidates before "Forwarded" are shown only as numbers (work in progress at AvaStars).
export default async function PortalHome() {
  const me = await requireClientUser();
  const jobs = await q(`
    SELECT j.id, j.title, j.location, j.work_mode, j.exp_min, j.exp_max, j.openings, j.status, j.created_at,
      count(a.id)::int AS sourced,
      count(a.id) FILTER (WHERE a.stage IN ('screening','forwarded','interview','selected','joined') OR a.client_decision IS NOT NULL)::int AS screened,
      count(a.id) FILTER (WHERE a.stage = 'forwarded' AND a.client_decision IS NULL)::int AS review,
      count(a.id) FILTER (WHERE a.stage = 'interview')::int AS interview,
      count(a.id) FILTER (WHERE a.stage = 'selected')::int AS selected,
      count(a.id) FILTER (WHERE a.stage = 'joined')::int AS joined
    FROM jobs j LEFT JOIN applications a ON a.job_id = j.id
    WHERE j.client_id = $1 GROUP BY j.id ORDER BY (j.status = 'open') DESC, j.created_at DESC`, [me.client_id]);
  const waiting = jobs.reduce((n, j) => n + j.review, 0);
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="stack" style={{ gap: 4 }}>
        <h1>Your hiring with AvaStars</h1>
        <p className="sub">{jobs.length} requirement(s){waiting ? ` · ${waiting} candidate(s) waiting for your feedback` : ''}</p>
      </div>
      {!jobs.length ? <div className="card empty">No requirements yet. Your AvaStars recruiter will add them here.</div> : null}
      {jobs.map((j) => (
        <Link key={j.id} href={`/portal/jobs/${j.id}`} className="card portal-job">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="stack" style={{ gap: 2 }}>
              <h2>{j.title}</h2>
              <span className="small muted">{[j.location, j.work_mode, expRange(j.exp_min, j.exp_max), `${j.openings} opening(s)`, `since ${fmtDate(j.created_at, false)}`].filter(Boolean).join(' · ')}</span>
            </div>
            <div className="row" style={{ gap: 8 }}>
              {j.review ? <Pill tone="amber">{j.review} waiting for you</Pill> : null}
              <Pill tone={j.status === 'open' ? 'green' : j.status === 'paused' ? 'amber' : 'gray'}>{j.status}</Pill>
            </div>
          </div>
          <div className="funnel">
            {[['Sourced', j.sourced], ['Screened', j.screened], ['For your review', j.review], ['Interview', j.interview], ['Selected', j.selected], ['Joined', j.joined]].map(([l, n]) => (
              <div key={l} className={l === 'For your review' && n ? 'hot' : undefined}><b>{n}</b><span>{l}</span></div>
            ))}
          </div>
        </Link>
      ))}
    </div>
  );
}
