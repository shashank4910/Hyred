import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase/server';
import { applyMatchSort } from '@/lib/apply-match-sort';
import { resolveMatchSort } from '@/lib/ui';
import { MatchList } from './MatchList';

const PAGE_SIZE = 20;

export type DashboardMatchSearchParams = {
  status?: string;
  q?: string;
  source?: string;
  min?: string;
  remote?: string;
  bookmarked?: string;
  sort?: string;
  from?: string;
};

export async function DashboardMatchResults({
  profileId,
  isAdmin,
  totalMatches,
  searchParams,
}: {
  profileId: string;
  isAdmin: boolean;
  totalMatches: number;
  searchParams: DashboardMatchSearchParams;
}) {
  const status = searchParams.status ?? 'inbox';
  const onlyBookmarked = searchParams.bookmarked === '1';
  const sort = resolveMatchSort(searchParams.sort);
  const effectiveMinScore = searchParams.min ? Number(searchParams.min) : 50;
  const highlightId = searchParams.from ?? null;

  const sb = supabaseAdmin();

  let query = sb
    .from('matches')
    .select(
      `id, llm_score, similarity, reason, status, bookmarked, matched_skills, missing_skills, applied_at, created_at, updated_at,
       job:jobs!inner(id, title, company, location, remote, url, source, salary, posted_at, fetched_at, description, tags)`,
      { count: 'exact' },
    )
    .eq('profile_id', profileId)
    .gte('llm_score', effectiveMinScore);

  const staleCutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
  query = query.or(`posted_at.gte.${staleCutoff},posted_at.is.null`, { foreignTable: 'job' });

  query = applyMatchSort(query, sort);

  if (onlyBookmarked) {
    query = query.eq('bookmarked', true);
  } else if (status === 'inbox') {
    query = query.in('status', ['new', 'viewed']);
  } else {
    query = query.eq('status', status);
  }

  if (isAdmin && searchParams.source) {
    query = query.eq('jobs.source', searchParams.source);
  }
  if (searchParams.remote === '1') {
    query = query.eq('jobs.remote', true);
  }
  if (searchParams.q) {
    const term = searchParams.q.replace(/[%]/g, '');
    query = query.or(`title.ilike.%${term}%,company.ilike.%${term}%`, {
      foreignTable: 'jobs',
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

  return (
    <MatchList
      initialMatches={(matches ?? []).map((m) => ({
        ...m,
        bookmarked: (m as unknown as { bookmarked: boolean }).bookmarked ?? false,
        matched_skills: (m as unknown as { matched_skills: string[] | null }).matched_skills ?? null,
        missing_skills: (m as unknown as { missing_skills: string[] | null }).missing_skills ?? null,
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
      }))}
      total={totalInFilter}
      initialHasMore={hasMore}
      showSource={isAdmin}
      highlightId={highlightId}
    />
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
          {hiddenBelowThreshold === 1 ? 'its score is' : 'their scores are'} below your threshold of{' '}
          <span className="text-primary font-semibold">{effectiveMinScore}</span>.
        </p>
        <p className="text-xs text-on-surface-variant">
          Lower the threshold in your{' '}
          <Link href="/onboarding" className="font-medium text-primary hover:underline">
            profile
          </Link>{' '}
          to view them, or wait for the next scan to bring fresher jobs.
        </p>
        <Link href={`/?status=${status}&min=0`} className="btn inline-flex" scroll={false}>
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
        No matches in <span className="font-medium text-primary">{status}</span> yet.
      </p>
      <p className="mt-1 text-xs text-on-surface-variant">
        {totalMatches > 0
          ? 'Try a different status or run a scan to find more.'
          : 'Click "Run scan" to find jobs matched to your resume.'}
      </p>
    </div>
  );
}
