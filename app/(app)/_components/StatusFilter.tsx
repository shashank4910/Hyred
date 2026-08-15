'use client';

import { useSearchParams } from 'next/navigation';
import { Bookmark, Inbox } from 'lucide-react';
import { STATUS_ORDER } from '@/lib/ui';
import { useDashboardNav } from './DashboardNavContext';

export function StatusFilter({
  counts,
  active,
  inboxCount,
  bookmarkedCount,
  onlyBookmarked,
}: {
  counts: Record<string, number>;
  active: string;
  inboxCount: number;
  bookmarkedCount: number;
  onlyBookmarked: boolean;
}) {
  const sp = useSearchParams();
  const { navigate, isPending } = useDashboardNav();

  function hrefFor(status: string): string {
    const params = new URLSearchParams(sp.toString());
    params.set('status', status);
    params.delete('bookmarked');
    return `/?${params.toString()}`;
  }

  function bookmarkedHref(): string {
    const params = new URLSearchParams(sp.toString());
    params.set('bookmarked', '1');
    params.delete('status');
    return `/?${params.toString()}`;
  }

  const tabs = [
    { id: 'inbox', label: 'Inbox', count: inboxCount, icon: <Inbox className="h-3.5 w-3.5" /> },
    ...STATUS_ORDER.filter((s) => s !== 'new' && s !== 'viewed').map((s) => ({
      id: s,
      label: s === 'applied' ? 'Applied' : s.charAt(0).toUpperCase() + s.slice(1),
      count: counts[s] ?? 0,
      icon: null,
    })),
    { id: 'bookmarked', label: 'Saved', count: bookmarkedCount, icon: <Bookmark className="h-3.5 w-3.5" /> },
  ];

  function tabButton(
    { id, label, count, icon }: (typeof tabs)[number],
    layout: 'scroll' | 'grid',
  ) {
    const isBookmarkTab = id === 'bookmarked';
    const isActive = isBookmarkTab ? onlyBookmarked : !onlyBookmarked && id === active;
    const href = isBookmarkTab ? bookmarkedHref() : hrefFor(id);

    return (
      <button
        key={`${layout}-${id}`}
        type="button"
        role="tab"
        aria-selected={isActive}
        disabled={isPending && !isActive}
        onClick={() => navigate(href)}
        className={[
          layout === 'scroll'
            ? 'flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold capitalize'
            : 'flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-2.5 text-center transition-all sm:flex-row sm:gap-1.5 md:px-2',
          isActive
            ? 'bg-primary-container text-on-primary-container shadow-sm'
            : 'text-on-surface-variant hover:bg-surface-container',
          isPending && !isActive ? 'opacity-60' : '',
        ].join(' ')}
      >
        <span className="inline-flex min-w-0 items-center gap-1">
          {icon ? <span className="shrink-0">{icon}</span> : null}
          <span className={layout === 'grid' ? 'truncate text-xs md:text-sm' : 'whitespace-nowrap'}>
            {label}
          </span>
        </span>
        {count > 0 && (
          <span
            className={[
              'shrink-0 rounded-full px-1.5 py-0.5 text-label-md font-bold leading-none',
              isActive ? 'bg-on-primary-container/15' : 'bg-surface-container text-text-muted',
            ].join(' ')}
          >
            {count}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="w-full rounded-2xl bg-surface-container-lowest p-1 shadow-card">
      {/* Mobile: scrollable chips — readable tap targets, no 7-col squeeze */}
      <div
        className="flex gap-1 overflow-x-auto p-0.5 [-ms-overflow-style:none] [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Match status"
      >
        {tabs.map((tab) => tabButton(tab, 'scroll'))}
      </div>
      {/* Desktop: full workflow grid */}
      <div
        className="hidden w-full grid-cols-7 gap-0.5 md:grid"
        role="tablist"
        aria-label="Match status"
      >
        {tabs.map((tab) => tabButton(tab, 'grid'))}
      </div>
    </div>
  );
}
