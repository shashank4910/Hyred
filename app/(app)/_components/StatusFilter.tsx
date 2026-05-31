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
    <div className="inline-flex items-center gap-1 rounded-2xl bg-surface-container-lowest p-1.5 shadow-card">
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
              'inline-flex items-center gap-1.5 rounded-xl px-5 py-2 text-label-md font-semibold whitespace-nowrap transition-all capitalize',
              isActive
                ? 'bg-primary-container text-on-primary-container shadow-sm'
                : 'text-on-surface-variant hover:bg-surface-container',
            ].join(' ')}
          >
            {icon}
            {label}
            {count > 0 && (
              <span
                className={[
                  'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
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
  );
}
