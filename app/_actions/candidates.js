'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { q, one, j, logActivity } from '@/lib/db';
import { requireUser, requirePerm } from '@/lib/auth';
import { can, canMoveTo, AccessError } from '@/lib/roles';
import { num, list, stageLabel, STAGES, token, appUrl } from '@/lib/util';
import { addToJob } from '@/lib/ingest';
import { requestSlot } from '@/lib/screening';
import { sendEmail } from '@/lib/messages';

const s = (fd, k) => String(fd.get(k) || '').trim() || null;

export async function moveStage(formData) {
  await requirePerm('pipeline.move');
  const appId = num(formData.get('app_id'));
  const stage = s(formData, 'stage');
  if (!STAGES.some((x) => x.id === stage)) return;
  const reason = s(formData, 'reason');
  const me = await requireUser();
  if (!canMoveTo(me, stage)) throw new AccessError(me, stage === 'selected' ? 'offers.manage' : stage === 'interview' ? 'interviews.manage' : 'clients.share');
  const app = await one('UPDATE applications SET stage = $2, reject_reason = CASE WHEN $2 = $4 THEN COALESCE($3, reject_reason) ELSE reject_reason END, updated_at = now() WHERE id = $1 RETURNING *', [appId, stage, reason, 'rejected']);
  if (!app) return;
  if (stage === 'selected') await q('INSERT INTO offers (application_id) VALUES ($1) ON CONFLICT DO NOTHING', [appId]);
  await logActivity(app.candidate_id, appId, `Moved to ${stageLabel(stage)}${reason ? ` — ${reason}` : ''}.`);
  revalidatePath('/pipeline');
  revalidatePath(`/candidates/${app.candidate_id}`);
}

/** Bulk buttons on the pipeline board. */
export async function bulkAction(formData) {
  const me = await requireUser();
  const ids = formData.getAll('app').map(Number).filter(Boolean);
  const action = s(formData, 'bulk');
  const need = { shortlist: 'pipeline.move', reject: 'pipeline.move', slot: 'calls.request', share: 'clients.share' }[action];
  if (need && !can(me, need)) throw new AccessError(me, need);
  const jobId = num(formData.get('job_id'));
  if (!ids.length) redirect(`/pipeline?job=${jobId}&msg=${encodeURIComponent('Tick at least one candidate first.')}`);
  let msg = '';
  if (action === 'shortlist') {
    for (const id of ids) {
      const a = await one(`UPDATE applications SET stage = 'shortlisted', updated_at = now() WHERE id = $1 RETURNING candidate_id`, [id]);
      await logActivity(a.candidate_id, id, 'Moved to Shortlisted.');
    }
    msg = `${ids.length} shortlisted.`;
  } else if (action === 'slot') {
    for (const id of ids) await requestSlot(id);
    msg = `Slot requests sent to ${ids.length} candidate(s).`;
  } else if (action === 'share') {
    const r = await shareWithClient(jobId, ids);
    msg = `${r.emailed ? `Shortlist emailed to ${r.emailed}` : 'Shortlist link created (no client email on file, so nothing was emailed)'}. Review link: ${appUrl(`/share/${r.token}`)} · feedback due ${r.due}.`;
  } else if (action === 'reject') {
    for (const id of ids) {
      const a = await one(`UPDATE applications SET stage = 'rejected', reject_reason = COALESCE(reject_reason, 'Not suitable'), updated_at = now() WHERE id = $1 RETURNING candidate_id`, [id]);
      await logActivity(a.candidate_id, id, 'Moved to Rejected.');
    }
    msg = `${ids.length} rejected.`;
  }
  revalidatePath('/pipeline');
  redirect(`/pipeline?job=${jobId}&msg=${encodeURIComponent(msg)}`);
}

