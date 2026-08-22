import type { supabaseAdmin } from './supabase/server';
import type { Preferences } from './types';
import { sanitizeCityFilter, sanitizeMatchSearchTerm, uniqueCitiesFromLocations } from './match-location-filter';
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
  /** When "1", skip the 45-day freshness window (show older/expired jobs too). */
  expired?: string;
  /** Comma-separated freshness ticks: 1d, 7d, 30d. Widest tick wins. */
  fresh?: string;
}

export const FRESHNESS_TICKS = [
  { id: '6h', days: 0.25, label: 'Last 6 hours' },
  { id: '12h', days: 0.5, label: 'Last 12 hours' },
  { id: '1d', days: 1, label: 'Last 24 hours' },
  { id: '7d', days: 7, label: 'This week' },
  { id: '30d', days: 30, label: 'This month' },
] as const;

export type FreshnessTickId = (typeof FRESHNESS_TICKS)[number]['id'];

/** Widest selected tick in days, or null when none are on (use the 45-day default). */
export function freshnessWindowDays(fresh: string | null | undefined): number | null {
  if (!fresh?.trim()) return null;
  const ids = new Set(fresh.split(',').map((s) => s.trim()));
  let max: number | null = null;
  for (const tick of FRESHNESS_TICKS) {
    if (!ids.has(tick.id)) continue;
    max = max == null ? tick.days : Math.max(max, tick.days);
  }
  return max;
}

/** Human label for the widest selected tick ("Last 6 hours", "This week", …). */
export function freshnessLabel(fresh: string | null | undefined): string {
  const days = freshnessWindowDays(fresh);
  if (days == null) return 'Freshness';
  const widest = FRESHNESS_TICKS.find((t) => t.days === days);
  return widest?.label ?? 'Freshness';
}

export function includeExpiredJobs(params: { expired?: string | null } | null | undefined): boolean {
  return params?.expired === '1';
}

/**
 * True when a job would normally be hidden by the dashboard freshness window.
 * Used for the "Older" badge when Include older jobs is on.
 */
export function isJobPastFreshnessWindow(job: {
  posted_at?: string | null;
  fetched_at?: string | null;
}, cutoffIso: string = staleJobCutoffIso()): boolean {
  const cutoff = new Date(cutoffIso).getTime();
  if (Number.isNaN(cutoff)) return false;
  const posted = job.posted_at ? new Date(job.posted_at).getTime() : null;
  const fetched = job.fetched_at ? new Date(job.fetched_at).getTime() : null;
  const postedOk = posted == null || Number.isNaN(posted) || posted >= cutoff;
  const fetchedOk = fetched != null && !Number.isNaN(fetched) && fetched >= cutoff;
  return !(postedOk || fetchedOk);
}

export function dashboardMinScore(preferences?: Preferences | null): number {
  return preferences?.min_score ?? DEFAULT_DASHBOARD_MIN_SCORE;
}

/**
 * Single parser for the URL `min` score floor, shared by the SSR list, the
 * /api/matches route, counts, and the city list so they can never disagree.
 * Empty/invalid → default 50; '0' → 0 (no floor, NULL llm_score rows included);
 * otherwise clamped to 0–100.
 */
export function parseMinScore(raw: string | null | undefined): number {
  if (raw == null || raw.trim() === '') return DEFAULT_DASHBOARD_MIN_SCORE;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_DASHBOARD_MIN_SCORE;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function staleJobCutoffIso(days: number = MAX_JOB_AGE_DAYS): string {
  const safeDays = Number.isFinite(days) && days > 0 ? days : MAX_JOB_AGE_DAYS;
  return new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();
}

/** Cutoff for the dashboard list: tick window, else the 45-day default. */
export function dashboardFreshnessCutoffIso(params: {
  fresh?: string | null;
} | null | undefined): string {
  const days = freshnessWindowDays(params?.fresh);
  return staleJobCutoffIso(days ?? MAX_JOB_AGE_DAYS);
}

/**
 * PostgREST `or` filter on `jobs` (use with `{ foreignTable: 'job' }`).
 *
 * Keep a match visible if ANY of:
 * - posted_at is unknown
 * - posted_at is within the freshness window
 * - fetched_at is within the window (Hyred discovered it recently)
 *
 * Why fetched_at: the card date uses discovery time, but some sources (JobsPipe,
 * Adzuna) write unreliable/old posted_at on upsert — which used to hide jobs
 * (and drop their city from the location dropdown) even though they were
 * found today.
 */
export function jobFreshnessOrFilter(cutoffIso: string = staleJobCutoffIso()): string {
  return `posted_at.gte.${cutoffIso},posted_at.is.null,fetched_at.gte.${cutoffIso}`;
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
    .or(jobFreshnessOrFilter(staleCutoff), { foreignTable: 'job' });
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
    .or(jobFreshnessOrFilter(staleCutoff), { foreignTable: 'job' });
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
  const minScore = parseMinScore(params.min);
  const staleCutoff = dashboardFreshnessCutoffIso(params);

  const baseCountQuery = () => {
    let q = sb
      .from('matches')
      .select(
        `id,
         job:jobs!inner(title, company, remote, source, posted_at, location)`,
        { count: 'exact', head: true }
      )
      .eq('profile_id', profileId);
    if (minScore > 0) {
      q = q.gte('llm_score', minScore);
    }

    if (!includeExpiredJobs(params)) {
      q = q.or(jobFreshnessOrFilter(staleCutoff), { foreignTable: 'job' });
    }

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
      const term = sanitizeMatchSearchTerm(params.q);
      if (term) {
        q = q.or(`title.ilike.%${term}%,company.ilike.%${term}%`, {
          foreignTable: 'job',
        });
      }
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
  const minScore = parseMinScore(params.min);
  const staleCutoff = dashboardFreshnessCutoffIso(params);
  const status = params.status ?? 'inbox';
  const onlyBookmarked = params.bookmarked === '1';

  let q = sb
    .from('matches')
    .select('job:jobs!inner(location, posted_at, fetched_at)')
    .eq('profile_id', profileId);
  if (minScore > 0) {
    q = q.gte('llm_score', minScore);
  }

  if (!includeExpiredJobs(params)) {
    q = q.or(jobFreshnessOrFilter(staleCutoff), { foreignTable: 'job' });
  }

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
    const term = sanitizeMatchSearchTerm(params.q);
    if (term) {
      q = q.or(`title.ilike.%${term}%,company.ilike.%${term}%`, {
        foreignTable: 'job',
      });
    }
  }

  // Prefer recently discovered jobs so rare cities (e.g. Noida) are not
  // dropped when the account has more than the sample cap.
  const { data } = await q
    .order('fetched_at', { ascending: false, foreignTable: 'job' })
    .limit(1000);

  const locations = (data ?? []).map((row) => {
    const job = row.job as unknown as { location: string | null } | null;
    return job?.location ?? null;
  });

  return uniqueCitiesFromLocations(locations);
}
