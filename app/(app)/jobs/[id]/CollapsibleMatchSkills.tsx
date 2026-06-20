'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Check, Sparkles, XCircle } from 'lucide-react';

type Props = {
  matchedSkills?: string[];
  missingSkills?: string[];
  resumeHref?: string;
};

export function CollapsibleMatchSkills({
  matchedSkills = [],
  missingSkills = [],
  resumeHref,
}: Props) {
  const [open, setOpen] = useState(false);
  if (matchedSkills.length === 0 && missingSkills.length === 0) return null;

  const summary = `${matchedSkills.length} matched · ${missingSkills.length} gaps`;

  function handleResumeClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    if (resumeHref?.startsWith('#')) {
      document.getElementById(resumeHref.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-outline-variant/50 bg-surface-container-low/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <span className="text-xs font-medium text-on-surface-variant">
          Skill match — <span className="text-on-surface">{summary}</span>
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-on-surface-variant shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-on-surface-variant shrink-0" />
        )}
      </button>
      {open && (
        <div className="flex flex-wrap items-center gap-2 border-t border-outline-variant/40 px-3 pb-3 pt-2">
          {matchedSkills.map((s) => (
            <span
              key={`m-${s}`}
              className="inline-flex items-center gap-1 rounded-full bg-match-success/10 px-3 py-1 text-[11px] font-semibold text-match-success"
            >
              <Check className="h-3.5 w-3.5" />
              {s}
            </span>
          ))}
          {missingSkills.map((s) => (
            <span
              key={`x-${s}`}
              className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[11px] font-medium text-red-600"
            >
              <XCircle className="h-3 w-3 text-red-400" />
              {s}
            </span>
          ))}
          {missingSkills.length > 0 && resumeHref && (
            <a
              href={resumeHref}
              onClick={handleResumeClick}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/20"
            >
              <Sparkles className="h-3 w-3" />
              Build Custom Resume
            </a>
          )}
        </div>
      )}
    </div>
  );
}
