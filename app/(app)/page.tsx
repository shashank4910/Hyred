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

  // Effective min score: explicit ?min= URL param overrides; otherwise use
  // the user's saved preference; default to 70.
  const effectiveMinScore = sp.min
    ? Number(sp.min)
    : Number(
        (profile.preferences as { min_score?: number } | null)?.min_score ?? 70,
      );

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

  // Count total matches in this status across ALL scores (so we can tell the
  // user how many are hidden by their min_score filter).
  const { count: totalInStatus } = await sb
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profile.id)
    .eq('status', status);
  const hiddenBelowThreshold =
    (totalInStatus ?? 0) - ((matches ?? []).length || 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            Hi{profile.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''} 👋
          </h1>
          <p className="text-sm text-muted">
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
        <ul className="space-y-2.5">
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
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        <span className={accent ? 'text-primary' : ''}>{icon}</span>
      </div>
      <div
        className={`mt-1 ${isText ? 'text-base' : 'text-2xl'} font-semibold ${
          accent ? 'text-primary' : 'text-fg'
        }`}
      >
        {value}
      </div>
      {subValue && <div className="text-xs text-muted mt-0.5">{subValue}</div>}
    </div>
  );
}

function EmptyOnboarding() {
  return (
    <div className="card max-w-xl mx-auto text-center mt-12 space-y-3">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mx-auto">
        <Sparkles className="h-6 w-6" />
      </div>
      <h1 className="text-xl font-semibold">Welcome to JobRadar</h1>
      <p className="text-muted text-sm">
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
  // If we have lower-scored matches that are filtered out, surface that
  // clearly and link to /onboarding to lower the threshold.
  if (hiddenBelowThreshold > 0) {
    return (
      <div className="card text-center py-10 space-y-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-300 mx-auto">
          <Inbox className="h-5 w-5" />
        </div>
        <p className="text-sm">
          <span className="font-semibold">{hiddenBelowThreshold}</span> match
          {hiddenBelowThreshold === 1 ? ' is' : 'es are'} hidden because{' '}
          {hiddenBelowThreshold === 1 ? 'its score is' : 'their scores are'}{' '}
          below your threshold of{' '}
          <span className="text-primary font-semibold">{effectiveMinScore}</span>.
        </p>
        <p className="text-xs text-muted">
          Lower the threshold in your{' '}
          <Link href="/onboarding" className="text-primary hover:underline">
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
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface text-muted mx-auto">
        <Inbox className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm">
        No matches in <span className="text-primary">{status}</span> yet.
      </p>
      <p className="mt-1 text-xs text-muted">
        {totalJobs > 0
          ? 'Try a different status or run a scan to find more.'
          : 'Click "Run scan" to fetch jobs from job boards.'}
      </p>
    </div>
  );
}
