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
    ...STATUS_ORDER.map((s) => ({
      id: s,
      label:
        s === 'applied'
          ? 'Applied'
          : s === 'interviewing'
            ? 'Interviewing'
            : s.charAt(0).toUpperCase() + s.slice(1),
      count: counts[s] ?? 0,
      icon: null,
    })),
    { id: 'bookmarked', label: 'Saved', count: bookmarkedCount, icon: <Bookmark className="h-3.5 w-3.5" /> },
  ];

  function tabButton({ id, label, count, icon }: (typeof tabs)[number]) {
    const isBookmarkTab = id === 'bookmarked';
    const isActive = isBookmarkTab ? onlyBookmarked : !onlyBookmarked && id === active;
    const href = isBookmarkTab ? bookmarkedHref() : hrefFor(id);

    return (
      <button
        key={id}
        type="button"
        role="tab"
        aria-selected={isActive}
        disabled={isPending && !isActive}
        onClick={() => navigate(href)}
        className={[
          'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold capitalize shadow-card',
          isActive
            ? 'bg-lime-brand text-ink'
            : 'bg-surface-card text-on-surface-variant hover:text-ink',
          isPending && !isActive ? 'opacity-60' : '',
        ].join(' ')}
      >
        <span className="inline-flex min-w-0 items-center gap-1">
          {icon ? <span className="shrink-0">{icon}</span> : null}
          <span className="whitespace-nowrap">
            {label}
          </span>
        </span>
        {count > 0 && (
          <span
            className={[
              'shrink-0 rounded-full px-1.5 py-0.5 text-label-md font-bold leading-none',
              isActive ? 'bg-ink/10' : 'bg-[#F3F4F6] text-text-muted',
            ].join(' ')}
          >
            {count}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      className="flex flex-wrap gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="tablist"
      aria-label="Match status"
    >
      {tabs.map((tab) => tabButton(tab))}
    </div>
  );
}
