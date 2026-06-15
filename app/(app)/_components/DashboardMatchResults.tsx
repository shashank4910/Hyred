import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';
import { applyMatchSort } from '@/lib/apply-match-sort';
import { resolveMatchSort } from '@/lib/ui';
import { isSkillPresentInJd } from '@/lib/gemini';
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

  // Fetch profile top_skills so we can compute matched/missing for cards
  // that pre-date the skills backfill (matched_skills is null).
  const profile = await getCurrentProfile();
  const topSkills: string[] = Array.isArray((profile?.insights as any)?.top_skills)
    ? (profile!.insights as any).top_skills
    : [];

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
    query = query.eq('job.source', searchParams.source);
  }
  if (searchParams.remote === '1') {
    query = query.eq('job.remote', true);
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

  // Strip HTML from JD text before any skill matching (raw DB descriptions contain HTML tags).
  const stripHtml = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ');

  // For cards missing matched_skills, derive them from profile top_skills × JD.
  // ONLY compute for cards where matched_skills is null/empty (pre-backfill rows).
  // NEVER overwrite missing_skills with wrong data — DB missing_skills from LLM is authoritative
  // (it means "skills in JD but absent from resume"). If DB is also null, leave empty rather than guess.
  const enriched = (matches ?? []).map((m) => {
    const raw = m as unknown as {
      matched_skills: string[] | null;
      missing_skills: string[] | null;
      job: { title: string; description: string | null };
    };
    let matchedSkills = raw.matched_skills ?? [];
    const missingSkills = raw.missing_skills ?? []; // always use DB value — LLM computed this correctly

    if (matchedSkills.length === 0 && topSkills.length > 0) {
      // Compute matched: profile skills that appear in the JD text (HTML stripped).
      const jdPlain = stripHtml(raw.job?.description ?? '');
      const title = raw.job?.title ?? '';
      matchedSkills = topSkills.filter((s) => isSkillPresentInJd(s, jdPlain, title));
      // Do NOT touch missingSkills — the DB value is what the LLM computed at ingest time.
    }

    return {
      ...m,
      bookmarked: (m as unknown as { bookmarked: boolean }).bookmarked ?? false,
      matched_skills: matchedSkills,
      missing_skills: missingSkills,
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
