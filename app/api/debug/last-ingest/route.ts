import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current-user';
import { supabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Diagnostic endpoint — returns the last 5 ingest runs for the signed-in user
 * with full timing, error details, and per-phase breakdown. Visit this URL
 * while a scan is running or after one completes to see what happened.
 *
 * Usage: GET /api/debug/last-ingest
 */
export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const sb = supabaseAdmin();

  // Fetch the last 5 ingest runs for this profile
  const { data: runs, error } = await sb
    .from('ingest_runs')
    .select('*')
    .eq('profile_id', profile.id)
    .order('started_at', { ascending: false })
    .limit(5);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get the currently running run (if any) — may not be in the last 5 if the
  // list is full of completed runs, but we want to check explicitly.
  const { data: activeRun } = await sb
    .from('ingest_runs')
    .select('*')
    .eq('profile_id', profile.id)
    .eq('status', 'running')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Build a timeline summary for each run
  const timelines = (runs ?? []).map((run: Record<string, unknown>) => {
    const raw = run as {
      id: string;
      status: string;
      triggered_by: string;
      started_at: string;
      finished_at: string | null;
      duration_ms: number | null;
      fetched: number | null;
      new_jobs: number | null;
      embedded: number | null;
      scored: number | null;
      matches_created: number | null;
      errors: unknown;
      /* started_at used as creation timestamp */
    };

    return {
      id: raw.id,
      status: raw.status,
      triggeredBy: raw.triggered_by,
      startedAt: raw.started_at,
      finishedAt: raw.finished_at ?? null,
      durationMs: raw.duration_ms,
      durationHuman: raw.duration_ms
        ? `${(raw.duration_ms / 1000).toFixed(0)}s (${(raw.duration_ms / 60000).toFixed(1)} min)`
        : null,
      phases: {
        fetched: raw.fetched ?? 0,
        newJobs: raw.new_jobs ?? 0,
        embedded: raw.embedded ?? 0,
        scored: raw.scored ?? 0,
        matchesCreated: raw.matches_created ?? 0,
      },
      // If the scan scored 0 but fetched > 0, this tells us which phase
      // was the bottleneck:
      bottleneck: raw.fetched && raw.fetched > 0 && raw.scored === 0
        ? (raw.embedded === 0
            ? 'Embed phase: 0 jobs had embeddings → scoring never started'
            : 'Scoring phase: jobs had embeddings but 0 were scored (pre-filter dropped all, or scoring failed)')
        : raw.fetched === 0
          ? 'Fetch phase: 0 jobs fetched from sources'
          : null,
      errors: (raw.errors ?? []) as { source: string; error: string }[],
      errorsFormatted: ((raw.errors ?? []) as { source: string; error: string }[])
        .map((e: { source: string; error: string }) => `[${e.source}] ${e.error}`)
        .join('; ') || '(none)',
    };
  });

  // Analyze the active run if one exists
  let activeAnalysis = null;
  if (activeRun) {
    const raw = activeRun as Record<string, unknown>;
    const startedAt = new Date(raw.started_at as string).getTime();
    const elapsedMs = Date.now() - startedAt;
    const rawErrors = (raw.errors ?? []) as { source: string; error: string }[];
    const fetched = (raw.fetched as number) ?? 0;
    const newJobs = (raw.new_jobs as number) ?? 0;
    const embedded = (raw.embedded as number) ?? 0;
    const scored = (raw.scored as number) ?? 0;

    // Determine bottleneck more precisely
    let bottleneck = null;
    if (fetched > 0 && scored === 0) {
      if (newJobs > 0 && embedded === 0) {
        bottleneck = '⛔ EMBED PHASE: New jobs were upserted but 0 got embeddings. OpenAI embed calls are likely failing or timing out. Check OPENAI_API_KEY.';
      } else if (newJobs > 0 && embedded > 0) {
        bottleneck = '❗ SCORING PHASE: Jobs were embedded but 0 got scored. LLM calls may be failing (check errors), or pre-filter dropped all candidates.';
      } else if (newJobs === 0) {
        bottleneck = 'ℹ️ No new jobs to process (all previously seen). 0 scored because there was nothing new to score.';
      }
    } else if (fetched === 0) {
      bottleneck = '⛔ FETCH PHASE: 0 jobs fetched from any source. Source APIs may be down or returning empty results.';
    }

    const suggestion = fetched > 0 && scored === 0
      ? `⏳ Running for ${(elapsedMs / 60000).toFixed(0)} min with ${fetched} fetched but 0 scored. ${bottleneck ?? 'Unknown phase bottleneck.'}`
      : null;

    activeAnalysis = {
      id: raw.id,
      status: raw.status,
      startedAt: raw.started_at,
      elapsedMs,
      elapsedHuman: `${(elapsedMs / 1000).toFixed(0)}s (${(elapsedMs / 60000).toFixed(1)} min)`,
      phases: {
        fetched,
        newJobs,
        embedded,
        scored,
        matchesCreated: (raw.matches_created as number) ?? 0,
      },
      bottleneck,
      suggestion,
      errors: rawErrors,
      errorsFormatted: rawErrors.map(e => `[${e.source}] ${e.error}`).join('; ') || '(none)',
    };
  }

  return NextResponse.json({
    profileId: profile.id,
    profileEmail: profile.email,
    activeRun: activeAnalysis,
    last5Scans: timelines,
    // Diagnostic guidance
    _help: {
      whatToCheck: [
        'If "fetched" > 0 and "embedded" = 0 → OpenAI API key issue or network timeout for embeddings',
        'If "embedded" > 0 and "scored" = 0 → LLM scoring failed or pre-filter dropped all candidates',
        'If all counts = 0 and duration_ms > 300s → function was killed by Vercel timeout before doing anything',
        'Check Vercel dashboard (vercel.com → project → Functions → latest invocation) for error logs',
      ],
    },
  });
}
