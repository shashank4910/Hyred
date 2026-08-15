'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  MapPin,
  Clock,
  Heart,
  Crown,
  Brain,
  ClipboardList,
  Users,
} from 'lucide-react';
import { relativeTime, formatShortDate, formatFullDate, SOURCE_LABELS } from '@/lib/ui';
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
  mncCategory,
  matchedSkills = [],
  missingSkills = [],
  showSource = false,
  isOlder = false,
  returnHref,
  staggerIndex = 0,
}: Props) {
  const fullDate = formatFullDate(job.fetched_at);
  const tooltip = `Discovered on ${fullDate}`;
  const isNew = status === 'new';
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [saving, setSaving] = useState(false);
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

  const returnQuery = returnHref ? `?return=${encodeURIComponent(returnHref)}` : '';
  const verdictHref = `/jobs/${matchId}/verdict${returnQuery}`;
  const prepHref = `/jobs/${matchId}/prep${returnQuery}`;

  return (
    <article
      style={{ animationDelay: `${delay}ms` }}
      className={[
        'group flex h-full min-w-0 flex-col rounded-2xl bg-white p-6 shadow-card transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1.5 hover:shadow-elevated animate-fade-in',
        isNew ? 'border-l-4 border-l-lime-brand' : 'border-l-4 border-l-transparent',
      ].join(' ')}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.02em] text-muted">
            MATCH
          </p>
          <p className="mt-0.5 text-3xl font-extrabold tabular-nums text-ink">
            {score != null ? Math.round(score) : '—'}
          </p>
        </div>
        <button
          type="button"
          onClick={toggleBookmark}
          disabled={saving}
          title={bookmarked ? 'Remove save' : 'Save this job'}
          className={[
            'rounded-full p-2 transition-transform duration-300',
            bookmarked ? 'text-error' : 'text-muted hover:text-ink',
          ].join(' ')}
        >
          <Heart className="h-5 w-5" fill={bookmarked ? 'currentColor' : 'none'} />
        </button>
      </div>

      {job.salary && (
        <p className="mb-2 text-sm font-semibold text-ink">{job.salary}</p>
      )}

      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Link
          href={jobHref}
          className="font-headline text-xl font-bold leading-tight text-ink hover:underline"
        >
          {job.title}
        </Link>
        {isNew && <span className="badge-primary">New</span>}
        {isOlder && (
          <span className="rounded-full bg-orange-50 px-2 py-0.5 text-label-md font-bold text-orange-700">
            Older
          </span>
        )}
        {showSource && (
          <span className="badge">{SOURCE_LABELS[job.source] ?? job.source}</span>
        )}
        {mncCategory && (
          <span className="badge-grape">
            <Crown className="h-2.5 w-2.5" />
            {mncCategory}
          </span>
        )}
      </div>
      {job.company && (
        <p className="text-sm text-on-surface-variant">{job.company}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted">
        {(job.location || job.remote) && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {job.location || 'Remote'}
          </span>
        )}
        {job.fetched_at && (
          <span className="inline-flex items-center gap-1" title={tooltip}>
            <Clock className="h-3.5 w-3.5" />
            {formatShortDate(job.fetched_at)}
            {relativeTime(job.fetched_at) && (
              <span>· {relativeTime(job.fetched_at)}</span>
            )}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <Users className="h-3.5 w-3.5" />
          Hyred match
        </span>
      </div>

      {reason && (
        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-on-surface-variant">
          {reason}
        </p>
      )}

      <div className="mt-3">
        <MatchSkillPills
          matchedSkills={matchedSkills}
          missingSkills={missingSkills}
          resumeHref={`/jobs/${matchId}#ats-resume`}
        />
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
        <Link href={jobHref} className="btn-primary h-11 flex-1 text-sm">
          Open job
        </Link>
        <Link
          href={verdictHref}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost text-label-md"
          title="Match Intelligence"
        >
          <Brain className="h-4 w-4" />
          Verdict
        </Link>
        <Link
          href={prepHref}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost text-label-md"
          title="Interview Prep"
        >
          <ClipboardList className="h-4 w-4" />
          Prep
        </Link>
      </div>
    </article>
  );
}
