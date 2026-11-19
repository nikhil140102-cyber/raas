'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { q, one, getSetting, setSetting } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { num } from '@/lib/util';
import { linkedinPost } from '@/lib/social';

/** Records that HR shared the post somewhere (button click or "Mark as shared"). */
export async function logShare(jobId, platform, body) {
  const user = await requireUser();
  await q(`INSERT INTO social_posts (job_id, platform, body, status, posted_by) VALUES ($1,$2,$3,'shared',$4)`, [Number(jobId), String(platform), String(body || ''), user.id]);
  await q(`UPDATE job_postings SET status = 'posted', posted_at = COALESCE(posted_at, now()), updated_at = now() WHERE job_id = $1 AND portal = 'social'`, [Number(jobId)]);
  revalidatePath(`/jobs/${jobId}/announce`);
}

export async function postToLinkedIn(formData) {
  const user = await requireUser();
  const jobId = num(formData.get('job_id'));
  const text = String(formData.get('body') || '').trim();
  const job = await one('SELECT * FROM jobs WHERE id = $1', [jobId]);
  const conn = await getSetting(`linkedin:${user.id}`, null);
  let msg;
  if (!conn || conn.expiresAt < Date.now()) {
    msg = 'Connect your LinkedIn account first (the connection lasts about 60 days).';
  } else if (!text) {
    msg = 'The post is empty.';
  } else {
    try {
      const url = await linkedinPost(conn, text, job);
      await q(`INSERT INTO social_posts (job_id, platform, body, status, url, posted_by) VALUES ($1,'linkedin',$2,'posted',$3,$4)`, [jobId, text, url, user.id]);
      await q(`UPDATE job_postings SET status = 'posted', posted_at = COALESCE(posted_at, now()), updated_at = now() WHERE job_id = $1 AND portal = 'social'`, [jobId]);
      msg = 'Posted on your LinkedIn profile.';
    } catch (e) {
      await q(`INSERT INTO social_posts (job_id, platform, body, status, error, posted_by) VALUES ($1,'linkedin',$2,'failed',$3,$4)`, [jobId, text, e.message, user.id]);
      msg = `LinkedIn post failed: ${e.message}`;
    }
  }
  revalidatePath(`/jobs/${jobId}/announce`);
  redirect(`/jobs/${jobId}/announce?msg=${encodeURIComponent(msg)}`);
}

export async function disconnectLinkedIn(formData) {
  const user = await requireUser();
  await setSetting(`linkedin:${user.id}`, null);
  redirect(`/jobs/${num(formData.get('job_id'))}/announce?msg=${encodeURIComponent('LinkedIn disconnected.')}`);
}
