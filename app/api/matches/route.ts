import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile, isCurrentUserAdmin } from '@/lib/current-user';
import { applyMatchSort } from '@/lib/apply-match-sort';
import { resolveMatchSort } from '@/lib/ui';
import { enrichMatchListSkills } from '@/lib/match-skill-enrich';
import { sanitizeCityFilter } from '@/lib/match-location-filter';
// Keep in sync with MATCH_LIST_SELECT in lib/match-list-select.ts

export const runtime = 'nodejs';

const PAGE_SIZE = 20;

/**
 * GET /api/matches — paginated match list for infinite scroll.
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
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const status = url.searchParams.get('status') ?? 'inbox';
  const sort = resolveMatchSort(url.searchParams.get('sort'));
  const minScore = parseInt(url.searchParams.get('min') ?? '50', 10);
  const q = url.searchParams.get('q') ?? '';
  const remote = url.searchParams.get('remote') === '1';
  const city = sanitizeCityFilter(url.searchParams.get('city'));
  const bookmarked = url.searchParams.get('bookmarked') === '1';

  const sb = supabaseAdmin();
  const offset = (page - 1) * PAGE_SIZE;

  let query = sb
    .from('matches')
    .select(
      `id, llm_score, similarity, reason, status, bookmarked, matched_skills, missing_skills, applied_at, created_at, updated_at,
       job:jobs!inner(id, title, company, location, remote, url, source, salary, posted_at, fetched_at, description)`,
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

  query = applyMatchSort(query, sort);

  if (q) {
    const term = q.replace(/[%_]/g, '');
    query = query.or(`title.ilike.%${term}%,company.ilike.%${term}%`, { foreignTable: 'job' });
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

  const { data: matches, count } = await query.range(offset, offset + PAGE_SIZE - 1);

  const topSkills: string[] = Array.isArray((profile.insights as { top_skills?: string[] } | null)?.top_skills)
    ? (profile.insights as { top_skills: string[] }).top_skills
    : [];

  const enriched = (matches ?? []).map((m) => {
    const raw = m as unknown as {
      matched_skills: string[] | null;
      missing_skills: string[] | null;
      job: { title: string; description: string | null };
    };
    const skills = enrichMatchListSkills(
      raw.matched_skills,
      raw.missing_skills,
      topSkills,
      raw.job?.title ?? '',
      raw.job?.description,
    );
    return { ...m, matched_skills: skills.matched_skills, missing_skills: skills.missing_skills };
  });

  const total = count ?? 0;
  const hasMore = offset + PAGE_SIZE < total;

  return NextResponse.json(
    { matches: enriched, total, page, pageSize: PAGE_SIZE, hasMore },
    { headers: { 'Cache-Control': 'private, s-maxage=30, stale-while-revalidate=60' } },
  );
}
