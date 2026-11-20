import { NextResponse } from 'next/server';
import { one } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { exportResponse } from '@/lib/resumeExport';

export const runtime = 'nodejs';

// Client-ready resume (contact details hidden) for a candidate shared with this client's company.
export async function GET(req, { params }) {
  const me = await currentUser();
  if (!me || me.role !== 'client' || !me.client_id) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const { appId } = await params;
  const app = await one(`SELECT a.* FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.id = $1 AND j.client_id = $2
    AND (a.stage IN ('forwarded','interview','selected','joined') OR a.client_decision IS NOT NULL)`, [Number(appId), me.client_id]);
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const c = await one('SELECT * FROM candidates WHERE id = $1', [app.candidate_id]);
  const screening = await one(`SELECT score, summary FROM screenings WHERE application_id = $1 AND status = 'completed' ORDER BY id DESC LIMIT 1`, [app.id]);
  c.client_resume = { ...(c.client_resume || {}), options: { ...((c.client_resume || {}).options || { brand: true, includeSummary: true }), hideContact: true } };
  return exportResponse(c, screening, app.match_score, 'pdf');
}
