import { one } from '@/lib/db';
import { portalKit } from '@/lib/social';
import { json, preflight, inboundGuard } from '@/lib/inbound';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The job laid out for a portal's "post a job" form (used by the extension to fill the form). */
export async function GET(req) {
  const auth = await inboundGuard(req);
  if (auth.res) return auth.res;
  const u = new URL(req.url);
  const portal = ['indeed', 'linkedin'].includes(u.searchParams.get('portal')) ? u.searchParams.get('portal') : 'indeed';
  const job = await one('SELECT * FROM jobs WHERE id = $1', [Number(u.searchParams.get('job')) || 0]);
  if (!job) return json({ error: 'Job not found.' }, 404);
  const kit = portalKit(job, portal);
  return json({ ok: true, job: { id: job.id, title: job.title }, portal, name: kit.name, url: kit.url, fields: kit.fields.map(([label, value]) => ({ label, value: String(value ?? '') })) });
}
export const OPTIONS = preflight;
