'use client';

import { Suspense, type ReactNode } from 'react';
import { DashboardMatchesLoading } from './DashboardMatchesLoading';
import { useDashboardNav } from './DashboardNavContext';

export function DashboardMatchesSection({
  children,
  cacheKey,
}: {
  children: React.ReactNode;
  cacheKey: string;
}) {
  const { isPending } = useDashboardNav();

  return (
    <div className="relative min-h-[200px]">
      {isPending && (
        <div className="absolute inset-0 z-10">
          <DashboardMatchesLoading />
        </div>
      )}
      <div
        className={
          isPending
            ? 'pointer-events-none opacity-40 transition-opacity duration-150'
            : 'transition-opacity duration-150'
        }
        aria-hidden={isPending}
      >
        <Suspense key={cacheKey} fallback={<DashboardMatchesLoading />}>
          {children}
        </Suspense>
      </div>
    </div>
  );
}
