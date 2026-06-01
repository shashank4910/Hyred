'use client';

const R = 40;
const C = 2 * Math.PI * R;

/** Shown while dashboard filters/sorts load a new match list. */
export function DashboardMatchesLoading() {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-outline-variant/25 bg-surface-container-lowest/90 py-10 shadow-card backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/[0.04] to-transparent" />

      <div className="relative flex flex-col items-center gap-3 px-6">
        <div className="relative h-24 w-24">
          <svg
            className="h-full w-full -rotate-90 animate-[spin_1.4s_linear_infinite]"
            viewBox="0 0 100 100"
            aria-hidden
          >
            <circle
              className="text-primary/15"
              cx="50"
              cy="50"
              r={R}
              fill="transparent"
              stroke="currentColor"
              strokeWidth="8"
            />
            <circle
              className="text-primary"
              cx="50"
              cy="50"
              r={R}
              fill="transparent"
              stroke="currentColor"
              strokeWidth="8"
              strokeDasharray={`${C * 0.35} ${C * 0.65}`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
              Match
            </span>
          </div>
        </div>
        <p className="text-sm font-semibold text-on-surface">Loading matches…</p>
        <p className="text-xs text-on-surface-variant">Sorting and filtering your jobs</p>
      </div>

      <ul className="relative mt-8 space-y-4 px-4 sm:px-6" aria-hidden>
        {Array.from({ length: 3 }).map((_, i) => (
          <li
            key={i}
            className="animate-pulse rounded-2xl bg-surface-container-low p-6 shadow-card"
            style={{ animationDelay: `${i * 120}ms` }}
          >
            <div className="mb-4 flex gap-4">
              <div className="skeleton h-14 w-14 shrink-0 rounded-2xl" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-5 w-3/4" />
                <div className="skeleton h-3 w-1/2" />
              </div>
              <div className="skeleton h-20 w-20 shrink-0 rounded-full" />
            </div>
            <div className="skeleton h-12 w-full rounded-2xl" />
          </li>
        ))}
      </ul>
    </div>
  );
}
