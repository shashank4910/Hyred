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
    <div className="flex flex-wrap gap-2">
      {STATUS_ORDER.map((s) => {
        const isActive = s === active;
        const count = counts[s] ?? 0;
        return (
          <Link
            key={s}
            href={hrefFor(s)}
            scroll={false}
            className={`inline-flex items-center gap-1.5 rounded-btn px-3 py-[7px] text-body-sm whitespace-nowrap transition-colors ${
              isActive
                ? 'bg-ink text-off-white font-medium'
                : 'border border-faded-stone text-stone hover:border-ink hover:text-ink'
            }`}
          >
            <span className="capitalize">{s}</span>
            <span className={`text-caption tabular-nums ${isActive ? 'text-off-white/60' : 'text-shadow-tint'}`}>
              {count}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
