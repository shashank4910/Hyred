'use client';

import Link from 'next/link';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

type NavItem = {
  href: string;
  label: string;
};

export function FloatingPillNav({
  items,
  activeHref,
}: {
  items: NavItem[];
  activeHref: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLAnchorElement>());
  const [pill, setPill] = useState({ left: 0, top: 0, width: 0, height: 0, ready: false });

  const placePill = useCallback(() => {
    const track = trackRef.current;
    const el = itemRefs.current.get(activeHref);
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
  }, [activeHref]);

  const itemKey = items.map((item) => item.href).join('|');

  useLayoutEffect(() => {
    placePill();
    const track = trackRef.current;
    if (!track) return;
    const ro = new ResizeObserver(() => placePill());
    ro.observe(track);
    for (const el of itemRefs.current.values()) ro.observe(el);
    window.addEventListener('resize', placePill);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', placePill);
    };
  }, [placePill, itemKey]);

  return (
    <div
      ref={trackRef}
      className="relative w-full overflow-x-auto rounded-full [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="list"
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
      {/* Single row, always: wraps never grow the fixed header past the content
          clearance. Centered when it fits, scrolls horizontally when tight. */}
      <div className="mx-auto flex w-max items-center gap-0 rounded-full bg-surface-card p-1">
        {items.map(({ href, label }) => {
          const active = href === activeHref;
          return (
            <Link
              key={href}
              href={href}
              role="listitem"
              prefetch={href === '/stats' ? false : undefined}
              ref={(node) => {
                if (node) itemRefs.current.set(href, node);
                else itemRefs.current.delete(href);
              }}
              aria-current={active ? 'page' : undefined}
              className={[
                'relative z-[1] shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-semibold tracking-[-0.02em] outline-none transition-colors duration-300 xl:px-3.5 xl:text-[13px]',
                'focus-visible:ring-2 focus-visible:ring-primary/40',
                active ? 'text-ink' : 'text-on-surface-variant hover:text-ink',
              ].join(' ')}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
