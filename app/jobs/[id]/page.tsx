import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/server';
import { JobActions } from './JobActions';

export const dynamic = 'force-dynamic';

export default async function JobMatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = supabaseAdmin();

  // Mark this match as 'viewed' if it was 'new'
  await sb
    .from('matches')
    .update({ status: 'viewed' })
    .eq('id', id)
    .eq('status', 'new');

  const { data: match } = await sb
    .from('matches')
    .select(
      `id, llm_score, similarity, reason, status, cover_letter, applied_at,
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

  return (
    <div className="space-y-4">
      <div>
        <Link href="/" className="text-sm text-muted hover:text-primary">
          &larr; Back to matches
        </Link>
      </div>

      <div className="card">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold">{job.title}</h1>
            <div className="text-muted mt-1">
              {[job.company, job.location || (job.remote ? 'Remote' : null)]
                .filter(Boolean)
                .join(' · ')}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="badge">{job.source}</span>
              {job.salary && <span className="badge">{job.salary}</span>}
              {(job.tags ?? []).slice(0, 6).map((t) => (
                <span key={t} className="badge">
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-4xl font-bold text-primary">{match.llm_score}</div>
            <div className="text-xs text-muted">match score</div>
          </div>
        </div>

        {match.reason && (
          <p className="mt-4 text-sm border-l-2 border-primary/50 pl-3">
            <span className="text-muted">Why this matched: </span>
            {match.reason}
          </p>
        )}

        <div className="mt-4">
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary"
          >
            Open original posting &rarr;
          </a>
        </div>
      </div>

      <JobActions
        matchId={match.id}
        status={match.status}
        coverLetter={match.cover_letter}
      />

      <div className="card">
        <h2 className="font-semibold mb-2">Job description</h2>
        <pre className="whitespace-pre-wrap text-sm text-[#cbd5e1] font-sans">
          {job.description ?? 'No description.'}
        </pre>
      </div>
    </div>
  );
}
