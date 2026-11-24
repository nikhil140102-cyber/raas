'use server';
// Scheduled job posts: pick a portal, a time and who will publish it. At that time the person gets a
// reminder (dashboard + Chrome extension); the extension fills the portal's form and they click Publish.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { q, one } from '@/lib/db';
import { requirePerm } from '@/lib/auth';

const back = (jobId, msg) => redirect(`/jobs/${jobId}/announce?msg=${encodeURIComponent(msg)}#schedule`);

export async function createSchedule(formData) {
  const me = await requirePerm('jobs.post');
  const jobId = Number(formData.get('job_id')) || 0;
  const portals = formData.getAll('portal').filter((p) => ['indeed', 'linkedin'].includes(p));
  const when = String(formData.get('when') || ''); // datetime-local, entered in India time
  const assigned = Number(formData.get('assigned_to')) || null;
  if (!portals.length) back(jobId, 'Tick Indeed and/or LinkedIn.');
  const at = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(when) ? new Date(`${when}:00+05:30`) : null;
  if (!at || Number.isNaN(at.getTime())) back(jobId, 'Pick a date and time.');
  if (!(await one('SELECT id FROM jobs WHERE id = $1', [jobId]))) back(jobId, 'Job not found.');
  if (assigned && !(await one(`SELECT id FROM users WHERE id = $1 AND active AND role IN ('admin','hr','intern')`, [assigned]))) back(jobId, 'Pick a team member.');
  for (const portal of portals) {
    await q('INSERT INTO post_schedules (job_id, portal, scheduled_at, assigned_to, note, created_by) VALUES ($1,$2,$3,$4,$5,$6)',
      [jobId, portal, at.toISOString(), assigned, String(formData.get('note') || '').slice(0, 300) || null, me.id]);
  }
  revalidatePath(`/jobs/${jobId}/announce`); revalidatePath('/');
  back(jobId, `Scheduled: ${portals.map((p) => (p === 'indeed' ? 'Indeed' : 'LinkedIn')).join(' + ')} on ${at.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}.`);
}

export async function updateSchedule(formData) {
  await requirePerm('jobs.post');
  const id = Number(formData.get('id')) || 0;
  const row = await one('SELECT job_id FROM post_schedules WHERE id = $1', [id]);
  if (!row) redirect('/');
  const action = String(formData.get('action'));
  if (action === 'delete') await q('DELETE FROM post_schedules WHERE id = $1', [id]);
  if (action === 'skip') await q(`UPDATE post_schedules SET status = 'skipped' WHERE id = $1`, [id]);
  revalidatePath(`/jobs/${row.job_id}/announce`); revalidatePath('/');
  back(row.job_id, action === 'delete' ? 'Schedule removed.' : 'Marked as skipped.');
}
