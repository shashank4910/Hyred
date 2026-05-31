import type { supabaseAdmin } from './supabase/server';

type AdminClient = ReturnType<typeof supabaseAdmin>;

/** Runs older than this with status=running are treated as abandoned (server timeout). */
export const INGEST_STALE_MS = 12 * 60 * 1000;

type RunPatch = {
  fetched?: number;
  new_jobs?: number;
  embedded?: number;
  scored?: number;
  matches_created?: number;
  errors?: { source: string; error: string }[];
  status?: 'running' | 'success' | 'partial' | 'failed';
  finished_at?: string;
  duration_ms?: number;
};

/** Persist mid-run progress so Stats is not stuck at zero while a scan is active. */
export async function patchIngestRun(
  sb: AdminClient,
  runId: string,
  patch: RunPatch,
): Promise<void> {
  await sb.from('ingest_runs').update(patch).eq('id', runId);
}

/**
 * Close ingest runs left in `running` after a serverless timeout or dropped
 * connection. Backfills matches_created from rows actually written for the profile.
 */
export async function closeStaleIngestRuns(
  sb: AdminClient,
  profileId?: string,
): Promise<number> {
  const cutoff = new Date(Date.now() - INGEST_STALE_MS).toISOString();

  let query = sb
    .from('ingest_runs')
    .select('id, profile_id, started_at')
    .eq('status', 'running')
    .lt('started_at', cutoff);

  if (profileId) {
    query = query.eq('profile_id', profileId);
  }

  const { data: stale } = await query;
  if (!stale?.length) return 0;

  for (const run of stale) {
    let matchesCreated = 0;
    if (run.profile_id) {
      const { count } = await sb
        .from('matches')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', run.profile_id as string)
        .gte('created_at', run.started_at as string);
      matchesCreated = count ?? 0;
    }

    const startedMs = new Date(run.started_at as string).getTime();
    await sb
      .from('ingest_runs')
      .update({
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedMs,
        matches_created: matchesCreated,
        status: 'failed',
        errors: [
          {
            source: 'timeout',
            error:
              'Scan was interrupted (server time limit or connection lost). Any matches already saved remain on your dashboard.',
          },
        ],
      })
      .eq('id', run.id);
  }

  return stale.length;
}

/** Block overlapping scans for the same profile (after stale cleanup). */
export async function assertNoActiveIngest(
  sb: AdminClient,
  profileId: string,
  excludeRunId?: string,
): Promise<void> {
  await closeStaleIngestRuns(sb, profileId);

  let query = sb
    .from('ingest_runs')
    .select('id')
    .eq('profile_id', profileId)
    .eq('status', 'running');

  if (excludeRunId) {
    query = query.neq('id', excludeRunId);
  }

  const { data: active } = await query.limit(1).maybeSingle();

  if (active) {
    throw new Error(
      'A scan is already running for your profile. Check Stats in a minute or refresh this page.',
    );
  }
}
