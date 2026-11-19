import Link from 'next/link';
import { notFound } from 'next/navigation';
import { q, one } from '@/lib/db';
import { Header, Pill } from '@/components/ui';
import { CopyButton, ConfirmButton } from '@/components/client';
import { PORTALS, expRange, ctcRange, fmtDate } from '@/lib/util';
import { portalPost, portalUrl, careersUrl } from '@/lib/posting';
import { markPosted, setJobStatus } from '../../../_actions/jobs';
import MatchRunner from '@/components/MatchRunner';

const STATUS = {
  live: ['Live', 'green'], submitted: ['Indexed via careers page', 'green'], posted: ['Posted', 'green'],
  not_posted: ['Not posted yet', 'amber'], closed: ['Closed', 'gray'], close_manually: ['Close it on the portal', 'red'],
};
const DETAIL = {
  careers: 'Published automatically with Google for Jobs markup.',
  google: 'Google reads the job from your careers page structured data. Make sure the careers page is on your real domain.',
  indeed: 'Direct posting needs Indeed partner approval (Job Sync API). Until then, copy the post and paste it on Indeed.',
  linkedin: 'LinkedIn is not accepting new job-posting API partners. Copy the post, publish it on LinkedIn, then save the live link.',
  naukri: 'Automatic posting needs a Naukri subscription plus their paid integration module. Until then, copy and paste.',
  social: 'Ready-made post for the LinkedIn feed, WhatsApp groups and Instagram.',
};

