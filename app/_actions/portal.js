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
  const decision = String(formData.get('decision'));
  const reason = String(formData.get('reason') || '').trim() || null;
  const comment = String(formData.get('comment') || '').trim() || null;
  const clientRejected = app.stage === 'rejected' && app.client_decision === 'no' && String(app.reject_reason || '').startsWith('Client');
  // What the client can do at each step (only on candidates shared with them):
  //   For your review → Shortlist for interview / Reject
  //   Interview       → Select / Reject / Undo shortlist
  //   Selected        → Reject (offer withdrawn) / Back to interview
  //   Not selected    → Undo (back to where it was)
  let text;
  if (decision === 'yes') {
    if (!(app.stage === 'forwarded' && !app.client_decision)) throw new Error('This candidate is not waiting for your feedback');
    await q(`UPDATE applications SET client_decision = 'yes', client_comment = $2, stage = 'interview', updated_at = now() WHERE id = $1`, [appId, comment]);
    text = 'Client shortlisted for interview';
  } else if (decision === 'select') {
    if (app.stage !== 'interview') throw new Error('Only candidates at the interview step can be selected');
    await q(`UPDATE applications SET client_decision = 'selected', client_comment = COALESCE($2, client_comment), stage = 'selected', updated_at = now() WHERE id = $1`, [appId, comment]);
    text = 'Client selected the candidate after interview';
  } else if (decision === 'no') {
    const ok = (app.stage === 'forwarded' && !app.client_decision) || app.stage === 'interview' || app.stage === 'selected';
    if (!ok) throw new Error('This candidate has moved on; ask your recruiter');
    const when = app.stage === 'interview' ? ' after interview' : app.stage === 'selected' ? ' (offer withdrawn)' : '';
    await q(`UPDATE applications SET client_decision = 'no', client_prev_stage = stage, client_reason = $2, client_comment = COALESCE($3, client_comment), stage = 'rejected', reject_reason = $4, updated_at = now() WHERE id = $1`,
      [appId, reason, comment, `Client${when}: ${reason || 'not suitable'}`]);
    text = `Client rejected${when}${reason ? ` — ${reason}` : ''}`;
  } else if (decision === 'undo') {
    if (clientRejected) {
      const prev = ['forwarded', 'interview', 'selected'].includes(app.client_prev_stage) ? app.client_prev_stage : 'forwarded';
      const back = prev === 'forwarded' ? null : prev === 'interview' ? 'yes' : 'selected';
      await q(`UPDATE applications SET client_decision = $2, client_reason = NULL, stage = $3, reject_reason = NULL, client_prev_stage = NULL, updated_at = now() WHERE id = $1`, [appId, back, prev]);
    } else if (app.client_decision === 'selected' && app.stage === 'selected') {
      await q(`UPDATE applications SET client_decision = 'yes', stage = 'interview', updated_at = now() WHERE id = $1`, [appId]);
    } else if (app.client_decision === 'yes' && app.stage === 'interview') {
      await q(`UPDATE applications SET client_decision = NULL, client_comment = NULL, stage = 'forwarded', updated_at = now() WHERE id = $1`, [appId]);
    } else throw new Error('This candidate has moved on; ask your recruiter');
    text = 'Client undid their last decision';
  } else throw new Error('Unknown decision');
  await logActivity(app.candidate_id, appId, `${text} (${me.name}, client portal)${comment ? ` ("${comment}")` : ''}.`);
  revalidatePath(`/portal/jobs/${app.job_id}`);
  revalidatePath('/portal');
}
