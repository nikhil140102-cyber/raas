'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { q, one, j } from '@/lib/db';
import { requireUser, requirePerm } from '@/lib/auth';
import { num, list, slugify, token, PORTALS } from '@/lib/util';
import { draftJD, suggestQuestions, extractJD, readDocumentWithAI } from '@/lib/ai';
import { extractText, cleanText } from '@/lib/ingest';

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
    required_certs: list(fd.get('required_certs')),
    preferred_certs: list(fd.get('preferred_certs')),
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
  const me = await requirePerm('jobs.edit');
  const id = num(formData.get('id'));
  const v = jobFromForm(formData);
  if (!v.title) throw new Error('Job title is required');
  // The contact section is hidden for now: keep an existing contact, otherwise use the client's contact.
  if (!v.client_contact.name && !v.client_contact.email) {
    const prev = id ? await one('SELECT client_contact FROM jobs WHERE id = $1', [id]) : null;
    const c = v.client_id ? await one('SELECT contact_name, contact_email, contact_phone FROM clients WHERE id = $1', [v.client_id]) : null;
    v.client_contact = prev?.client_contact?.name || prev?.client_contact?.email ? prev.client_contact : { name: c?.contact_name || null, email: c?.contact_email || null, phone: c?.contact_phone || null };
  }
  const cols = ['client_id', 'title', 'openings', 'employment_type', 'work_mode', 'location', 'exp_min', 'exp_max', 'ctc_min', 'ctc_max', 'joining_timeline', 'mandatory_skills', 'preferred_skills', 'required_certs', 'preferred_certs', 'description', 'screening_questions', 'interview_rounds', 'client_contact', 'hm_notes', 'public_company', 'min_score'];
  const jsonCols = new Set(['mandatory_skills', 'preferred_skills', 'required_certs', 'preferred_certs', 'screening_questions', 'interview_rounds', 'client_contact', 'hm_notes']);
  const params = cols.map((c) => (jsonCols.has(c) ? j(v[c]) : v[c]));
  const cast = (c, i) => `$${i + 1}${jsonCols.has(c) ? '::jsonb' : ''}`;
  let jobId = id;
  if (id) {
    await q(`UPDATE jobs SET ${cols.map((c, i) => `${c} = ${cast(c, i)}`).join(', ')} WHERE id = $${cols.length + 1}`, [...params, id]);
  } else {
    const slug = `${slugify(v.title)}-${token(3).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    jobId = (await one(`INSERT INTO jobs (${cols.join(', ')}, slug, created_by) VALUES (${cols.map(cast).join(', ')}, $${cols.length + 1}, $${cols.length + 2}) RETURNING id`, [...params, slug, me.id])).id;
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
  await requirePerm('jobs.edit');
  return draftJD({ ...fields, mandatory_skills: list(fields.mandatory_skills), preferred_skills: list(fields.preferred_skills) });
}

export async function aiSuggestQuestions(fields) {
  await requirePerm('jobs.edit');
  const qs = await suggestQuestions({ ...fields, mandatory_skills: list(fields.mandatory_skills) });
  return qs.map((x) => `${x.q} | ${x.type}`).join('\n');
}

export async function markPosted(formData) {
  const user = await requirePerm('jobs.post');
  const jobId = num(formData.get('job_id'));
  const portal = s(formData, 'portal');
  const url = s(formData, 'url');
  // Upsert: the portal row may not exist if it wasn't ticked when the job was created.
  const prev = await one('SELECT status, url FROM job_postings WHERE job_id = $1 AND portal = $2', [jobId, portal]);
  await q(`INSERT INTO job_postings (job_id, portal, status, url, posted_at, updated_at) VALUES ($1, $2, 'posted', $3, now(), now())
    ON CONFLICT (job_id, portal) DO UPDATE SET status = 'posted', url = EXCLUDED.url, posted_at = COALESCE(job_postings.posted_at, now()), updated_at = now()`, [jobId, portal, url]);
  // Show it in the share history too (once per new link).
  if (!prev || prev.status !== 'posted' || (prev.url || null) !== url) {
    await q(`INSERT INTO social_posts (job_id, platform, body, status, url, posted_by) VALUES ($1,$2,$3,'posted',$4,$5)`, [jobId, portal, prev?.status === 'posted' ? 'Live link updated' : 'Job posted on the portal', url, user.id]);
  }
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/announce`);
  redirect(`/jobs/${jobId}/announce?msg=${encodeURIComponent(`Saved: ${portal === 'naukri' ? 'Naukri' : portal === 'indeed' ? 'Indeed' : portal} marked as posted${url ? ' with its live link' : ''}.`)}#history`);
}

