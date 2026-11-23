import { NextResponse } from 'next/server';
import { importUser } from '@/lib/importAuth';
import { importApplicant, openJobs } from '@/lib/importer';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Saves one applicant from the Import page (optionally with a resume file). */
export async function POST(req) {
  const { error } = await importUser();
  if (error) return error;
  const fd = await req.formData();
  let applicant = {};
  try { applicant = JSON.parse(String(fd.get('applicant') || '{}')); } catch { return NextResponse.json({ status: 'failed', error: 'Bad applicant data' }, { status: 400 }); }
  const file = fd.get('resume');
  const resume = file && typeof file.arrayBuffer === 'function' && file.size ? { buffer: Buffer.from(await file.arrayBuffer()), filename: file.name, mime: file.type } : null;
  if (resume && resume.buffer.length > 10 * 1024 * 1024) return NextResponse.json({ status: 'failed', error: 'Resume is larger than 10 MB' });
  const jobId = Number(fd.get('job_id')) || null;
  const autoJob = fd.get('auto_job') === '1';
  const source = String(fd.get('source') || 'Import').slice(0, 60);
  try {
    const r = await importApplicant({ applicant, resume, jobId, autoJob, jobs: jobId || autoJob ? await openJobs() : null, source });
    return NextResponse.json(r);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ status: 'failed', error: e.message || 'Server error' });
  }
}
