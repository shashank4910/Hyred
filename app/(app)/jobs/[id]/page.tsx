import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, MapPin, Clock, FileText } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile, isCurrentUserAdmin } from '@/lib/current-user';
import { ensureFullDescription, stripHtml } from '@/lib/jd-fetcher';
import { supplementMatchedFromProfile, filterMissingSkillsForJd } from '@/lib/match-skill-enrich';
import { JobActions } from './JobActions';
import { AutoApplyButton } from './AutoApplyButton';
import { MatchSkillPills } from '../../_components/MatchSkillPills';
import { CollapsibleCard } from '../../_components/CollapsibleCard';
import { CompanyLogo } from '../../_components/CompanyLogo';
import { relativeTime, scoreColorClass, scoreLabel, SOURCE_LABELS } from '@/lib/ui';
import { ReferralRadar } from './ReferralRadar';
import { JobHashScroll } from './JobHashScroll';

export const dynamic = 'force-dynamic';

export default async function JobMatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ return?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  // Only honor internal return paths — never bounce to an external URL.
  const decodedReturn = sp.return ? decodeURIComponent(sp.return) : '';
  const isSafeReturn = decodedReturn.startsWith('/');
  const backHref = isSafeReturn ? decodedReturn : `/?from=${id}`;
  // Parallel auth resolution — these were sequential round trips (each does
  // its own auth.getUser() + profile query) and added a second auth hop of
  // pure latency to every job page view.
  const [profile0, isAdmin] = await Promise.all([
    getCurrentProfile(),
    isCurrentUserAdmin(),
  ]);
  if (!profile0) notFound();
  const sb = supabaseAdmin();

  // Mark-as-viewed AND fetch the row in one round trip when possible:
  // update(...).select() returns the full row only when it actually flipped
  // 'new' → 'viewed'. When the status was already 'viewed' (repeat visits,
  // the common case) zero rows match, so we fall back to a plain select.
  const VIEW_SELECT = `id, llm_score, similarity, reason, status, bookmarked, matched_skills, missing_skills, cover_letter, notes, applied_at, tailored_resume_text, tailored_resume_url,
       profile:profiles(insights),
       job:jobs(id, title, company, location, remote, url, source, salary, description, posted_at, fetched_at, tags)`;
  const { data: updatedMatch } = await sb
    .from('matches')
    .update({ status: 'viewed' })
    .eq('id', id)
    .eq('profile_id', profile0.id)
    .eq('status', 'new')
    .select(VIEW_SELECT)
    .maybeSingle();

  // Main match row + the two independent lookups run together — they were
  // sequential round trips before (resume versions and premium status don't
  // depend on the match row).
  const [{ data: match }, { data: resumeVersions }, { data: premiumSub }] = await Promise.all([
    updatedMatch
      ? Promise.resolve({ data: updatedMatch })
      : sb
          .from('matches')
          .select(VIEW_SELECT)
          .eq('id', id)
          .eq('profile_id', profile0.id)
          .maybeSingle(),
    sb
      .from('resume_versions')
      .select('id, label, ats_match_score, created_at')
      .eq('profile_id', profile0.id)
      .eq('match_id', id)
      .order('created_at', { ascending: false })
      .limit(10),
    sb
      .from('premium_subscriptions')
      .select('plan')
      .eq('profile_id', profile0.id)
      .eq('status', 'active')
      .maybeSingle(),
  ]);

  if (!match) notFound();

  const job = match.job as unknown as {
    id: string;
    title: string;
    company: string | null;
    location: string | null;
    remote: boolean;
    url: string;
    source: string;
    salary: string | null;
    description: string | null;
    posted_at: string | null;
    tags: string[] | null;
  };
  const colorClass = scoreColorClass(match.llm_score);
  const posted = relativeTime(job.posted_at);

  // Ensure the FULL job description is loaded before rendering.
  // Adzuna (and some other sources) truncate JDs to ~500 chars on ingest.
  // Previously the page rendered whatever was in the DB and the full JD was
  // only fetched later by background API calls (skills/resume) — so the user
  // saw a partial JD until a hard refresh re-queried the updated row.
  // Now we fetch + persist it here, server-side, so the first render is complete.
  // ensureFullDescription is idempotent: a no-op once the JD is long enough.
  //
  // TIME-BOXED to 2.5s: the fetch hits the company's career page over the
  // internet (12s timeout inside jd-fetcher) — a slow site used to block the
  // ENTIRE page render for 5-6s. If the fetch can't win in 2.5s we render
  // with the stored description instead; the ingest/scan path still does the
  // full unbounded fetch and persistence, so the JD self-heals for the next
  // visit.
  const fullDescription = await Promise.race([
    ensureFullDescription({
      jobId: job.id,
      currentDescription: job.description,
      url: job.url,
    }),
    new Promise<string | null>((resolve) =>
      setTimeout(() => resolve(job.description), 2_500),
    ),
  ]);

  // Render hygiene: whatever we render must be plain text. Some sources
  // (LinkedIn detail endpoint) store HTML fragments; a failed backfill used
  // to surface raw tags in the page. Strip defensively at the last mile.
  const displayDescription = stripHtml(fullDescription ?? '').trim() ||
    stripHtml(job.description ?? '').trim();

  // Dynamic self-healing: Recalculate matched skills using the full description
  // and the user's top profile skills if they are not in sync.
  const candidateSkills = (match.profile as any)?.insights?.top_skills;
  if (Array.isArray(candidateSkills)) {
    const currentMatched = (match as any).matched_skills ?? [];
    const currentMissing = (match as any).missing_skills ?? [];
    const updatedMatched = supplementMatchedFromProfile(
      currentMatched,
      candidateSkills,
      fullDescription,
      job.title,
    );
    const updatedMissing = filterMissingSkillsForJd(
      currentMissing,
      fullDescription,
      job.title,
    );
    const matchedDiff =
      currentMatched.length !== updatedMatched.length ||
      currentMatched.some((s: string, idx: number) => s !== updatedMatched[idx]);
    const missingDiff =
      currentMissing.length !== updatedMissing.length ||
      currentMissing.some((s: string, idx: number) => s !== updatedMissing[idx]);

    if (matchedDiff || missingDiff) {
      await sb
        .from('matches')
        .update({
          matched_skills: updatedMatched,
          missing_skills: updatedMissing,
        })
        .eq('id', id)
        .eq('profile_id', profile0.id);
      match.matched_skills = updatedMatched;
      (match as any).missing_skills = updatedMissing;
    }
  }

  const isPremium = Boolean(premiumSub?.plan && premiumSub.plan !== 'free');
  const tailoredText =
    (match as unknown as { tailored_resume_text?: string | null }).tailored_resume_text ?? '';
  const jdRaw = displayDescription || 'No description.';
  const jdPreview =
    jdRaw.length > 120 ? `${jdRaw.slice(0, 120).trim()}…` : jdRaw;

  return (
    <div className="space-y-5">
      <JobHashScroll />
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-primary transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to matches
      </Link>

      {/* Job header card */}
      <div className="glass-card p-6 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="font-headline text-headline-md font-bold text-on-background leading-tight">{job.title}</h1>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-on-surface-variant">
              {job.company && (
                <span className="inline-flex items-center gap-1.5">
                  <CompanyLogo name={job.company} size={24} />
                  {job.company}
                </span>
              )}
              {(job.location || job.remote) && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  {job.location || 'Remote'}
                </span>
              )}
              {posted && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />
                  Posted {posted}
                </span>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {isAdmin && (
                <span className="badge">{SOURCE_LABELS[job.source] ?? job.source}</span>
              )}
              {job.salary && <span className="badge-success">{job.salary}</span>}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className={`text-stat-value font-headline font-bold ${colorClass}`}>
              {match.llm_score ?? '–'}
            </div>
            <div className="text-xs text-on-surface-variant uppercase tracking-wider font-medium mt-1">
              {scoreLabel(match.llm_score)}
            </div>
          </div>
        </div>

        {match.reason && (
          <div className="mt-5 p-4 rounded-lg bg-primary-fixed/30 border-l-4 border-primary">
            <p className="text-sm text-on-surface-variant">
              <span className="text-primary font-medium">Why this matched: </span>
              {match.reason}
            </p>
          </div>
        )}

        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant mb-2">
            Skill match
          </p>
          <MatchSkillPills
            matchedSkills={(match as unknown as { matched_skills: string[] | null }).matched_skills ?? []}
            missingSkills={(match as unknown as { missing_skills: string[] | null }).missing_skills ?? []}
            resumeHref="#ats-resume"
          />
        </div>
      </div>

      <JobActions
        matchId={match.id}
        status={match.status}
        bookmarked={(match as unknown as { bookmarked: boolean }).bookmarked ?? false}
        coverLetter={match.cover_letter}
        applyUrl={job.url}
        hasTailoredResume={!!(tailoredText || (match as unknown as { tailored_resume_url?: string | null }).tailored_resume_url)}
        initialResumeText={tailoredText}
        initialResumeVersions={resumeVersions ?? []}
        isPremium={isPremium}
      />

      {/* Referral Radar */}
      {job.company && (
        <ReferralRadar
          matchId={match.id}
          company={job.company}
          jobTitle={job.title}
          matchScore={match.llm_score}
          matchedSkills={(match as unknown as { matched_skills: string[] | null }).matched_skills ?? []}
          jobUrl={job.url}
        />
      )}

      {/* Auto Apply — collapsed by default */}
      <CollapsibleCard
        title="Auto Apply"
        icon={<span className="text-secondary">⚡</span>}
        summary="AI agent fills the application for you"
        defaultOpen={false}
      >
        <p className="text-xs text-on-surface-variant mb-4">
          The AI agent will open the company&apos;s career page, fill the form using your
          Application Profile, upload your ATS resume, and submit — while you watch it live.
        </p>
        <AutoApplyButton
          matchId={match.id}
          agentUrl={process.env.NEXT_PUBLIC_APPLY_AGENT_URL ?? null}
        />
      </CollapsibleCard>

      {/* Job description — collapsed by default */}
      <CollapsibleCard
        title="Job description"
        icon={<FileText className="h-4 w-4 text-primary" />}
        summary={jdPreview}
        defaultOpen={false}
      >
        <pre className="whitespace-pre-wrap text-sm text-on-surface-variant font-sans leading-relaxed max-h-[70vh] overflow-y-auto">
          {displayDescription || 'No description.'}
        </pre>
      </CollapsibleCard>
    </div>
  );
}