async function shareWithClient(jobId, appIds) {
  const job = await one('SELECT j.*, c.contact_email AS c_email, c.contact_name AS c_name, c.name AS client_name FROM jobs j LEFT JOIN clients c ON c.id = j.client_id WHERE j.id = $1', [jobId]);
  const t = token();
  const due = new Date(Date.now() + 24 * 36e5);
  await q('INSERT INTO shares (job_id, token, application_ids, due_at) VALUES ($1,$2,$3::jsonb,$4)', [jobId, t, j(appIds), due]);
  for (const id of appIds) {
    const a = await one(`UPDATE applications SET stage = 'forwarded', client_decision = NULL, client_reason = NULL, updated_at = now() WHERE id = $1 RETURNING candidate_id`, [id]);
    await logActivity(a.candidate_id, id, `Forwarded to ${job.client_name || 'the client'}.`);
  }
  const to = job.client_contact?.email || job.c_email;
  if (to) await sendEmail({
    to,
    subject: `${appIds.length} candidate(s) for ${job.title} — feedback within 24 hours`,
    text: `Hi ${job.client_contact?.name || job.c_name || ''},\n\nWe have screened ${appIds.length} candidate(s) for ${job.title}. Please review them and shortlist or reject each one here:\n${appUrl(`/share/${t}`)}\n\nWe'd appreciate your feedback within 24 hours so we can update the candidates.\n\nAvaStars Recruitment`,
  });
  return { token: t, emailed: to || null, due: due.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) };
}

export async function shareOne(formData) {
  await requirePerm('clients.share');
  const appId = num(formData.get('app_id'));
  const app = await one('SELECT * FROM applications WHERE id = $1', [appId]);
  const r = await shareWithClient(app.job_id, [appId]);
  revalidatePath(`/candidates/${app.candidate_id}`);
  redirect(`/candidates/${app.candidate_id}?app=${appId}&msg=${encodeURIComponent(`${r.emailed ? `Emailed to ${r.emailed}` : 'No client email on file, so nothing was emailed'}. Client review link: ${appUrl(`/share/${r.token}`)}`)}`);
}

export async function updateCandidate(formData) {
  await requirePerm('candidates.edit');
  const id = num(formData.get('id'));
  await q(
    `UPDATE candidates SET name = COALESCE($2, name), email = $3, phone = $4, current_title = $5, current_company = $6, location = $7, total_exp = $8, cctc = $9, ectc = $10, notice_days = $11, availability = $12, skills = $13::jsonb, updated_at = now() WHERE id = $1`,
    [id, s(formData, 'name'), s(formData, 'email'), s(formData, 'phone'), s(formData, 'current_title'), s(formData, 'current_company'), s(formData, 'location'), num(formData.get('total_exp')), num(formData.get('cctc')), num(formData.get('ectc')), num(formData.get('notice_days')), s(formData, 'availability'), j(list(formData.get('skills')))],
  );
  await logActivity(id, null, 'Profile details edited by HR.');
  revalidatePath(`/candidates/${id}`);
}

export async function addCandidateToJob(formData) {
  await requirePerm('candidates.edit');
  const cid = num(formData.get('candidate_id'));
  const jobId = num(formData.get('job_id'));
  const { applicationId } = await addToJob(jobId, cid, 'Added by HR');
  // HR chose this person on purpose: keep them in the pipeline even below the cut-off.
  await q(`UPDATE applications SET stage = 'pending', reject_reason = NULL WHERE id = $1 AND stage = 'rejected' AND reject_reason LIKE 'Low match%'`, [applicationId]);
  revalidatePath(`/candidates/${cid}`);
  redirect(`/candidates/${cid}?app=${applicationId}`);
}

export async function rescore(formData) {
  await requirePerm('candidates.edit');
  const app = await one('SELECT * FROM applications WHERE id = $1', [num(formData.get('app_id'))]);
  await addToJob(app.job_id, app.candidate_id, app.source);
  revalidatePath(`/candidates/${app.candidate_id}`);
}

