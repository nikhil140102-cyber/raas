import Link from 'next/link';
import { notFound } from 'next/navigation';
import { q, one, getSetting } from '@/lib/db';
import { requireUser, requirePagePerm } from '@/lib/auth';
import { Header, Pill, Flash } from '@/components/ui';
import { CopyButton } from '@/components/client';
import { fmtDate, appUrl, appUrlProblem } from '@/lib/util';
import { careersUrl, trackedUrl } from '@/lib/posting';
import { PLATFORMS, buildPosts, shareLinks, portalKit } from '@/lib/social';
import FoldCard from '@/components/FoldCard';
import { markPosted } from '../../../../_actions/jobs';
import PortalKit from './PortalKit';
import { postToLinkedIn } from '../../../../_actions/social';
import PostCard from './PostCard';

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
              <PortalKit key={portal} portal={portal} kit={portalKit(job, portal)}>
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
          <FoldCard id="side-apply" title="Apply link" defaultOpen>
            <p className="small" style={{ wordBreak: 'break-all' }}>{link}</p>
            <div className="row" style={{ gap: 8 }}><CopyButton text={link} label="Copy link" /><a className="btn sm" href={link} target="_blank" rel="noreferrer">Open</a></div>
            <p className="tiny muted">Anyone can open it and apply. No login needed. The link preview shows the job title, location and salary.</p>
            <CopyButton text={appUrl('/careers')} label="Copy link to all open jobs" />
          </FoldCard>

          <FoldCard id="side-how" title="How it works">
            <ol className="small" style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, color: 'var(--ink2)' }}>
              <li>Pick a sample style (Professional, Short &amp; quick, Referral ask).</li>
              <li>Edit the text if you like.</li>
              <li>Click Share or Copy + open. The post opens in that app.</li>
              <li>For Indeed and Naukri, copy each field into their job form, then paste the live link back here.</li>
              <li>With the AvaStars extension, “Create post on LinkedIn” writes the post for you; you click Post.</li>
            </ol>
          </FoldCard>

          <FoldCard id="side-history" anchor="history" title="Share history" defaultOpen>
            {history.length ? history.map((h) => (
              <div key={h.id} className="row small" style={{ justifyContent: 'space-between', gap: 8 }}>
                <span><span className="strong">{PLATFORMS.find((p) => p.id === h.platform)?.name || { indeed: 'Indeed', naukri: 'Naukri', x: 'X (Twitter)', facebook: 'Facebook', instagram: 'Instagram' }[h.platform] || h.platform}</span> · {h.who || '—'} · {fmtDate(h.created_at)}</span>
                {h.status === 'posted' && h.url ? <a href={h.url} target="_blank" rel="noreferrer">{['indeed', 'naukri'].includes(h.platform) ? 'View job' : 'View post'}</a> : <Pill tone={h.status === 'failed' ? 'red' : 'green'}>{h.status}</Pill>}
              </div>
            )) : <p className="small muted">Nothing shared yet.</p>}
          </FoldCard>
        </aside>
      </div>
    </>
  );
}
