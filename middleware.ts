import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE } from '@/lib/auth';

const PUBLIC_PATHS = [
  '/login',
  '/api/login',
  '/api/ingest',
  // Extension API: each route enforces its own Bearer-JWT check;
  // skip cookie-based middleware entirely so CORS preflight/Authorization
  // works without a user session cookie.
  '/api/extension',
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow Next internals + static assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/static') ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE.name)?.value;
  const ok = await verifySession(token);
  if (ok) return NextResponse.next();

  // For API routes, return 401 JSON
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
