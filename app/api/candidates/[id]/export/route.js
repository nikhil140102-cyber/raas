import { NextResponse } from 'next/server';
import { one } from '@/lib/db';
import { currentStaff as currentUser } from '@/lib/auth';
import { exportResponse } from '@/lib/resumeExport';

export const runtime = 'nodejs';

export async function GET(req, { params }) {
  if (!(await currentUser())) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const { id } = await params;
  const url = new URL(req.url);
  const c = await one('SELECT * FROM candidates WHERE id = $1', [Number(id)]);
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const appId = Number(url.searchParams.get('app')) || null;
  const app = appId ? await one('SELECT match_score FROM applications WHERE id = $1 AND candidate_id = $2', [appId, c.id]) : null;
  const screening = appId ? await one(`SELECT score, summary FROM screenings WHERE application_id = $1 AND status = 'completed' ORDER BY id DESC LIMIT 1`, [appId]) : null;
  return exportResponse(c, screening, app?.match_score, url.searchParams.get('format'));
}
