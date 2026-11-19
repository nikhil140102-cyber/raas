import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { linkedinAuthUrl, linkedinConfigured } from '@/lib/social';
import { token } from '@/lib/util';

export const runtime = 'nodejs';

// Sends HR to LinkedIn to allow posting on their profile.
export async function GET(req) {
  if (!(await currentUser())) return NextResponse.redirect(new URL('/login', req.url));
  const back = new URL(req.url).searchParams.get('back') || '/jobs';
  if (!linkedinConfigured()) return NextResponse.redirect(new URL(`${back}?msg=${encodeURIComponent('Add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET to the environment first.')}`, req.url));
  const state = token(12);
  const res = NextResponse.redirect(linkedinAuthUrl(state));
  res.cookies.set('li_state', JSON.stringify({ state, back }), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600 });
  return res;
}
