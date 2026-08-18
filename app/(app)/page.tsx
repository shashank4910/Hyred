import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile, isCurrentUserAdmin } from '@/lib/current-user';
import { closeStaleIngestRuns } from '@/lib/ingest-runs';
import { StatusFilter } from './_components/StatusFilter';
import { MatchFilters } from './_components/MatchFilters';
import { DashboardMatchResults } from './_components/DashboardMatchResults';
import { DashboardMatchesSection } from './_components/DashboardMatchesSection';
import { DashboardNavProvider } from './_components/DashboardNavContext';
import { RunIngestButton } from './_components/RunIngestButton';
import { Search, Sparkles } from 'lucide-react';
import { getDashboardCounts, listMatchCities, freshnessLabel } from '@/lib/match-stats';

export const dynamic = 'force-dynamic';

type SearchParams = {
  status?: string;
  q?: string;
  source?: string;
  min?: string;
  remote?: string;
  city?: string;
  bookmarked?: string;
  sort?: 'score' | 'posted' | 'newest' | 'activity' | 'company';
  from?: string; // match ID to highlight on back-navigation
  expired?: string; // "1" = include older/expired jobs
  fresh?: string;
};

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? 'inbox';
  const onlyBookmarked = sp.bookmarked === '1';

  const matchListKey = [
    status,
    onlyBookmarked ? '1' : '0',
    sp.sort ?? '',
    sp.min ?? '',
    sp.q ?? '',
    sp.remote ?? '',
    sp.city ?? '',
    sp.source ?? '',
    sp.expired ?? '',
    sp.fresh ?? '',
    sp.from ?? '',
  ].join('|');

  const sb = supabaseAdmin();
  const profile = await getCurrentProfile();
  const isAdmin = await isCurrentUserAdmin();

  if (!profile || !profile.resume_text) {
    return <EmptyOnboarding />;
  }

  // Don't block the dashboard on cleanup — filters felt slow waiting on this.
  void closeStaleIngestRuns(sb, profile.id);

  // Status counts + city options (aligned with active dashboard filters)
  const [
    { counts, inboxCount, bookmarkedCount },
    cities,
    { count: totalMatches },
  ] = await Promise.all([
    getDashboardCounts(
      sb,
      profile.id,
      {
        min: sp.min,
        remote: sp.remote,
        city: sp.city,
        source: sp.source,
        q: sp.q,
        expired: sp.expired,
        fresh: sp.fresh,
      },
      isAdmin,
    ),
    listMatchCities(
      sb,
      profile.id,
      {
        min: sp.min,
        source: sp.source,
        q: sp.q,
        status,
        bookmarked: sp.bookmarked,
        expired: sp.expired,
        fresh: sp.fresh,
      },
      isAdmin,
    ),
    sb
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', profile.id),
  ]);

  const heading = (sp.q && sp.q.trim()) || 'Matches';
  const chips: { label: string; clear: string }[] = [];
  if (sp.remote === '1') chips.push({ label: 'Remote', clear: 'remote' });
  if (sp.city) chips.push({ label: sp.city, clear: 'city' });
  if (sp.expired === '1') chips.push({ label: 'Older jobs', clear: 'expired' });
  if (sp.fresh) {
    chips.push({ label: freshnessLabel(sp.fresh), clear: 'fresh' });
  }
  if (sp.min) chips.push({ label: `Score ${sp.min}+`, clear: 'min' });

  function hrefWithout(drop: string) {
    const params = new URLSearchParams();
    const keep: [string, string | undefined][] = [
      ['status', sp.status],
      ['q', sp.q],
      ['source', sp.source],
      ['min', sp.min],
      ['remote', sp.remote],
      ['city', sp.city],
      ['bookmarked', sp.bookmarked],
      ['sort', sp.sort],
      ['expired', sp.expired],
      ['fresh', sp.fresh],
    ];
    for (const [k, v] of keep) {
      if (k === drop || !v) continue;
      params.set(k, v);
    }
    return `/?${params.toString()}`;
  }

  return (
    <div>
      <div className="sm:hidden mb-4">
        <RunIngestButton isAdmin={isAdmin} luminous />
      </div>

      <DashboardNavProvider>
        {/* Desktop: viewport-height row so the filter panel stays static and only the job list scrolls. */}
        <div className="lg:flex lg:gap-8 lg:h-[calc(100vh-12rem)]">
          <MatchFilters isAdmin={isAdmin} cities={cities} />
          <div id="dashboard-list-scroll" className="min-w-0 flex-1 lg:h-full lg:overflow-y-auto lg:overscroll-contain lg:pb-6">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <h1 className="flex items-center gap-3 font-headline text-3xl font-extrabold tracking-tight text-ink md:text-5xl">
                {heading}
                <Search className="h-7 w-7 text-ink md:h-8 md:w-8" aria-hidden />
              </h1>
              {chips.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {chips.map((c) => (
                    <Link
                      key={c.clear}
                      href={hrefWithout(c.clear)}
                      className="rounded-full bg-lime-brand px-3 py-1.5 text-sm font-semibold text-ink"
                    >
                      {c.label} ×
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <div className="mb-6">
              <StatusFilter
                counts={counts}
                active={status}
                inboxCount={inboxCount ?? 0}
                bookmarkedCount={bookmarkedCount ?? 0}
                onlyBookmarked={onlyBookmarked}
              />
            </div>
            <DashboardMatchesSection cacheKey={matchListKey}>
              <DashboardMatchResults
                profileId={profile.id}
                isAdmin={isAdmin}
                totalMatches={totalMatches ?? 0}
                searchParams={sp}
                topSkills={
                  Array.isArray((profile.insights as { top_skills?: string[] } | null)?.top_skills)
                    ? (profile.insights as { top_skills: string[] }).top_skills
                    : []
                }
              />
            </DashboardMatchesSection>
          </div>
        </div>
      </DashboardNavProvider>
    </div>
  );
}

function EmptyOnboarding() {
  return (
    <div className="mx-auto mt-12 max-w-xl space-y-4 rounded-[1.5rem] bg-surface-card px-8 py-12 text-center shadow-card">
      <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary">
        <Sparkles className="h-7 w-7" />
      </div>
      <h1 className="font-headline text-headline-md font-bold text-on-surface">Welcome to Hyred</h1>
      <p className="text-on-surface-variant text-body-md max-w-sm mx-auto">
        Upload your resume so we can start finding matches that fit your
        experience.
      </p>
      <Link href="/onboarding" className="btn-primary">
        Add my resume
      </Link>
    </div>
  );
}
