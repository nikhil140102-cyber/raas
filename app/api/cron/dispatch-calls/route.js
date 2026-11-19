import { NextResponse } from 'next/server';
import { cronAllowed } from '@/lib/cronAuth';
import { dispatchDueCalls } from '@/lib/screening';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Run every 5–15 minutes: starts AI calls whose booked slot has arrived.
export async function GET(req) {
  if (!cronAllowed(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json(await dispatchDueCalls());
}
