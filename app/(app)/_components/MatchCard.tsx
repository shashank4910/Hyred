import Link from 'next/link';
import { MapPin, Building2, Clock, ExternalLink } from 'lucide-react';
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
    <Link
      href={`/jobs/${matchId}`}
      className="card-hover block group animate-fade-in"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold truncate group-hover:text-primary transition-colors">
              {job.title}
            </h3>
            <span className="badge">{SOURCE_LABELS[job.source] ?? job.source}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            {job.company && (
              <span className="inline-flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {job.company}
              </span>
            )}
            {(job.location || job.remote) && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {job.location || 'Remote'}
              </span>
            )}
            {posted && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {posted}
              </span>
            )}
            {job.salary && (
              <span className="inline-flex items-center gap-1 text-primary/80">
                {job.salary}
              </span>
            )}
          </div>
          {reason && (
            <p className="mt-2 text-sm text-fg/80 line-clamp-2">{reason}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className={`text-3xl font-bold ${colorClass}`}>{score ?? '–'}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted">
            match
          </div>
        </div>
      </div>
      <div className="mt-3 text-xs text-muted opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1">
        View details <ExternalLink className="h-3 w-3" />
      </div>
    </Link>
  );
}
