import { NextResponse } from 'next/server';
import { currentStaff as currentUser } from '@/lib/auth';
import { ingestResume } from '@/lib/ingest';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req) {
  if (!(await currentUser())) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const fd = await req.formData();
  const file = fd.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') return NextResponse.json({ error: 'No file' }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ status: 'failed', error: 'File is larger than 10 MB' });
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const result = await ingestResume({ buffer, filename: file.name, mime: file.type, source: 'Bulk upload', jobId: fd.get('job_id') || null });
    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ status: 'failed', error: e.message });
  }
}
