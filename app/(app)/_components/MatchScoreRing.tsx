'use client';

const R = 40;
const C = 2 * Math.PI * R;

export function MatchScoreRing({ score }: { score: number | null }) {
  const pct = score == null ? 0 : Math.min(100, Math.max(0, score));
  const offset = C - (pct / 100) * C;
  const strokeClass =
    pct >= 90
      ? 'text-match-success'
      : pct >= 75
        ? 'text-primary-container'
        : pct >= 60
          ? 'text-secondary-fixed-dim'
          : 'text-text-muted';

  return (
    <div className="relative h-20 w-20 shrink-0">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden>
        <circle
          className="text-primary/10"
          cx="50"
          cy="50"
          r={R}
          fill="transparent"
          stroke="currentColor"
          strokeWidth="8"
        />
        <circle
          className={strokeClass}
          cx="50"
          cy="50"
          r={R}
          fill="transparent"
          stroke="currentColor"
          strokeWidth="8"
          strokeDasharray={C}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-label-md font-bold leading-none">{score ?? '–'}</span>
        {score != null && (
          <span className={`text-label-md uppercase font-bold tracking-tighter ${strokeClass}`}>
            Match
          </span>
        )}
      </div>
    </div>
  );
}
