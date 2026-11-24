'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { q, one, logActivity } from '@/lib/db';
import { requirePerm } from '@/lib/auth';
import { addToJob, saveScore } from '@/lib/ingest';
import { scoreMatch } from '@/lib/ai';
import { SOURCING_STATUSES } from '@/lib/sourcing';
import { upsertProspect } from '@/lib/prospects';


export async function setSourcingStatus(formData) {
  const me = await requirePerm('candidates.edit');
  const id = Number(formData.get('cand_id')) || 0;
  const status = String(formData.get('status'));
  if (!SOURCING_STATUSES.some(([v]) => v === status)) return;
  await q('UPDATE candidates SET sourcing_status = $2, updated_at = now() WHERE id = $1', [id, status]);
  await logActivity(id, null, `Sourcing status: ${SOURCING_STATUSES.find(([v]) => v === status)[1]} (${me.name}).`);
  revalidatePath('/sourcing');
}

/** Puts a sourced prospect on a job's pipeline (scored, as Pending). */
export async function addProspectToJob(formData) {
  await requirePerm('candidates.edit');
  const id = Number(formData.get('cand_id')) || 0;
  const jobId = Number(formData.get('job_id')) || 0;
  const back = String(formData.get('back') || '/sourcing');
  const job = await one(`SELECT id, title FROM jobs WHERE id = $1 AND status IN ('open','paused')`, [jobId]);
  if (!job) redirect(`${back}${back.includes('?') ? '&' : '?'}msg=${encodeURIComponent('Pick an open job first.')}`);
  await addToJob(job.id, id, 'LinkedIn sourcing');
  revalidatePath('/sourcing'); revalidatePath('/pipeline');
  redirect(`${back}${back.includes('?') ? '&' : '?'}msg=${encodeURIComponent(`Added to ${job.title}.`)}`);
}

/** "Connect on LinkedIn" in the Sourcing table: opens the profile (in the browser) and records the request. */
export async function markConnectSent(formData) {
  const me = await requirePerm('candidates.edit');
  const id = Number(formData.get('cand_id')) || 0;
  const undo = formData.get('undo') === '1';
  if (undo) await q(`UPDATE candidates SET connect_sent_at = NULL, connect_sent_by = NULL, sourcing_status = CASE WHEN sourcing_status = 'request_sent' THEN 'to_contact' ELSE sourcing_status END WHERE id = $1`, [id]);
  else {
    await q(`UPDATE candidates SET connect_sent_at = COALESCE(connect_sent_at, now()), connect_sent_by = COALESCE(connect_sent_by, $2),
      sourcing_status = CASE WHEN sourcing_status IN ('to_contact') OR sourcing_status IS NULL THEN 'request_sent' ELSE sourcing_status END WHERE id = $1`, [id, me.id]);
    await logActivity(id, null, `LinkedIn connection request sent by ${me.name}.`);
  }
  revalidatePath('/sourcing');
}

/** Scores every saved prospect against one job, so the "Top 20" table can rank them. */
export async function scoreProspects(formData) {
  await requirePerm('candidates.edit');
  const jobId = Number(formData.get('job_id')) || 0;
  const job = await one('SELECT * FROM jobs WHERE id = $1', [jobId]);
  if (!job) redirect('/sourcing');
  const rows = await q(`SELECT c.* FROM candidates c WHERE c.sourcing_status IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM candidate_scores s WHERE s.candidate_id = c.id AND s.job_id = $1) ORDER BY c.created_at DESC LIMIT 150`, [jobId]);
  for (const c of rows) {
    const r = await scoreMatch(job, c).catch(() => null);
    if (r) await saveScore(job.id, c.id, r.score, r.detail);
  }
  revalidatePath('/sourcing');
  redirect(`/sourcing?job=${jobId}&msg=${encodeURIComponent(`${rows.length} prospect(s) scored for ${job.title}.`)}#top`);
}

/** A person from the Google results on the Sourcing page: Save (and optionally record a Connect). */
export async function saveFoundPerson(person, jobId, connect) {
  const me = await requirePerm('candidates.edit');
  const r = await upsertProspect(person || {}, { user: me, jobId: Number(jobId) || null, connectSent: Boolean(connect) });
  revalidatePath('/sourcing');
  return { id: r.id, match: r.match };
}

/** The Sourcing table checks this when you come back from LinkedIn: did the extension see the request go out? */
export async function connectStatus(profileUrl) {
  await requirePerm('candidates.edit');
  const r = await one(`SELECT id, connect_sent_at FROM candidates WHERE lower(rtrim(profile_url, '/')) = lower(rtrim($1, '/')) ORDER BY connect_sent_at DESC NULLS LAST LIMIT 1`, [String(profileUrl || '')]);
  return { id: r?.id || null, sent: r?.connect_sent_at ? new Date(r.connect_sent_at).toISOString() : null };
}

/** "I sent it" (manual) or "Undo" for one person in the Sourcing table. */
export async function setConnectSent(id, sent) {
  const fd = new FormData();
  fd.set('cand_id', String(id));
  if (!sent) fd.set('undo', '1');
  await markConnectSent(fd);
  return { ok: true };
}
