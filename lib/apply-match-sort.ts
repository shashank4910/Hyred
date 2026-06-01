import type { MatchSortMode } from './ui';

type OrderableQuery = {
  order: (
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean; foreignTable?: string },
  ) => OrderableQuery;
};

/** Apply dashboard / matches API sort to a Supabase matches query. */
export function applyMatchSort<T extends OrderableQuery>(query: T, sort: MatchSortMode): T {
  switch (sort) {
    case 'posted':
      return query
        .order('posted_at', { foreignTable: 'job', ascending: false, nullsFirst: false })
        .order('fetched_at', { foreignTable: 'job', ascending: false }) as T;
    case 'score':
      return query
        .order('llm_score', { ascending: false })
        .order('fetched_at', { foreignTable: 'job', ascending: false }) as T;
    case 'activity':
      return query.order('updated_at', { ascending: false }) as T;
    case 'oldest':
      return query.order('fetched_at', { foreignTable: 'job', ascending: true }) as T;
    case 'newest':
      return query.order('fetched_at', { foreignTable: 'job', ascending: false }) as T;
    default:
      return query
        .order('llm_score', { ascending: false })
        .order('fetched_at', { foreignTable: 'job', ascending: false }) as T;
  }
}
