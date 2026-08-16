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
    case 'company':
      return query
        .order('company', { foreignTable: 'job', ascending: true, nullsFirst: false })
        .order('llm_score', { ascending: false }) as T;
    case 'score':
    default:
      return query
        .order('llm_score', { ascending: false })
        .order('fetched_at', { foreignTable: 'job', ascending: false }) as T;
  }
}
