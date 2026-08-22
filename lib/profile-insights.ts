import type { Preferences, ResumeInsights } from './types';

const MATCH_STATUSES_CLEARED_ON_RESUME_CHANGE = ['new', 'viewed', 'rejected'] as const;

/** Drop cached ingest search profile so the next scan re-derives from resume. */
export function stripSearchProfile(
  insights: ResumeInsights | null | undefined,
): ResumeInsights | null {
  if (!insights || typeof insights !== 'object') return insights ?? null;
  const next = { ...(insights as Record<string, unknown>) };
  delete next.search_profile;
  return next as ResumeInsights;
}

/**
 * When the resume changes, preferences must follow the NEW resume — not stale
 * values adopted from a previous account/session (e.g. HR roles on a marketing CV).
 */
export function preferencesFromResumeInsights(
  preferences: Preferences,
  insights: ResumeInsights | null | undefined,
): Preferences {
  if (!insights) return preferences;

  let next: Preferences = { ...preferences };

  if (insights.suggested_roles?.length) {
    next = { ...next, roles: insights.suggested_roles };
  }

  if (insights.current_location) {
    const locs = new Set<string>(next.locations ?? []);
    locs.add(insights.current_location);
    if (next.remote_only) locs.add('Remote');
    next = { ...next, locations: [...locs] };
  }

  return next;
}

/** Drop match rows that should be re-scored after a resume upload. Keeps saved/applied pipeline rows. */
export async function clearMatchesForResumeChange(
  sb: ReturnType<typeof import('./supabase/server').supabaseAdmin>,
  profileId: string,
): Promise<number> {
  const { data, error } = await sb
    .from('matches')
    .delete()
    .eq('profile_id', profileId)
    .in('status', [...MATCH_STATUSES_CLEARED_ON_RESUME_CHANGE])
    .select('job_id');
  if (error) throw new Error(`Failed to clear matches after resume change: ${error.message}`);

  // Also drop the corresponding job_scores ledger rows (rejects included) so
  // the next scan re-scores those jobs against the NEW resume — otherwise the
  // ledger would suppress exactly the re-scoring the clear was for.
  const clearedJobIds = (data ?? []).map((r) => r.job_id as string).filter(Boolean);
  if (clearedJobIds.length > 0) {
    const { error: ledgerError } = await sb
      .from('job_scores')
      .delete()
      .eq('profile_id', profileId)
      .in('job_id', clearedJobIds);
    if (ledgerError && ledgerError.code !== '42P01') {
      // 42P01 = table missing (pre-0022) — nothing to clear yet.
      console.warn('[profile] job_scores ledger clear failed:', ledgerError.message);
    }
  }

  return data?.length ?? 0;
}
