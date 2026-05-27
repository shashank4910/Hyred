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

  // Tabs: Inbox first, then every explicit status, then Bookmarked
  const tabs = [
    { id: 'inbox', label: 'Inbox', count: inboxCount, icon: <Inbox className="h-3 w-3" /> },
    ...STATUS_ORDER
      // skip 'new' and 'viewed' — they're merged into Inbox
      .filter((s) => s !== 'new' && s !== 'viewed')
      .map((s) => ({ id: s, label: s, count: counts[s] ?? 0, icon: null })),
  ];

  return (
    <div className="flex flex-wrap gap-2 -mx-1 px-1 overflow-x-auto">
      {tabs.map(({ id, label, count, icon }) => {
        const isActive = !onlyBookmarked && id === active;
        return (
          <Link
            key={id}
            href={hrefFor(id)}
            scroll={false}
            className={
              isActive
                ? 'inline-flex items-center gap-1.5 rounded-btn bg-amber text-ink px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap shadow-sm'
                : 'inline-flex items-center gap-1.5 rounded-btn border border-border px-3.5 py-1.5 text-xs text-stone hover:text-ink hover:border-amber/40 hover:bg-amber/5 whitespace-nowrap transition-colors'
            }
          >
            {icon}
            <span className="capitalize">{label}</span>
            <span
              className={
                isActive
                  ? 'rounded-badge bg-ink/10 px-1.5 py-0.5 text-[10px] font-medium'
                  : 'rounded-badge bg-off-white px-1.5 py-0.5 text-[10px]'
              }
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
        className={
          onlyBookmarked
            ? 'inline-flex items-center gap-1.5 rounded-btn bg-amber text-ink px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap shadow-sm'
            : 'inline-flex items-center gap-1.5 rounded-btn border border-border px-3.5 py-1.5 text-xs text-stone hover:text-ink hover:border-amber/40 hover:bg-amber/5 whitespace-nowrap transition-colors'
        }
      >
        <Bookmark
          className="h-3 w-3"
          fill={onlyBookmarked ? 'currentColor' : 'none'}
        />
        <span>Bookmarked</span>
        <span
          className={
            onlyBookmarked
              ? 'rounded-badge bg-ink/10 px-1.5 py-0.5 text-[10px] font-medium'
              : 'rounded-badge bg-off-white px-1.5 py-0.5 text-[10px]'
          }
        >
          {bookmarkedCount}
        </span>
      </Link>
    </div>
  );
}
