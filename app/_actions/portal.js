'use server';
// Client portal actions. Only client logins, and only for their own company's candidates.
import { revalidatePath } from 'next/cache';
import { q, one, logActivity } from '@/lib/db';
import { requireClientUser } from '@/lib/auth';
import { num } from '@/lib/util';

export async function portalDecision(formData) {
  const me = await requireClientUser();
  const appId = num(formData.get('app_id'));
  const app = await one(`SELECT a.*, j.client_id FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.id = $1`, [appId]);
  if (!app || app.client_id !== me.client_id) throw new Error('Candidate not found');
  if (!['forwarded', 'interview', 'rejected'].includes(app.stage)) throw new Error('This candidate is not waiting for your feedback');
  const decision = String(formData.get('decision'));
  const reason = String(formData.get('reason') || '').trim() || null;
  const comment = String(formData.get('comment') || '').trim() || null;
  if (decision === 'undo') {
    await q(`UPDATE applications SET client_decision = NULL, client_reason = NULL, client_comment = NULL, stage = 'forwarded', reject_reason = NULL, updated_at = now() WHERE id = $1`, [appId]);
  } else if (decision === 'yes') {
    await q(`UPDATE applications SET client_decision = 'yes', client_comment = $2, stage = 'interview', updated_at = now() WHERE id = $1`, [appId, comment]);
  } else {
    await q(`UPDATE applications SET client_decision = 'no', client_reason = $2, client_comment = $3, stage = 'rejected', reject_reason = $4, updated_at = now() WHERE id = $1`, [appId, reason, comment, `Client: ${reason || 'not suitable'}`]);
  }
  const text = decision === 'yes' ? 'Client shortlisted for interview' : decision === 'no' ? `Client rejected${reason ? ` — ${reason}` : ''}` : 'Client undid their decision';
  await logActivity(app.candidate_id, appId, `${text} (${me.name}, client portal)${comment ? ` ("${comment}")` : ''}.`);
  revalidatePath(`/portal/jobs/${app.job_id}`);
  revalidatePath('/portal');
}
