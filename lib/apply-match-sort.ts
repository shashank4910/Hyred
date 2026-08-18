import type { MatchSortMode } from './ui';

type OrderableQuery = {
  order: (
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean; foreignTable?: string },
  ) => OrderableQuery;
};

/**
 * Server-side order for pagination. "posted" (Newest) orders by when the match
 * was ADDED to the user's dashboard (matches.created_at) so a fresh scan's
 * results lead the list; each page is then re-ranked with
 * sortMatchesByFreshness. Score keeps the previous behavior.
 */
export function applyMatchSort<T extends OrderableQuery>(query: T, sort: MatchSortMode): T {
  if (sort === 'posted') {
    return query
      .order('created_at', { ascending: false })
      .order('llm_score', { ascending: false }) as T;
  }
  return query
    .order('llm_score', { ascending: false })
    .order('fetched_at', { foreignTable: 'job', ascending: false }) as T;
}
