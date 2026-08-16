import type { MatchSortMode } from './ui';

type OrderableQuery = {
  order: (
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean; foreignTable?: string },
  ) => OrderableQuery;
};

/**
 * Server-side order for pagination. "posted" (Newest) uses discovery time so
 * pages stay stable; each page is then re-ranked with jobListingTime.
 */
export function applyMatchSort<T extends OrderableQuery>(query: T, sort: MatchSortMode): T {
  if (sort === 'posted') {
    return query
      .order('fetched_at', { foreignTable: 'job', ascending: false })
      .order('posted_at', { foreignTable: 'job', ascending: false, nullsFirst: false }) as T;
  }
  return query
    .order('llm_score', { ascending: false })
    .order('fetched_at', { foreignTable: 'job', ascending: false }) as T;
}
