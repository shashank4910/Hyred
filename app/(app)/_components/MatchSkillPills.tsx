import { Check, Plus } from 'lucide-react';

export function MatchSkillPills({
  matchedSkills = [],
  missingSkills = [],
}: {
  matchedSkills?: string[];
  missingSkills?: string[];
}) {
  if (matchedSkills.length === 0 && missingSkills.length === 0) return null;

  return (
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
  );
}
