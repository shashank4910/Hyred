import { Check, Sparkles } from 'lucide-react';

export function MatchSkillPills({
  matchedSkills = [],
  missingSkills = [],
}: {
  matchedSkills?: string[];
  missingSkills?: string[];
}) {
  if (matchedSkills.length === 0 && missingSkills.length === 0) return null;

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
        <span
          className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] font-bold text-primary hover:bg-primary/10 transition-all shadow-sm"
        >
          <Sparkles className="h-3 w-3 text-primary animate-pulse" />
          Tailor Resume
        </span>
      )}
    </div>
  );
}
