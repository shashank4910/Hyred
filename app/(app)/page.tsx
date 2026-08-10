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
import { Inbox, Sparkles, TrendingUp, Briefcase, ArrowRight } from 'lucide-react';
import { relativeTime, STATUS_ORDER } from '@/lib/ui';
import { getDashboardCounts, listMatchCities } from '@/lib/match-stats';

export const dynamic = 'force-dynamic';

type SearchParams = {
  status?: string;
  q?: string;
  source?: string;
  min?: string;
  remote?: string;
  city?: string;
  bookmarked?: string;
  sort?: 'newest' | 'score' | 'activity';
  from?: string; // match ID to highlight on back-navigation
  expired?: string; // "1" = include older/expired jobs
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
    { data: lastRun },
    { data: activeRun },
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
      },
      isAdmin,
    ),
    sb
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', profile.id),
    sb
      .from('ingest_runs')
      .select('finished_at, matches_created, status')
      .eq('profile_id', profile.id)
      .not('finished_at', 'is', null)
      .order('finished_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb
      .from('ingest_runs')
      .select('started_at, matches_created')
      .eq('profile_id', profile.id)
      .eq('status', 'running')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const lastScanLabel = activeRun
    ? 'In progress…'
    : lastRun?.finished_at
      ? relativeTime(lastRun.finished_at)
      : 'No scan yet';

  return (
    <div className="space-y-8">
      {/* Greeting row */}
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="flex-1">
          <h1 className="font-headline text-headline-lg-mobile md:text-headline-lg font-bold text-on-surface">
            Hello{profile.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}!
          </h1>
          <p className="mt-2 text-body-md text-on-surface-variant">
            Your profile is matching with{' '}
            <span className="font-bold text-primary">{inboxCount ?? 0} opportunities</span>{' '}
            in your inbox
            {(counts.new ?? 0) > 0 && (
              <>
                {' '}
                — including{' '}
                <span className="font-bold text-primary">{counts.new} new</span> today
              </>
            )}
            .
          </p>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-1">
          <QuickStat
            label="New"
            value={counts.new ?? 0}
            icon={<Sparkles className="h-5 w-5" />}
            accent
          />
          <QuickStat
            label="Applied"
            value={counts.applied ?? 0}
            icon={<Briefcase className="h-5 w-5" />}
          />
          <QuickStat
            label="Tracked"
            value={totalMatches ?? 0}
            icon={<TrendingUp className="h-5 w-5" />}
          />
        </div>
      </div>

      <div className="sm:hidden">
        <RunIngestButton isAdmin={isAdmin} luminous />
      </div>

      <div className="space-y-6">
        <DashboardNavProvider>
          <StatusFilter
            counts={counts}
            active={status}
            inboxCount={inboxCount ?? 0}
            bookmarkedCount={bookmarkedCount ?? 0}
            onlyBookmarked={onlyBookmarked}
          />
          <MatchFilters isAdmin={isAdmin} cities={cities} />
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
        </DashboardNavProvider>
      </div>

      <section className="mt-4">
        <div className="overflow-hidden rounded-[2.5rem] bg-surface-container-lowest p-1 shadow-card">
          <div className="flex flex-col items-center md:flex-row">
            <div className="relative flex h-48 w-full items-center justify-center teal-gradient md:h-auto md:w-1/3 md:min-h-[220px]">
              <Sparkles className="h-16 w-16 text-on-primary/30" />
            </div>
            <div className="flex-1 p-8 md:p-10">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-secondary-container/30 px-4 py-1.5 text-label-md font-bold uppercase tracking-widest text-secondary">
                AI matching
              </div>
              <h3 className="mb-3 text-headline-lg font-bold text-on-surface">
                Hyred scores every job against your resume
              </h3>
              <p className="mb-4 max-w-xl text-body-lg leading-relaxed text-on-surface-variant">
                We scan job boards, explain why each role fits, and highlight skills you already
                have — so you spend time on applications that matter.
              </p>
              <Link
                href="/stats"
                className="inline-flex items-center gap-2 font-semibold text-primary transition-colors hover:text-primary-container"
              >
                View your stats
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function QuickStat({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="flex min-w-[160px] items-center gap-4 rounded-2xl bg-surface-container-lowest p-5 shadow-card">
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-2xl ${accent ? 'bg-primary/10 text-primary' : 'bg-match-success/10 text-match-success'}`}
      >
        {icon}
      </div>
      <div>
        <p className="text-label-md text-text-muted">{label}</p>
        <p className="text-headline-md font-bold text-on-surface">{value}</p>
      </div>
    </div>
  );
}

function EmptyOnboarding() {
  return (
    <div className="mx-auto mt-12 max-w-xl space-y-4 rounded-2xl bg-surface-container-lowest px-8 py-12 text-center shadow-card">
      <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl teal-gradient text-on-primary">
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
