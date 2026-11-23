// AI screening flow: ask for a slot -> candidate books -> call -> score.
import { q, one, j, getSetting, logActivity } from './db';
import { token, appUrl, fmtDate } from './util';
import { sendEmail, sendWhatsApp } from './messages';
import { dispatchCall, providerName } from './voice';
import { scoreCall } from './ai';
import { callQuestions } from './questions';

export const DEFAULT_CALL_SETTINGS = { windowStart: '10:00', windowEnd: '19:00', slotMinutes: 30, maxAttempts: 3, retryHours: 3, days: 3 };

export async function callSettings() {
  return { ...DEFAULT_CALL_SETTINGS, ...(await getSetting('call_settings', {})) };
}

async function context(applicationId) {
  return one(
    `SELECT a.*, c.name AS cand_name, c.email AS cand_email, c.phone AS cand_phone, jb.title AS job_title, jb.id AS jid
       FROM applications a JOIN candidates c ON c.id = a.candidate_id JOIN jobs jb ON jb.id = a.job_id WHERE a.id = $1`,
    [applicationId],
  );
}

/** Sends the slot-picker link by email and WhatsApp. Re-uses an open request if there is one. */
export async function requestSlot(applicationId) {
  const ctx = await context(applicationId);
  if (!ctx) throw new Error('Application not found');
  let s = await one(`SELECT * FROM screenings WHERE application_id = $1 AND status IN ('requested','booked','no_answer') ORDER BY id DESC LIMIT 1`, [applicationId]);
  if (!s) s = await one('INSERT INTO screenings (application_id, token) VALUES ($1, $2) RETURNING *', [applicationId, token()]);
  const link = appUrl(`/book/${s.token}`);
  const first = (ctx.cand_name || '').split(' ')[0] || 'there';
  const text = `Hi ${first}, your profile matches the ${ctx.job_title} role we are hiring for at AvaStars. Please pick a time for a 10-minute screening call with our AI recruiter: ${link}`;
  await sendEmail({ to: ctx.cand_email, subject: `Pick a time for your ${ctx.job_title} screening call`, text: `${text}\n\nThe call is with an AI assistant and is recorded so our recruiters can review it. Prefer a human recruiter? Choose that option on the same page.\n\nAvaStars Recruitment` });
  await sendWhatsApp({ to: ctx.cand_phone, text });
  await q(`UPDATE applications SET stage = CASE WHEN stage IN ('pending','shortlisted') THEN 'screening' ELSE stage END, updated_at = now() WHERE id = $1`, [applicationId]);
  await logActivity(ctx.candidate_id, applicationId, 'Screening slot request sent by email and WhatsApp.');
  return s;
}

const BOOKABLE = ['requested', 'booked', 'no_answer'];

/** Whether a booking link may still be used: request still open and candidate not rejected or hired. */
export async function bookingOpen(s) {
  if (!s || !BOOKABLE.includes(s.status)) return false;
  const app = await one('SELECT stage FROM applications WHERE id = $1', [s.application_id]);
  return Boolean(app) && !['rejected', 'selected', 'joined'].includes(app.stage);
}

export async function bookSlot(tokenValue, slotIso, consent) {
  const s = await one('SELECT * FROM screenings WHERE token = $1', [tokenValue]);
  if (!s) throw new Error('This link is not valid.');
  if (!(await bookingOpen(s))) throw new Error('This booking link is no longer active.');
  if (!consent) throw new Error('Please agree to the AI call and recording to continue.');
  // Accept only a slot we actually offered (the form value can be edited by hand).
  const offered = (await slotOptions()).flatMap((d) => d.slots);
  const wanted = new Date(slotIso);
  if (Number.isNaN(wanted.getTime()) || !offered.includes(wanted.toISOString())) throw new Error('That time is not available. Please pick one of the times shown.');
  await q(`UPDATE screenings SET status = 'booked', slot_at = $2, consent = true, updated_at = now() WHERE id = $1 AND status = ANY($3)`, [s.id, wanted.toISOString(), BOOKABLE]);
  const ctx = await context(s.application_id);
  await logActivity(ctx.candidate_id, s.application_id, `Candidate booked an AI screening call for ${fmtDate(wanted)} and agreed to recording.`);
}

export async function requestHuman(tokenValue) {
  const s = await one('SELECT * FROM screenings WHERE token = $1', [tokenValue]);
  if (!s) throw new Error('This link is not valid.');
  if (!(await bookingOpen(s))) throw new Error('This booking link is no longer active.');
  await q(`UPDATE screenings SET status = 'human_requested', updated_at = now() WHERE id = $1`, [s.id]);
  const ctx = await context(s.application_id);
  await logActivity(ctx.candidate_id, s.application_id, 'Candidate asked to speak to a human recruiter.');
}

