import { NextResponse } from 'next/server';
import { currentStaff as currentUser } from '@/lib/auth';
import { setSetting } from '@/lib/db';
import { linkedinExchange } from '@/lib/social';

export const runtime = 'nodejs';

// LinkedIn sends the user back here after they allow (or cancel) access.
export async function GET(req) {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));
  const url = new URL(req.url);
  let saved = {};
  try { saved = JSON.parse(req.cookies.get('li_state')?.value || '{}'); } catch { /* ignore */ }
  const back = saved.back || '/jobs';
  const go = (msg) => {
    const res = NextResponse.redirect(new URL(`${back}?msg=${encodeURIComponent(msg)}`, req.url));
    res.cookies.delete('li_state');
    return res;
  };
  if (url.searchParams.get('error')) return go(`LinkedIn: ${url.searchParams.get('error_description') || 'access was not given'}`);
  if (!saved.state || saved.state !== url.searchParams.get('state')) return go('LinkedIn sign-in expired. Please try again.');
  try {
    const conn = await linkedinExchange(url.searchParams.get('code'));
    await setSetting(`linkedin:${user.id}`, conn);
    return go(`LinkedIn connected as ${conn.name}.`);
  } catch (e) {
    return go(`LinkedIn connection failed: ${e.message}`);
  }
}
