'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  MapPin,
  Building2,
  Clock,
  Bookmark,
  Crown,
  Zap,
  Brain,
  ClipboardList,
} from 'lucide-react';
import { relativeTime, formatShortDate, formatFullDate, SOURCE_LABELS } from '@/lib/ui';
import { MatchScoreRing } from './MatchScoreRing';
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
  mncCategory?: string;
  matchedSkills?: string[];
  missingSkills?: string[];
  showSource?: boolean;
  /** When set, job detail "back" returns here (e.g. /top-mnc?category=...) */
  returnHref?: string;
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
  returnHref,
}: Props) {
  const fullDate = formatFullDate(job.fetched_at);
  const tooltip = `Discovered on ${fullDate}`;
  const isViewed = status === 'viewed' || status !== 'new';
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

  const jobHref = returnHref
    ? `/jobs/${matchId}?return=${encodeURIComponent(returnHref)}`
    : `/jobs/${matchId}`;

  const returnQuery = returnHref ? `?return=${encodeURIComponent(returnHref)}` : '';
  const verdictHref = `/jobs/${matchId}/verdict${returnQuery}`;
  const prepHref = `/jobs/${matchId}/prep${returnQuery}`;

  return (
    <div
      className={[
        'group block min-w-0 animate-fade-in rounded-2xl p-6 shadow-card transition-all hover:-translate-y-1 hover:border-primary/10 hover:shadow-elevated border-l-4',
        isViewed
          ? 'bg-surface-container-low/40 border-l-transparent opacity-75 hover:opacity-100'
          : 'bg-surface-container-lowest border-l-primary shadow-elevated',
      ].join(' ')}
    >
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-low text-lg font-bold text-primary">
            {companyInitial}
          </div>
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Link
                href={jobHref}
                className={[
                  'text-headline-md leading-tight hover:text-primary transition-colors',
                  isViewed ? 'text-on-surface-variant font-medium' : 'text-on-surface font-bold',
                ].join(' ')}
              >
                {job.title}
              </Link>
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
              {/* Date shows discovery date (fetched_at) */}
              {/* Note: fetched_at is always present per Job type definition */}
              <>
                <span className="h-1 w-1 rounded-full bg-outline-variant" />
                <span className="inline-flex items-center gap-1" title={tooltip}>
                  <Clock className="h-4 w-4" />
                  {job.fetched_at && (
                    <>
                      {formatShortDate(job.fetched_at)}
                      {relativeTime(job.fetched_at) && (
                        <span className="text-text-muted">· {relativeTime(job.fetched_at)}</span>
                      )}
                    </>
                  )}
                </span>
              </>
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
        <div>
          <MatchSkillPills
            matchedSkills={matchedSkills}
            missingSkills={missingSkills}
            resumeHref={`/jobs/${matchId}#ats-resume`}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={verdictHref}
            target="_blank"
            rel="noopener noreferrer"
            className="btn inline-flex gap-1.5 px-3 py-2 text-label-md"
            title="Match Intelligence — Apply / Stretch / Skip (opens in new tab)"
          >
            <Brain className="h-4 w-4" />
            Verdict
          </Link>
          <Link
            href={prepHref}
            target="_blank"
            rel="noopener noreferrer"
            className="btn inline-flex gap-1.5 px-3 py-2 text-label-md"
            title="Interview Prep Pack (opens in new tab)"
          >
            <ClipboardList className="h-4 w-4" />
            Interview prep
          </Link>
          <button
            type="button"
            onClick={toggleBookmark}
            disabled={saving}
            title={bookmarked ? 'Remove bookmark' : 'Bookmark this job'}
            className={[
              'rounded-2xl border border-outline-variant p-3 transition-all',
              bookmarked
                ? 'bg-primary/10 text-primary'
                : 'text-primary opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-surface-container',
            ].join(' ')}
          >
            <Bookmark className="h-4 w-4" fill={bookmarked ? 'currentColor' : 'none'} />
          </button>
          <Link href={jobHref} className="btn-primary inline-flex gap-2 px-5 py-3 text-label-md">
            <Zap className="h-4 w-4" />
            View job
          </Link>
        </div>
      </div>
    </div>
  );
}
