import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { q, one, logActivity } from '@/lib/db';
import { ingestResume, addToJob, findDuplicate, matchToOpenJobs } from '@/lib/ingest';
import { normalizePhone } from '@/lib/ai';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Inbound Candidate API: lets Zapier, Make, n8n, Google Forms, website forms or partners push a candidate.
 * Auth: header "Authorization: Bearer <INBOUND_API_KEY>" (or "x-api-key").
 * Body: multipart/form-data (fields + "resume" file) or JSON (fields + resume_base64 + resume_filename).
 * Fields: name, email, phone, location, job_id or job_slug, source, notes.
 */
function authorized(req) {
  const key = process.env.INBOUND_API_KEY || '';
  if (key.length < 16) return false;
  const given = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') || req.headers.get('x-api-key') || '';
  const a = Buffer.from(given); const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

const clean = (v, max = 200) => (v === null || v === undefined ? '' : String(v).trim().slice(0, max));

export async function POST(req) {
  if (!process.env.INBOUND_API_KEY) return NextResponse.json({ error: 'INBOUND_API_KEY is not set on the server.' }, { status: 503 });
  if (!authorized(req)) return NextResponse.json({ error: 'Invalid API key.' }, { status: 401 });

  let f = {}; let buffer = null; let filename = ''; let mime = '';
  const type = req.headers.get('content-type') || '';
  try {
    if (type.includes('multipart/form-data')) {
      const fd = await req.formData();
      for (const [k, v] of fd.entries()) if (typeof v === 'string') f[k] = v;
      const file = fd.get('resume');
      if (file && typeof file.arrayBuffer === 'function' && file.size) { buffer = Buffer.from(await file.arrayBuffer()); filename = file.name; mime = file.type; }
    } else {
      f = await req.json();
      if (f.resume_base64) { buffer = Buffer.from(String(f.resume_base64), 'base64'); filename = clean(f.resume_filename) || 'resume.pdf'; mime = clean(f.resume_mime); }
    }
  } catch {
    return NextResponse.json({ error: 'Could not read the request body. Send JSON or multipart/form-data.' }, { status: 400 });
  }
  if (buffer && buffer.length > 8 * 1024 * 1024) return NextResponse.json({ error: 'Resume must be under 8 MB.' }, { status: 413 });

  const source = clean(f.source, 60) || 'Inbound API';
  const job = f.job_id || f.job_slug
    ? await one(`SELECT id, title FROM jobs WHERE (id = $1 OR slug = $2) AND status IN ('open','paused')`, [Number(f.job_id) || 0, clean(f.job_slug)])
    : null;
  if ((f.job_id || f.job_slug) && !job) return NextResponse.json({ error: 'Job not found or closed.' }, { status: 404 });
  const overrides = { name: clean(f.name), email: clean(f.email).toLowerCase(), phone: clean(f.phone, 40), location: clean(f.location, 80) };

  if (buffer) {
    const r = await ingestResume({ buffer, filename, mime, source, jobId: job?.id || null, overrides });
    if (r.status === 'failed') return NextResponse.json({ ok: false, error: r.error }, { status: 422 });
    if (f.notes && r.candidateId) await logActivity(r.candidateId, null, `Note from ${source}: ${clean(f.notes, 1000)}`);
    return NextResponse.json({ ok: true, status: r.status, candidate_id: r.candidateId, job: job?.title || null, match: r.score ?? null });
  }

  // No resume: create (or update) a basic profile so the team sees the applicant straight away.
  if (!overrides.name || !(overrides.email || overrides.phone)) return NextResponse.json({ error: 'Send a resume, or at least name plus email or phone.' }, { status: 400 });
  const phone = normalizePhone(overrides.phone);
  const dup = await findDuplicate(overrides.email, phone);
  let id = dup?.id;
  if (!id) {
    id = (await one(`INSERT INTO candidates (name, email, phone, location, source, summary) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [overrides.name, overrides.email || null, phone || null, overrides.location || null, source, 'Added without a resume. Ask the candidate for their CV.'])).id;
  }
  if (job) await addToJob(job.id, id, source); else await matchToOpenJobs(id, source).catch(() => {});
  await logActivity(id, null, `${dup ? 'Updated' : 'Added'} via ${source}${f.notes ? `: ${clean(f.notes, 1000)}` : ''} (no resume yet).`);
  return NextResponse.json({ ok: true, status: dup ? 'merged' : 'new', candidate_id: id, job: job?.title || null, resume: false });
}