export async function setPostingStatus(formData) {
  await requirePerm('jobs.post');
  const jobId = num(formData.get('job_id'));
  await q('UPDATE job_postings SET status = $3, updated_at = now() WHERE job_id = $1 AND portal = $2', [jobId, s(formData, 'portal'), s(formData, 'status')]);
  revalidatePath(`/jobs/${jobId}`);
}

export async function setJobStatus(formData) {
  await requirePerm('jobs.edit');
  const jobId = num(formData.get('job_id'));
  const status = ['open', 'paused', 'closed'].includes(s(formData, 'status')) ? s(formData, 'status') : 'open';
  await q(`UPDATE jobs SET status = $2, closed_at = CASE WHEN $2 = 'closed' THEN now() ELSE NULL END WHERE id = $1`, [jobId, status]);
  if (status === 'closed') await q(`UPDATE job_postings SET status = CASE WHEN portal IN ('careers','google') THEN 'closed' ELSE 'close_manually' END, updated_at = now() WHERE job_id = $1 AND status <> 'not_posted'`, [jobId]);
  if (status === 'open') await q(`UPDATE job_postings SET status = 'live', updated_at = now() WHERE job_id = $1 AND portal = 'careers'`, [jobId]);
  if (status === 'paused') await q(`UPDATE job_postings SET status = 'paused', updated_at = now() WHERE job_id = $1 AND portal = 'careers'`, [jobId]);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath('/pipeline');
  const back = s(formData, 'back');
  if (back && back.startsWith('/')) redirect(back);
}

/** JD import: reads an uploaded file or pasted text and returns form fields. */
export async function importJD(formData) {
  await requirePerm('jobs.edit');
  let text = cleanText(formData.get('text')).trim();
  const file = formData.get('file');
  if (file && typeof file.arrayBuffer === 'function' && file.size > 0) {
    if (file.size > 10 * 1024 * 1024) return { error: 'File is larger than 10 MB.' };
    try {
      const buf = Buffer.from(await file.arrayBuffer());
      text = await extractText(buf, file.name, file.type);
      if (/\.pdf$/i.test(file.name) && text.replace(/\s/g, '').length < 40) text = cleanText(await readDocumentWithAI(buf, file.name, file.type));
    } catch (e) { return { error: e.message }; }
  }
  if (!text || text.replace(/\s/g, '').length < 40) return { error: 'Paste the job description or choose a PDF, Word or text file.' };
  const f = await extractJD(text);
  const join = (a) => (Array.isArray(a) ? a.join(', ') : a || '');
  return {
    by: f.by,
    fields: {
      title: f.title || '', openings: f.openings ?? '', employment_type: f.employment_type || '', work_mode: f.work_mode || '',
      location: f.location || '', exp_min: f.exp_min ?? '', exp_max: f.exp_max ?? '', ctc_min: f.ctc_min ?? '', ctc_max: f.ctc_max ?? '',
      joining_timeline: f.joining_timeline || '', mandatory_skills: join(f.mandatory_skills), preferred_skills: join(f.preferred_skills),
      required_certs: join(f.required_certs), preferred_certs: join(f.preferred_certs), description: f.description || text,
      questions: Array.isArray(f.questions) ? f.questions.map((x) => (typeof x === 'string' ? `${x} | Open answer` : `${x.q} | ${x.type || 'Open answer'}`)).join('\n') : '',
    },
  };
}
