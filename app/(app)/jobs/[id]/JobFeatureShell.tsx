import Link from 'next/link';
import { ArrowLeft, MapPin } from 'lucide-react';
import { scoreColorClass, scoreLabel } from '@/lib/ui';
import type { MatchSummary } from './get-match-summary';
import { CompanyLogo } from '../../_components/CompanyLogo';

export function JobFeatureShell({
  match,
  featureLabel,
  backHref,
  jobHref,
  children,
}: {
  match: MatchSummary;
  featureLabel: string;
  backHref: string;
  jobHref: string;
  children: React.ReactNode;
}) {
  const colorClass = scoreColorClass(match.llm_score);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-on-surface-variant hover:text-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to matches
        </Link>
        <span className="text-outline-variant">·</span>
        <Link href={jobHref} className="text-on-surface-variant hover:text-primary transition-colors">
          Full job page
        </Link>
      </div>

      <div className="glass-card p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-2">{featureLabel}</p>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-headline text-headline-md font-bold text-on-background leading-tight">
              {match.job.title}
            </h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-on-surface-variant">
              {match.job.company && (
                <span className="inline-flex items-center gap-1.5">
                  <CompanyLogo name={match.job.company} size={16} />
                  {match.job.company}
                </span>
              )}
              {match.job.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  {match.job.location}
                </span>
              )}
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
      </div>

      {children}
    </div>
  );
}
