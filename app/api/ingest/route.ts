import { NextRequest, NextResponse } from 'next/server';
import { runIngest } from '@/lib/ingest';
import { verifySession, COOKIE } from '@/lib/auth';
import type { SourceName } from '@/lib/sources';

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
 * Optional body (JSON):
 *   { sources?: string[] } — restrict scan to specific sources only.
 *   Example: { sources: ["jsearch"] } will only scan JSearch.
 *   If omitted, scans all configured sources (default behavior).
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

  // Parse optional sources filter from request body
  let sources: SourceName[] | undefined;
  try {
    const body = await req.json().catch(() => null);
    if (body?.sources && Array.isArray(body.sources) && body.sources.length > 0) {
      sources = body.sources as SourceName[];
    }
  } catch { /* no body = scan all */ }

  try {
    const result = await runIngest({ triggeredBy: 'manual', sources });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Allow GET as well so the cron job can hit a simple URL
export const GET = POST;
