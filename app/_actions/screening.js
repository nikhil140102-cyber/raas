'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { one, setSetting } from '@/lib/db';
import { requireUser, requirePerm } from '@/lib/auth';
import { num } from '@/lib/util';
import { requestSlot, startCall, finishCall, bookSlot, requestHuman } from '@/lib/screening';

export async function askForSlot(formData) {
  await requirePerm('calls.request');
  const appId = num(formData.get('app_id'));
  await requestSlot(appId);
  const back = String(formData.get('back') || '/screening');
  revalidatePath(back);
  redirect(back);
}

export async function callNow(formData) {
  await requirePerm('calls.start');
  let msg = 'Call started.';
  try { await startCall(num(formData.get('screening_id'))); } catch (e) { msg = `Could not start the call: ${e.message}`; }
  revalidatePath('/screening');
  redirect('/screening?msg=' + encodeURIComponent(msg));
}

/** Test helper for VOICE_PROVIDER=mock: HR pastes a transcript (or marks no answer). */
export async function simulateCall(formData) {
  await requirePerm('calls.start');
  const id = num(formData.get('screening_id'));
  const outcome = String(formData.get('outcome') || 'completed');
  await finishCall(id, { status: outcome, transcript: String(formData.get('transcript') || ''), durationSec: num(formData.get('duration')) || 300 });
  revalidatePath('/screening');
  redirect('/screening?msg=' + encodeURIComponent(outcome === 'completed' ? 'Call result saved and scored.' : 'Marked as no answer.'));
}

export async function saveCallSettings(formData) {
  await requirePerm('settings.manage');
  await setSetting('call_settings', {
    windowStart: String(formData.get('windowStart') || '10:00'),
    windowEnd: String(formData.get('windowEnd') || '19:00'),
    slotMinutes: num(formData.get('slotMinutes')) || 30,
    maxAttempts: num(formData.get('maxAttempts')) || 3,
    retryHours: num(formData.get('retryHours')) || 3,
    days: num(formData.get('days')) || 3,
  });
  redirect('/settings?msg=' + encodeURIComponent('Call settings saved.'));
}

// ---- public (candidate) actions, protected by the screening token ----
export async function bookSlotPublic(prev, formData) {
  try {
    const t = String(formData.get('token'));
    const slot = String(formData.get('slot') || '');
    if (!slot) return { error: 'Pick a time first.' };
    await bookSlot(t, slot, formData.get('consent') === 'on');
    return { ok: true, slot };
  } catch (e) {
    return { error: e.message };
  }
}

export async function requestHumanPublic(formData) {
  const t = String(formData.get('token'));
  await requestHuman(t);
  const s = await one('SELECT token FROM screenings WHERE token = $1', [t]);
  redirect(`/book/${s.token}?human=1`);
}
