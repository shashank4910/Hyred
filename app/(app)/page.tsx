import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/server';
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
};

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  // 'inbox' = new + viewed combined (default). Individual statuses are explicit.
  const status = sp.status ?? 'inbox';
  const onlyBookmarked = sp.bookmarked === '1';

  const sb = supabaseAdmin();

  const { data: profile } = await sb
    .from('profiles')
    .select('id, email, full_name, resume_text, insights, preferences')
    .order('created_at')
    .limit(1)
    .maybeSingle();

  if (!profile || !profile.resume_text) {
    return <EmptyOnboarding />;
  }

  // Effective min score: explicit ?min= URL param overrides; otherwise default to 50.
  // We do NOT use the user's saved preferences.min_score as a HARD filter on
  // the dashboard — that's used by the ingest's "Kept" counter only. Showing
  // a saturated dashboard with all 50+ matches is more useful than silently
  // hiding everything when the user has set a high threshold.
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

  // Inbox count = new + viewed combined
  const { count: inboxCount } = await sb
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profile.id)
    .in('status', ['new', 'viewed']);

  // Bookmarked count (cross-status)
  const { count: bookmarkedCount } = await sb
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profile.id)
    .eq('bookmarked', true);

  // Top-line stats
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
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  // Match query with filters
  let query = sb
    .from('matches')
    .select(
      `id, llm_score, similarity, reason, status, bookmarked, applied_at, created_at,
       job:jobs!inner(id, title, company, location, remote, url, source, salary, posted_at, description, tags)`,
    )
    .eq('profile_id', profile.id)
    .gte('llm_score', effectiveMinScore)
    .order('llm_score', { ascending: false });

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

  // Count total matches in this status across ALL scores (so we can tell the
  // user how many are hidden by their min_score filter).
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
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-heading-sm font-semibold text-ink">
            Hi{profile.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}
          </h1>
          <p className="text-body-sm text-stone mt-1">
            {counts.new ?? 0} new match{counts.new === 1 ? '' : 'es'} waiting for
            you.
          </p>
        </div>
        <RunIngestButton />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
      <div className="space-y-3">
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
            };
            return (
              <li key={m.id}>
                <MatchCard
                  matchId={m.id}
                  score={m.llm_score}
                  reason={m.reason}
                  status={m.status}
                  bookmarked={(m as unknown as { bookmarked: boolean }).bookmarked ?? false}
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
    <div className="stat-card">
      <div className="flex items-center justify-between text-caption text-stone">
        <span>{label}</span>
        <span className={accent ? 'text-amber' : 'text-shadow-tint'}>{icon}</span>
      </div>
      <div
        className={`mt-1.5 ${isText ? 'text-body' : 'text-heading-sm'} font-semibold ${
          accent ? 'text-amber' : 'text-ink'
        }`}
      >
        {value}
      </div>
      {subValue && <div className="text-caption text-stone mt-0.5">{subValue}</div>}
    </div>
  );
}

function EmptyOnboarding() {
  return (
    <div className="card max-w-xl mx-auto text-center mt-12 space-y-4 py-12">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber/10 text-amber mx-auto">
        <Sparkles className="h-7 w-7" />
      </div>
      <h1 className="text-subheading font-semibold text-ink">Welcome to JobRadar</h1>
      <p className="text-stone text-body-sm max-w-sm mx-auto">
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
      <div className="card text-center py-10 space-y-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-sunshine text-amber-hover mx-auto">
          <Inbox className="h-5 w-5" />
        </div>
        <p className="text-sm text-ink">
          <span className="font-semibold">{hiddenBelowThreshold}</span> match
          {hiddenBelowThreshold === 1 ? ' is' : 'es are'} hidden because{' '}
          {hiddenBelowThreshold === 1 ? 'its score is' : 'their scores are'}{' '}
          below your threshold of{' '}
          <span className="text-amber font-semibold">{effectiveMinScore}</span>.
        </p>
        <p className="text-xs text-stone">
          Lower the threshold in your{' '}
          <Link href="/onboarding" className="text-amber-hover hover:underline font-medium">
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
    <div className="card text-center py-12">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-off-white text-stone mx-auto">
        <Inbox className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm text-ink">
        No matches in <span className="text-amber font-medium">{status}</span> yet.
      </p>
      <p className="mt-1 text-xs text-stone">
        {totalJobs > 0
          ? 'Try a different status or run a scan to find more.'
          : 'Click "Run scan" to fetch jobs from job boards.'}
      </p>
    </div>
  );
}
