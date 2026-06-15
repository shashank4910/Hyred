import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Supabase Auth session middleware.
 *  - Refreshes the auth session cookie on every request (required for SSR).
 *  - Redirects unauthenticated users to /login for app pages.
 *  - Returns 401 JSON for unauthenticated /api/* calls.
 *
 * Public (no session required):
 *   /login, /auth/* (OAuth callback), /api/extension/* (own Bearer auth),
 *   /api/ingest (cron uses INGEST_SECRET), Next internals + static assets.
 */
const PUBLIC_PATHS = ['/login', '/auth', '/privacy', '/terms', '/contact', '/api/extension', '/api/ingest', '/free-tools', '/explore'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/static')
  ) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          response = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() refreshes the session and must run for every request.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isPublic(pathname)) {
    return response;
  }

  if (!user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
