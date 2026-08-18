/** How a job seeker means "newest": when this listing last became current. */

const DAY_MS = 24 * 60 * 60 * 1000;

type JobDates = {
  posted_at?: string | null;
  fetched_at?: string | null;
};

function asJobDates(job: JobDates | JobDates[] | null | undefined): JobDates {
  if (Array.isArray(job)) return job[0] ?? {};
  return job ?? {};
}

function parseTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Ignore employer dates that are in the future (bad APIs) so they cannot
 * jump the queue. Ancient posted_at is kept for GREATEST vs fetched_at —
 * a 2019 post date loses to a discovery from this week.
 */
export function jobListingTime(
  job: JobDates | JobDates[] | null | undefined,
  nowMs: number = Date.now(),
): number {
  const dates = asJobDates(job);
  const fetched = parseTime(dates.fetched_at);
  const posted = parseTime(dates.posted_at);
  const futureLimit = nowMs + DAY_MS;
  const postedOk = posted != null && posted <= futureLimit ? posted : null;
  return Math.max(postedOk ?? 0, fetched ?? 0);
}

export function jobListingIso(job: JobDates | JobDates[] | null | undefined): string | null {
  const dates = asJobDates(job);
  const t = jobListingTime(dates);
  if (t > 0) return new Date(t).toISOString();
  return dates.fetched_at ?? dates.posted_at ?? null;
}

export type MatchDates = {
  created_at?: string | null;
  job?: JobDates | JobDates[] | null | undefined;
};

/**
 * When a match became "new" for the user: the later of the job's listing time
 * and when the match was created (i.e. when a scan surfaced it). A match
 * created 3 hours ago for a job first discovered yesterday reads "3 hours
 * ago", not "1 day ago" — otherwise a fresh scan's results look stale.
 */
export function matchListingTime(
  match: MatchDates | null | undefined,
  nowMs: number = Date.now(),
): number {
  const created = parseTime(match?.created_at);
  return Math.max(jobListingTime(match?.job, nowMs), created ?? 0);
}

export function matchListingIso(match: MatchDates | null | undefined): string | null {
  const t = matchListingTime(match);
  if (t > 0) return new Date(t).toISOString();
  return jobListingIso(match?.job);
}

/**
 * "Newest" order for the dashboard: matches surfaced most recently first.
 * Sorted by when the match was ADDED to the user's dashboard (created_at) —
 * not the raw job listing date, so a scan's fresh results lead the list
 * instead of being buried under old high scorers. Ties fall back to score.
 */
export function sortMatchesByFreshness<
  T extends {
    llm_score?: number | null;
    created_at?: string | null;
    job?: JobDates | JobDates[] | null | undefined;
  },
>(matches: T[]): T[] {
  return [...matches].sort((a, b) => {
    const byTime = (parseTime(b.created_at) ?? 0) - (parseTime(a.created_at) ?? 0);
    if (byTime !== 0) return byTime;
    return (b.llm_score ?? 0) - (a.llm_score ?? 0);
  });
}
