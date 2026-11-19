'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { q, one, logActivity } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { num, fmtDate } from '@/lib/util';
import { sendEmail } from '@/lib/messages';
import { interviewIcs } from '@/lib/ics';

const s = (fd, k) => String(fd.get(k) || '').trim() || null;

export async function scheduleInterview(formData) {
  await requireUser();
  const appId = num(formData.get('app_id'));
  const date = s(formData, 'date'); const time = s(formData, 'time') || '10:00';
  if (!appId || !date) redirect('/interviews?msg=' + encodeURIComponent('Pick a candidate and a date.'));
  const when = new Date(`${date}T${time}:00+05:30`);
  const round = s(formData, 'round') || 'Interview';
  const link = s(formData, 'meeting_link');
  const iv = await one('INSERT INTO interviews (application_id, round, scheduled_at, meeting_link) VALUES ($1,$2,$3,$4) RETURNING id', [appId, round, when, link]);
  const ctx = await one(
    `SELECT a.candidate_id, c.name, c.email, jb.title, jb.client_contact, cl.contact_email, cl.name AS client_name
       FROM applications a JOIN candidates c ON c.id = a.candidate_id JOIN jobs jb ON jb.id = a.job_id LEFT JOIN clients cl ON cl.id = jb.client_id WHERE a.id = $1`,
    [appId],
  );
  await q(`UPDATE applications SET stage = CASE WHEN stage IN ('forwarded','shortlisted','screening','pending') THEN 'interview' ELSE stage END, updated_at = now() WHERE id = $1`, [appId]);
  if (formData.get('notify') === 'on') {
    const ics = interviewIcs({ uid: `iv-${iv.id}`, start: when, title: `${round}: ${ctx.name} — ${ctx.title}`, description: `Interview for ${ctx.title}.${link ? `\nJoin: ${link}` : ''}`, location: link || '' });
    const text = `Hi,\n\n${round} for ${ctx.title} is scheduled on ${fmtDate(when)} (IST).${link ? `\nJoin: ${link}` : ''}\n\nAvaStars Recruitment`;
    const attachments = [{ filename: 'invite.ics', content: ics, contentType: 'text/calendar; method=REQUEST' }];
    await sendEmail({ to: ctx.email, subject: `${round} — ${ctx.title}`, text, attachments });
    const clientTo = ctx.client_contact?.email || ctx.contact_email;
    if (clientTo) await sendEmail({ to: clientTo, subject: `${round} with ${ctx.name} — ${ctx.title}`, text: `${text}\n\nPlease share feedback within 24 hours of the interview.`, attachments });
  }
  await logActivity(ctx.candidate_id, appId, `${round} scheduled for ${fmtDate(when)}.`);
  revalidatePath('/interviews');
  redirect('/interviews?msg=' + encodeURIComponent('Interview scheduled.'));
}

export async function recordOutcome(formData) {
  await requireUser();
  const id = num(formData.get('interview_id'));
  const outcome = s(formData, 'outcome');
  const iv = await one(`UPDATE interviews SET status = 'done', outcome = $2, feedback = $3 WHERE id = $1 RETURNING application_id, round`, [id, outcome, s(formData, 'feedback')]);
  const app = await one('SELECT * FROM applications WHERE id = $1', [iv.application_id]);
  if (outcome === 'selected') {
    await q(`UPDATE applications SET stage = 'selected', updated_at = now() WHERE id = $1`, [app.id]);
    await q('INSERT INTO offers (application_id) VALUES ($1) ON CONFLICT DO NOTHING', [app.id]);
  } else if (outcome === 'rejected') {
    await q(`UPDATE applications SET stage = 'rejected', reject_reason = $2, updated_at = now() WHERE id = $1`, [app.id, s(formData, 'reason') || 'Rejected after interview']);
  }
  await logActivity(app.candidate_id, app.id, `${iv.round}: ${outcome === 'next' ? 'moving to next round' : outcome}${s(formData, 'feedback') ? ` — ${s(formData, 'feedback')}` : ''}.`);
  revalidatePath('/interviews');
}

export async function saveOffer(formData) {
  await requireUser();
  const appId = num(formData.get('app_id'));
  const status = s(formData, 'status') || 'negotiating';
  await q(
    `INSERT INTO offers (application_id, offered_ctc, status, joining_date, note, updated_at) VALUES ($1,$2,$3,$4,$5,now())
     ON CONFLICT (application_id) DO UPDATE SET offered_ctc = EXCLUDED.offered_ctc, status = EXCLUDED.status, joining_date = EXCLUDED.joining_date, note = EXCLUDED.note, updated_at = now()`,
    [appId, num(formData.get('offered_ctc')), status, s(formData, 'joining_date'), s(formData, 'note')],
  );
  const app = await one('SELECT candidate_id FROM applications WHERE id = $1', [appId]);
  if (status === 'dropped') await q(`UPDATE applications SET stage = 'rejected', reject_reason = 'Candidate dropped out', updated_at = now() WHERE id = $1`, [appId]);
  await logActivity(app.candidate_id, appId, `Offer updated: ${status}.`);
  revalidatePath('/interviews');
}
