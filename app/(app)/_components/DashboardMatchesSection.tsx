'use client';

import { Suspense, type ReactNode } from 'react';
import { useDashboardNav } from './DashboardNavContext';

/**
 * Keep the current match list visible while a filter/sort navigation resolves.
 * Do NOT remount Suspense with a changing key — that forced a loading skeleton
 * on every city/score change and felt like a cache miss.
 */
export function DashboardMatchesSection({
  children,
}: {
  children: ReactNode;
  /** @deprecated Kept for call-site compat; ignored so filters don't remount. */
  cacheKey?: string;
}) {
  const { isPending } = useDashboardNav();

  return (
    <div className="relative min-h-[200px]">
      {isPending && (
        <div
          className="pointer-events-none absolute right-0 top-0 z-10 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary"
          role="status"
          aria-live="polite"
        >
          Updating…
        </div>
      )}
      <div
        className={
          isPending
            ? 'transition-opacity duration-150 opacity-80'
            : 'transition-opacity duration-150'
        }
      >
        <Suspense fallback={null}>{children}</Suspense>
      </div>
    </div>
  );
}
