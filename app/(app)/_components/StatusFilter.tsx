'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Bookmark, Inbox } from 'lucide-react';
import { STATUS_ORDER } from '@/lib/ui';

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

  return (
    <div className="w-full rounded-2xl bg-surface-container-lowest p-1 shadow-card">
      <div className="grid w-full grid-cols-7 gap-0.5">
      {tabs.map(({ id, label, count, icon }) => {
        const isBookmarkTab = id === 'bookmarked';
        const isActive = isBookmarkTab ? onlyBookmarked : !onlyBookmarked && id === active;
        const href = isBookmarkTab ? bookmarkedHref() : hrefFor(id);

        return (
          <Link
            key={id}
            href={href}
            scroll={false}
            className={[
              'flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-2 text-center transition-all sm:flex-row sm:gap-1 sm:px-1.5 sm:py-2.5 md:px-2',
              isActive
                ? 'bg-primary-container text-on-primary-container shadow-sm'
                : 'text-on-surface-variant hover:bg-surface-container',
            ].join(' ')}
          >
            <span className="inline-flex min-w-0 items-center gap-0.5 sm:gap-1">
              {icon ? (
                <span className="hidden shrink-0 sm:inline">{icon}</span>
              ) : null}
              <span className="truncate text-[10px] font-semibold leading-tight sm:text-xs md:text-sm capitalize">
                {label}
              </span>
            </span>
            {count > 0 && (
              <span
                className={[
                  'shrink-0 rounded-full px-1 py-px text-[9px] font-bold leading-none sm:px-1.5 sm:py-0.5 sm:text-[10px]',
                  isActive ? 'bg-on-primary-container/15' : 'bg-surface-container text-text-muted',
                ].join(' ')}
              >
                {count}
              </span>
            )}
          </Link>
        );
      })}
      </div>
    </div>
  );
}