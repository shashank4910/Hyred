import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, MapPin, Building2, Clock } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase/server';
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

  return (
    <div className="space-y-4">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> All matches
      </Link>

      <div className="card">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold leading-tight">{job.title}</h1>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
              {job.company && (
                <span className="inline-flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  {job.company}
                </span>
              )}
              {(job.location || job.remote) && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {job.location || 'Remote'}
                </span>
              )}
              {posted && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  Posted {posted}
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="badge">{SOURCE_LABELS[job.source] ?? job.source}</span>
              {job.salary && <span className="badge-primary">{job.salary}</span>}
              {(job.tags ?? []).slice(0, 8).map((t) => (
                <span key={t} className="badge">
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className={`text-4xl font-bold ${colorClass}`}>
              {match.llm_score ?? '–'}
            </div>
            <div className="text-xs text-muted uppercase tracking-wide">
              {scoreLabel(match.llm_score)}
            </div>
          </div>
        </div>

        {match.reason && (
          <p className="mt-4 text-sm border-l-2 border-primary/50 pl-3 text-fg/90">
            <span className="text-muted">Why this matched: </span>
            {match.reason}
          </p>
        )}
      </div>

      <JobActions
        matchId={match.id}
        status={match.status}
        coverLetter={match.cover_letter}
        notes={match.notes}
        candidateSkills={profile?.insights?.top_skills ?? []}
        applyUrl={job.url}
      />

      <div className="card">
        <h2 className="font-semibold mb-2">Job description</h2>
        <pre className="whitespace-pre-wrap text-sm text-fg/85 font-sans leading-relaxed">
          {job.description ?? 'No description.'}
        </pre>
      </div>
    </div>
  );
}
