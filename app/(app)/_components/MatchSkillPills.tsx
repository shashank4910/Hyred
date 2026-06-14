'use client';

import { Check, Sparkles, MinusCircle } from 'lucide-react';

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
  if (matchedSkills.length === 0 && missingSkills.length === 0) return null;

  const ctaClass =
    'inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/20 hover:border-primary/60 active:scale-95 transition-all shadow-sm cursor-pointer select-none';

  function handleResumeClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.stopPropagation(); // stop parent <Link> card from swallowing this click
    if (resumeHref?.startsWith('#')) {
      e.preventDefault();
      document
        .getElementById(resumeHref.slice(1))
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Matched skills — green checkmark pills */}
      {matchedSkills.slice(0, 5).map((s) => (
        <span
          key={`m-${s}`}
          className="inline-flex items-center gap-1 rounded-full bg-match-success/10 px-3 py-1 text-[11px] font-semibold text-match-success"
        >
          <Check className="h-3.5 w-3.5" />
          {s}
        </span>
      ))}

      {/* Missing skills — grey dashed pills (up to 3) */}
      {missingSkills.slice(0, 3).map((s) => (
        <span
          key={`x-${s}`}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-outline-variant/60 bg-surface-container px-3 py-1 text-[11px] font-medium text-on-surface-variant/60"
        >
          <MinusCircle className="h-3 w-3 text-on-surface-variant/40" />
          {s}
        </span>
      ))}

      {/* CTA — Build Custom Resume */}
      {missingSkills.length > 0 && (
        resumeHref ? (
          <a
            href={resumeHref}
            onClick={handleResumeClick}
            className={ctaClass}
          >
            <Sparkles className="h-3 w-3 animate-pulse" />
            Build Custom Resume
          </a>
        ) : (
          <span className={ctaClass}>
            <Sparkles className="h-3 w-3 animate-pulse" />
            Build Custom Resume
          </span>
        )
      )}
    </div>
  );
}
