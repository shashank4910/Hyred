import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';
import { StatusFilter } from './_components/StatusFilter';
import { RunIngestButton } from './_components/RunIngestButton';
import { MatchFilters } from './_components/MatchFilters';
import { MatchCard } from './_components/MatchCard';
import { Inbox, Sparkles, TrendingUp, Briefcase, Clock } from 'lucide-react';
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

  if (!profile || !profile.resume_text) {
    return <EmptyOnboarding />;
  }

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

  const [{ count: totalJobs }, { count: totalMatches }, { data: lastRun }] =
    await Promise.all([
      sb.from('jobs').select('id', { count: 'exact', head: true }),
      sb
        .from('matches')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', profile.id),
      sb
        .from('ingest_runs')
        .select('finished_at, matches_created, status')
        .eq('profile_id', profile.id)
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

  if (sp.source) {
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

  return (
    <div className="space-y-8">
      {/* Hero / Welcome */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-fixed text-primary text-xs font-medium tracking-wide mb-3">
            <Sparkles className="h-3.5 w-3.5" />
            <span>{counts.new ?? 0} NEW MATCHES</span>
          </div>
          <h1 className="font-headline text-headline-lg-mobile md:text-heading-sm font-bold text-on-background">
            Hi{profile.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}
          </h1>
          <p className="text-body-md text-on-surface-variant mt-1">
            Your AI-curated job matches, scored and ready for action.
          </p>
        </div>
        <RunIngestButton />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="New matches"
          value={counts.new ?? 0}
          icon={<Sparkles className="h-4 w-4" />}
          accent
        />
        <StatCard
          label="Applied"
          value={counts.applied ?? 0}
          icon={<Briefcase className="h-4 w-4" />}
        />
        <StatCard
          label="Total tracked"
          value={totalMatches ?? 0}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="Last scan"
          value={
            lastRun?.finished_at
              ? relativeTime(lastRun.finished_at)
              : 'Never'
          }
          subValue={
            lastRun?.matches_created != null
              ? `+${lastRun.matches_created} kept`
              : undefined
          }
          icon={<Clock className="h-4 w-4" />}
          isText
        />
      </div>

      {/* Filters */}
      <div className="space-y-4">
        <StatusFilter counts={counts} active={status} inboxCount={inboxCount ?? 0} bookmarkedCount={bookmarkedCount ?? 0} onlyBookmarked={onlyBookmarked} />
        <MatchFilters />
      </div>

      {/* Results */}
      {(matches ?? []).length === 0 ? (
        <EmptyMatches
          status={status}
          totalJobs={totalJobs ?? 0}
          hiddenBelowThreshold={hiddenBelowThreshold}
          effectiveMinScore={effectiveMinScore}
        />
      ) : (
        <ul className="space-y-3">
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
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent,
  isText,
  subValue,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accent?: boolean;
  isText?: boolean;
  subValue?: string;
}) {
  return (
    <div className="glass-card p-4 rounded-xl">
      <div className="flex items-center justify-between text-xs font-medium text-on-surface-variant">
        <span>{label}</span>
        <span className={accent ? 'text-primary' : 'text-outline'}>{icon}</span>
      </div>
      <div
        className={`mt-2 ${isText ? 'text-body-md' : 'text-stat-value font-headline'} font-bold ${
          accent ? 'text-primary' : 'text-on-background'
        }`}
      >
        {value}
      </div>
      {subValue && <div className="text-xs text-on-surface-variant mt-1">{subValue}</div>}
    </div>
  );
}

function EmptyOnboarding() {
  return (
    <div className="glass-card max-w-xl mx-auto text-center mt-12 space-y-4 py-12 px-8">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary-fixed text-primary mx-auto">
        <Sparkles className="h-7 w-7" />
      </div>
      <h1 className="font-headline text-headline-md font-bold text-on-background">Welcome to JobRadar</h1>
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
  totalJobs,
  hiddenBelowThreshold,
  effectiveMinScore,
}: {
  status: string;
  totalJobs: number;
  hiddenBelowThreshold: number;
  effectiveMinScore: number;
}) {
  if (hiddenBelowThreshold > 0) {
    return (
      <div className="glass-card text-center py-10 px-6 space-y-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary-fixed text-primary mx-auto">
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
    <div className="glass-card text-center py-12 px-6">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface-container text-outline mx-auto">
        <Inbox className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm text-on-surface">
        No matches in <span className="text-primary font-medium">{status}</span> yet.
      </p>
      <p className="mt-1 text-xs text-on-surface-variant">
        {totalJobs > 0
          ? 'Try a different status or run a scan to find more.'
          : 'Click "Run scan" to fetch jobs from job boards.'}
      </p>
    </div>
  );
}
