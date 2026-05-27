import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, MapPin, Building2, Clock } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ensureFullDescription } from '@/lib/jd-fetcher';
import { JobActions } from './JobActions';
import { relativeTime, scoreColorClass, scoreLabel, SOURCE_LABELS } from '@/lib/ui';

export const dynamic = 'force-dynamic';

export default async function JobMatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = supabaseAdmin();

  await sb
    .from('matches')
    .update({ status: 'viewed' })
    .eq('id', id)
    .eq('status', 'new');

  const { data: match } = await sb
    .from('matches')
    .select(
      `id, llm_score, similarity, reason, status, cover_letter, notes, applied_at,
       profile:profiles(insights),
       job:jobs(id, title, company, location, remote, url, source, salary, description, posted_at, tags)`,
    )
    .eq('id', id)
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
  const profile = match.profile as unknown as {
    insights: { top_skills?: string[] } | null;
  } | null;
  const colorClass = scoreColorClass(match.llm_score);
  const posted = relativeTime(job.posted_at);

  // Lazy-upgrade truncated descriptions
  const fullDescription = await ensureFullDescription({
    jobId: job.id,
    currentDescription: job.description,
    url: job.url,
  });

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-body-sm text-stone hover:text-ink transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to matches
      </Link>

      {/* Job header card */}
      <div className="card">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-heading-sm font-semibold text-ink">{job.title}</h1>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-body-sm text-stone">
              {job.company && (
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-shadow-tint" />
                  {job.company}
                </span>
              )}
              {(job.location || job.remote) && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-shadow-tint" />
                  {job.location || 'Remote'}
                </span>
              )}
              {posted && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-shadow-tint" />
                  Posted {posted}
                </span>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="badge">{SOURCE_LABELS[job.source] ?? job.source}</span>
              {job.salary && <span className="badge-warm">{job.salary}</span>}
              {(job.tags ?? []).slice(0, 8).map((t) => (
                <span key={t} className="badge">{t}</span>
              ))}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className={`text-heading font-semibold tabular-nums ${colorClass}`}>
              {match.llm_score ?? '–'}
            </div>
            <div className="text-caption text-shadow-tint uppercase tracking-wide mt-1">
              {scoreLabel(match.llm_score)}
            </div>
          </div>
        </div>

        {match.reason && (
          <div className="mt-6 border-l-2 border-faded-stone pl-4">
            <p className="text-caption text-shadow-tint uppercase tracking-wide mb-1">Why this matched</p>
            <p className="text-body-sm text-stone">{match.reason}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <JobActions
        matchId={match.id}
        status={match.status}
        coverLetter={match.cover_letter}
        notes={match.notes}
        candidateSkills={profile?.insights?.top_skills ?? []}
        applyUrl={job.url}
      />

      {/* Job description */}
      <div className="card">
        <h2 className="text-body font-semibold text-ink mb-4">Job description</h2>
        <div className="prose-sm">
          <pre className="whitespace-pre-wrap text-body-sm text-stone font-sans leading-relaxed m-0">
            {fullDescription || 'No description available.'}
          </pre>
        </div>
      </div>
    </div>
  );
}
