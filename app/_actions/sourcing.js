'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { q, one, logActivity } from '@/lib/db';
import { requirePerm } from '@/lib/auth';
import { addToJob } from '@/lib/ingest';
import { SOURCING_STATUSES } from '@/lib/sourcing';


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
