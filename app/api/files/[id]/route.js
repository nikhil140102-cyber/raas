import { NextResponse } from 'next/server';
import { one } from '@/lib/db';
import { currentStaff } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(req, { params }) {
  // Raw resumes include contact details: staff only. Clients get the redacted PDF from /portal/resume/[appId].
  if (!(await currentStaff())) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const { id } = await params;
  const f = await one('SELECT filename, mime, data FROM files WHERE id = $1', [Number(id)]);
  if (!f) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return new NextResponse(Buffer.from(f.data), {
    headers: { 'content-type': f.mime || 'application/octet-stream', 'content-disposition': `inline; filename="${encodeURIComponent(f.filename)}"` },
  });
}
