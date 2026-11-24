import { q, one, logActivity } from '@/lib/db';
import { scoreMatch } from '@/lib/ai';
import { saveScore } from '@/lib/ingest';
import { json, preflight, inboundGuard } from '@/lib/inbound';

export const runtime = 'nodejs';
export const maxDuration = 60;

const clip = (v, n = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * Sourcing: save a LinkedIn profile you are looking at as a prospect (someone who hasn't applied yet).
 * Only what the profile shows is kept; the prospect stays out of job pipelines until HR adds them.
 */
export async function POST(req) {
  const auth = await inboundGuard(req);
  if (auth.res) return auth.res;
  const b = await req.json().catch(() => ({}));
  const profile = clip(b.profile_url, 300).split('?')[0];
  const name = clip(b.name, 120);
  if (!name || !/^https:\/\/([a-z]+\.)?linkedin\.com\/in\//.test(profile)) return json({ error: 'Open a LinkedIn profile first.' }, 400);
  const skills = (Array.isArray(b.skills) ? b.skills : []).map((x) => clip(x, 60)).filter(Boolean).slice(0, 40);
  const text = [name, clip(b.headline, 300), clip(b.location, 100), b.company ? `Current: ${clip(b.company, 150)}` : '', clip(b.about, 2500),
    Array.isArray(b.experience) ? b.experience.map((x) => clip(x, 200)).join('\n') : '', skills.length ? `Skills: ${skills.join(', ')}` : ''].filter(Boolean).join('\n');
  const jobId = Number(b.job_id) || null;
  const prev = await one('SELECT id FROM candidates WHERE profile_url = $1 LIMIT 1', [profile]);
  let id = prev?.id;
  if (id) {
    await q(`UPDATE candidates SET current_title = COALESCE(NULLIF($2,''), current_title), location = COALESCE(location, NULLIF($3,'')), current_company = COALESCE(current_company, NULLIF($4,'')),
        open_to_work = COALESCE($5, open_to_work), sourced_job_id = COALESCE($6, sourced_job_id), sourcing_status = COALESCE(sourcing_status, 'to_contact'),
        resume_text = CASE WHEN resume_text IS NULL OR length(resume_text) < 80 THEN $7 ELSE resume_text END, updated_at = now() WHERE id = $1`,
      [id, clip(b.headline, 200), clip(b.location, 100), clip(b.company, 150), typeof b.open_to_work === 'boolean' ? b.open_to_work : null, jobId, text]);
  } else {
    id = (await one(
      `INSERT INTO candidates (name, current_title, location, current_company, skills, source, profile_url, resume_text, summary, sourcing_status, sourced_job_id, open_to_work)
       VALUES ($1,$2,$3,$4,$5::jsonb,'LinkedIn sourcing',$6,$7,$8,'to_contact',$9,$10) RETURNING id`,
      [name, clip(b.headline, 200) || null, clip(b.location, 100) || null, clip(b.company, 150) || null, JSON.stringify(skills), profile, text,
        `Sourced from LinkedIn${b.open_to_work ? ' (open to work)' : ''}; has not applied yet.`, jobId, typeof b.open_to_work === 'boolean' ? b.open_to_work : null],
    )).id;
  }
  if (b.connect_sent === true) {
    // Recorded when the recruiter clicked LinkedIn's own Connect button and it went through (shows "Pending").
    await q(`UPDATE candidates SET connect_sent_at = COALESCE(connect_sent_at, now()), connect_sent_by = COALESCE(connect_sent_by, $2),
        sourcing_status = CASE WHEN sourcing_status IN ('to_contact') OR sourcing_status IS NULL THEN 'request_sent' ELSE sourcing_status END WHERE id = $1`, [id, auth.user?.id ?? null]);
    await logActivity(id, null, `LinkedIn connection request sent${auth.user ? ` by ${auth.user.name}` : ''}.`);
  }
  let match = null; let jobTitle = null;
  if (jobId && !(b.connect_sent === true && prev)) {
    const job = await one('SELECT * FROM jobs WHERE id = $1', [jobId]);
    if (job) {
      const cand = await one('SELECT * FROM candidates WHERE id = $1', [id]);
      const r = await scoreMatch(job, cand).catch(() => null);
      if (r) { match = r.score; await saveScore(job.id, id, r.score, r.detail); }
      jobTitle = job.title;
    }
  }
  await logActivity(id, null, `${prev ? 'Updated' : 'Saved'} as a sourced prospect from LinkedIn${auth.user ? ` by ${auth.user.name}` : ''}${jobTitle ? ` for ${jobTitle}` : ''}.`);
  return json({ ok: true, candidate_id: id, merged: Boolean(prev), match, job: jobTitle });
}
export const OPTIONS = preflight;
