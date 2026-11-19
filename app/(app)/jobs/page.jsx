import Link from 'next/link';
import { q } from '@/lib/db';
import { Header, Pill } from '@/components/ui';
import { expRange, ctcRange, fmtDate } from '@/lib/util';

export const metadata = { title: 'Jobs — AvaStars Hire' };

export default async function JobsPage({ searchParams }) {
  const sp = await searchParams;
  const status = sp.status === 'closed' ? 'closed' : 'open';
  const jobs = await q(`
    SELECT j.*, c.name AS client,
      count(DISTINCT a.id) FILTER (WHERE a.stage <> 'rejected')::int AS active,
      (SELECT count(*)::int FROM job_postings p WHERE p.job_id = j.id AND p.status IN ('live','posted','submitted')) AS posted,
      (SELECT count(*)::int FROM job_postings p WHERE p.job_id = j.id AND p.status = 'not_posted' AND p.portal IN ('linkedin','indeed','naukri')) AS todo
    FROM jobs j LEFT JOIN clients c ON c.id = j.client_id LEFT JOIN applications a ON a.job_id = j.id
    WHERE j.status = $1 GROUP BY j.id, c.name ORDER BY j.created_at DESC`, [status]);
  return (
    <>
      <Header title="Jobs & posting" sub="Every requirement, and where it is posted">
        <Link href="/jobs/new" className="btn primary">New requirement</Link>
      </Header>
      <nav className="tabs" aria-label="Job status">
        <Link href="/jobs" aria-current={status === 'open' ? 'page' : undefined}>Open</Link>
        <Link href="/jobs?status=closed" aria-current={status === 'closed' ? 'page' : undefined}>Closed</Link>
      </nav>
      <div className="card flush">
        {jobs.length ? (
          <div className="tablewrap">
            <table className="t" style={{ minWidth: 900 }}>
              <thead><tr><th>Role</th><th>Client</th><th>Experience</th><th>CTC</th><th>Openings</th><th>Candidates</th><th>Portals</th><th>Created</th></tr></thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td className="namecell"><Link href={`/jobs/${j.id}`}>{j.title}</Link><div>{j.location} · {j.work_mode}</div></td>
                    <td>{j.client || '—'}</td><td>{expRange(j.exp_min, j.exp_max)}</td><td>{ctcRange(j.ctc_min, j.ctc_max)}</td><td>{j.openings}</td>
                    <td><Link href={`/pipeline?job=${j.id}`}>{j.active}</Link></td>
                    <td>{j.todo ? <Pill tone="amber">{j.todo} to post</Pill> : <Pill tone="green">{j.posted} live</Pill>}</td>
                    <td className="small muted">{fmtDate(j.created_at, false)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty">No {status} jobs.</div>}
      </div>
    </>
  );
}
