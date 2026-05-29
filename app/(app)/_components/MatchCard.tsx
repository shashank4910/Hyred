'use client';

import Link from 'next/link';
import { MapPin, Building2, Clock, ExternalLink, Bookmark } from 'lucide-react';
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
};

export function MatchCard({ matchId, score, reason, status, bookmarked: initialBookmarked, job }: Props) {
  const colorClass = scoreColorClass(score);
  // Prefer the source's posted_at when available; fall back to fetched_at
  // (when JobRadar first saw the job) so every card always shows a date.
  // Many sources don't expose a posted_at value, but fetched_at is always set
  // and is a good proxy for freshness within a small window.
  const dateSource = job.posted_at ?? job.fetched_at ?? null;
  const relative = relativeTime(dateSource);
  const shortDate = formatShortDate(dateSource);
  const fullDate = formatFullDate(dateSource);
  const isAdded = !job.posted_at && !!job.fetched_at;
  const tooltip = isAdded
    ? `Added to JobRadar on ${fullDate} (source did not provide a posted date)`
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
    setBookmarked(next); // optimistic
    try {
      const res = await fetch(`/api/match/${matchId}/bookmark`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bookmarked: next }),
      });
      if (!res.ok) setBookmarked(!next); // revert on error
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
        'card-hover block group animate-fade-in relative',
        isViewed ? 'opacity-75 hover:opacity-100 transition-opacity duration-200' : '',
      ].join(' ')}
    >
      {/* Seen/Unseen dot indicator */}
      {!isViewed && (
        <span className="absolute top-4 right-4 h-2 w-2 rounded-full bg-amber animate-pulse" />
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3
              className={[
                'text-body truncate group-hover:text-amber-hover transition-colors',
                isViewed ? 'font-normal' : 'font-semibold text-ink',
              ].join(' ')}
            >
              {job.title}
            </h3>
            <span className="badge">{SOURCE_LABELS[job.source] ?? job.source}</span>
            {!isViewed && (
              <span className="inline-flex items-center rounded-badge bg-amber/15 text-amber-hover px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                New
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone">
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
            {shortDate && (
              <span
                className="inline-flex items-center gap-1"
                title={tooltip}
              >
                <Clock className="h-3 w-3" />
                <span className="font-medium text-ink/80">{shortDate}</span>
                {relative && (
                  <span className="text-shadow-tint">· {relative}</span>
                )}
                {isAdded && (
                  <span className="text-[9px] uppercase tracking-wide text-shadow-tint">added</span>
                )}
              </span>
            )}
            {job.salary && (
              <span className="inline-flex items-center gap-1 text-amber-hover font-medium">
                {job.salary}
              </span>
            )}
          </div>
          {reason && (
            <p className="mt-2 text-sm text-stone line-clamp-2">{reason}</p>
          )}
        </div>

        {/* Score + bookmark */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="text-right">
            <div className={`text-3xl font-bold ${colorClass}`}>{score ?? '–'}</div>
            <div className="text-[10px] uppercase tracking-wide text-shadow-tint font-medium">
              match
            </div>
          </div>
          {/* Bookmark button */}
          <button
            onClick={toggleBookmark}
            disabled={saving}
            title={bookmarked ? 'Remove bookmark' : 'Bookmark this job'}
            className={[
              'rounded-full p-1.5 transition-all duration-150',
              bookmarked
                ? 'text-amber bg-amber/10 hover:bg-amber/20'
                : 'text-shadow-tint opacity-0 group-hover:opacity-100 hover:text-amber hover:bg-amber/10',
            ].join(' ')}
          >
            <Bookmark
              className="h-4 w-4"
              fill={bookmarked ? 'currentColor' : 'none'}
            />
          </button>
        </div>
      </div>

      <div className="mt-3 text-xs text-stone opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1">
        View details <ExternalLink className="h-3 w-3" />
      </div>
    </Link>
  );
}
