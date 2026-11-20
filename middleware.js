import { NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from './lib/session';

// Pages and APIs that do not need an HR login.
const PUBLIC = ['/login', '/careers', '/share', '/book', '/api/public', '/api/inbound', '/api/webhooks', '/api/cron', '/_next', '/favicon'];

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p + '?'))) {
    return NextResponse.next();
  }
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    // Visitors who open the main address (e.g. from a shared link) see the open jobs, not the HR login.
    if (pathname === '/') {
      const url = req.nextUrl.clone();
      url.pathname = '/careers';
      url.search = '';
      return NextResponse.redirect(url);
    }
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
