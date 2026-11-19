'use server';
// Client feedback on a shared shortlist. Public: protected by the share token.
import { revalidatePath } from 'next/cache';
import { q, one, logActivity } from '@/lib/db';
import { num } from '@/lib/util';

export async function clientDecision(formData) {
  const t = String(formData.get('token') || '');
  const share = await one('SELECT * FROM shares WHERE token = $1', [t]);
  if (!share) throw new Error('Link not valid');
  const appId = num(formData.get('app_id'));
  if (!(share.application_ids || []).map(Number).includes(appId)) throw new Error('Candidate not in this shortlist');
  const decision = String(formData.get('decision'));
  const reason = String(formData.get('reason') || '').trim() || null;
  const comment = String(formData.get('comment') || '').trim() || null;

  if (decision === 'undo') {
    await q(`UPDATE applications SET client_decision = NULL, client_reason = NULL, client_comment = NULL, stage = 'forwarded', updated_at = now() WHERE id = $1`, [appId]);
  } else if (decision === 'yes') {
    await q(`UPDATE applications SET client_decision = 'yes', client_comment = $2, stage = 'interview', updated_at = now() WHERE id = $1`, [appId, comment]);
  } else {
    await q(`UPDATE applications SET client_decision = 'no', client_reason = $2, client_comment = $3, stage = 'rejected', reject_reason = $4, updated_at = now() WHERE id = $1`, [appId, reason, comment, `Client: ${reason || 'not suitable'}`]);
  }
  const app = await one('SELECT candidate_id FROM applications WHERE id = $1', [appId]);
  const text = decision === 'yes' ? 'Client shortlisted for interview' : decision === 'no' ? `Client rejected${reason ? ` — ${reason}` : ''}` : 'Client undid their decision';
  await logActivity(app.candidate_id, appId, `${text}${comment ? ` ("${comment}")` : ''}.`);
  revalidatePath(`/share/${t}`);
}
