import Link from 'next/link';
import { q } from '@/lib/db';
import { requirePagePerm } from '@/lib/auth';
import { Header, Flash, Score, Pill } from '@/components/ui';
import { AutoSelect } from '@/components/client';
import { fmtDate } from '@/lib/util';
import { SOURCING_STATUSES, sourcingLinks, WEEKLY_INVITE_LIMIT } from '@/lib/sourcing';
import ConnectButton from '@/components/ConnectButton';
import { setSourcingStatus, addProspectToJob, scoreProspects } from '../../_actions/sourcing';

export const metadata = { title: 'Sourcing — AvaStars Hire' };

export default async function SourcingPage({ searchParams }) {
  const sp = await searchParams;
  await requirePagePerm('candidates.edit', '/');
  const jobs = await q(`SELECT j.id, j.title, j.location, j.mandatory_skills, c.name AS client FROM jobs j LEFT JOIN clients c ON c.id = j.client_id WHERE j.status IN ('open','paused') ORDER BY j.created_at DESC`);
  const job = jobs.find((j) => String(j.id) === String(sp.job || ''));
  // Fill the search from the chosen job unless the user typed their own.
  const skillsText = sp.skills ?? (job ? (job.mandatory_skills || []).slice(0, 4).join(', ') : '');
  const title = sp.title ?? (job ? job.title : '');
  const location = sp.location ?? (job ? String(job.location || '').replace(/\(.*?\)/g, '').trim() : '');
  const openToWork = sp.otw !== '0';
  const searched = Boolean(skillsText || title);
  const links = searched ? sourcingLinks({ skills: skillsText.split(','), title, location, openToWork }) : [];
  const status = SOURCING_STATUSES.some(([v]) => v === sp.status) ? sp.status : '';
  const prospects = await q(
    `SELECT c.id, c.name, c.current_title, c.current_company, c.location, c.profile_url, c.sourcing_status, c.open_to_work, c.created_at, c.sourced_job_id,
            j.title AS job_title, s.score,
            (SELECT count(*) FROM applications a WHERE a.candidate_id = c.id)::int AS in_pipeline
       FROM candidates c LEFT JOIN jobs j ON j.id = c.sourced_job_id LEFT JOIN candidate_scores s ON s.candidate_id = c.id AND s.job_id = c.sourced_job_id
      WHERE c.sourcing_status IS NOT NULL AND ($1 = '' OR c.sourcing_status = $1)
      ORDER BY c.created_at DESC LIMIT 200`, [status]);
  const counts = Object.fromEntries((await q(`SELECT sourcing_status AS s, count(*)::int AS n FROM candidates WHERE sourcing_status IS NOT NULL GROUP BY 1`)).map((r) => [r.s, r.n]));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const back = `/sourcing${status ? `?status=${status}` : ''}`;
  const top = job ? await q(
    `SELECT c.id, c.name, c.current_title, c.current_company, c.location, c.profile_url, c.open_to_work, c.sourcing_status, c.connect_sent_at, s.score,
            (SELECT count(*) FROM applications a WHERE a.candidate_id = c.id AND a.job_id = $1)::int AS in_job
       FROM candidates c JOIN candidate_scores s ON s.candidate_id = c.id AND s.job_id = $1
      WHERE c.sourcing_status IS NOT NULL AND c.sourcing_status <> 'not_interested'
      ORDER BY s.score DESC, c.open_to_work DESC NULLS LAST, c.created_at DESC LIMIT 20`, [job.id]) : [];
  const unscored = job ? (await q(`SELECT count(*)::int AS n FROM candidates c WHERE c.sourcing_status IS NOT NULL AND NOT EXISTS (SELECT 1 FROM candidate_scores s WHERE s.candidate_id = c.id AND s.job_id = $1)`, [job.id]))[0].n : 0;
  const inv = (await q(`SELECT count(*) FILTER (WHERE connect_sent_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata')::int AS today,
      count(*) FILTER (WHERE connect_sent_at >= now() - interval '7 days')::int AS week, count(connect_sent_at)::int AS total,
      count(*) FILTER (WHERE connect_sent_at IS NOT NULL AND sourcing_status IN ('connected','messaged','replied','interested'))::int AS accepted
    FROM candidates WHERE sourcing_status IS NOT NULL`))[0];
  const requests = await q(`SELECT c.id, c.name, c.current_title, c.profile_url, c.connect_sent_at, c.sourcing_status, u.name AS by_name FROM candidates c LEFT JOIN users u ON u.id = c.connect_sent_by
    WHERE c.connect_sent_at IS NOT NULL ORDER BY c.connect_sent_at DESC LIMIT 50`);

  return (
    <>
      <Header title="Sourcing" sub="Find people who are open to work, save the good ones from LinkedIn with the Chrome extension, and track your outreach." />
      <Flash msg={sp.msg} />
      <div className="cols">
        <section className="col-main stack" style={{ gap: 16 }}>
          <section className="card">
            <h2>1. Search</h2>
            <form method="get" className="stack" style={{ gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                <label className="field">For job (optional)
                  <select name="job" defaultValue={sp.job || ''}>
                    <option value="">— no job —</option>
                    {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}{j.client ? ` · ${j.client}` : ''}</option>)}
                  </select>
                </label>
                <label className="field">Job title / role<input name="title" defaultValue={title} placeholder="e.g. Site Reliability Engineer" /></label>
                <label className="field">Skills (comma separated)<input name="skills" defaultValue={skillsText} placeholder="e.g. Kubernetes, Terraform, GCP" /></label>
                <label className="field">Location<input name="location" defaultValue={location} placeholder="e.g. Pune" /></label>
              </div>
              <label className="row small" style={{ gap: 6 }}><input type="hidden" name="otw" value="0" /><input type="checkbox" name="otw" value="1" defaultChecked={openToWork} /> Only people who say they are open to work</label>
              <div><button className="btn primary" type="submit">Build searches</button></div>
              <p className="tiny muted">Pick a job and leave the boxes empty to use its title, top skills and city.</p>
            </form>
          </section>

          {links.length ? (
            <section className="card">
              <h2>2. Open a search and save the right people</h2>
              <div className="stack" style={{ gap: 10 }}>
                {links.map((l) => (
                  <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                    <div><div className="strong">{l.name}</div><div className="tiny muted">{l.hint}</div></div>
                    <a className="btn sm primary" href={l.url} target="_blank" rel="noreferrer" aria-label={`Open ${l.name}`}>Open</a>
                  </div>
                ))}
              </div>
              <p className="small" style={{ margin: 0 }}>Open a promising profile on LinkedIn and click <strong>Save to AvaStars</strong> (the extension adds the button on every profile){job ? <> — set the extension&apos;s <em>Add them to</em> to <strong>{job.title}</strong> to get a match %</> : ''}.</p>
              <p className="tiny muted" style={{ margin: 0 }}>LinkedIn doesn&apos;t allow software to collect profiles automatically, so you choose and save people one by one. That keeps your LinkedIn account safe.</p>
            </section>
          ) : null}
          {job ? (
            <section className="card" id="top">
              <div className="row" style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0 }}>3. Top {top.length || 20} for {job.title}</h2>
                {unscored ? (
                  <form action={scoreProspects}><input type="hidden" name="job_id" value={job.id} /><button className="btn sm" type="submit">Score {unscored} more saved prospect(s) for this job</button></form>
                ) : null}
              </div>
              {top.length ? (
                <div className="tablewrap">
                  <table>
                    <thead><tr><th>#</th><th>Person</th><th>Location</th><th>Match</th><th>LinkedIn</th></tr></thead>
                    <tbody>
                      {top.map((p, i) => (
                        <tr key={p.id}>
                          <td className="small muted">{i + 1}</td>
                          <td>
                            <Link href={`/candidates/${p.id}`} className="strong">{p.name}</Link>{p.open_to_work ? <> <Pill tone="green">Open to work</Pill></> : null}
                            <div className="tiny muted">{[p.current_title, p.current_company].filter(Boolean).join(' · ') || '—'}</div>
                          </td>
                          <td className="small">{p.location || '—'}</td>
                          <td><Score value={p.score} /></td>
                          <td><ConnectButton id={p.id} url={p.profile_url} sentAt={p.connect_sent_at ? new Date(p.connect_sent_at).toISOString() : null} name={p.name} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="small muted">No saved prospects scored for this job yet. Open the searches above and click <strong>Save</strong> next to good people (search results) or <strong>Save to AvaStars</strong> on a profile.</p>}
              <p className="tiny muted" style={{ margin: 0 }}>&quot;Connect on LinkedIn&quot; opens the profile; click LinkedIn&apos;s Connect there. Requests you send on LinkedIn are also counted automatically by the extension.</p>
            </section>
          ) : null}
        </section>
        <aside className="col-side">
          <section className="card">
            <h2>LinkedIn connection requests</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <div><div className="tiny muted">Today</div><div className="strong" style={{ fontSize: 22 }}>{inv.today}</div></div>
              <div><div className="tiny muted">Last 7 days</div><div className="strong" style={{ fontSize: 22 }}>{inv.week}</div></div>
              <div><div className="tiny muted">All time</div><div className="strong" style={{ fontSize: 22 }}>{inv.total}</div></div>
            </div>
            <div className="bar" style={{ height: 8 }} role="img" aria-label={`${inv.week} of about ${WEEKLY_INVITE_LIMIT} weekly LinkedIn requests used`}><div style={{ width: `${Math.min(100, (inv.week / WEEKLY_INVITE_LIMIT) * 100)}%`, background: inv.week >= WEEKLY_INVITE_LIMIT * 0.8 ? 'var(--amber, #B54708)' : undefined }} /></div>
            <p className="tiny muted" style={{ margin: 0 }}>{inv.week} of about {WEEKLY_INVITE_LIMIT} per week LinkedIn allows.{inv.week >= WEEKLY_INVITE_LIMIT * 0.8 ? ' Slow down to keep your account safe.' : ''} {inv.total ? `${inv.accepted} of ${inv.total} accepted or further.` : ''}</p>
            <a className="btn sm" href="#requests">See all requests</a>
          </section>
          <section className="card">
            <h2>How sourcing works</h2>
            <ol className="small" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
              <li>Build searches from skills or a job.</li>
              <li>Open them; look for the green <strong>#OpenToWork</strong> frame or headline.</li>
              <li>Click <strong>Save</strong> next to good people in the results (or <strong>Save to AvaStars</strong> on a profile).</li>
              <li>Pick a job to see your <strong>Top 20</strong> ranked by match, and connect with them.</li>
              <li>Message them on LinkedIn, then update their status here.</li>
              <li>When they send a CV in chat, use <strong>Send to AvaStars</strong> under the file — they move into the pipeline.</li>
            </ol>
            <p className="tiny muted">Need filters like &quot;open to work&quot; across thousands of people? That&apos;s LinkedIn Recruiter Lite or Naukri Resdex (paid).</p>
          </section>
        </aside>
      </div>

      <section className="card" id="prospects">
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <h2 style={{ margin: 0 }}>Prospects ({total})</h2>
          <nav className="tabs" aria-label="Prospect status">
            <Link href="/sourcing#prospects" aria-current={!status ? 'page' : undefined}>All ({total})</Link>
            {SOURCING_STATUSES.map(([v, l]) => <Link key={v} href={`/sourcing?status=${v}#prospects`} aria-current={status === v ? 'page' : undefined}>{l} ({counts[v] || 0})</Link>)}
          </nav>
        </div>
        {prospects.length ? (
          <div className="tablewrap">
            <table>
              <thead><tr><th>Person</th><th>Location</th><th>Saved for</th><th>Match</th><th>Status</th><th>Next</th></tr></thead>
              <tbody>
                {prospects.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/candidates/${p.id}`} className="strong">{p.name}</Link>
                      {p.open_to_work ? <> <Pill tone="green">Open to work</Pill></> : null}
                      <div className="tiny muted">{[p.current_title, p.current_company].filter(Boolean).join(' · ') || '—'}</div>
                      {p.profile_url ? <a className="tiny" href={p.profile_url} target="_blank" rel="noreferrer">LinkedIn profile ↗</a> : null}
                    </td>
                    <td className="small">{p.location || '—'}</td>
                    <td className="small">{p.job_title || '—'}<div className="tiny muted">saved {fmtDate(p.created_at)}</div></td>
                    <td>{p.score !== null && p.score !== undefined ? <Score value={p.score} /> : <span className="tiny muted">—</span>}</td>
                    <td><AutoSelect action={setSourcingStatus} name="status" value={p.sourcing_status} options={SOURCING_STATUSES.map(([value, label]) => ({ value, label }))} hidden={{ cand_id: p.id }} /></td>
                    <td>
                      {p.in_pipeline ? <Pill tone="blue">In pipeline</Pill> : (
                        <form action={addProspectToJob} className="row" style={{ gap: 6 }}>
                          <input type="hidden" name="cand_id" value={p.id} />
                          <input type="hidden" name="back" value={back} />
                          <select name="job_id" defaultValue={p.sourced_job_id || ''} aria-label={`Job for ${p.name}`} style={{ maxWidth: 170 }}>
                            <option value="">Job…</option>
                            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
                          </select>
                          <button className="btn sm" type="submit">Add to pipeline</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="small muted">No prospects yet. Build a search, open a profile on LinkedIn and click <strong>Save to AvaStars</strong>.</p>}
      </section>

      <section className="card" id="requests">
        <h2>Connection requests sent ({inv.total})</h2>
        {requests.length ? (
          <div className="tablewrap">
            <table>
              <thead><tr><th>Person</th><th>Sent</th><th>By</th><th>Status now</th></tr></thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/candidates/${r.id}`} className="strong">{r.name}</Link><div className="tiny muted">{r.current_title || '—'}</div>{r.profile_url ? <a className="tiny" href={r.profile_url} target="_blank" rel="noreferrer">LinkedIn ↗</a> : null}</td>
                    <td className="small">{new Date(r.connect_sent_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
                    <td className="small">{r.by_name || '—'}</td>
                    <td><AutoSelect action={setSourcingStatus} name="status" value={r.sourcing_status} options={SOURCING_STATUSES.map(([value, label]) => ({ value, label }))} hidden={{ cand_id: r.id }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="small muted">No connection requests recorded yet.</p>}
        <p className="tiny muted" style={{ margin: 0 }}>When someone accepts, set their status to <strong>Connected</strong> (or Messaged / Replied as the chat goes on).</p>
      </section>
    </>
  );
}
