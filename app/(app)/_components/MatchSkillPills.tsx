'use client';

import { Check, Sparkles } from 'lucide-react';

export function MatchSkillPills({
  matchedSkills = [],
  missingSkills = [],
  resumeHref,
}: {
  matchedSkills?: string[];
  missingSkills?: string[];
  /** When provided, "Build Custom Resume" becomes a link to this URL */
  resumeHref?: string;
}) {
  if (matchedSkills.length === 0 && missingSkills.length === 0) return null;

  const pillClass =
    'inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/8 px-3.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/15 hover:border-primary/50 active:scale-95 transition-all shadow-sm cursor-pointer';

  return (
    <div className="flex flex-wrap items-center gap-2">
      {matchedSkills.slice(0, 5).map((s) => (
        <span
          key={`m-${s}`}
          className="inline-flex items-center gap-1 rounded-full bg-match-success/10 px-3 py-1 text-[11px] font-semibold text-match-success"
        >
          <Check className="h-3.5 w-3.5" />
          {s}
        </span>
      ))}
      {missingSkills.length > 0 && (
        resumeHref ? (
          <a
            href={resumeHref}
            onClick={(e) => {
              // If it's an in-page anchor, smooth-scroll instead of hard jump
              if (resumeHref.startsWith('#')) {
                e.preventDefault();
                document.getElementById(resumeHref.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }}
            className={pillClass}
          >
            <Sparkles className="h-3 w-3 animate-pulse" />
            Build Custom Resume
          </a>
        ) : (
          <span className={pillClass}>
            <Sparkles className="h-3 w-3 animate-pulse" />
            Build Custom Resume
          </span>
        )
      )}
    </div>
  );
}
