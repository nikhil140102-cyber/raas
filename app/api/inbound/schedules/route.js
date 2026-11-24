import { q } from '@/lib/db';
import { json, preflight, inboundGuard } from '@/lib/inbound';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Scheduled job posts waiting for this person (assigned to them, or to nobody), due ones first. */
export async function GET(req) {
  const auth = await inboundGuard(req);
  if (auth.res) return auth.res;
  const rows = await q(
    `SELECT s.id, s.job_id, s.portal, s.scheduled_at, s.note, j.title, u.name AS assignee
       FROM post_schedules s JOIN jobs j ON j.id = s.job_id LEFT JOIN users u ON u.id = s.assigned_to
      WHERE s.status = 'pending' AND ($1::int IS NULL OR s.assigned_to IS NULL OR s.assigned_to = $1)
      ORDER BY s.scheduled_at LIMIT 50`,
    [auth.user?.id ?? null],
  );
  const now = Date.now();
  return json({ ok: true, items: rows.map((r) => ({ ...r, due: new Date(r.scheduled_at).getTime() <= now })) });
}
export const OPTIONS = preflight;
