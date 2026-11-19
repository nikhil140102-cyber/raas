'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { q, one, j } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { num, list, slugify, token, PORTALS } from '@/lib/util';
import { draftJD, suggestQuestions } from '@/lib/ai';

const s = (fd, k) => String(fd.get(k) || '').trim() || null;

function jobFromForm(fd) {
  const questions = String(fd.get('questions') || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [qText, type] = l.split('|').map((x) => x.trim());
    return { q: qText, type: type || 'Open answer' };
  });
  const rounds = String(fd.get('rounds') || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [name, by] = l.split(/\s[—–-]\s|\|/).map((x) => x.trim());
    return { name, by: by || '' };
  });
  return {
    client_id: num(fd.get('client_id')),
    title: s(fd, 'title'),
    openings: num(fd.get('openings')) || 1,
    employment_type: s(fd, 'employment_type') || 'Permanent',
    work_mode: s(fd, 'work_mode') || 'Hybrid',
    location: s(fd, 'location'),
    exp_min: num(fd.get('exp_min')), exp_max: num(fd.get('exp_max')),
    ctc_min: num(fd.get('ctc_min')), ctc_max: num(fd.get('ctc_max')),
    joining_timeline: s(fd, 'joining_timeline'),
    mandatory_skills: list(fd.get('mandatory_skills')),
    preferred_skills: list(fd.get('preferred_skills')),
    description: s(fd, 'description'),
    screening_questions: questions,
    interview_rounds: rounds,
    client_contact: { name: s(fd, 'contact_name'), email: s(fd, 'contact_email'), phone: s(fd, 'contact_phone') },
    hm_notes: { manager: s(fd, 'hm_manager'), date: s(fd, 'hm_date'), must: s(fd, 'hm_must'), flexible: s(fd, 'hm_flexible'), conditions: fd.getAll('hm_conditions').map(String) },
    public_company: s(fd, 'public_company'),
    min_score: num(fd.get('min_score')) ?? 60,
  };
}

export async function saveJob(formData) {
  await requireUser();
  const id = num(formData.get('id'));
  const v = jobFromForm(formData);
  if (!v.title) throw new Error('Job title is required');
  const cols = ['client_id', 'title', 'openings', 'employment_type', 'work_mode', 'location', 'exp_min', 'exp_max', 'ctc_min', 'ctc_max', 'joining_timeline', 'mandatory_skills', 'preferred_skills', 'description', 'screening_questions', 'interview_rounds', 'client_contact', 'hm_notes', 'public_company', 'min_score'];
  const jsonCols = new Set(['mandatory_skills', 'preferred_skills', 'screening_questions', 'interview_rounds', 'client_contact', 'hm_notes']);
  const params = cols.map((c) => (jsonCols.has(c) ? j(v[c]) : v[c]));
  const cast = (c, i) => `$${i + 1}${jsonCols.has(c) ? '::jsonb' : ''}`;
  let jobId = id;
  if (id) {
    await q(`UPDATE jobs SET ${cols.map((c, i) => `${c} = ${cast(c, i)}`).join(', ')} WHERE id = $${cols.length + 1}`, [...params, id]);
  } else {
    const slug = `${slugify(v.title)}-${token(3).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    jobId = (await one(`INSERT INTO jobs (${cols.join(', ')}, slug) VALUES (${cols.map(cast).join(', ')}, $${cols.length + 1}) RETURNING id`, [...params, slug])).id;
    for (const p of PORTALS) {
      const status = p.id === 'careers' ? 'live' : p.id === 'google' ? 'submitted' : 'not_posted';
      await q('INSERT INTO job_postings (job_id, portal, status, posted_at) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [jobId, p.id, status, p.id === 'careers' ? new Date() : null]);
    }
  }
  if (v.client_id) {
    await q('UPDATE clients SET contact_name = COALESCE(contact_name, $2), contact_email = COALESCE(contact_email, $3), contact_phone = COALESCE(contact_phone, $4) WHERE id = $1', [v.client_id, v.client_contact.name, v.client_contact.email, v.client_contact.phone]);
  }
  revalidatePath('/jobs');
  redirect(id ? `/jobs/${jobId}` : `/jobs/${jobId}?new=1`);
}

/** Used by the intake form's AI buttons. Returns plain data to the client component. */
export async function aiDraftDescription(fields) {
  await requireUser();
  return draftJD({ ...fields, mandatory_skills: list(fields.mandatory_skills), preferred_skills: list(fields.preferred_skills) });
}

export async function aiSuggestQuestions(fields) {
  await requireUser();
  const qs = await suggestQuestions({ ...fields, mandatory_skills: list(fields.mandatory_skills) });
  return qs.map((x) => `${x.q} | ${x.type}`).join('\n');
}

export async function markPosted(formData) {
  await requireUser();
  const jobId = num(formData.get('job_id'));
  await q(`UPDATE job_postings SET status = 'posted', url = $3, posted_at = COALESCE(posted_at, now()), updated_at = now() WHERE job_id = $1 AND portal = $2`, [jobId, s(formData, 'portal'), s(formData, 'url')]);
  revalidatePath(`/jobs/${jobId}`);
}

export async function setPostingStatus(formData) {
  await requireUser();
  const jobId = num(formData.get('job_id'));
  await q('UPDATE job_postings SET status = $3, updated_at = now() WHERE job_id = $1 AND portal = $2', [jobId, s(formData, 'portal'), s(formData, 'status')]);
  revalidatePath(`/jobs/${jobId}`);
}

export async function setJobStatus(formData) {
  await requireUser();
  const jobId = num(formData.get('job_id'));
  const status = s(formData, 'status');
  await q(`UPDATE jobs SET status = $2, closed_at = CASE WHEN $2 = 'closed' THEN now() ELSE NULL END WHERE id = $1`, [jobId, status]);
  if (status === 'closed') await q(`UPDATE job_postings SET status = CASE WHEN portal IN ('careers','google') THEN 'closed' ELSE 'close_manually' END, updated_at = now() WHERE job_id = $1 AND status <> 'not_posted'`, [jobId]);
  if (status === 'open') await q(`UPDATE job_postings SET status = 'live', updated_at = now() WHERE job_id = $1 AND portal = 'careers'`, [jobId]);
  revalidatePath(`/jobs/${jobId}`);
}
