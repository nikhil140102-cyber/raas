import Link from 'next/link';
import { q } from '@/lib/db';
import { requirePagePerm } from '@/lib/auth';
import { Header, Flash, Score, Pill } from '@/components/ui';
import { AutoSelect } from '@/components/client';
import { fmtDate } from '@/lib/util';
import { SOURCING_STATUSES, sourcingLinks } from '@/lib/sourcing';
import { setSourcingStatus, addProspectToJob } from '../../_actions/sourcing';

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
        </section>
        <aside className="col-side">
          <section className="card">
            <h2>How sourcing works</h2>
            <ol className="small" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
              <li>Build searches from skills or a job.</li>
              <li>Open them; look for the green <strong>#OpenToWork</strong> frame or headline.</li>
              <li>On a good profile click <strong>Save to AvaStars</strong>.</li>
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
    </>
  );
}
