import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile, isCurrentUserAdmin } from '@/lib/current-user';
import { closeStaleIngestRuns } from '@/lib/ingest-runs';
import { StatusFilter } from './_components/StatusFilter';
import { MatchFilters } from './_components/MatchFilters';
import { MatchCard } from './_components/MatchCard';
import { DashboardInsights } from './_components/DashboardInsights';
import { RunIngestButton } from './_components/RunIngestButton';
import { Inbox, Sparkles, TrendingUp, Briefcase, ArrowRight } from 'lucide-react';
import { relativeTime, STATUS_ORDER } from '@/lib/ui';

export const dynamic = 'force-dynamic';

type SearchParams = {
  status?: string;
  q?: string;
  source?: string;
  min?: string;
  remote?: string;
  bookmarked?: string;
  sort?: 'newest' | 'posted' | 'score' | 'activity' | 'oldest';
};

type SortMode = NonNullable<SearchParams['sort']>;
const VALID_SORTS: SortMode[] = ['newest', 'posted', 'score', 'activity', 'oldest'];

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? 'inbox';
  const onlyBookmarked = sp.bookmarked === '1';
  const sort: SortMode = (VALID_SORTS as readonly string[]).includes(sp.sort ?? '')
    ? (sp.sort as SortMode)
    : 'newest';

  const sb = supabaseAdmin();

  const profile = await getCurrentProfile();
  const isAdmin = await isCurrentUserAdmin();

  if (!profile || !profile.resume_text) {
    return <EmptyOnboarding />;
  }

  await closeStaleIngestRuns(sb, profile.id);

  const effectiveMinScore = sp.min ? Number(sp.min) : 50;

  // Status counts
  const counts: Record<string, number> = {};
  await Promise.all(
    STATUS_ORDER.map(async (s) => {
      const { count } = await sb
        .from('matches')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', profile.id)
        .eq('status', s);
      counts[s] = count ?? 0;
    }),
  );

  const { count: inboxCount } = await sb
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profile.id)
    .in('status', ['new', 'viewed']);

  const { count: bookmarkedCount } = await sb
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profile.id)
    .eq('bookmarked', true);

  const [{ count: totalMatches }, { data: lastRun }, { data: activeRun }] =
    await Promise.all([
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

  // Match query with filters
  let query = sb
    .from('matches')
    .select(
      `id, llm_score, similarity, reason, status, bookmarked, matched_skills, missing_skills, applied_at, created_at, updated_at,
       job:jobs!inner(id, title, company, location, remote, url, source, salary, posted_at, fetched_at, description, tags)`,
    )
    .eq('profile_id', profile.id)
    .gte('llm_score', effectiveMinScore);

  // Filter out stale jobs (older than 45 days) from the dashboard.
  // Jobs without a posted_at are kept (can't determine age).
  const staleCutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
  query = query.or(`posted_at.gte.${staleCutoff},posted_at.is.null`, { foreignTable: 'job' });

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
    case 'newest':
    default:
      query = query.order('fetched_at', { foreignTable: 'job', ascending: false });
      break;
  }

  if (onlyBookmarked) {
    query = query.eq('bookmarked', true);
  } else if (status === 'inbox') {
    query = query.in('status', ['new', 'viewed']);
  } else {
    query = query.eq('status', status);
  }

  if (isAdmin && sp.source) {
    query = query.eq('jobs.source', sp.source);
  }
  if (sp.remote === '1') {
    query = query.eq('jobs.remote', true);
  }
  if (sp.q) {
    const term = sp.q.replace(/[%]/g, '');
    query = query.or(`title.ilike.%${term}%,company.ilike.%${term}%`, {
      foreignTable: 'jobs',
    });
  }

  const { data: matches } = await query.limit(100);

  let totalInStatusQuery = sb
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profile.id);
  if (onlyBookmarked) {
    totalInStatusQuery = totalInStatusQuery.eq('bookmarked', true);
  } else if (status === 'inbox') {
    totalInStatusQuery = totalInStatusQuery.in('status', ['new', 'viewed']);
  } else {
    totalInStatusQuery = totalInStatusQuery.eq('status', status);
  }
  const { count: totalInStatus } = await totalInStatusQuery;
  const hiddenBelowThreshold =
    (totalInStatus ?? 0) - ((matches ?? []).length || 0);

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

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1 space-y-6">
          <StatusFilter
            counts={counts}
            active={status}
            inboxCount={inboxCount ?? 0}
            bookmarkedCount={bookmarkedCount ?? 0}
            onlyBookmarked={onlyBookmarked}
          />
          <MatchFilters isAdmin={isAdmin} />

          {(matches ?? []).length === 0 ? (
            <EmptyMatches
              status={status}
              totalMatches={totalMatches ?? 0}
              hiddenBelowThreshold={hiddenBelowThreshold}
              effectiveMinScore={effectiveMinScore}
            />
          ) : (
            <ul className="grid grid-cols-1 gap-6">
              {(matches ?? []).map((m) => {
                const job = m.job as unknown as {
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
                };
                return (
                  <li key={m.id}>
                    <MatchCard
                      matchId={m.id}
                      score={m.llm_score}
                      reason={m.reason}
                      status={m.status}
                      bookmarked={(m as unknown as { bookmarked: boolean }).bookmarked ?? false}
                      matchedSkills={(m as unknown as { matched_skills: string[] | null }).matched_skills ?? []}
                      missingSkills={(m as unknown as { missing_skills: string[] | null }).missing_skills ?? []}
                      job={job}
                      showSource={isAdmin}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <aside className="min-w-0 w-full shrink-0 xl:w-72">
          <DashboardInsights
            inboxCount={inboxCount ?? 0}
            lastScanMatches={activeRun ? activeRun.matches_created : lastRun?.matches_created ?? null}
            totalMatches={totalMatches ?? 0}
            lastScanLabel={lastScanLabel}
          />
        </aside>
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

function EmptyMatches({
  status,
  totalMatches,
  hiddenBelowThreshold,
  effectiveMinScore,
}: {
  status: string;
  totalMatches: number;
  hiddenBelowThreshold: number;
  effectiveMinScore: number;
}) {
  if (hiddenBelowThreshold > 0) {
    return (
      <div className="rounded-2xl bg-surface-container-lowest px-6 py-10 text-center shadow-card">
        <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Inbox className="h-5 w-5" />
        </div>
        <p className="text-sm text-on-surface">
          <span className="font-semibold">{hiddenBelowThreshold}</span> match
          {hiddenBelowThreshold === 1 ? ' is' : 'es are'} hidden because{' '}
          {hiddenBelowThreshold === 1 ? 'its score is' : 'their scores are'}{' '}
          below your threshold of{' '}
          <span className="text-primary font-semibold">{effectiveMinScore}</span>.
        </p>
        <p className="text-xs text-on-surface-variant">
          Lower the threshold in your{' '}
          <Link href="/onboarding" className="text-primary hover:underline font-medium">
            profile
          </Link>{' '}
          to view them, or wait for the next scan to bring fresher jobs.
        </p>
        <Link
          href={`/?status=${status}&min=0`}
          className="btn inline-flex"
          scroll={false}
        >
          Show all scores anyway
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-surface-container-lowest px-6 py-12 text-center shadow-card">
      <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-surface-container text-text-muted">
        <Inbox className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm text-on-surface">
        No matches in <span className="text-primary font-medium">{status}</span> yet.
      </p>
      <p className="mt-1 text-xs text-on-surface-variant">
        {totalMatches > 0
          ? 'Try a different status or run a scan to find more.'
          : 'Click "Run scan" to find jobs matched to your resume.'}
      </p>
    </div>
  );
}
