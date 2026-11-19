import { NextResponse } from 'next/server';
import { one } from '@/lib/db';
import { ingestResume } from '@/lib/ingest';
import { num } from '@/lib/util';
import { normalizePhone } from '@/lib/ai';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Very small in-memory rate limit per IP (resets when the server restarts).
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 10 * 60000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 8;
}

export async function POST(req) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'local';
  if (limited(ip)) return NextResponse.json({ error: 'Too many applications from this connection. Try again later.' }, { status: 429 });
  const fd = await req.formData();
  const job = await one(`SELECT id FROM jobs WHERE id = $1 AND status = 'open'`, [num(fd.get('job_id'))]);
  if (!job) return NextResponse.json({ error: 'This job is no longer open.' }, { status: 400 });
  if (!fd.get('consent')) return NextResponse.json({ error: 'Consent is required.' }, { status: 400 });
  const file = fd.get('resume');
  if (!file || typeof file.arrayBuffer !== 'function' || !file.size) return NextResponse.json({ error: 'Please attach your resume.' }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'Resume must be under 5 MB.' }, { status: 400 });
  const email = String(fd.get('email') || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'Please enter a valid email.' }, { status: 400 });

  const result = await ingestResume({
    buffer: Buffer.from(await file.arrayBuffer()),
    filename: file.name,
    mime: file.type,
    source: 'Careers page',
    jobId: job.id,
    overrides: {
      name: String(fd.get('name') || '').trim() || null,
      email,
      phone: normalizePhone(fd.get('phone')),
      cctc: num(fd.get('cctc')),
      ectc: num(fd.get('ectc')),
      notice_days: num(fd.get('notice_days')),
    },
  });
  if (result.status === 'failed') return NextResponse.json({ error: `We could not read your resume (${result.error}). Please upload a PDF or Word file with text.` }, { status: 400 });
  return NextResponse.json({ ok: true });
}
