import { NextRequest, NextResponse } from 'next/server';
import { runIngest } from '@/lib/ingest';
import { verifySession, COOKIE } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Manual or cron-triggered ingest.
 *
 * Auth: accepts ANY of:
 *   1. Valid session cookie (logged-in dashboard user clicking "Run scan")
 *   2. Header `x-ingest-secret: <secret>` (GitHub Actions cron)
 *   3. Query `?secret=<secret>` (convenience for cURL)
 *
 * If INGEST_SECRET is not set AND no session, allow open access (dev only).
 */
export async function POST(req: NextRequest) {
  // Check session cookie first — dashboard users are always allowed
  const token = req.cookies.get(COOKIE.name)?.value;
  const hasValidSession = await verifySession(token);

  if (!hasValidSession) {
    // Fall back to INGEST_SECRET check for cron / external callers
    const secret = process.env.INGEST_SECRET;
    if (secret) {
      const got =
        req.headers.get('x-ingest-secret') ??
        new URL(req.url).searchParams.get('secret');
      if (got !== secret) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      }
    }
  }

  try {
    const result = await runIngest({ triggeredBy: 'manual' });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Allow GET as well so the cron job can hit a simple URL
export const GET = POST;
