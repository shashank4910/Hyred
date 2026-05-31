import { NextRequest, NextResponse } from 'next/server';
import { runIngest, runIngestForAllProfiles } from '@/lib/ingest';
import { getCurrentProfile } from '@/lib/current-user';
import type { SourceName } from '@/lib/sources';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Manual or cron-triggered ingest.
 *
 * Auth + targeting:
 *   1. Signed-in dashboard user (Supabase session) → scans ONLY that user's
 *      profile (per-user "Run scan" button).
 *   2. Header `x-ingest-secret` / `?secret=` matching INGEST_SECRET (cron /
 *      external) → scans ALL onboarded profiles.
 *
 * Optional body (JSON): { sources?: string[], triggeredBy?: 'manual' | 'onboarding' }
 * to restrict sources or tag auto-scan runs.
 */
export async function POST(req: NextRequest) {
  // 1. Signed-in user → their own profile only.
  const profile = await getCurrentProfile();

  // Parse optional body.
  let sources: SourceName[] | undefined;
  let triggeredBy: 'manual' | 'onboarding' = 'manual';
  try {
    const body = await req.json().catch(() => null);
    if (body?.sources && Array.isArray(body.sources) && body.sources.length > 0) {
      sources = body.sources as SourceName[];
    }
    if (body?.triggeredBy === 'onboarding') {
      triggeredBy = 'onboarding';
    }
  } catch {
    /* no body = scan all sources */
  }

  if (profile) {
    if (!profile.resume_text || !profile.resume_embedding) {
      return NextResponse.json(
        { error: 'Complete onboarding (upload your resume) before scanning.' },
        { status: 400 },
      );
    }
    try {
      const result = await runIngest({
        profileId: profile.id,
        triggeredBy,
        sources,
      });
      return NextResponse.json(result);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }

  // 2. No session → require INGEST_SECRET, then scan all profiles (cron).
  const secret = process.env.INGEST_SECRET;
  if (secret) {
    const got =
      req.headers.get('x-ingest-secret') ??
      new URL(req.url).searchParams.get('secret');
    if (got !== secret) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  } else {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const summary = await runIngestForAllProfiles({ triggeredBy: 'cron', sources });
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Allow GET as well so a cron job can hit a simple URL.
export const GET = POST;