export async function saveClientResume(formData) {
  await requirePerm('clients.share');
  const id = num(formData.get('id'));
  const roles = formData.getAll('exp_role'); const whens = formData.getAll('exp_when'); const points = formData.getAll('exp_points');
  const resume = {
    headline: s(formData, 'headline') || '',
    summary: s(formData, 'summary') || '',
    experience: roles.map((r, i) => ({ role: String(r).trim(), when: String(whens[i] || '').trim(), points: String(points[i] || '').trim() })).filter((e) => e.role),
    skills: s(formData, 'skills') || '',
    education: s(formData, 'education') || '',
    options: { hideContact: formData.get('hideContact') === 'on', brand: formData.get('brand') === 'on', includeSummary: formData.get('includeSummary') === 'on' },
  };
  await q('UPDATE candidates SET client_resume = $2::jsonb, updated_at = now() WHERE id = $1', [id, j(resume)]);
  revalidatePath(`/candidates/${id}/resume`);
  redirect(`/candidates/${id}/resume?app=${formData.get('app') || ''}&saved=1`);
}

export async function resetClientResume(formData) {
  await requirePerm('clients.share');
  const id = num(formData.get('id'));
  await q('UPDATE candidates SET client_resume = NULL WHERE id = $1', [id]);
  redirect(`/candidates/${id}/resume?app=${formData.get('app') || ''}`);
}

export async function deleteCandidate(formData) {
  await requirePerm('candidates.delete');
  await q('DELETE FROM candidates WHERE id = $1', [num(formData.get('id'))]);
  revalidatePath('/resumes');
  redirect('/resumes?msg=' + encodeURIComponent('Candidate deleted.'));
}

/** Resume database: put the ticked candidates into one job's pipeline (Pending or Shortlisted), whatever their match %. */
export async function addSelectedToJob(formData) {
  const me = await requirePerm('candidates.edit');
  const ids = [...new Set(formData.getAll('cand').map(Number).filter(Boolean))];
  const jobId = num(formData.get('job_id'));
  const stage = ['pending', 'shortlisted'].includes(formData.get('stage')) ? String(formData.get('stage')) : 'pending';
  const back = String(formData.get('back') || '/resumes');
  const go = (msg) => redirect(`${back}${back.includes('?') ? '&' : '?'}msg=${encodeURIComponent(msg)}`);
  if (!jobId) go('Choose a job first.');
  if (!ids.length) go('Tick at least one candidate first.');
  if (!canMoveTo(me, stage)) throw new AccessError(me, 'pipeline.move');
  const job = await one('SELECT j.title, c.name AS client FROM jobs j LEFT JOIN clients c ON c.id = j.client_id WHERE j.id = $1', [jobId]);
  if (!job) go('That job no longer exists.');
  let added = 0; let moved = 0; let kept = 0;
  for (const cid of ids) {
    const before = await one('SELECT id, stage, reject_reason FROM applications WHERE job_id = $1 AND candidate_id = $2', [jobId, cid]);
    const { applicationId } = await addToJob(jobId, cid, 'Added by HR');
    const after = await one('SELECT stage, reject_reason FROM applications WHERE id = $1', [applicationId]);
    // Candidates HR already moved further (screening, client, interview…) stay where they are.
    const movable = after.stage === 'pending' || (after.stage === 'rejected' && /^Low match/.test(after.reject_reason || '')) || (stage === 'shortlisted' && after.stage === 'pending');
    if (movable && after.stage !== stage) {
      await q('UPDATE applications SET stage = $2, reject_reason = NULL, updated_at = now() WHERE id = $1', [applicationId, stage]);
      await logActivity(cid, applicationId, `Added to ${job.title} as ${stageLabel(stage)} by ${me.name}.`);
    }
    if (!before) added += 1; else if (movable) moved += 1; else kept += 1;
  }
  revalidatePath('/pipeline');
  revalidatePath('/resumes');
  const where = `${job.title}${job.client ? ` (${job.client})` : ''}`;
  go(`${added} added to ${where} as ${stageLabel(stage)}${moved ? `, ${moved} already there moved to ${stageLabel(stage)}` : ''}${kept ? `, ${kept} left at their later stage` : ''}.`);
}
