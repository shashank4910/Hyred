'use client';

import Link from 'next/link';
import { useState } from 'react';
import { MapPin, Clock, Heart, Crown } from 'lucide-react';
import { relativeTime, formatShortDate, formatFullDate, SOURCE_LABELS } from '@/lib/ui';
import { matchListingIso } from '@/lib/job-listing-time';
import { MatchSkillPills } from './MatchSkillPills';

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
  /** When the match landed in the user's dashboard (a scan surfaced it). */
  createdAt?: string | null;
  mncCategory?: string;
  matchedSkills?: string[];
  missingSkills?: string[];
  showSource?: boolean;
  isOlder?: boolean;
  returnHref?: string;
  staggerIndex?: number;
};

export function MatchCard({
  matchId,
  score,
  reason,
  status,
  bookmarked: initialBookmarked,
  job,
  createdAt,
  mncCategory,
  matchedSkills = [],
  missingSkills = [],
  showSource = false,
  isOlder = false,
  returnHref,
  staggerIndex = 0,
}: Props) {
  const listingAt = matchListingIso({ created_at: createdAt, job });
  const fullDate = formatFullDate(listingAt);
  const tooltip = listingAt ? fullDate : '';
  const isNew = status === 'new';
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const delay = Math.min(staggerIndex, 7) * 60;

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

  const jobHref = returnHref
    ? `/jobs/${matchId}?return=${encodeURIComponent(returnHref)}`
    : `/jobs/${matchId}`;
  const resumeHref = `/jobs/${matchId}#ats-resume`;

  const previewLimit = 220;
  const needsMore = Boolean(reason && reason.length > previewLimit);
  const shownReason =
    !reason
      ? ''
      : expanded || !needsMore
        ? reason
        : `${reason.slice(0, previewLimit).trimEnd()}…`;

  return (
    <article
      style={{ animationDelay: `${delay}ms` }}
      className="group flex h-full min-w-0 flex-col rounded-[1.5rem] bg-surface-card p-6 shadow-card transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1.5 hover:shadow-elevated animate-fade-in"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <p className="pt-1 text-sm font-semibold text-ink">
          {job.salary ? job.salary : isNew ? 'New' : '\u00a0'}
        </p>
        <div className="flex items-center gap-2">
          {score != null && (
            <p
              className="flex h-11 min-w-[2.75rem] items-center justify-center rounded-2xl bg-lime-brand px-2.5 text-[1.375rem] font-extrabold tabular-nums leading-none text-ink"
              aria-label={`Match score ${Math.round(score)}`}
            >
              {Math.round(score)}
            </p>
          )}
          <button
            type="button"
            onClick={toggleBookmark}
            disabled={saving}
            title={bookmarked ? 'Remove save' : 'Save this job'}
            className={[
              'rounded-full p-1.5 transition-transform duration-300',
              bookmarked ? 'text-error' : 'text-on-surface-variant hover:text-ink',
            ].join(' ')}
          >
            <Heart className="h-5 w-5" fill={bookmarked ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>

      <Link
        href={jobHref}
        className="font-headline text-lg font-bold leading-snug tracking-[-0.02em] text-ink hover:underline"
      >
        {job.title}
      </Link>
      {job.company && (
        <p className="mt-1 text-sm font-medium text-on-surface-variant">{job.company}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-on-surface-variant">
        {(job.location || job.remote) && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {job.remote ? 'Remote' : job.location}
          </span>
        )}
        {listingAt && (
          <span className="inline-flex items-center gap-1" title={tooltip}>
            <Clock className="h-3.5 w-3.5" />
            {formatShortDate(listingAt)}
            {relativeTime(listingAt) && (
              <span>· {relativeTime(listingAt)}</span>
            )}
          </span>
        )}
        {isOlder && <span className="font-semibold text-orange-700">Older</span>}
        {showSource && <span>{SOURCE_LABELS[job.source] ?? job.source}</span>}
        {mncCategory && (
          <span className="inline-flex items-center gap-1">
            <Crown className="h-3 w-3" />
            {mncCategory}
          </span>
        )}
      </div>

      {reason && (
        <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
          {shownReason}{' '}
          {needsMore && (
            <button
              type="button"
              className="font-bold text-ink hover:underline"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'see less' : 'see more'}
            </button>
          )}
        </p>
      )}

      <div className="mt-3">
        <MatchSkillPills
          matchedSkills={matchedSkills}
          missingSkills={missingSkills}
          resumeHref={resumeHref}
        />
      </div>

      <div className="mt-auto pt-5">
        <Link
          href={jobHref}
          className="btn-primary flex h-12 w-full rounded-full text-sm font-semibold"
        >
          Apply now
        </Link>
      </div>
    </article>
  );
}
