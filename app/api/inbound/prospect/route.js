import { upsertProspect } from '@/lib/prospects';
import { json, preflight, inboundGuard } from '@/lib/inbound';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Sourcing: save a LinkedIn profile you are looking at as a prospect (someone who hasn't applied yet),
 * or record a connection request you sent (connect_sent: true).
 */
export async function POST(req) {
  const auth = await inboundGuard(req);
  if (auth.res) return auth.res;
  const b = await req.json().catch(() => ({}));
  try {
    const r = await upsertProspect(b, { user: auth.user, jobId: Number(b.job_id) || null, connectSent: b.connect_sent === true });
    return json({ ok: true, candidate_id: r.id, merged: r.merged, match: r.match, job: r.job });
  } catch (e) {
    return json({ error: e.message || 'Could not save.' }, 400);
  }
}
export const OPTIONS = preflight;
