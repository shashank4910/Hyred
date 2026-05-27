import Link from 'next/link';
import { MapPin, Building2, Clock } from 'lucide-react';
import { relativeTime, scoreColorClass, SOURCE_LABELS } from '@/lib/ui';

type Props = {
  matchId: string;
  score: number | null;
  reason: string | null;
  job: {
    id: string;
    title: string;
    company: string | null;
    location: string | null;
    remote: boolean;
    salary: string | null;
    source: string;
    posted_at: string | null;
    fetched_at?: string;
  };
};

export function MatchCard({ matchId, score, reason, job }: Props) {
  const colorClass = scoreColorClass(score);
  const posted = relativeTime(job.posted_at);

  return (
    <Link href={`/jobs/${matchId}`} className="card-interactive block group animate-fade-in">
      <div className="flex items-start justify-between gap-6">
        {/* Left content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-body font-semibold text-ink group-hover:text-stone transition-colors truncate">
              {job.title}
            </h3>
            <span className="badge">{SOURCE_LABELS[job.source] ?? job.source}</span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-stone">
            {job.company && (
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-shadow-tint" />
                {job.company}
              </span>
            )}
            {(job.location || job.remote) && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-shadow-tint" />
                {job.location || 'Remote'}
              </span>
            )}
            {posted && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-shadow-tint" />
                {posted}
              </span>
            )}
            {job.salary && (
              <span className="font-medium text-ink">{job.salary}</span>
            )}
          </div>

          {reason && (
            <p className="mt-3 text-body-sm text-stone line-clamp-2">{reason}</p>
          )}
        </div>

        {/* Score */}
        <div className="text-right shrink-0 pl-4">
          <div className={`text-heading font-semibold tabular-nums ${colorClass}`}>
            {score ?? '–'}
          </div>
          <div className="text-caption text-shadow-tint uppercase tracking-wide mt-0.5">
            score
          </div>
        </div>
      </div>
    </Link>
  );
}
