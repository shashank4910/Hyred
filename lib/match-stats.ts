import type { supabaseAdmin } from './supabase/server';
import type { Preferences } from './types';
import { sanitizeCityFilter, uniqueCitiesFromLocations } from './match-location-filter';
import { STATUS_ORDER } from './ui';

export const DEFAULT_DASHBOARD_MIN_SCORE = 50;
export const MAX_JOB_AGE_DAYS = 45;

type AdminClient = ReturnType<typeof supabaseAdmin>;

export interface MatchFilterParams {
  min?: string;
  remote?: string;
  /** City substring filter against jobs.location (e.g. "Gurgaon"). */
  city?: string;
  source?: string;
  q?: string;
}

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

/** Computes filtered counts for all tabs on the dashboard, in sync with query filters. */
export async function getDashboardCounts(
  sb: AdminClient,
  profileId: string,
  params: MatchFilterParams,
  isAdmin: boolean = false,
) {
  const minScore = params.min ? Number(params.min) : 50;
  const staleCutoff = staleJobCutoffIso();

  const baseCountQuery = () => {
    let q = sb
      .from('matches')
      .select(
        `id,
         job:jobs!inner(title, company, remote, source, posted_at, location)`,
        { count: 'exact', head: true }
      )
      .eq('profile_id', profileId)
      .gte('llm_score', minScore);

    q = q.or(`posted_at.gte.${staleCutoff},posted_at.is.null`, { foreignTable: 'job' });

    if (isAdmin && params.source) {
      q = q.eq('job.source', params.source);
    }
    if (params.remote === '1') {
      q = q.eq('job.remote', true);
    }
    const city = sanitizeCityFilter(params.city);
    if (city) {
      q = q.ilike('job.location', `%${city}%`);
    }
    if (params.q) {
      const term = params.q.replace(/[%_]/g, '');
      q = q.or(`title.ilike.%${term}%,company.ilike.%${term}%`, {
        foreignTable: 'job',
      });
    }

    return q;
  };

  // Calculate inbox, bookmarked, and status counts in parallel
  const [inboxRes, bookmarkedRes, ...statusResults] = await Promise.all([
    baseCountQuery().in('status', ['new', 'viewed']),
    baseCountQuery().eq('bookmarked', true),
    ...STATUS_ORDER.map((s) => baseCountQuery().eq('status', s)),
  ]);

  const counts: Record<string, number> = {};
  STATUS_ORDER.forEach((s, i) => {
    counts[s] = statusResults[i].count ?? 0;
  });

  return {
    inboxCount: inboxRes.count ?? 0,
    bookmarkedCount: bookmarkedRes.count ?? 0,
    counts,
  };
}

/**
 * Distinct city labels from matches under the current dashboard filters
 * (status / score / source / search). City + remote filters are ignored so
 * the location dropdown still lists switchable cities.
 */
export async function listMatchCities(
  sb: AdminClient,
  profileId: string,
  params: MatchFilterParams & { status?: string; bookmarked?: string },
  isAdmin: boolean = false,
): Promise<string[]> {
  const minScore = params.min ? Number(params.min) : DEFAULT_DASHBOARD_MIN_SCORE;
  const staleCutoff = staleJobCutoffIso();
  const status = params.status ?? 'inbox';
  const onlyBookmarked = params.bookmarked === '1';

  let q = sb
    .from('matches')
    .select('job:jobs!inner(location, posted_at, title, company, source)')
    .eq('profile_id', profileId)
    .gte('llm_score', minScore)
    .or(`posted_at.gte.${staleCutoff},posted_at.is.null`, { foreignTable: 'job' });

  if (onlyBookmarked) {
    q = q.eq('bookmarked', true);
  } else if (status === 'inbox') {
    q = q.in('status', ['new', 'viewed']);
  } else {
    q = q.eq('status', status);
  }

  if (isAdmin && params.source) {
    q = q.eq('job.source', params.source);
  }
  if (params.q) {
    const term = params.q.replace(/[%_]/g, '');
    q = q.or(`title.ilike.%${term}%,company.ilike.%${term}%`, {
      foreignTable: 'job',
    });
  }

  // Cap for safety — city labels only, so a few hundred rows is enough.
  const { data } = await q.limit(1000);

  const locations = (data ?? []).map((row) => {
    const job = row.job as unknown as { location: string | null } | null;
    return job?.location ?? null;
  });

  return uniqueCitiesFromLocations(locations);
}
