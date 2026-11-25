import { one } from '@/lib/db';
import { portalKit, buildPosts } from '@/lib/social';
import { json, preflight, inboundGuard } from '@/lib/inbound';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The job laid out for a portal's "post a job" form (used by the extension to fill the form). */
export async function GET(req) {
  const auth = await inboundGuard(req);
  if (auth.res) return auth.res;
  const u = new URL(req.url);
  const portal = ['indeed', 'linkedin', 'linkedin_post'].includes(u.searchParams.get('portal')) ? u.searchParams.get('portal') : 'indeed';
  const job = await one('SELECT j.*, c.name AS client FROM jobs j LEFT JOIN clients c ON c.id = j.client_id WHERE j.id = $1', [Number(u.searchParams.get('job')) || 0]);
  if (!job) return json({ error: 'Job not found.' }, 404);
  if (portal === 'linkedin_post') {
    // A LinkedIn feed post: the scheduled text if one was saved, else the first LinkedIn sample.
    const sched = u.searchParams.get('schedule') ? await one('SELECT body FROM post_schedules WHERE id = $1 AND job_id = $2', [Number(u.searchParams.get('schedule')) || 0, job.id]) : null;
    const text = sched?.body || (await buildPosts(job)).linkedin?.[0]?.text || '';
    return json({ ok: true, job: { id: job.id, title: job.title }, portal, name: 'LinkedIn post', text });
  }
  const kit = portalKit(job, portal);
  return json({ ok: true, job: { id: job.id, title: job.title }, portal, name: kit.name, url: kit.url, fields: kit.fields.map(([label, value]) => ({ label, value: String(value ?? '') })) });
}
export const OPTIONS = preflight;
