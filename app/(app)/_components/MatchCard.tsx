'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  MapPin,
  Building2,
  Clock,
  Bookmark,
  Crown,
  Check,
  Plus,
  Zap,
} from 'lucide-react';
import { relativeTime, formatShortDate, formatFullDate, SOURCE_LABELS } from '@/lib/ui';
import { MatchScoreRing } from './MatchScoreRing';

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
  mncCategory?: string;
  matchedSkills?: string[];
  missingSkills?: string[];
  showSource?: boolean;
};

export function MatchCard({
  matchId,
  score,
  reason,
  status,
  bookmarked: initialBookmarked,
  job,
  mncCategory,
  matchedSkills = [],
  missingSkills = [],
  showSource = false,
}: Props) {
  const dateSource = job.posted_at ?? job.fetched_at ?? null;
  const relative = relativeTime(dateSource);
  const shortDate = formatShortDate(dateSource);
  const fullDate = formatFullDate(dateSource);
  const isAdded = !job.posted_at && !!job.fetched_at;
  const tooltip = isAdded
    ? `Added to Hyred on ${fullDate} (source did not provide a posted date)`
    : `Posted on the source on ${fullDate}`;
  const isViewed = status === 'viewed' || status !== 'new';
  const isNew = status === 'new';
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [saving, setSaving] = useState(false);

  const companyInitial = (job.company ?? job.title).charAt(0).toUpperCase();
  const insightBorder =
    (score ?? 0) >= 75 ? 'border-match-success' : 'border-secondary-fixed-dim';

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
        'group block min-w-0 animate-fade-in rounded-2xl p-6 shadow-card transition-all hover:-translate-y-1 hover:border-primary/10 hover:shadow-elevated',
        isNew
          ? 'bg-surface-container-lowest border-l-4 border-l-primary'
          : 'bg-surface-container-lowest/70 opacity-75 hover:opacity-100',
      ].join(' ')}
    >
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-low text-lg font-bold text-primary">
            {companyInitial}
          </div>
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h3 className="text-headline-md font-semibold leading-tight text-on-surface group-hover:text-primary transition-colors">
                {job.title}
              </h3>
              {!isViewed && (
                <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                  New
                </span>
              )}
              {showSource && (
                <span className="badge">{SOURCE_LABELS[job.source] ?? job.source}</span>
              )}
              {mncCategory && (
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary-container/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-secondary">
                  <Crown className="h-2.5 w-2.5" />
                  {mncCategory}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-label-md text-on-surface-variant">
              {job.company && (
                <span className="inline-flex items-center gap-1">
                  <Building2 className="h-4 w-4" />
                  {job.company}
                </span>
              )}
              {(job.location || job.remote) && (
                <>
                  <span className="h-1 w-1 rounded-full bg-outline-variant" />
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {job.location || 'Remote'}
                  </span>
                </>
              )}
              {shortDate && (
                <>
                  <span className="h-1 w-1 rounded-full bg-outline-variant" />
                  <span className="inline-flex items-center gap-1" title={tooltip}>
                    <Clock className="h-4 w-4" />
                    {shortDate}
                    {relative && <span className="text-text-muted">· {relative}</span>}
                  </span>
                </>
              )}
              {job.salary && (
                <>
                  <span className="h-1 w-1 rounded-full bg-outline-variant" />
                  <span className="font-medium text-match-success">{job.salary}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <MatchScoreRing score={score} />
      </div>

      {reason && (
        <div
          className={`mb-6 rounded-2xl border-l-4 bg-surface-container-low/50 p-4 ${insightBorder}`}
        >
          <p className="text-body-md italic leading-relaxed text-on-surface-variant">
            &ldquo;{reason}&rdquo;
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {matchedSkills.slice(0, 5).map((s) => (
            <span
              key={`m-${s}`}
              className="inline-flex items-center gap-1 rounded-full bg-match-success/10 px-3 py-1 text-[11px] font-semibold text-match-success"
            >
              <Check className="h-3.5 w-3.5" />
              {s}
            </span>
          ))}
          {missingSkills.slice(0, 5).map((s) => (
            <span
              key={`x-${s}`}
              className="inline-flex items-center gap-1 rounded-full bg-surface-container px-3 py-1 text-[11px] font-semibold text-text-muted"
            >
              <Plus className="h-3.5 w-3.5" />
              {s}
            </span>
          ))}
        </div>
        <div className="flex gap-2" onClick={(e) => e.preventDefault()}>
          <button
            type="button"
            onClick={toggleBookmark}
            disabled={saving}
            title={bookmarked ? 'Remove bookmark' : 'Bookmark this job'}
            className={[
              'rounded-2xl border border-outline-variant p-3 transition-all',
              bookmarked
                ? 'bg-primary/10 text-primary'
                : 'text-primary opacity-0 group-hover:opacity-100 hover:bg-surface-container',
            ].join(' ')}
          >
            <Bookmark className="h-4 w-4" fill={bookmarked ? 'currentColor' : 'none'} />
          </button>
          <span className="btn-primary pointer-events-none inline-flex gap-2 px-5 py-3 text-label-md">
            <Zap className="h-4 w-4" />
            View job
          </span>
        </div>
      </div>
    </Link>
  );
}
