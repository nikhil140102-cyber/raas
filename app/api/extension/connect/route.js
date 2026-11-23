import { NextResponse } from 'next/server';
import { importUser } from '@/lib/importAuth';
import { issueExtensionKey } from '@/lib/inbound';

export const runtime = 'nodejs';

/** Gives the signed-in team member a personal key for the Chrome extension (replaces their previous one). */
export async function POST() {
  const { me, error } = await importUser();
  if (error) return error;
  const key = await issueExtensionKey(me.id);
  return NextResponse.json({ ok: true, key, name: me.name }, { headers: { 'Cache-Control': 'no-store' } });
}
