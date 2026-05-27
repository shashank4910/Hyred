'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { STATUS_ORDER } from '@/lib/ui';

export function StatusFilter({
  counts,
  active,
}: {
  counts: Record<string, number>;
  active: string;
}) {
  const sp = useSearchParams();

  function hrefFor(status: string): string {
    const params = new URLSearchParams(sp.toString());
    params.set('status', status);
    return `/?${params.toString()}`;
  }

  return (
    <div className="flex flex-wrap gap-2 -mx-1 px-1 overflow-x-auto">
      {STATUS_ORDER.map((s) => {
        const isActive = s === active;
        const count = counts[s] ?? 0;
        return (
          <Link
            key={s}
            href={hrefFor(s)}
            scroll={false}
            className={
              isActive
                ? 'inline-flex items-center gap-1.5 rounded-btn bg-amber text-ink px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap shadow-sm'
                : 'inline-flex items-center gap-1.5 rounded-btn border border-border px-3.5 py-1.5 text-xs text-stone hover:text-ink hover:border-amber/40 hover:bg-amber/5 whitespace-nowrap transition-colors'
            }
          >
            <span className="capitalize">{s}</span>
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
    </div>
  );
}
