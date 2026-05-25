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
                ? 'inline-flex items-center gap-1.5 rounded-full bg-primary text-bg px-3 py-1 text-xs font-semibold whitespace-nowrap'
                : 'inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted hover:text-primary hover:border-primary/40 whitespace-nowrap'
            }
          >
            <span className="capitalize">{s}</span>
            <span
              className={
                isActive
                  ? 'rounded-full bg-bg/20 px-1.5 text-[10px]'
                  : 'rounded-full bg-surface px-1.5 text-[10px]'
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