/** Starts the AI call now. */
export async function startCall(screeningId) {
  const s = await one('SELECT * FROM screenings WHERE id = $1', [screeningId]);
  if (!s) throw new Error('Screening not found');
  const app = await one('SELECT * FROM applications WHERE id = $1', [s.application_id]);
  const candidate = await one('SELECT * FROM candidates WHERE id = $1', [app.candidate_id]);
  const job = await one('SELECT * FROM jobs WHERE id = $1', [app.job_id]);
  if (!candidate.phone) throw new Error('Candidate has no phone number');
  const questions = await callQuestions(job);
  try {
    const { provider, callId } = await dispatchCall({ screening: s, candidate, job, questions });
    await q(`UPDATE screenings SET status = 'calling', provider = $2, provider_call_id = $3, attempts = attempts + 1, updated_at = now() WHERE id = $1`, [s.id, provider, callId]);
    await logActivity(candidate.id, app.id, `AI screening call started (${provider}).`);
  } catch (e) {
    await q(`UPDATE screenings SET status = 'failed', summary = $2, attempts = attempts + 1, updated_at = now() WHERE id = $1`, [s.id, e.message]);
    await logActivity(candidate.id, app.id, `AI call could not start: ${e.message}`);
    throw e;
  }
}

/** Called by provider webhooks (and the mock simulator) when a call ends. */
export async function finishCall(screeningId, { status, transcript, recordingUrl, durationSec, callId }) {
  const s = await one('SELECT * FROM screenings WHERE id = $1', [screeningId]);
  if (!s) throw new Error('Screening not found');
  const app = await one('SELECT * FROM applications WHERE id = $1', [s.application_id]);
  const job = await one('SELECT * FROM jobs WHERE id = $1', [app.job_id]);
  const settings = await callSettings();

  if (status === 'calling') {
    await q(`UPDATE screenings SET status = 'calling', provider_call_id = COALESCE($2, provider_call_id), updated_at = now() WHERE id = $1`, [s.id, callId || null]);
    return;
  }
  if (status === 'no_answer' || status === 'failed') {
    const retry = s.attempts < settings.maxAttempts;
    await q(
      `UPDATE screenings SET status = $2, slot_at = CASE WHEN $3 THEN now() + ($4 || ' hours')::interval ELSE slot_at END, updated_at = now() WHERE id = $1`,
      [s.id, retry ? 'no_answer' : 'failed', retry, String(settings.retryHours)],
    );
    await logActivity(app.candidate_id, app.id, retry ? `No answer. Will try again in ${settings.retryHours} hours (attempt ${s.attempts} of ${settings.maxAttempts}).` : 'No answer after all attempts.');
    return;
  }

  const result = await scoreCall(await callQuestions(job), transcript);
  await q(
    `UPDATE screenings SET status = 'completed', transcript = $2, recording_url = $3, duration_sec = $4, answers = $5::jsonb, score = $6, summary = $7, completed_at = now(), updated_at = now() WHERE id = $1`,
    [s.id, transcript || '', recordingUrl || null, durationSec || null, j(result.answers), result.score, result.summary],
  );
  const f = result.facts || {};
  await q('UPDATE candidates SET cctc = COALESCE(cctc, $2), ectc = COALESCE(ectc, $3), notice_days = COALESCE(notice_days, $4), updated_at = now() WHERE id = $1', [app.candidate_id, f.cctc ?? null, f.ectc ?? null, f.notice_days ?? null]);
  await logActivity(app.candidate_id, app.id, `AI screening call finished${result.score ? `: score ${result.score}/10` : ''}.`);
}

/** Cron: start calls whose slot has arrived, inside the call window (IST). */
export async function dispatchDueCalls() {
  const settings = await callSettings();
  const now = new Date();
  const hm = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
  if (hm < settings.windowStart || hm > settings.windowEnd) return { started: 0, skipped: 'outside call window' };
  const due = await q(`SELECT id FROM screenings WHERE status IN ('booked','no_answer') AND slot_at <= now() ORDER BY slot_at LIMIT 20`);
  let started = 0; const errors = [];
  for (const d of due) {
    try { await startCall(d.id); started++; } catch (e) { errors.push(e.message); }
  }
  return { started, errors, provider: providerName() };
}

/** Next N working days of slots in IST, as ISO strings. */
export async function slotOptions() {
  const st = await callSettings();
  const out = [];
  const [sh, sm] = st.windowStart.split(':').map(Number);
  const [eh, em] = st.windowEnd.split(':').map(Number);
  const IST = 5.5 * 36e5;
  const nowIst = new Date(Date.now() + IST);
  const day = new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate()));
  while (out.length < st.days) {
    if (day.getUTCDay() !== 0) {
      const slots = [];
      for (let m = sh * 60 + sm; m + st.slotMinutes <= eh * 60 + em; m += st.slotMinutes) {
        const utc = new Date(day.getTime() + m * 60000 - IST);
        if (utc.getTime() > Date.now() + 30 * 60000) slots.push(utc.toISOString());
      }
      if (slots.length) out.push({ label: day.toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }), slots });
    }
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return out;
}
