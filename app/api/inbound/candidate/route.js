import { one } from '@/lib/db';
import { importApplicant, openJobs } from '@/lib/importer';
import { json, preflight, inboundGuard } from '@/lib/inbound';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Inbound Candidate API: lets Zapier, Make, n8n, Google Forms, website forms, partners and the
 * AvaStars Collector Chrome extension push a candidate.
 * Auth: header "Authorization: Bearer <INBOUND_API_KEY>" (or "x-api-key").
 * Body: multipart/form-data (fields + "resume" file) or JSON (fields + resume_base64 + resume_filename).
 * Fields: name, email, phone, location, job_id or job_slug (or job_title + auto_job=1), source, notes,
 *   applied_on, current_title, current_company, total_exp, notice, cctc, ectc, skills, profile_url.
 */
const clean = (v, max = 200) => (v === null || v === undefined ? '' : String(v).trim().slice(0, max));

export async function POST(req) {
  const bad = inboundGuard(req);
  if (bad) return bad;

  let f = {}; let resume = null;
  const type = req.headers.get('content-type') || '';
  try {
    if (type.includes('multipart/form-data')) {
      const fd = await req.formData();
      for (const [k, v] of fd.entries()) if (typeof v === 'string') f[k] = v;
      const file = fd.get('resume');
      if (file && typeof file.arrayBuffer === 'function' && file.size) resume = { buffer: Buffer.from(await file.arrayBuffer()), filename: file.name, mime: file.type };
    } else {
      f = await req.json();
      if (f.resume_base64) resume = { buffer: Buffer.from(String(f.resume_base64), 'base64'), filename: clean(f.resume_filename) || 'resume.pdf', mime: clean(f.resume_mime) };
    }
  } catch {
    return json({ error: 'Could not read the request body. Send JSON or multipart/form-data.' }, 400);
  }
  if (resume && resume.buffer.length > 8 * 1024 * 1024) return json({ error: 'Resume must be under 8 MB.' }, 413);

  const source = clean(f.source, 60) || 'Inbound API';
  let jobId = null;
  if (f.job_id || f.job_slug) {
    const job = await one(`SELECT id FROM jobs WHERE (id = $1 OR slug = $2) AND status IN ('open','paused')`, [Number(f.job_id) || 0, clean(f.job_slug)]);
    if (!job) return json({ error: 'Job not found or closed.' }, 404);
    jobId = job.id;
  }
  const autoJob = !jobId && ['1', 'true', 'yes'].includes(String(f.auto_job || '').toLowerCase());
  const skills = Array.isArray(f.skills) ? f.skills : clean(f.skills, 2000);
  const applicant = { ...f, skills, total_exp: f.total_exp ?? f.experience, applied_on: f.applied_on ?? f.applied_at };
  if (!resume && !clean(f.name) && !clean(f.email) && !clean(f.phone)) return json({ error: 'Send a resume, or at least a name, email or phone.' }, 400);
  try {
    const r = await importApplicant({ applicant, resume, jobId, autoJob, jobs: autoJob || jobId ? await openJobs() : null, source, notes: clean(f.notes, 1000) });
    if (r.status === 'failed') return json({ ok: false, error: r.error }, 422);
    return json({ ok: true, status: r.status === 'created' ? 'new' : r.status, candidate_id: r.candidateId, job: r.job || null, match: r.score ?? null, resume: Boolean(resume) });
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: e.message || 'Server error' }, 500);
  }
}
export const OPTIONS = preflight;
