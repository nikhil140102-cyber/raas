import { NextResponse } from 'next/server';
import { one } from '@/lib/db';
import { exportResponse } from '@/lib/resumeExport';

export const runtime = 'nodejs';

// Client downloads the client-ready resume from a shared shortlist link.
export async function GET(req, { params }) {
  const { token, appId } = await params;
  const share = await one('SELECT application_ids FROM shares WHERE token = $1', [token]);
  const id = Number(appId);
  if (!share || !(share.application_ids || []).map(Number).includes(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const app = await one('SELECT * FROM applications WHERE id = $1', [id]);
  const c = await one('SELECT * FROM candidates WHERE id = $1', [app.candidate_id]);
  const screening = await one(`SELECT score, summary FROM screenings WHERE application_id = $1 AND status = 'completed' ORDER BY id DESC LIMIT 1`, [id]);
  // Contact details are always hidden on client downloads.
  c.client_resume = { ...(c.client_resume || {}), options: { ...((c.client_resume || {}).options || { brand: true, includeSummary: true }), hideContact: true } };
  return exportResponse(c, screening, app.match_score, 'pdf');
}
