'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { DEFAULT_MATCH_SORT, resolveMatchSort, type MatchSortMode } from '@/lib/ui';
import { useDashboardNav } from './DashboardNavContext';

const SORT_OPTIONS: { value: MatchSortMode; label: string }[] = [
  { value: 'score', label: 'Highest score' },
  { value: 'posted', label: 'Newest' },
];

export function MatchSortBar() {
  const sp = useSearchParams();
  const { navigate, isPending } = useDashboardNav();
  const sort = resolveMatchSort(sp.get('sort'));
  const trackRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef(new Map<string, HTMLButtonElement>());
  const [pill, setPill] = useState({ left: 0, top: 0, width: 0, height: 0, ready: false });

  const placePill = useCallback(() => {
    const track = trackRef.current;
    const el = btnRefs.current.get(sort);
    if (!track || !el) return;
    const t = track.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const next = {
      left: r.left - t.left + track.scrollLeft,
      top: r.top - t.top + track.scrollTop,
      width: r.width,
      height: r.height,
      ready: true,
    };
    setPill((prev) =>
      prev.ready &&
      prev.left === next.left &&
      prev.top === next.top &&
      prev.width === next.width &&
      prev.height === next.height
        ? prev
        : next,
    );
  }, [sort]);

  useLayoutEffect(() => {
    placePill();
    const track = trackRef.current;
    if (!track) return;
    const ro = new ResizeObserver(() => placePill());
    ro.observe(track);
    window.addEventListener('resize', placePill);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', placePill);
    };
  }, [placePill]);

  function setSort(next: MatchSortMode) {
    const params = new URLSearchParams(sp.toString());
    if (next === DEFAULT_MATCH_SORT) params.delete('sort');
    else params.set('sort', next);
    navigate(`/?${params.toString()}`, { replace: true });
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <p className="shrink-0 text-xs font-semibold text-on-surface-variant">Sort by</p>
      <div
        ref={trackRef}
        role="radiogroup"
        aria-label="Sort matches"
        className="relative inline-flex max-w-full flex-wrap rounded-full bg-surface-card p-1"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute z-0 rounded-full bg-lime-brand shadow-sm motion-safe:transition-[left,top,width,height] motion-safe:duration-300 motion-safe:ease-out-expo"
          style={{
            left: pill.left,
            top: pill.top,
            width: pill.width,
            height: pill.height,
            opacity: pill.ready ? 1 : 0,
          }}
        />
        {SORT_OPTIONS.map(({ value, label }) => {
          const active = value === sort;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={isPending && !active}
              ref={(node) => {
                if (node) btnRefs.current.set(value, node);
                else btnRefs.current.delete(value);
              }}
              onClick={() => setSort(value)}
              className={[
                'relative z-[1] shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-semibold tracking-[-0.02em] outline-none',
                'focus-visible:ring-2 focus-visible:ring-primary/40',
                active ? 'text-ink' : 'text-on-surface-variant hover:text-ink',
                isPending && !active ? 'opacity-60' : '',
              ].join(' ')}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
