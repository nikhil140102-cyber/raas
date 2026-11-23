import { aiEnabled } from '@/lib/ai';
import { openJobs } from '@/lib/importer';
import { json, preflight, inboundGuard } from '@/lib/inbound';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Open jobs, so the Chrome extension (or Zapier) can offer a job picker. Also works as a "test connection". */
export async function GET(req) {
  const auth = await inboundGuard(req);
  if (auth.res) return auth.res;
  const jobs = await openJobs();
  return json({ ok: true, app: 'AvaStars Hire', ai: aiEnabled(), user: auth.user?.name || null, jobs: jobs.map((j) => ({ id: j.id, title: j.title, client: j.client || null, slug: j.slug })) });
}
export const OPTIONS = preflight;
