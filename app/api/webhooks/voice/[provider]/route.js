import { cfg } from '@/lib/config';
import { NextResponse } from 'next/server';
import { parseWebhook } from '@/lib/voice';
import { finishCall } from '@/lib/screening';
import { one } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 60;

// The voice platform calls this when a call changes status or ends.
export async function POST(req, { params }) {
  const { provider } = await params;
  const url = new URL(req.url);
  const secret = cfg('VOICE_WEBHOOK_SECRET');
  if (!secret || (url.searchParams.get('secret') !== secret && req.headers.get('x-webhook-secret') !== secret)) {
    return NextResponse.json({ error: 'Bad secret' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const evt = parseWebhook(provider, body);
  let screeningId = evt.screeningId;
  if (!screeningId && evt.callId) screeningId = (await one('SELECT id FROM screenings WHERE provider_call_id = $1', [String(evt.callId)]))?.id;
  if (!screeningId) return NextResponse.json({ error: 'Unknown call' }, { status: 404 });
  try {
    await finishCall(screeningId, evt);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('voice webhook', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
