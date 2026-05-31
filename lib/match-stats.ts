import type { supabaseAdmin } from './supabase/server';
import type { Preferences } from './types';

export const DEFAULT_DASHBOARD_MIN_SCORE = 50;
export const MAX_JOB_AGE_DAYS = 45;

type AdminClient = ReturnType<typeof supabaseAdmin>;

export function dashboardMinScore(preferences?: Preferences | null): number {
  return preferences?.min_score ?? DEFAULT_DASHBOARD_MIN_SCORE;
}

export function staleJobCutoffIso(): string {
  return new Date(
    Date.now() - MAX_JOB_AGE_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
}

/** Matches the Matches page default list: score floor + fresh jobs only. */
function visibleOnDashboardQuery(
  sb: AdminClient,
  profileId: string,
  minScore: number,
) {
  const staleCutoff = staleJobCutoffIso();
  return sb
    .from('matches')
    .select('id, job:jobs!inner(posted_at)', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .gte('llm_score', minScore)
    .or(`posted_at.gte.${staleCutoff},posted_at.is.null`, { foreignTable: 'job' });
}

export async function countVisibleOnDashboard(
  sb: AdminClient,
  profileId: string,
  minScore: number,
): Promise<number> {
  const { count } = await visibleOnDashboardQuery(sb, profileId, minScore);
  return count ?? 0;
}

export async function countVisibleInbox(
  sb: AdminClient,
  profileId: string,
  minScore: number,
): Promise<number> {
  const staleCutoff = staleJobCutoffIso();
  const { count } = await sb
    .from('matches')
    .select('id, job:jobs!inner(posted_at)', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .gte('llm_score', minScore)
    .in('status', ['new', 'viewed'])
    .or(`posted_at.gte.${staleCutoff},posted_at.is.null`, { foreignTable: 'job' });
  return count ?? 0;
}

export async function countAllTracked(
  sb: AdminClient,
  profileId: string,
): Promise<number> {
  const { count } = await sb
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId);
  return count ?? 0;
}

export async function countByStatus(
  sb: AdminClient,
  profileId: string,
  status: string,
): Promise<number> {
  const { count } = await sb
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .eq('status', status);
  return count ?? 0;
}
