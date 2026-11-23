import { cfg } from './config';
// AI voice screening providers. Pick one with VOICE_PROVIDER.
//   mock    – no real call; HR completes it with "Simulate call" (for testing)
//   bolna   – Bolna Voice AI outbound call API
//   webhook – POST the call request to VOICE_DISPATCH_URL (Omni, n8n, Make, your own service)
// Every provider must report back to /api/webhooks/voice/<provider>?secret=VOICE_WEBHOOK_SECRET
// with the screening id, status, transcript and recording URL.
import { appUrl } from './util';

export function providerName() {
  return cfg('VOICE_PROVIDER') || 'mock';
}

export function buildScript({ candidate, job, questions }) {
  const intro = `Hi ${candidate.name?.split(' ')[0] || 'there'}, I'm an AI assistant calling from AvaStars about the ${job.title} role. This call is recorded so our recruiters can review it. Is that okay?`;
  return { intro, questions: questions.map((x) => x.q), outro: 'Thank you. A recruiter from AvaStars will get back to you soon.' };
}

export async function dispatchCall({ screening, candidate, job, questions }) {
  const provider = providerName();
  const script = buildScript({ candidate, job, questions });
  const webhook = appUrl(`/api/webhooks/voice/${provider}?secret=${encodeURIComponent(cfg('VOICE_WEBHOOK_SECRET') || '')}`);

  if (provider === 'mock') {
    return { provider, callId: `mock-${screening.id}-${Date.now()}` };
  }

  if (provider === 'bolna') {
    if (!cfg('BOLNA_API_KEY') || !cfg('BOLNA_AGENT_ID')) throw new Error('Set BOLNA_API_KEY and BOLNA_AGENT_ID');
    // Check field names against Bolna's current API docs before going live.
    const res = await fetch(`${cfg('BOLNA_API_URL') || 'https://api.bolna.ai'}/call`, {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg('BOLNA_API_KEY')}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        agent_id: cfg('BOLNA_AGENT_ID'),
        recipient_phone_number: candidate.phone,
        ...(cfg('BOLNA_FROM_NUMBER') ? { from_phone_number: cfg('BOLNA_FROM_NUMBER') } : {}),
        user_data: {
          screening_id: String(screening.id),
          candidate_name: candidate.name,
          job_title: job.title,
          intro: script.intro,
          questions: script.questions.map((x, i) => `${i + 1}. ${x}`).join('\n'),
          outro: script.outro,
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || data?.error || `Bolna returned ${res.status}`);
    return { provider, callId: data.execution_id || data.call_id || data.id || null };
  }

  if (provider === 'webhook') {
    if (!cfg('VOICE_DISPATCH_URL')) throw new Error('Set VOICE_DISPATCH_URL');
    const res = await fetch(cfg('VOICE_DISPATCH_URL'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ screening_id: screening.id, phone: candidate.phone, candidate_name: candidate.name, job_title: job.title, script, callback_url: webhook }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Dispatch URL returned ${res.status}`);
    return { provider, callId: data.call_id || data.id || null };
  }

  throw new Error(`Unknown VOICE_PROVIDER "${provider}"`);
}

/** Normalises a provider webhook body into {screeningId, callId, status, transcript, recordingUrl, durationSec}. */
export function parseWebhook(provider, body) {
  const pick = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== '');
  if (provider === 'bolna') {
    const ud = body.context_details?.recipient_data || body.user_data || body.context_details || {};
    const raw = String(pick(body.status, body.call_status, '')).toLowerCase();
    let status = 'completed';
    if (/no-answer|no_answer|busy|not.answered|unanswered/.test(raw)) status = 'no_answer';
    else if (/fail|error|cancel/.test(raw)) status = 'failed';
    else if (/progress|ringing|initiated|queued/.test(raw)) status = 'calling';
    const transcript = typeof body.transcript === 'string' ? body.transcript : Array.isArray(body.transcript) ? body.transcript.map((t) => `${t.role || t.speaker}: ${t.content || t.text}`).join('\n') : '';
    return {
      screeningId: Number(pick(ud.screening_id, body.screening_id)),
      callId: pick(body.execution_id, body.id),
      status,
      transcript,
      recordingUrl: pick(body.telephony_data?.recording_url, body.recording_url),
      durationSec: Number(pick(body.telephony_data?.duration, body.conversation_duration, body.duration, 0)) || null,
    };
  }
  return {
    screeningId: Number(body.screening_id),
    callId: body.call_id || null,
    status: body.status || 'completed',
    transcript: body.transcript || '',
    recordingUrl: body.recording_url || null,
    durationSec: body.duration_sec ? Number(body.duration_sec) : null,
  };
}
