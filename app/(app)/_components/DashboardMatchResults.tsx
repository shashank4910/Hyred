import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';
import { applyMatchSort } from '@/lib/apply-match-sort';
import { resolveMatchSort } from '@/lib/ui';
import { enrichMatchListSkills } from '@/lib/match-skill-enrich';
import { sanitizeCityFilter } from '@/lib/match-location-filter';
import { MATCH_LIST_SELECT } from '@/lib/match-list-select';
import { jobFreshnessOrFilter, staleJobCutoffIso } from '@/lib/match-stats';
import { EmptyMatches } from './EmptyMatches';
import { MatchList } from './MatchList';

const PAGE_SIZE = 20;

export type DashboardMatchSearchParams = {
  status?: string;
  q?: string;
  source?: string;
  min?: string;
  remote?: string;
  city?: string;
  bookmarked?: string;
  sort?: string;
  from?: string;
};

export async function DashboardMatchResults({
  profileId,
  isAdmin,
  totalMatches,
  searchParams,
  topSkills: topSkillsProp,
}: {
  profileId: string;
  isAdmin: boolean;
  totalMatches: number;
  searchParams: DashboardMatchSearchParams;
  /** Prefer passing from the page to avoid a second getCurrentProfile(). */
  topSkills?: string[];
}) {
  const status = searchParams.status ?? 'inbox';
  const onlyBookmarked = searchParams.bookmarked === '1';
  const sort = resolveMatchSort(searchParams.sort);
  const effectiveMinScore = searchParams.min ? Number(searchParams.min) : 50;
  const highlightId = searchParams.from ?? null;

  const sb = supabaseAdmin();

  let topSkills = topSkillsProp ?? [];
  if (!topSkillsProp) {
    const profile = await getCurrentProfile();
    topSkills = Array.isArray((profile?.insights as { top_skills?: string[] } | null)?.top_skills)
      ? (profile!.insights as { top_skills: string[] }).top_skills
      : [];
  }

  // Slim list select — skip JD description (large) for dashboard cards.
  let query = sb
    .from('matches')
    .select(MATCH_LIST_SELECT, { count: 'exact' })
    .eq('profile_id', profileId)
    .gte('llm_score', effectiveMinScore);

  const staleCutoff = staleJobCutoffIso();
  query = query.or(jobFreshnessOrFilter(staleCutoff), { foreignTable: 'job' });

  query = applyMatchSort(query, sort);

  if (onlyBookmarked) {
    query = query.eq('bookmarked', true);
  } else if (status === 'inbox') {
    query = query.in('status', ['new', 'viewed']);
  } else {
    query = query.eq('status', status);
  }

  if (isAdmin && searchParams.source) {
    query = query.eq('job.source', searchParams.source);
  }
  if (searchParams.remote === '1') {
    query = query.eq('job.remote', true);
  }
  const city = sanitizeCityFilter(searchParams.city);
  if (city) {
    query = query.ilike('job.location', `%${city}%`);
  }
  if (searchParams.q) {
    const term = searchParams.q.replace(/[%]/g, '');
    query = query.or(`title.ilike.%${term}%,company.ilike.%${term}%`, {
      foreignTable: 'job',
    });
  }

  const { data: matches, count: matchCount } = await query.limit(PAGE_SIZE);

  const totalInFilter = matchCount ?? 0;
  const hasMore = totalInFilter > PAGE_SIZE;
  const hiddenBelowThreshold =
    totalInFilter > 0 && (matches ?? []).length === 0 ? totalInFilter : 0;

  if ((matches ?? []).length === 0) {
    return (
      <EmptyMatches
        status={status}
        totalMatches={totalMatches}
        hiddenBelowThreshold={hiddenBelowThreshold}
        effectiveMinScore={effectiveMinScore}
      />
    );
  }

  // Pad sparse skill chips — common when ingest scored against a truncated JD.
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

    return {
      ...m,
      bookmarked: (m as unknown as { bookmarked: boolean }).bookmarked ?? false,
      matched_skills: skills.matched_skills,
      missing_skills: skills.missing_skills,
      job: m.job as unknown as {
        id: string;
        title: string;
        company: string | null;
        location: string | null;
        remote: boolean;
        url: string;
        source: string;
        salary: string | null;
        posted_at: string | null;
        fetched_at: string | null;
      },
    };
  });


  return (
    <MatchList
      initialMatches={enriched}
      total={totalInFilter}
      initialHasMore={hasMore}
      showSource={isAdmin}
      highlightId={highlightId}
    />
  );
}
