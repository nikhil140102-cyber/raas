// Saving a sourced person (from the Chrome extension or the Sourcing page's Google results) as a prospect.
import { q, one, logActivity } from './db';
import { scoreMatch } from './ai';
import { saveScore } from './ingest';

const clip = (v, n = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * Creates or updates a prospect by LinkedIn profile link. Only what the profile / search result shows is kept.
 * connectSent records a LinkedIn connection request. Returns { id, merged, match, job }.
 */
export async function upsertProspect(b, { user = null, jobId = null, connectSent = false, source = 'LinkedIn sourcing' } = {}) {
  const profile = clip(b.profile_url, 300).split('?')[0];
  const name = clip(b.name, 120);
  if (!name || !/^https:\/\/([a-z]+\.)?linkedin\.com\/in\//.test(profile)) throw new Error('A name and a LinkedIn profile link are needed.');
  const skills = (Array.isArray(b.skills) ? b.skills : []).map((x) => clip(x, 60)).filter(Boolean).slice(0, 40);
  const text = [name, clip(b.headline, 300), clip(b.location, 100), b.company ? `Current: ${clip(b.company, 150)}` : '', clip(b.about || b.snippet, 2500),
    Array.isArray(b.experience) ? b.experience.map((x) => clip(x, 200)).join('\n') : '', skills.length ? `Skills: ${skills.join(', ')}` : ''].filter(Boolean).join('\n');
  const otw = typeof b.open_to_work === 'boolean' ? b.open_to_work : null;
  const prev = await one('SELECT id FROM candidates WHERE profile_url = $1 LIMIT 1', [profile]);
  let id = prev?.id;
  if (id) {
    await q(`UPDATE candidates SET current_title = COALESCE(NULLIF($2,''), current_title), location = COALESCE(location, NULLIF($3,'')), current_company = COALESCE(current_company, NULLIF($4,'')),
        open_to_work = COALESCE($5, open_to_work), sourced_job_id = COALESCE($6, sourced_job_id), sourcing_status = COALESCE(sourcing_status, 'to_contact'),
        resume_text = CASE WHEN resume_text IS NULL OR length(resume_text) < length($7) THEN $7 ELSE resume_text END, updated_at = now() WHERE id = $1`,
      [id, clip(b.headline, 200), clip(b.location, 100), clip(b.company, 150), otw, jobId, text]);
  } else {
    id = (await one(
      `INSERT INTO candidates (name, current_title, location, current_company, skills, source, profile_url, resume_text, summary, sourcing_status, sourced_job_id, open_to_work)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,'to_contact',$10,$11) RETURNING id`,
      [name, clip(b.headline, 200) || null, clip(b.location, 100) || null, clip(b.company, 150) || null, JSON.stringify(skills), source, profile, text,
        `Sourced from LinkedIn${otw ? ' (open to work)' : ''}; has not applied yet.`, jobId, otw],
    )).id;
  }
  if (connectSent) {
    await q(`UPDATE candidates SET connect_sent_at = COALESCE(connect_sent_at, now()), connect_sent_by = COALESCE(connect_sent_by, $2),
        sourcing_status = CASE WHEN sourcing_status IN ('to_contact') OR sourcing_status IS NULL THEN 'request_sent' ELSE sourcing_status END WHERE id = $1`, [id, user?.id ?? null]);
    await logActivity(id, null, `LinkedIn connection request sent${user ? ` by ${user.name}` : ''}.`);
  }
  let match = null; let jobTitle = null;
  if (jobId && !(connectSent && prev)) {
    const job = await one('SELECT * FROM jobs WHERE id = $1', [jobId]);
    if (job) {
      const cand = await one('SELECT * FROM candidates WHERE id = $1', [id]);
      const r = await scoreMatch(job, cand).catch(() => null);
      if (r) { match = r.score; await saveScore(job.id, id, r.score, r.detail); }
      jobTitle = job.title;
    }
  }
  if (!connectSent || !prev) await logActivity(id, null, `${prev ? 'Updated' : 'Saved'} as a sourced prospect${user ? ` by ${user.name}` : ''}${jobTitle ? ` for ${jobTitle}` : ''}.`);
  return { id, merged: Boolean(prev), match, job: jobTitle };
}
