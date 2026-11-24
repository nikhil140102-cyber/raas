import Link from 'next/link';
import { notFound } from 'next/navigation';
import { q, one, getSetting } from '@/lib/db';
import { requireUser, requirePagePerm } from '@/lib/auth';
import { Header, Pill, Flash } from '@/components/ui';
import { CopyButton } from '@/components/client';
import { fmtDate, appUrl, appUrlProblem } from '@/lib/util';
import { careersUrl, trackedUrl } from '@/lib/posting';
import { PLATFORMS, buildPosts, shareLinks, linkedinConfigured, portalKit } from '@/lib/social';
import { markPosted } from '../../../../_actions/jobs';
import PortalKit from './PortalKit';
import { postToLinkedIn, disconnectLinkedIn } from '../../../../_actions/social';
import PostCard from './PostCard';
import { createSchedule, updateSchedule } from '../../../../_actions/schedules';

export const metadata = { title: 'Announce hiring — AvaStars Hire' };

export default async function AnnouncePage({ params, searchParams }) {
  await requirePagePerm('jobs.post', '/jobs');
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const job = await one('SELECT j.*, c.name AS client FROM jobs j LEFT JOIN clients c ON c.id = j.client_id WHERE j.id = $1', [Number(id)]);
  if (!job) notFound();
  const posts = await buildPosts(job);
  const links = shareLinks(job);
  const postings = Object.fromEntries((await q('SELECT portal, status, url FROM job_postings WHERE job_id = $1', [job.id])).map((p) => [p.portal, p]));
  const link = careersUrl(job);
  const conn = await getSetting(`linkedin:${user.id}`, null);
  const connected = conn && conn.expiresAt > Date.now();
  const history = await q('SELECT s.*, u.name AS who FROM social_posts s LEFT JOIN users u ON u.id = s.posted_by WHERE s.job_id = $1 ORDER BY s.created_at DESC LIMIT 30', [job.id]);
  const local = /localhost|127\.0\.0\.1/.test(appUrl());
  const back = `/jobs/${job.id}/announce`;
  const team = await q(`SELECT id, name, role FROM users WHERE active AND role IN ('admin','hr','intern') ORDER BY name`);
  const schedules = await q(`SELECT s.*, u.name AS assignee, d.name AS done_name FROM post_schedules s LEFT JOIN users u ON u.id = s.assigned_to LEFT JOIN users d ON d.id = s.done_by
    WHERE s.job_id = $1 ORDER BY (s.status = 'pending') DESC, s.scheduled_at DESC LIMIT 20`, [job.id]);
  const istNow = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 16);
  const ist = (d) => new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

  return (
    <>
      <Header
        crumbs={<><Link href="/jobs">Jobs</Link> / <Link href={`/jobs/${job.id}`}>{job.title}</Link> / Announce hiring</>}
        title="Post & announce"
        sub="Sample posts for LinkedIn and social media, plus Indeed and Naukri job forms filled in for you. Pick a sample, edit if needed, then post."
      />
      <nav className="subnav" aria-label="Job sections">
        <Link href={`/jobs/${job.id}`}>Publishing</Link>
        <Link href={`/jobs/${job.id}/announce`} aria-current="page">Post & announce</Link>
        <Link href={`/pipeline?job=${job.id}`}>Candidates</Link>
        <Link href={`/jobs/${job.id}/edit`}>Requirement details</Link>
      </nav>
      <Flash msg={sp.msg} tone={/fail|first|empty|expired/i.test(String(sp.msg || '')) ? 'warn' : 'ok'} />
      {job.status !== 'open' ? <div className="notice warn">This job is closed, so the apply page shows it as closed. Reopen it before sharing.</div> : null}
      {appUrlProblem() ? <div className="notice warn" role="alert"><strong>Check APP_URL in Vercel.</strong> {appUrlProblem()}</div> : null}
      {local ? (
        <div className="notice warn">
          The apply link is <strong>{link}</strong>. That only works on this computer. Put the app online (or start a temporary public link, see the README) and set APP_URL to the public address so shared links work for everyone.
        </div>
      ) : null}

      <div className="cols">
        <section className="col-main">
          <h2>Social media posts</h2>
          {PLATFORMS.map((p) => (
            <PostCard key={p.id} jobId={job.id} platform={p.id} name={p.name} hint={p.hint} samples={posts[p.id]} shareUrl={links[p.id]} link={trackedUrl(job, p.id)} defaultOpen={p.id === 'linkedin'}>
              {p.id === 'linkedin' && connected ? (
                <form id="li-form-linkedin" action={postToLinkedIn}>
                  <input type="hidden" name="job_id" value={job.id} />
                  <button className="btn sm ai" type="submit">Post now on my LinkedIn</button>
                </form>
              ) : null}
            </PostCard>
          ))}

          <h2 style={{ marginTop: 12 }}>Job portals</h2>
          {['indeed', 'naukri'].map((portal) => {
            const row = postings[portal] || {};
            return (
              <PortalKit key={portal} kit={portalKit(job, portal)}>
                <form action={markPosted} className="row" style={{ alignItems: 'flex-end', gap: 10 }}>
                  <input type="hidden" name="job_id" value={job.id} /><input type="hidden" name="portal" value={portal} />
                  <label className="field" style={{ flex: '1 1 280px' }}>After publishing, paste the live job link<input name="url" type="url" defaultValue={row.url || ''} placeholder="https://…" /></label>
                  <button className="btn sm primary" type="submit" style={{ minHeight: 44 }}>{row.status === 'posted' ? 'Update link' : 'Mark as posted'}</button>
                  {row.status === 'posted' ? <Pill tone="green">Posted</Pill> : null}
                </form>
              </PortalKit>
            );
          })}
        </section>

        <aside className="col-side">
          <section className="card">
            <h2>Apply link</h2>
            <p className="small" style={{ wordBreak: 'break-all' }}>{link}</p>
            <div className="row" style={{ gap: 8 }}><CopyButton text={link} label="Copy link" /><a className="btn sm" href={link} target="_blank" rel="noreferrer">Open</a></div>
            <p className="tiny muted">Anyone can open it and apply. No login needed. The link preview shows the job title, location and salary.</p>
            <CopyButton text={appUrl('/careers')} label="Copy link to all open jobs" />
          </section>

          <section id="schedule" className="card">
            <h2>Schedule posting on Indeed / LinkedIn</h2>
            <p className="tiny muted">At the chosen time the person you pick gets a reminder on their dashboard and in the AvaStars Chrome extension. The extension fills the portal&apos;s form; they check it and click Publish.</p>
            <form action={createSchedule} className="stack" style={{ gap: 8 }}>
              <input type="hidden" name="job_id" value={job.id} />
              <div className="row" style={{ gap: 14 }}>
                <label className="row small" style={{ gap: 6 }}><input type="checkbox" name="portal" value="indeed" defaultChecked /> Indeed</label>
                <label className="row small" style={{ gap: 6 }}><input type="checkbox" name="portal" value="linkedin" defaultChecked /> LinkedIn</label>
              </div>
              <label className="field">When (India time)<input type="datetime-local" name="when" min={istNow} defaultValue={istNow} required /></label>
              <label className="field">Who publishes it
                <select name="assigned_to" defaultValue={user.id}>
                  {team.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.role === 'hr' ? 'HR' : t.role === 'admin' ? 'Admin' : 'Intern'})</option>)}
                  <option value="">Anyone in the team</option>
                </select>
              </label>
              <label className="field">Note (optional)<input name="note" maxLength={300} placeholder="e.g. Post as sponsored, ₹500 budget" /></label>
              <button className="btn primary sm" type="submit">Schedule</button>
            </form>
            {schedules.length ? (
              <div className="stack" style={{ gap: 6 }}>
                {schedules.map((s) => (
                  <div key={s.id} className="row small" style={{ justifyContent: 'space-between', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                    <span>
                      <strong>{s.portal === 'indeed' ? 'Indeed' : 'LinkedIn'}</strong> · {ist(s.scheduled_at)} · {s.assignee || 'anyone'}
                      {s.note ? <span className="tiny muted"> · {s.note}</span> : null}
                    </span>
                    {s.status === 'pending' ? (
                      <span className="row" style={{ gap: 4 }}>
                        <Pill tone={new Date(s.scheduled_at) <= new Date() ? 'amber' : 'blue'}>{new Date(s.scheduled_at) <= new Date() ? 'Due' : 'Scheduled'}</Pill>
                        <form action={updateSchedule}><input type="hidden" name="id" value={s.id} /><button className="linkbtn tiny" name="action" value="delete" type="submit">Remove</button></form>
                      </span>
                    ) : <Pill tone={s.status === 'done' ? 'green' : 'gray'}>{s.status === 'done' ? `Published${s.done_name ? ` by ${s.done_name}` : ''}` : 'Skipped'}</Pill>}
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="card">
            <h2>Post directly on LinkedIn</h2>
            {!linkedinConfigured() ? (
              <p className="small muted">Optional. Add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET (a free LinkedIn developer app with “Share on LinkedIn”) to post with one click. Until then, use “Copy + open LinkedIn”.</p>
            ) : connected ? (
              <>
                <p className="small">Connected as <strong>{conn.name}</strong> until {fmtDate(conn.expiresAt, false)}.</p>
                <form action={disconnectLinkedIn}><input type="hidden" name="job_id" value={job.id} /><button className="linkbtn" type="submit">Disconnect</button></form>
              </>
            ) : (
              <>
                <p className="small muted">Posts go on your personal profile. Company page posting needs LinkedIn&apos;s approval (Community Management API); until then, reshare your post to the page.</p>
                <a className="btn" href={`/api/linkedin/connect?back=${encodeURIComponent(back)}`}>Connect my LinkedIn</a>
              </>
            )}
          </section>

          <section className="card">
            <h2>How it works</h2>
            <ol className="small" style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, color: 'var(--ink2)' }}>
              <li>Pick a sample style (Professional, Short &amp; quick, Referral ask).</li>
              <li>Edit the text if you like.</li>
              <li>Click Share or Copy + open. The post opens in that app.</li>
              <li>For Indeed and Naukri, copy each field into their job form, then paste the live link back here.</li>
            </ol>
          </section>

          <section id="history" className="card">
            <h2>Share history</h2>
            {history.length ? history.map((h) => (
              <div key={h.id} className="row small" style={{ justifyContent: 'space-between', gap: 8 }}>
                <span><span className="strong">{PLATFORMS.find((p) => p.id === h.platform)?.name || { indeed: 'Indeed', naukri: 'Naukri', x: 'X (Twitter)', facebook: 'Facebook', instagram: 'Instagram' }[h.platform] || h.platform}</span> · {h.who || '—'} · {fmtDate(h.created_at)}</span>
                {h.status === 'posted' && h.url ? <a href={h.url} target="_blank" rel="noreferrer">{['indeed', 'naukri'].includes(h.platform) ? 'View job' : 'View post'}</a> : <Pill tone={h.status === 'failed' ? 'red' : 'green'}>{h.status}</Pill>}
              </div>
            )) : <p className="small muted">Nothing shared yet.</p>}
          </section>
        </aside>
      </div>
    </>
  );
}
