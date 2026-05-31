import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, MapPin, Building2, Clock } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile, isCurrentUserAdmin } from '@/lib/current-user';
import { ensureFullDescription } from '@/lib/jd-fetcher';
import { JobActions } from './JobActions';
import { AutoApplyButton } from './AutoApplyButton';
import { BackToMatches } from './BackToMatches';
import { relativeTime, scoreColorClass, scoreLabel, SOURCE_LABELS } from '@/lib/ui';

export const dynamic = 'force-dynamic';

export default async function JobMatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile0 = await getCurrentProfile();
  if (!profile0) notFound();
  const isAdmin = await isCurrentUserAdmin();
  const sb = supabaseAdmin();

  await sb
    .from('matches')
    .update({ status: 'viewed' })
    .eq('id', id)
    .eq('profile_id', profile0.id)
    .eq('status', 'new');

  const { data: match } = await sb
    .from('matches')
    .select(
      `id, llm_score, similarity, reason, status, bookmarked, cover_letter, notes, applied_at,
       profile:profiles(insights),
       job:jobs(id, title, company, location, remote, url, source, salary, description, posted_at, tags)`,
    )
    .eq('id', id)
    .eq('profile_id', profile0.id)
    .maybeSingle();

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
  const fullDescription = await ensureFullDescription({
    jobId: job.id,
    currentDescription: job.description,
    url: job.url,
  });

  return (
    <div className="space-y-5">
      <BackToMatches matchId={id} />

      {/* Job header card */}
      <div className="glass-card p-6 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="font-headline text-headline-md font-bold text-on-background leading-tight">{job.title}</h1>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-on-surface-variant">
              {job.company && (
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="h-4 w-4" />
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
              {(job.tags ?? []).slice(0, 8).map((t) => (
                <span key={t} className="badge">
                  {t}
                </span>
              ))}
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
      </div>

      <JobActions
        matchId={match.id}
        status={match.status}
        bookmarked={(match as unknown as { bookmarked: boolean }).bookmarked ?? false}
        coverLetter={match.cover_letter}
        notes={match.notes}
        applyUrl={job.url}
      />

      {/* Auto Apply */}
      <div className="glass-card p-6 border-secondary/20 bg-gradient-to-r from-secondary-fixed/20 to-transparent">
        <h2 className="font-headline font-semibold text-on-background flex items-center gap-2 mb-1">
          <span className="text-secondary">⚡</span> Auto Apply
        </h2>
        <p className="text-xs text-on-surface-variant mb-4">
          The AI agent will open the company&apos;s career page, fill the form using your
          Application Profile, upload your ATS resume, and submit — while you watch it live.
        </p>
        <AutoApplyButton
          matchId={match.id}
          agentUrl={process.env.NEXT_PUBLIC_APPLY_AGENT_URL ?? null}
        />
      </div>

      {/* Job description */}
      <div className="glass-card p-6 md:p-8">
        <h2 className="font-headline font-semibold text-on-background mb-4">Job description</h2>
        <pre className="whitespace-pre-wrap text-sm text-on-surface-variant font-sans leading-relaxed">
          {fullDescription || job.description || 'No description.'}
        </pre>
      </div>
    </div>
  );
}
