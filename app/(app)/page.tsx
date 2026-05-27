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
};

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? 'new';

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
      `id, llm_score, similarity, reason, status, applied_at, created_at,
       job:jobs!inner(id, title, company, location, remote, url, source, salary, posted_at, description, tags)`,
    )
    .eq('profile_id', profile.id)
    .eq('status', status)
    .gte('llm_score', effectiveMinScore)
    .order('llm_score', { ascending: false });

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

  const { count: totalInStatus } = await sb
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profile.id)
    .eq('status', status);
  const hiddenBelowThreshold =
    (totalInStatus ?? 0) - ((matches ?? []).length || 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-heading-sm font-semibold text-ink">
            {profile.full_name ? `Hi, ${profile.full_name.split(' ')[0]}` : 'Dashboard'}
          </h1>
          <p className="text-body-sm text-stone mt-1">
            {counts.new ?? 0} new match{counts.new === 1 ? '' : 'es'} waiting for review.
          </p>
        </div>
        <RunIngestButton />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="New matches" value={counts.new ?? 0} icon={<Sparkles className="h-4 w-4" />} accent />
        <StatCard label="Applied" value={counts.applied ?? 0} icon={<Briefcase className="h-4 w-4" />} />
        <StatCard label="Total tracked" value={totalMatches ?? 0} icon={<TrendingUp className="h-4 w-4" />} />
        <StatCard
          label="Last scan"
          value={lastRun?.finished_at ? relativeTime(lastRun.finished_at) : 'Never'}
          subValue={lastRun?.matches_created != null ? `+${lastRun.matches_created} kept` : undefined}
          icon={<Clock className="h-4 w-4" />}
          isText
        />
      </div>

      {/* Filters */}
      <div className="space-y-4">
        <StatusFilter counts={counts} active={status} />
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
        <div className="space-y-4">
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
              <MatchCard
                key={m.id}
                matchId={m.id}
                score={m.llm_score}
                reason={m.reason}
                job={job}
              />
            );
          })}
        </div>
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
      <div className="flex items-center justify-between">
        <span className="text-caption text-stone">{label}</span>
        <span className={accent ? 'text-amber' : 'text-shadow-tint'}>{icon}</span>
      </div>
      <div className={`mt-2 ${isText ? 'text-body font-medium' : 'text-heading-sm font-semibold'} ${accent ? 'text-amber' : 'text-ink'} tabular-nums`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      {subValue && <div className="text-caption text-stone mt-1">{subValue}</div>}
    </div>
  );
}

function EmptyOnboarding() {
  return (
    <div className="card max-w-lg mx-auto text-center mt-16">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-card bg-amber/10 text-amber mx-auto">
        <Sparkles className="h-7 w-7" />
      </div>
      <h1 className="text-subheading font-semibold text-ink mt-5">Welcome to JobRadar</h1>
      <p className="text-body-sm text-stone mt-2 max-w-sm mx-auto">
        Upload your resume so we can start finding matches that fit your experience.
      </p>
      <div className="mt-6">
        <Link href="/onboarding" className="btn-primary">Get started</Link>
      </div>
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
      <div className="card text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-card bg-sunshine text-sunset-orange mx-auto">
          <Inbox className="h-5 w-5" />
        </div>
        <p className="text-body-sm text-ink mt-4">
          <span className="font-medium">{hiddenBelowThreshold}</span> match{hiddenBelowThreshold === 1 ? ' is' : 'es are'} hidden below your score threshold of{' '}
          <span className="font-medium text-amber">{effectiveMinScore}</span>.
        </p>
        <p className="text-caption text-stone mt-2">
          Lower the threshold in your{' '}
          <Link href="/onboarding" className="text-sunset-orange hover:underline">profile</Link>{' '}
          or wait for fresh jobs.
        </p>
        <div className="mt-4">
          <Link href={`/?status=${status}&min=0`} className="btn" scroll={false}>
            Show all scores
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card text-center">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-card bg-off-white text-shadow-tint mx-auto">
        <Inbox className="h-5 w-5" />
      </div>
      <p className="text-body-sm text-ink mt-4">
        No matches in <span className="font-medium text-amber">{status}</span> yet.
      </p>
      <p className="text-caption text-stone mt-2">
        {totalJobs > 0
          ? 'Try a different status tab or run a scan to find more.'
          : 'Click "Run scan" to fetch jobs from job boards.'}
      </p>
    </div>
  );
}
