'use client';

import Link from 'next/link';
import { MapPin, Building2, Clock, ExternalLink, Bookmark, Crown, Check, X } from 'lucide-react';
import { relativeTime, formatShortDate, formatFullDate, scoreColorClass, SOURCE_LABELS } from '@/lib/ui';
import { useState } from 'react';

type Props = {
  matchId: string;
  score: number | null;
  reason: string | null;
  status: string;
  bookmarked: boolean;
  job: {
    id: string;
    title: string;
    company: string | null;
    location: string | null;
    remote: boolean;
    salary: string | null;
    source: string;
    posted_at: string | null;
    fetched_at?: string | null;
  };
  /** Optional MNC category label — rendered inline as a badge */
  mncCategory?: string;
  /** Top skills matched between JD and resume (why it matched) */
  matchedSkills?: string[];
  /** Top skills the JD wants but resume lacks (the gaps) */
  missingSkills?: string[];
  /** When false, hide the job-board source badge (admin-only data). */
  showSource?: boolean;
};

export function MatchCard({ matchId, score, reason, status, bookmarked: initialBookmarked, job, mncCategory, matchedSkills = [], missingSkills = [], showSource = false }: Props) {
  const colorClass = scoreColorClass(score);
  const dateSource = job.posted_at ?? job.fetched_at ?? null;
  const relative = relativeTime(dateSource);
  const shortDate = formatShortDate(dateSource);
  const fullDate = formatFullDate(dateSource);
  const isAdded = !job.posted_at && !!job.fetched_at;
  const tooltip = isAdded
    ? `Added to Hyred on ${fullDate} (source did not provide a posted date)`
    : `Posted on the source on ${fullDate}`;
  const isViewed = status === 'viewed' || (status !== 'new');
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [saving, setSaving] = useState(false);

  async function toggleBookmark(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (saving) return;
    setSaving(true);
    const next = !bookmarked;
    setBookmarked(next);
    try {
      const res = await fetch(`/api/match/${matchId}/bookmark`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bookmarked: next }),
      });
      if (!res.ok) setBookmarked(!next);
    } catch {
      setBookmarked(!next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Link
      href={`/jobs/${matchId}`}
      className={[
        'block group animate-fade-in relative rounded-xl border bg-surface-card p-5 shadow-card transition-all hover:shadow-elevated hover:border-primary/30 hover:-translate-y-0.5',
        isViewed ? 'opacity-80 hover:opacity-100' : 'border-border-muted',
      ].join(' ')}
    >
      {/* New indicator */}
      {!isViewed && (
        <span className="absolute top-4 right-4 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
        </span>
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3
              className={[
                'text-body-md truncate group-hover:text-primary transition-colors',
                isViewed ? 'font-medium text-on-surface' : 'font-semibold text-on-background',
              ].join(' ')}
            >
              {job.title}
            </h3>
            {showSource && (
              <span className="badge">{SOURCE_LABELS[job.source] ?? job.source}</span>
            )}
            {mncCategory && (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary-fixed text-on-secondary-fixed-variant px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                <Crown className="h-2.5 w-2.5" />
                {mncCategory}
              </span>
            )}
            {!isViewed && (
              <span className="inline-flex items-center rounded-full bg-primary-fixed text-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                New
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-on-surface-variant">
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
            {shortDate && (
              <span className="inline-flex items-center gap-1" title={tooltip}>
                <Clock className="h-3.5 w-3.5" />
                <span className="font-medium text-on-surface/80">{shortDate}</span>
                {relative && (
                  <span className="text-outline">· {relative}</span>
                )}
                {isAdded && (
                  <span className="text-[9px] uppercase tracking-wide text-outline bg-surface-container px-1.5 py-0.5 rounded-full">added</span>
                )}
              </span>
            )}
            {job.salary && (
              <span className="inline-flex items-center gap-1 text-success-green font-medium">
                {job.salary}
              </span>
            )}
          </div>
          {reason && (
            <p className="mt-2.5 text-sm text-on-surface-variant line-clamp-2">{reason}</p>
          )}

          {/* Top matched / missing skills — quick visual "why" at a glance */}
          {(matchedSkills.length > 0 || missingSkills.length > 0) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {matchedSkills.slice(0, 5).map((s) => (
                <span
                  key={`m-${s}`}
                  className="inline-flex items-center gap-1 rounded-full bg-success-green/10 text-success-green px-2 py-0.5 text-[11px] font-medium"
                  title="Matches your resume"
                >
                  <Check className="h-3 w-3" />
                  {s}
                </span>
              ))}
              {missingSkills.slice(0, 5).map((s) => (
                <span
                  key={`x-${s}`}
                  className="inline-flex items-center gap-1 rounded-full bg-error/10 text-error px-2 py-0.5 text-[11px] font-medium"
                  title="Required by the job but not clearly in your resume"
                >
                  <X className="h-3 w-3" />
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Score + bookmark */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="text-right">
            <div className={`text-stat-value font-headline font-bold ${colorClass}`}>{score ?? '–'}</div>
            <div className="text-[10px] uppercase tracking-wider text-outline font-medium mt-0.5">
              match
            </div>
          </div>
          <button
            onClick={toggleBookmark}
            disabled={saving}
            title={bookmarked ? 'Remove bookmark' : 'Bookmark this job'}
            className={[
              'rounded-full p-1.5 transition-all duration-150',
              bookmarked
                ? 'text-secondary bg-secondary-fixed hover:bg-secondary-fixed-dim'
                : 'text-outline opacity-0 group-hover:opacity-100 hover:text-secondary hover:bg-secondary-fixed',
            ].join(' ')}
          >
            <Bookmark
              className="h-4 w-4"
              fill={bookmarked ? 'currentColor' : 'none'}
            />
          </button>
        </div>
      </div>

      <div className="mt-3 text-xs text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1">
        View details <ExternalLink className="h-3 w-3" />
      </div>
    </Link>
  );
}
