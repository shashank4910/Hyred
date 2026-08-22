import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile, isCurrentUserAdmin } from '@/lib/current-user';
import { applyMatchSort } from '@/lib/apply-match-sort';
import { resolveMatchSort } from '@/lib/ui';
import { enrichMatchListSkills } from '@/lib/match-skill-enrich';
import { sanitizeCityFilter, sanitizeMatchSearchTerm } from '@/lib/match-location-filter';
import { MATCH_LIST_SELECT } from '@/lib/match-list-select';
import { includeExpiredJobs, jobFreshnessOrFilter, dashboardFreshnessCutoffIso, parseMinScore } from '@/lib/match-stats';
import { sortMatchesByFreshness } from '@/lib/job-listing-time';

export const runtime = 'nodejs';

const PAGE_SIZE = 20;

/**
 * GET /api/matches — paginated match list for infinite scroll + fast filter refresh.
 *
 * Query params:
 *   page, status, sort, min, q, remote, city, source, bookmarked
 *
 * Returns: { matches, total, page, pageSize, hasMore }
 */
export async function GET(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const isAdmin = await isCurrentUserAdmin();

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const status = url.searchParams.get('status') ?? 'inbox';
  const sort = resolveMatchSort(url.searchParams.get('sort'));
  const minScore = parseMinScore(url.searchParams.get('min'));
  const q = url.searchParams.get('q') ?? '';
  const remote = url.searchParams.get('remote') === '1';
  const city = sanitizeCityFilter(url.searchParams.get('city'));
  const bookmarked = url.searchParams.get('bookmarked') === '1';
  const showExpired = includeExpiredJobs({ expired: url.searchParams.get('expired') });

  const sb = supabaseAdmin();
  const offset = (page - 1) * PAGE_SIZE;

  // Slim select — no JD description blob (was the slow part of list loads).
  // min=0 means no floor at all: NULL llm_score rows stay visible, matching
  // the SSR list in DashboardMatchResults.
  // Exact counts are expensive — only compute on page 1; the client already
  // holds the total from the first page and ignores later ones.
  const wantCount = page === 1;
  let query = sb
    .from('matches')
    .select(MATCH_LIST_SELECT, wantCount ? { count: 'exact' as const } : undefined)
    .eq('profile_id', profile.id);
  if (minScore > 0) {
    query = query.gte('llm_score', minScore);
  }

  const staleCutoff = dashboardFreshnessCutoffIso({
    fresh: url.searchParams.get('fresh'),
  });
  if (!showExpired) {
    query = query.or(jobFreshnessOrFilter(staleCutoff), { foreignTable: 'job' });
  }

  if (bookmarked) {
    query = query.eq('bookmarked', true);
  } else if (status === 'inbox') {
    query = query.in('status', ['new', 'viewed']);
  } else {
    query = query.eq('status', status);
  }

  query = applyMatchSort(query, sort);

  if (q) {
    const term = sanitizeMatchSearchTerm(q);
    if (term) {
      query = query.or(`title.ilike.%${term}%,company.ilike.%${term}%`, { foreignTable: 'job' });
    }
  }
  if (remote) {
    query = query.eq('job.remote', true);
  }
  if (city) {
    query = query.ilike('job.location', `%${city}%`);
  }
  const source = url.searchParams.get('source') ?? '';
  if (isAdmin && source) {
    query = query.eq('job.source', source);
  }

  const { data: matches, count, error } = await query.range(offset, offset + PAGE_SIZE - 1);
  if (error) {
    console.error('[api/matches] query failed:', error.message);
    return NextResponse.json({ error: 'query_failed' }, { status: 500 });
  }

  const topSkills: string[] = Array.isArray((profile.insights as { top_skills?: string[] } | null)?.top_skills)
    ? (profile.insights as { top_skills: string[] }).top_skills
    : [];

  const enriched = (matches ?? []).map((m) => {
    const raw = m as unknown as {
      matched_skills: string[] | null;
      missing_skills: string[] | null;
      job: { title: string };
    };
    const skills = enrichMatchListSkills(
      raw.matched_skills,
      raw.missing_skills,
      topSkills,
      raw.job?.title ?? '',
      null,
    );
    return { ...m, matched_skills: skills.matched_skills, missing_skills: skills.missing_skills };
  });

  const ordered = sort === 'posted' ? sortMatchesByFreshness(enriched) : enriched;

  let total = 0;
  let hasMore = false;
  if (wantCount) {
    total = count ?? 0;
    hasMore = offset + PAGE_SIZE < total;
  } else {
    // No count ran — a full page means there is probably more.
    hasMore = (ordered?.length ?? 0) === PAGE_SIZE;
  }

  const body: Record<string, unknown> = {
    matches: ordered,
    page,
    pageSize: PAGE_SIZE,
    hasMore,
  };
  if (wantCount) body.total = total;

  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'private, max-age=0, stale-while-revalidate=30' },
  });
}
