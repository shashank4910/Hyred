import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile, isCurrentUserAdmin } from '@/lib/current-user';
import { MatchCard } from '../_components/MatchCard';
import { Crown, Building2, Sparkles } from 'lucide-react';
import { matchTopCompany, CATEGORY_LABELS, type CompanyEntry } from '@/lib/top-companies';
import { enrichMatchListSkills } from '@/lib/match-skill-enrich';
// Keep in sync with MATCH_LIST_SELECT_WITH_META in lib/match-list-select.ts

export const dynamic = 'force-dynamic';

type SearchParams = {
  category?: string;
  from?: string;
};

const VALID_CATEGORIES: CompanyEntry['category'][] = [
  'fortune500_tech',
  'fortune500_finance',
  'big4_consulting',
  'indian_mnc',
  'global_product',
  'unicorn_india',
];

export default async function TopMncPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const categoryFilter = VALID_CATEGORIES.includes(sp.category as CompanyEntry['category'])
    ? (sp.category as CompanyEntry['category'])
    : null;
  const highlightId = sp.from ?? null;

  const sb = supabaseAdmin();

  const profile = await getCurrentProfile();
  const isAdmin = await isCurrentUserAdmin();

  if (!profile || !profile.resume_text) {
    return (
      <div className="glass-card max-w-xl mx-auto text-center mt-12 space-y-4 py-12 px-8">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-secondary-fixed text-secondary mx-auto">
          <Crown className="h-7 w-7" />
        </div>
        <h1 className="font-headline text-headline-md font-bold text-on-background">Top MNC Hiring</h1>
        <p className="text-on-surface-variant text-body-md max-w-sm mx-auto">
          Upload your resume first to see job matches from Fortune 500 and top MNC companies.
        </p>
        <Link href="/onboarding" className="btn-primary">
          Add my resume
        </Link>
      </div>
    );
  }

  // Fetch ALL matches with job data — we filter client-side by company name.
  // NO score floor here: the value of this premium feature is "every job from
  // a top company", regardless of the AI score. A TCS/Infosys/Levi job should
  // appear even if it scored modestly.
  const { data: allMatches } = await sb
    .from('matches')
    .select(
      `id, llm_score, similarity, reason, status, bookmarked, matched_skills, missing_skills, applied_at, created_at, updated_at,
       job:jobs!inner(id, title, company, location, remote, url, source, salary, posted_at, fetched_at, description, tags)`,
    )
    .eq('profile_id', profile.id)
    .order('llm_score', { ascending: false, nullsFirst: false })
    .limit(1000);

  // Filter to only top MNC companies + apply category filter
  type MatchWithMnc = (typeof allMatches extends (infer T)[] | null ? T : never) & {
    _mnc: { name: string; category: CompanyEntry['category'] };
  };

  const mncMatches: MatchWithMnc[] = [];
  const categoryCounts: Record<string, number> = {};

  for (const m of allMatches ?? []) {
    const job = m.job as unknown as { company: string | null };
    const mnc = matchTopCompany(job.company);
    if (mnc) {
      categoryCounts[mnc.category] = (categoryCounts[mnc.category] ?? 0) + 1;
      if (!categoryFilter || mnc.category === categoryFilter) {
        mncMatches.push({ ...m, _mnc: mnc } as unknown as MatchWithMnc);
      }
    }
  }

  const totalMncJobs = Object.values(categoryCounts).reduce((a, b) => a + b, 0);
  const topSkills: string[] = Array.isArray((profile.insights as { top_skills?: string[] } | null)?.top_skills)
    ? (profile.insights as { top_skills: string[] }).top_skills
    : [];

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed-variant text-xs font-medium tracking-wide mb-3">
          <Crown className="h-3.5 w-3.5" />
          <span>PREMIUM FEATURE</span>
        </div>
        <h1 className="font-headline text-headline-lg-mobile md:text-heading-sm font-bold text-on-background flex items-center gap-3">
          <Building2 className="h-7 w-7 text-secondary" />
          Top MNC Hiring
        </h1>
        <p className="text-body-md text-on-surface-variant mt-1">
          Jobs from Fortune 500, Big 4, major Indian enterprises, and high-growth unicorns.
          <span className="text-secondary font-medium ml-2">{totalMncJobs} matches found</span>
        </p>
      </div>

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/top-mnc"
          scroll={false}
          className={[
            'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium whitespace-nowrap transition-all',
            !categoryFilter
              ? 'bg-secondary text-on-secondary shadow-sm'
              : 'border border-border-muted text-on-surface-variant hover:text-secondary hover:border-secondary/40 hover:bg-secondary-fixed/30',
          ].join(' ')}
        >
          All Companies
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${!categoryFilter ? 'bg-white/20' : 'bg-surface-container'}`}>
            {totalMncJobs}
          </span>
        </Link>
        {VALID_CATEGORIES.map((cat) => {
          const count = categoryCounts[cat] ?? 0;
          if (count === 0) return null;
          const isActive = categoryFilter === cat;
          return (
            <Link
              key={cat}
              href={`/top-mnc?category=${cat}`}
              scroll={false}
              className={[
                'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium whitespace-nowrap transition-all',
                isActive
                  ? 'bg-secondary text-on-secondary shadow-sm'
                  : 'border border-border-muted text-on-surface-variant hover:text-secondary hover:border-secondary/40 hover:bg-secondary-fixed/30',
              ].join(' ')}
            >
              {CATEGORY_LABELS[cat]}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${isActive ? 'bg-white/20' : 'bg-surface-container'}`}>
                {count}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Results */}
      {mncMatches.length === 0 ? (
        <div className="glass-card text-center py-12 px-6">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-secondary-fixed text-secondary mx-auto">
            <Sparkles className="h-6 w-6" />
          </div>
          <p className="mt-4 text-sm text-on-surface">
            No matches from top companies {categoryFilter ? `in "${CATEGORY_LABELS[categoryFilter]}"` : ''} yet.
          </p>
          <p className="mt-1 text-xs text-on-surface-variant">
            Run a scan to fetch more jobs — Fortune 500 companies post new roles daily.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {mncMatches.map((m) => {
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
            const mnc = (m as unknown as MatchWithMnc)._mnc;
            const returnHref = categoryFilter
              ? `/top-mnc?category=${categoryFilter}&from=${m.id}`
              : `/top-mnc?from=${m.id}`;
            const jobRow = m.job as unknown as {
              title: string;
              description: string | null;
            };
            const skills = enrichMatchListSkills(
              (m as unknown as { matched_skills: string[] | null }).matched_skills,
              (m as unknown as { missing_skills: string[] | null }).missing_skills,
              topSkills,
              jobRow.title,
              jobRow.description,
            );
            return (
              <li
                key={m.id}
                className={
                  m.id === highlightId
                    ? 'rounded-2xl ring-2 ring-primary ring-offset-2 transition-all'
                    : undefined
                }
              >
                <MatchCard
                  matchId={m.id}
                  score={m.llm_score}
                  reason={m.reason}
                  status={m.status}
                  bookmarked={(m as unknown as { bookmarked: boolean }).bookmarked ?? false}
                  matchedSkills={skills.matched_skills}
                  missingSkills={skills.missing_skills}
                  job={job}
                  showSource={isAdmin}
                  mncCategory={CATEGORY_LABELS[mnc.category]}
                  returnHref={returnHref}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
