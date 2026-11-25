import { q, one } from '@/lib/db';
import { json, preflight, inboundGuard } from '@/lib/inbound';

export const runtime = 'nodejs';

/** "I've published it": marks the job as posted on the portal (with its live link) and closes the schedule. */
export async function POST(req) {
  const auth = await inboundGuard(req);
  if (auth.res) return auth.res;
  const b = await req.json().catch(() => ({}));
  const portal = ['indeed', 'linkedin', 'linkedin_post'].includes(b.portal) ? b.portal : null;
  const jobId = Number(b.job_id) || 0;
  if (!portal || !(await one('SELECT id FROM jobs WHERE id = $1', [jobId]))) return json({ error: 'Unknown job or portal.' }, 400);
  const url = /^https?:\/\//.test(String(b.url || '')) ? String(b.url).slice(0, 500) : null;
  const uid = auth.user?.id ?? null;
  if (portal === 'linkedin_post') {
    // A feed post was published (or scheduled on LinkedIn) from the extension.
    await q(`INSERT INTO social_posts (job_id, platform, body, status, url, posted_by) VALUES ($1,'linkedin',$2,'posted',$3,$4)`,
      [jobId, String(b.text || 'LinkedIn post created with the Chrome extension').slice(0, 3000), url, uid]);
    const done = await q(`UPDATE post_schedules SET status = 'done', done_by = $2, done_at = now(), url = $3
        WHERE status = 'pending' AND job_id = $1 AND portal = 'linkedin_post' AND ($4::int IS NULL OR id = $4) RETURNING id`, [jobId, uid, url, Number(b.schedule_id) || null]);
    return json({ ok: true, schedules_closed: done.length });
  }
  await q(`INSERT INTO job_postings (job_id, portal, status, url, posted_at, updated_at) VALUES ($1, $2, 'posted', $3, now(), now())
    ON CONFLICT (job_id, portal) DO UPDATE SET status = 'posted', url = COALESCE(EXCLUDED.url, job_postings.url), posted_at = COALESCE(job_postings.posted_at, now()), updated_at = now()`, [jobId, portal, url]);
  await q(`INSERT INTO social_posts (job_id, platform, body, status, url, posted_by) VALUES ($1,$2,$3,'posted',$4,$5)`,
    [jobId, portal, `Job posted on ${portal === 'indeed' ? 'Indeed' : 'LinkedIn'} with the Chrome extension${auth.user ? ` by ${auth.user.name}` : ''}`, url, uid]);
  const done = await q(`UPDATE post_schedules SET status = 'done', done_by = $3, done_at = now(), url = $4
      WHERE status = 'pending' AND job_id = $1 AND portal = $2 AND ($5::int IS NULL OR id = $5) RETURNING id`, [jobId, portal, uid, url, Number(b.schedule_id) || null]);
  return json({ ok: true, schedules_closed: done.length });
}
export const OPTIONS = preflight;
