/** How a job seeker means "newest": when this listing last became current. */

const DAY_MS = 24 * 60 * 60 * 1000;

type JobDates = {
  posted_at?: string | null;
  fetched_at?: string | null;
};

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
export function jobListingTime(job: JobDates, nowMs: number = Date.now()): number {
  const fetched = parseTime(job.fetched_at);
  const posted = parseTime(job.posted_at);
  const futureLimit = nowMs + DAY_MS;
  const postedOk = posted != null && posted <= futureLimit ? posted : null;
  return Math.max(postedOk ?? 0, fetched ?? 0);
}

export function jobListingIso(job: JobDates): string | null {
  const t = jobListingTime(job);
  if (t > 0) return new Date(t).toISOString();
  return job.fetched_at ?? job.posted_at ?? null;
}

export function sortMatchesByFreshness<T extends { llm_score?: number | null; job: JobDates }>(
  matches: T[],
): T[] {
  return [...matches].sort((a, b) => {
    const byTime = jobListingTime(b.job) - jobListingTime(a.job);
    if (byTime !== 0) return byTime;
    return (b.llm_score ?? 0) - (a.llm_score ?? 0);
  });
}