export default async function JobPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const job = await one('SELECT j.*, c.name AS client FROM jobs j LEFT JOIN clients c ON c.id = j.client_id WHERE j.id = $1', [Number(id)]);
  if (!job) notFound();
  const postings = Object.fromEntries((await q('SELECT * FROM job_postings WHERE job_id = $1', [job.id])).map((p) => [p.portal, p]));
  const sources = await q(`SELECT COALESCE(source, 'Unknown') AS source, count(*)::int AS n FROM applications WHERE job_id = $1 GROUP BY 1 ORDER BY 2 DESC`, [job.id]);
  const total = await one('SELECT count(*)::int AS n FROM applications WHERE job_id = $1', [job.id]);
  const maxSrc = Math.max(1, ...sources.map((s) => s.n));
  const link = careersUrl(job);

  return (
    <>
      <Header
        crumbs={<><Link href="/jobs">Jobs</Link>{job.client ? <> / <Link href={`/clients/${job.client_id}`}>{job.client}</Link></> : null}</>}
        title={<div className="row" style={{ gap: 10 }}><h1>{job.title}</h1><Pill tone={job.status === 'open' ? 'green' : 'gray'}>{job.status === 'open' ? 'Open' : 'Closed'}</Pill></div>}
        sub={`${job.location || '—'} · ${job.work_mode} · ${expRange(job.exp_min, job.exp_max)} · ${ctcRange(job.ctc_min, job.ctc_max)} · ${job.openings} opening(s) · ${job.employment_type}${job.joining_timeline ? ` · ${job.joining_timeline}` : ''}`}
      >
        <Link href={`/jobs/${job.id}/edit`} className="btn">Edit job</Link>
        <form action={setJobStatus}>
          <input type="hidden" name="job_id" value={job.id} />
          <input type="hidden" name="status" value={job.status === 'open' ? 'closed' : 'open'} />
          {job.status === 'open' ? <ConfirmButton message="Close this job? It comes off your careers page right away.">Close job</ConfirmButton> : <button className="btn" type="submit">Reopen job</button>}
        </form>
      </Header>

      {sp.new ? <div className="notice ok" role="status">Job created and live on your careers page. Resumes already in your database are being scored against it now; strong matches go straight into the pipeline. Next: <Link href={`/jobs/${job.id}/announce`}>post it on LinkedIn, Indeed, Naukri, WhatsApp and more →</Link></div> : null}
      <nav className="subnav" aria-label="Job sections">
        <Link href={`/jobs/${job.id}`} aria-current="page">Publishing</Link>
        <Link href={`/jobs/${job.id}/announce`}>Post & announce</Link>
        <Link href={`/pipeline?job=${job.id}`}>Candidates ({total.n})</Link>
        <Link href={`/screening?job=${job.id}`}>AI screening</Link>
        <Link href={`/jobs/${job.id}/edit`}>Requirement details</Link>
      </nav>

      <div className="cols">
        <section className="col-main">
          <div className="header"><h2>Where this job is posted</h2><span className="small muted">Applications from every portal flow into one pipeline</span></div>
          {PORTALS.map((p) => {
            const row = postings[p.id] || { status: 'not_posted' };
            const [label, tone] = STATUS[row.status] || [row.status, 'gray'];
            const post = portalPost(job, p.id);
            const assisted = ['linkedin', 'indeed', 'naukri'].includes(p.id);
            return (
              <article key={p.id} className="card" style={{ gap: 12 }}>
                <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
                  <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div className="row" style={{ gap: 8 }}><h3>{p.name}</h3><Pill tone={p.mode === 'Automatic' ? 'green' : 'indigo'}>{p.mode}</Pill></div>
                    <span className="small muted">{DETAIL[p.id]}</span>
                    {row.url ? <a href={row.url} target="_blank" rel="noreferrer" className="small" style={{ wordBreak: 'break-all' }}>{row.url}</a> : null}
                    {row.posted_at ? <span className="tiny muted">Since {fmtDate(row.posted_at, false)}</span> : null}
                  </div>
                  <Pill tone={tone}>{label}</Pill>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  {p.id === 'careers' ? <><a href={link} target="_blank" rel="noreferrer" className="btn sm">View page</a><CopyButton text={link} label="Copy link" /></> : null}
                  {p.id === 'google' ? <a href={`https://search.google.com/test/rich-results?url=${encodeURIComponent(link)}`} target="_blank" rel="noreferrer" className="btn sm">Test Google markup</a> : null}
                  {assisted || p.id === 'social' ? <CopyButton text={post} label="Copy post" /> : null}
                  {portalUrl(p.id) ? <a href={portalUrl(p.id)} target="_blank" rel="noreferrer" className="btn sm">Open {p.name}</a> : null}
                </div>
                {assisted ? (
                  <form action={markPosted} className="row" style={{ alignItems: 'flex-end', gap: 10 }}>
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="portal" value={p.id} />
                    <label className="field" style={{ flex: '1 1 300px' }}>Live job link on {p.name}<input name="url" type="url" defaultValue={row.url || ''} placeholder="https://…" /></label>
                    <button className="btn primary sm" type="submit" style={{ minHeight: 44 }}>{row.status === 'posted' ? 'Update link' : 'Mark as posted'}</button>
                  </form>
                ) : null}
                {assisted || p.id === 'social' ? (
                  <details>
                    <summary className="small strong" style={{ cursor: 'pointer', color: 'var(--accent)' }}>Preview post</summary>
                    <p className="soft small pre" style={{ marginTop: 8 }}>{post}</p>
                  </details>
                ) : null}
              </article>
            );
          })}
        </section>

        <aside className="col-side">
          <section className="card">
            <h2>Applications by source</h2>
            {sources.length ? sources.map((s) => (
              <div key={s.source} className="stack" style={{ gap: 6 }}>
                <div className="row small" style={{ justifyContent: 'space-between' }}><span>{s.source}</span><span className="strong">{s.n}</span></div>
                <div className="bar" style={{ height: 8 }}><div style={{ width: `${(s.n / maxSrc) * 100}%` }} /></div>
              </div>
            )) : <p className="small muted">No applications yet.</p>}
          </section>
          <section className="card">
            <h2>Find people you already have</h2>
            <p className="small muted">Scores every resume in the database against this job. Everyone gets a match %; anyone at {job.min_score}% or above is added to the pipeline.</p>
            <MatchRunner jobs={[{ id: job.id, title: job.title }]} auto={!!sp.new && job.status === 'open'} label="Match database resumes to this job" />
            <MatchRunner jobs={[{ id: job.id, title: job.title }]} force label="Re-score everyone (after editing the job)" className="btn sm" />
          </section>
          <section className="card">
            <h2>Screening questions</h2>
            {(job.screening_questions || []).length ? (
              <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }} className="small">
                {job.screening_questions.map((x, i) => <li key={i}>{x.q}</li>)}
              </ol>
            ) : <p className="small muted">None yet. <Link href={`/jobs/${job.id}/edit`}>Add questions</Link> so the AI can screen candidates.</p>}
          </section>
        </aside>
      </div>
    </>
  );
}
