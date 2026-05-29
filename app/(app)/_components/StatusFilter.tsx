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
    ...STATUS_ORDER
      .filter((s) => s !== 'new' && s !== 'viewed')
      .map((s) => ({ id: s, label: s, count: counts[s] ?? 0, icon: null })),
  ];

  return (
    <div className="flex flex-wrap gap-2 overflow-x-auto pb-1">
      {tabs.map(({ id, label, count, icon }) => {
        const isActive = !onlyBookmarked && id === active;
        return (
          <Link
            key={id}
            href={hrefFor(id)}
            scroll={false}
            className={[
              'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium whitespace-nowrap transition-all',
              isActive
                ? 'bg-primary text-on-primary shadow-sm'
                : 'border border-border-muted text-on-surface-variant hover:text-primary hover:border-primary/40 hover:bg-primary-fixed/30',
            ].join(' ')}
          >
            {icon}
            <span className="capitalize">{label}</span>
            <span
              className={[
                'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                isActive
                  ? 'bg-white/20'
                  : 'bg-surface-container',
              ].join(' ')}
            >
              {count}
            </span>
          </Link>
        );
      })}

      {/* Bookmarked tab */}
      <Link
        href={bookmarkedHref()}
        scroll={false}
        className={[
          'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium whitespace-nowrap transition-all',
          onlyBookmarked
            ? 'bg-secondary text-on-secondary shadow-sm'
            : 'border border-border-muted text-on-surface-variant hover:text-secondary hover:border-secondary/40 hover:bg-secondary-fixed/30',
        ].join(' ')}
      >
        <Bookmark
          className="h-3.5 w-3.5"
          fill={onlyBookmarked ? 'currentColor' : 'none'}
        />
        <span>Bookmarked</span>
        <span
          className={[
            'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
            onlyBookmarked
              ? 'bg-white/20'
              : 'bg-surface-container',
          ].join(' ')}
        >
          {bookmarkedCount}
        </span>
      </Link>
    </div>
  );
}
