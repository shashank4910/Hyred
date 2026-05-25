import { NextRequest, NextResponse } from 'next/server';
import { runIngest } from '@/lib/ingest';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Manual or cron-triggered ingest.
 *
 * Auth: if INGEST_SECRET env var is set, require either:
 *   - header `x-ingest-secret: <secret>`, OR
 *   - query `?secret=<secret>`
 *
 * If INGEST_SECRET is not set, allow open access (dev only).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.INGEST_SECRET;
  if (secret) {
    const got =
      req.headers.get('x-ingest-secret') ??
      new URL(req.url).searchParams.get('secret');
    if (got !== secret) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await runIngest();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Allow GET as well so the cron job can hit a simple URL
export const GET = POST;
