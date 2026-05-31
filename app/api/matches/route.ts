import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';

export const runtime = 'nodejs';

const PAGE_SIZE = 20;

/**
 * GET /api/matches — paginated match list for infinite scroll.
 *
 * Query params:
 *   page, status, sort, min, q, remote, source, bookmarked
 *
 * Returns: { matches, total, page, pageSize, hasMore }
 */
export async function GET(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const status = url.searchParams.get('status') ?? 'inbox';
  const sort = url.searchParams.get('sort') ?? 'score';
  const minScore = parseInt(url.searchParams.get('min') ?? '50', 10);
  const q = url.searchParams.get('q') ?? '';
  const remote = url.searchParams.get('remote') === '1';
  const bookmarked = url.searchParams.get('bookmarked') === '1';

  const sb = supabaseAdmin();
  const offset = (page - 1) * PAGE_SIZE;

  let query = sb
    .from('matches')
    .select(
      `id, llm_score, similarity, reason, status, bookmarked, matched_skills, missing_skills, applied_at, created_at, updated_at,
       job:jobs!inner(id, title, company, location, remote, url, source, salary, posted_at, fetched_at)`,
      { count: 'exact' },
    )
    .eq('profile_id', profile.id)
    .gte('llm_score', minScore);

  const staleCutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
  query = query.or(`posted_at.gte.${staleCutoff},posted_at.is.null`, { foreignTable: 'job' });

  if (bookmarked) {
    query = query.eq('bookmarked', true);
  } else if (status === 'inbox') {
    query = query.in('status', ['new', 'viewed']);
  } else {
    query = query.eq('status', status);
  }

  switch (sort) {
    case 'posted':
      query = query
        .order('posted_at', { foreignTable: 'job', ascending: false, nullsFirst: false })
        .order('fetched_at', { foreignTable: 'job', ascending: false });
      break;
    case 'score':
      query = query
        .order('llm_score', { ascending: false })
        .order('fetched_at', { foreignTable: 'job', ascending: false });
      break;
    case 'activity':
      query = query.order('updated_at', { ascending: false });
      break;
    case 'oldest':
      query = query.order('fetched_at', { foreignTable: 'job', ascending: true });
      break;
    default:
      query = query.order('fetched_at', { foreignTable: 'job', ascending: false });
      break;
  }

  if (q) {
    const term = q.replace(/[%]/g, '');
    query = query.or(`title.ilike.%${term}%,company.ilike.%${term}%`, { foreignTable: 'jobs' });
  }
  if (remote) {
    query = query.eq('jobs.remote', true);
  }

  const { data: matches, count } = await query.range(offset, offset + PAGE_SIZE - 1);

  const total = count ?? 0;
  const hasMore = offset + PAGE_SIZE < total;

  return NextResponse.json(
    { matches: matches ?? [], total, page, pageSize: PAGE_SIZE, hasMore },
    { headers: { 'Cache-Control': 'private, s-maxage=30, stale-while-revalidate=60' } },
  );
}
