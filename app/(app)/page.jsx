import Link from 'next/link';
import { q, one } from '@/lib/db';
import { STAGES, fmtDate, hoursLeft, expRange, SCREENING_STATUS } from '@/lib/util';
import { Header, Kpi, Pill, Flash } from '@/components/ui';
import { loadSample } from '../_actions/settings';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/roles';


export const metadata = { title: 'Dashboard — AvaStars Hire' };

export default async function Dashboard({ searchParams }) {
  const sp = await searchParams;
  const me = await requireUser();
  const jobs = await one(`SELECT count(*)::int AS n, COALESCE(sum(openings),0)::int AS openings, count(DISTINCT client_id)::int AS clients FROM jobs WHERE status = 'open'`);
  const resumes = await one(`SELECT count(*)::int AS n FROM files WHERE created_at > now() - interval '7 days' AND candidate_id IS NOT NULL`);
  const strong = await one(`SELECT count(DISTINCT candidate_id)::int AS n FROM candidate_scores WHERE scored_at > now() - interval '7 days' AND score >= 70`);
  const callsToday = await one(`SELECT count(*) FILTER (WHERE status = 'completed')::int AS done, count(*) FILTER (WHERE status IN ('booked','calling','no_answer'))::int AS booked FROM screenings WHERE (slot_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date`);
  const waiting = await one(`SELECT count(*)::int AS n, count(*) FILTER (WHERE s.due_at < now())::int AS overdue FROM applications a JOIN LATERAL (SELECT due_at FROM shares WHERE job_id = a.job_id AND application_ids @> to_jsonb(a.id) ORDER BY sent_at DESC LIMIT 1) s ON true WHERE a.stage = 'forwarded' AND a.client_decision IS NULL`);

  const active = await q(`
    SELECT j.id, j.title, j.location, j.work_mode, j.exp_min, j.exp_max, j.openings, c.name AS client,
      count(a.id) FILTER (WHERE a.stage <> 'rejected')::int AS total,
      count(a.id) FILTER (WHERE a.stage = 'shortlisted')::int AS shortlisted,
      count(a.id) FILTER (WHERE a.stage = 'screening')::int AS screening,
      count(a.id) FILTER (WHERE a.stage = 'forwarded')::int AS forwarded,
      (SELECT min(due_at) FROM shares s WHERE s.job_id = j.id AND EXISTS (SELECT 1 FROM applications x WHERE x.job_id = j.id AND x.stage = 'forwarded' AND x.client_decision IS NULL AND s.application_ids @> to_jsonb(x.id))) AS due
    FROM jobs j LEFT JOIN clients c ON c.id = j.client_id LEFT JOIN applications a ON a.job_id = j.id
    WHERE j.status = 'open' GROUP BY j.id, c.name ORDER BY j.created_at DESC LIMIT 8`);

  const calls = await q(`
    SELECT s.status, s.slot_at, s.score, c.name, c.id AS cid, jb.title FROM screenings s
    JOIN applications a ON a.id = s.application_id JOIN candidates c ON c.id = a.candidate_id JOIN jobs jb ON jb.id = a.job_id
    WHERE s.slot_at IS NOT NULL AND (s.slot_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date
    ORDER BY s.slot_at LIMIT 6`);

  const failed = await one(`SELECT count(*)::int AS n FROM files WHERE parse_error IS NOT NULL AND created_at > now() - interval '14 days'`);
  const noAnswer = await one(`SELECT count(*)::int AS n FROM screenings WHERE status = 'no_answer'`);
  const human = await one(`SELECT count(*)::int AS n FROM screenings WHERE status = 'human_requested'`);
  const pendingPosts = await one(`SELECT count(*)::int AS n FROM job_postings p JOIN jobs j ON j.id = p.job_id WHERE j.status = 'open' AND p.status = 'not_posted' AND p.portal IN ('linkedin','naukri','indeed')`);
  const stageCounts = await q(`SELECT stage, count(*)::int AS n FROM applications WHERE updated_at > now() - interval '30 days' GROUP BY stage`);
  const sc = Object.fromEntries(stageCounts.map((r) => [r.stage, r.n]));
  const maxStage = Math.max(1, ...Object.values(sc));

  const alerts = [
    waiting.overdue > 0 && { tone: '#B42318', title: `${waiting.overdue} client decision(s) overdue`, body: 'Past the 24-hour feedback window. Send the client a reminder.', href: '/pipeline' },
    human.n > 0 && { tone: '#B42318', title: `${human.n} candidate(s) asked for a human`, body: 'Call them back personally.', href: '/screening' },
    failed.n > 0 && { tone: '#B54708', title: `${failed.n} resume(s) could not be read`, body: 'Usually scanned images. Check them by hand.', href: '/resumes?failed=1' },
    pendingPosts.n > 0 && { tone: '#175CD3', title: `${pendingPosts.n} portal post(s) still to do`, body: 'Copy the ready-made post and paste it on the portal.', href: '/jobs' },
    noAnswer.n > 0 && { tone: '#98A2B3', title: `${noAnswer.n} call(s) not answered`, body: 'They will be retried automatically.', href: '/screening' },
  ].filter(Boolean);

  return (
    <>
      <section className="hero">
        <div className="titles" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1>Hiring dashboard</h1>
          <p>{new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long' })} · {jobs.n} open requirement(s) across {jobs.clients} client(s)</p>
        </div>
        <div className="row">
          <Link href="/resumes" className="btn">Upload resumes</Link>
          <Link href="/pipeline" className="btn">Open pipeline</Link>
          {can(me, 'jobs.edit') ? <Link href="/jobs/new" className="btn light">New requirement</Link> : null}
        </div>
      </section>

      <Flash msg={sp.msg} />
      {jobs.n === 0 && can(me, 'jobs.edit') ? (
        <form action={loadSample} className="card" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="titles"><h2>Welcome to AvaStars Hire</h2><p className="small muted">Start with a real requirement, or load sample data to try every screen first.</p></div>
          <div className="row">{can(me, 'settings.manage') ? <button className="btn" type="submit">Load sample data</button> : null}<Link href="/jobs/new" className="btn primary">Create first requirement</Link></div>
        </form>
      ) : null}
      <section className="grid-kpi" aria-label="Key numbers">
        <Kpi icon="briefcase" tone="indigo" label="Open requirements" value={jobs.n} note={`${jobs.clients} client(s) · ${jobs.openings} openings`} />
        <Kpi icon="file" tone="teal" label="New resumes (7 days)" value={resumes.n} note={`${strong.n} candidate(s) with a 70%+ match`} noteColor="var(--green)" />
        <Kpi icon="phone" tone="violet" label="AI screening calls today" value={callsToday.done + callsToday.booked} note={`${callsToday.done} done · ${callsToday.booked} booked`} />
        <Kpi icon="clock" tone={waiting.overdue ? 'pink' : 'amber'} label="Awaiting client feedback" value={waiting.n} note={waiting.overdue ? `${waiting.overdue} past the 24-hour SLA` : 'None overdue'} noteColor={waiting.overdue ? 'var(--red)' : undefined} />
      </section>

      <div className="cols">
        <section className="card flush col-main">
          <div className="card-head"><h2>Active requirements</h2><Link href="/jobs" className="small strong" style={{ textDecoration: 'none' }}>All jobs</Link></div>
          {active.length ? (
            <div className="tablewrap">
              <table className="t" style={{ minWidth: 720 }}>
                <thead><tr><th>Role</th><th>Client</th><th>Openings</th><th>Pipeline</th><th>Client feedback</th></tr></thead>
                <tbody>
                  {active.map((r) => {
                    const h = r.due ? hoursLeft(r.due) : null;
                    return (
                      <tr key={r.id}>
                        <td className="namecell"><Link href={`/pipeline?job=${r.id}`}>{r.title}</Link><div>{[r.location, r.work_mode, (r.exp_min || r.exp_max) ? expRange(r.exp_min, r.exp_max) : null].filter(Boolean).join(' · ')}</div></td>
                        <td>{r.client || '—'}</td>
                        <td>{r.openings}</td>
                        <td className="small" style={{ whiteSpace: 'nowrap' }} title="Active · shortlisted · screening · with client">{r.total} · {r.shortlisted} · {r.screening} · {r.forwarded}</td>
                        <td>{h === null ? <Pill tone="gray">Nothing pending</Pill> : h < 0 ? <Pill tone="red">Overdue {-h}h</Pill> : <Pill tone="amber">Due in {h}h</Pill>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <div className="empty">No open jobs yet. <Link href="/jobs/new">Create the first requirement</Link>.</div>}
        </section>

        <aside className="col-side">
          <section className="card">
            <div className="header"><h2>AI calls today</h2><Link href="/screening" className="small strong" style={{ textDecoration: 'none' }}>Open queue</Link></div>
            {calls.length ? calls.map((c, i) => (
              <div key={i} className="row" style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}><Link href={`/candidates/${c.cid}`} className="strong" style={{ color: 'var(--ink)', textDecoration: 'none' }}>{c.name}</Link><span className="tiny muted">{c.title}</span></div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span className="small strong">{fmtDate(c.slot_at).split(', ').pop()}</span>
                  <Pill tone={c.status === 'completed' ? 'green' : c.status === 'calling' ? 'blue' : 'indigo'}>{c.status === 'completed' && c.score ? `Score ${c.score}` : SCREENING_STATUS[c.status]}</Pill>
                </div>
              </div>
            )) : <p className="small muted">No calls booked for today.</p>}
          </section>
          <section className="card">
            <h2>Needs attention</h2>
            {alerts.length ? alerts.map((a, i) => (
              <Link key={i} href={a.href} className="soft" style={{ display: 'flex', gap: 12, textDecoration: 'none', color: 'inherit' }}>
                <span className="dot" style={{ background: a.tone, marginTop: 5 }} aria-hidden="true" />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span className="strong">{a.title}</span><span className="small muted">{a.body}</span></span>
              </Link>
            )) : <p className="small muted">All clear.</p>}
          </section>
        </aside>
      </div>

      <section className="card">
        <div className="header"><h2>Candidates by stage</h2><span className="small muted">Last 30 days</span></div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          {STAGES.map((s) => (
            <Link key={s.id} href="/pipeline" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 14, border: '1px solid var(--line)', borderRadius: 10, textDecoration: 'none', color: 'inherit' }}>
              <span className="small strong" style={{ color: 'var(--ink2)' }}>{s.label}</span>
              <span style={{ fontSize: 22, fontWeight: 700 }}>{sc[s.id] || 0}</span>
              <div className="bar"><div style={{ width: `${Math.max(3, ((sc[s.id] || 0) / maxStage) * 100)}%`, background: s.color }} /></div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
