'use client';

import { Check, Sparkles, XCircle } from 'lucide-react';

export function MatchSkillPills({
  matchedSkills = [],
  missingSkills = [],
  resumeHref,
}: {
  matchedSkills?: string[];
  missingSkills?: string[];
  /** When provided, "Build Custom Resume" becomes a clickable link */
  resumeHref?: string;
}) {
  if (matchedSkills.length === 0 && missingSkills.length === 0 && !resumeHref) return null;

  const ctaClass =
    'inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/20 hover:border-primary/60 active:scale-95 transition-all shadow-sm cursor-pointer select-none';

  function handleResumeClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.stopPropagation();
    if (resumeHref?.startsWith('#')) {
      e.preventDefault();
      document
        .getElementById(resumeHref.slice(1))
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {matchedSkills.slice(0, 5).map((s) => (
        <span
          key={`m-${s}`}
          className="inline-flex items-center gap-1 rounded-full bg-match-success/15 px-3 py-1 text-[11px] font-semibold text-ink"
        >
          <Check className="h-3.5 w-3.5 text-match-success" />
          {s}
        </span>
      ))}

      {missingSkills.slice(0, 3).map((s) => (
        <span
          key={`x-${s}`}
          className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-3 py-1 text-[11px] font-semibold text-red-700"
        >
          <XCircle className="h-3 w-3 text-red-600" />
          {s}
        </span>
      ))}

      {resumeHref ? (
        <a href={resumeHref} onClick={handleResumeClick} className={ctaClass}>
          <Sparkles className="h-3 w-3" />
          Build Custom Resume
        </a>
      ) : missingSkills.length > 0 ? (
        <span className={ctaClass}>
          <Sparkles className="h-3 w-3" />
          Build Custom Resume
        </span>
      ) : null}
    </div>
  );
}
